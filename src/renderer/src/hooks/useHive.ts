import { useEffect, useRef } from 'react';
import { useStore, type Agent, type StationKind, type ToolKind } from '@/store/store';
import { buildSpawnCommand, type HarnessConfig } from '@/store/config';

const GOD_ID = 'god';
const GOD_PTY = `pty-${GOD_ID}`;

/**
 * Type a line into an agent's Claude Code TUI and actually submit it.
 *
 * Writing the text and the carriage return in a single chunk makes the TUI
 * treat the whole thing as a paste, so the "\r" lands as a newline inside the
 * input box instead of submitting — the command just sits there as text. We
 * send the text first, then the Enter as a separate keystroke a tick later so
 * the prompt is registered and executed. Idle autonomous agents thus act on a
 * dispatched instruction on their own. */
async function submitToPty(ptyId: string, text: string): Promise<void> {
  await window.cth.writePty(ptyId, text);
  await new Promise((r) => setTimeout(r, 140));
  await window.cth.writePty(ptyId, '\r');
}

/** Tool name → where the avatar walks + what it carries. */
const TOOL_STATION: Record<string, { station: StationKind; carry?: ToolKind }> = {
  Read: { station: 'shelf', carry: 'Read' },
  Edit: { station: 'desk', carry: 'Edit' },
  Write: { station: 'desk', carry: 'Write' },
  Bash: { station: 'terminal', carry: 'Bash' },
  Grep: { station: 'shelf', carry: 'Grep' },
  Glob: { station: 'shelf', carry: 'Glob' },
  WebFetch: { station: 'web', carry: 'WebFetch' },
  WebSearch: { station: 'web', carry: 'WebSearch' },
  TodoWrite: { station: 'board', carry: 'TodoWrite' }
};

/**
 * The renderer-side glue for the hive:
 *   1. spawns the god agent into Michael's room when none is running,
 *   2. drives avatar state from real Claude Code hook events, and
 *   3. wakes idle agents that have unread inbox messages so collaboration
 *      doesn't stall while an agent sits at its prompt.
 */
export function useHive(config: HarnessConfig | null): void {
  const nudged = useRef<Record<string, number>>({});

  // 1) Bootstrap the god agent (source of truth = live PTYs, to dodge restarts).
  useEffect(() => {
    if (!config?.onboardingComplete || !config.harnessHome) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      if (cancelled) return;
      const live = await window.cth.listPtys().catch(() => []);
      if (cancelled || live.some((p) => p.id === GOD_PTY)) return; // already running
      useStore.getState().removeAgent(GOD_ID); // clear any stale restored entry

      const command = buildSpawnCommand(config);
      const [exe, ...args] = command.trim().split(/\s+/);
      const res = await window.cth.spawnPty({
        id: GOD_PTY,
        cwd: config.harnessHome!,
        command: exe,
        args,
        cols: 100,
        rows: 30,
        hive: { id: GOD_ID, name: 'Michael', cwd: config.harnessHome!, isGod: true, role: 'orchestrator (god)' }
      });
      if (!res.ok || cancelled) return;
      const god: Agent = {
        id: GOD_ID,
        name: 'Michael',
        character: 'michael',
        accent: 'lemon',
        description: 'god — runs the floor, triages requests, escalates only critical calls to you',
        project: 'hive',
        tmuxTarget: '',
        cwd: config.harnessHome!,
        status: 'idle',
        action: 'running the floor',
        progress: 0,
        currentStation: 'desk',
        ptyId: GOD_PTY,
        command: command.trim(),
        isGod: true,
        recentTextTs: Date.now()
      };
      useStore.getState().addAgent(god);
    }, 1200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [config?.onboardingComplete, config?.harnessHome]);

  // 2) Drive avatars from real hook events emitted by each agent's shim.
  useEffect(() => {
    return window.cth.onHiveHookEvent((e) => {
      if (!e.agentId) return;
      const { updateAgent, agents } = useStore.getState();
      const self = agents.find((a) => a.id === e.agentId);
      if (!self) return;
      // Hook events are the authoritative status source for real agents (the
      // pty-stream parser only refines the on-floor action/station).
      if (e.event === 'PreToolUse' && e.tool) {
        const m = TOOL_STATION[e.tool] ?? { station: 'desk' as StationKind };
        updateAgent(e.agentId, { status: 'working', currentStation: m.station, carrying: m.carry, action: `using ${e.tool}` });
      } else if (e.event === 'PostToolUse' || e.event === 'UserPromptSubmit') {
        // A turn is in progress (prompt submitted / tool just finished) — keep
        // it working so it doesn't flicker idle between tool calls.
        updateAgent(e.agentId, { status: 'working' });
      } else if (e.event === 'Stop' || e.event === 'SubagentStop') {
        updateAgent(e.agentId, { status: 'idle', action: 'idle', carrying: undefined });
      } else if (e.event === 'Notification') {
        // Only the god agent escalates to the human ("needs you"). Sub-agents
        // are autonomous — a notification means they're parked waiting on god,
        // not on you, so they read as "waiting" rather than "blocked".
        updateAgent(e.agentId, { status: self.isGod ? 'blocked' : 'waiting' });
      }
    });
  }, []);

  // 3) Wake idle agents holding unread inbox messages.
  useEffect(() => {
    if (!config?.onboardingComplete) return;
    const iv = setInterval(async () => {
      const agents = useStore.getState().agents.filter(
        (a) => a.ptyId && (a.status === 'idle' || a.status === 'waiting')
      );
      for (const a of agents) {
        try {
          const count = (await window.cth.hiveInbox(a.id)).length;
          if (count > 0 && nudged.current[a.id] !== count) {
            nudged.current[a.id] = count;
            await submitToPty(
              a.ptyId!,
              'You have new hive inbox message(s) — read your inbox, act on them now, and move handled ones to inbox/.done/. Act autonomously; only message god if you genuinely need a decision.'
            );
          } else if (count === 0) {
            nudged.current[a.id] = 0;
          }
        } catch { /* ignore */ }
      }
    }, 4000);
    return () => clearInterval(iv);
  }, [config?.onboardingComplete]);
}
