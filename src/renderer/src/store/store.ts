import { create } from 'zustand';
import type { AccentColorName } from '@/design/tokens';
import type { OfficeCharacterName } from '@/scene/office/cast';
import type { StatusKind } from '@/components/PixelBadge';

export type ToolKind =
  | 'Read' | 'Edit' | 'Write' | 'Bash' | 'WebFetch' | 'WebSearch'
  | 'Grep' | 'Glob' | 'TodoWrite' | 'MCP';

export type StationKind =
  | 'shelf' | 'terminal' | 'web' | 'board' | 'mailbox' | 'mcp' | 'desk';

export interface BlockReason {
  summary: string;                 // short headline shown on banner
  detail: string;                  // longer explanation
  command?: string;                // verbatim command awaiting confirmation, if any
  actions: Array<{
    label: string;
    kind: 'approve' | 'deny' | 'neutral';
    /** what we'd send to the tmux pane on click */
    send?: string;
  }>;
}

export interface Agent {
  id: string;
  name: string;
  /** which Office character represents this agent on the floor */
  character: OfficeCharacterName;
  accent: AccentColorName;
  /** persistent short context — what is this agent for (shown on the floor) */
  description: string;
  project: string;
  /** legacy field — populated only for the seeded mock agents */
  tmuxTarget: string;
  cwd: string;
  goal?: string;
  status: StatusKind;
  action: string;
  progress: number;
  currentStation?: StationKind;
  carrying?: ToolKind;
  /** latest assistant message, streamed character-by-character in the sidebar */
  recentAssistantText?: string;
  /** epoch ms — used to drive the typewriter so identical strings still re-stream */
  recentTextTs?: number;
  /** populated when status === 'blocked' */
  blockReason?: BlockReason;
  /** present iff this agent has a real PTY in the main process */
  ptyId?: string;
  /** the command being run in the PTY (e.g. 'claude') */
  command?: string;
  /** the last prompt the user submitted to this agent in Claude Code —
   *  shown on the floor as a card above the seated avatar */
  lastPrompt?: string;
  /** the orchestrator ("god") agent — seated in Michael's room, runs the floor */
  isGod?: boolean;
}

export interface FeedEntry {
  agentId: string;
  text: string;
  ts: number;
}

export type SidebarTab = 'terminal' | 'files';

interface State {
  agents: Agent[];
  selectedId: string | null;
  feeds: Record<string, string[]>;
  addAgentOpen: boolean;
  fullscreenAgentId: string | null;
  fullscreenFilePath: string | null;
  sidebarWidth: number;
  sidebarTab: SidebarTab;
  select: (id: string) => void;
  updateAgent: (id: string, patch: Partial<Agent>) => void;
  pushFeed: (id: string, line: string) => void;
  addAgent: (agent: Agent) => void;
  removeAgent: (id: string) => void;
  setAddAgentOpen: (open: boolean) => void;
  setFullscreen: (id: string | null) => void;
  setFullscreenFile: (path: string | null) => void;
  setSidebarWidth: (px: number) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  /** Drop persisted agents whose PTY is no longer alive in the main process.
   *  Called once at startup so a renderer reload (e.g. after the laptop sleeps)
   *  restores still-running agents and only removes truly-dead ones. */
  reconcileWithLivePtys: (livePtyIds: string[]) => void;
}

const LS_SIDEBAR_WIDTH = 'cth.sidebarWidth';
const LS_SIDEBAR_TAB = 'cth.sidebarTab';
const LS_AGENTS = 'cth.agents';
const LS_SELECTED = 'cth.selectedId';

// Fields that are large or transient — not worth persisting across reloads.
type PersistedAgent = Omit<Agent, 'recentAssistantText' | 'recentTextTs' | 'blockReason'>;

function persistAgents(agents: Agent[], selectedId: string | null): void {
  try {
    const slim: PersistedAgent[] = agents.map(({ recentAssistantText, recentTextTs, blockReason, ...rest }) => {
      void recentAssistantText; void recentTextTs; void blockReason;
      return rest;
    });
    window.localStorage.setItem(LS_AGENTS, JSON.stringify(slim));
    window.localStorage.setItem(LS_SELECTED, selectedId ?? '');
  } catch { /* noop */ }
}

function loadPersistedAgents(): Agent[] {
  try {
    const raw = window.localStorage.getItem(LS_AGENTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedAgent[];
    if (!Array.isArray(parsed)) return [];
    // Reset volatile run-state; the PTY stream / mock loop will repopulate it.
    return parsed.map((a) => ({
      ...a,
      status: 'idle',
      action: 'reconnecting…',
      currentStation: 'desk',
      carrying: undefined,
      recentTextTs: Date.now(),
    }));
  } catch {
    return [];
  }
}

function loadPersistedSelectedId(agents: Agent[]): string | null {
  try {
    const id = window.localStorage.getItem(LS_SELECTED);
    return id && agents.some((a) => a.id === id) ? id : (agents[0]?.id ?? null);
  } catch {
    return agents[0]?.id ?? null;
  }
}
const initialSidebarWidth = (() => {
  try {
    const v = window.localStorage.getItem(LS_SIDEBAR_WIDTH);
    const n = v ? parseInt(v, 10) : NaN;
    if (!Number.isNaN(n) && n >= 320 && n <= 1200) return n;
  } catch { /* noop */ }
  return 420;
})();
const initialSidebarTab: SidebarTab = (() => {
  try {
    const v = window.localStorage.getItem(LS_SIDEBAR_TAB);
    if (v === 'files' || v === 'terminal') return v;
  } catch { /* noop */ }
  return 'terminal';
})();

const initialAgents = loadPersistedAgents();
const initialSelectedId = loadPersistedSelectedId(initialAgents);

export const useStore = create<State>((set) => ({
  agents: initialAgents,
  selectedId: initialSelectedId,
  feeds: {},
  addAgentOpen: false,
  fullscreenAgentId: null,
  fullscreenFilePath: null,
  sidebarWidth: initialSidebarWidth,
  sidebarTab: initialSidebarTab,
  select: (id) => set((s) => { persistAgents(s.agents, id); return { selectedId: id }; }),
  updateAgent: (id, patch) =>
    set((s) => ({ agents: s.agents.map(a => a.id === id ? { ...a, ...patch } : a) })),
  pushFeed: (id, line) =>
    set((s) => ({ feeds: { ...s.feeds, [id]: [...(s.feeds[id] ?? []), line] } })),
  addAgent: (agent) =>
    set((s) => {
      const agents = [...s.agents, agent];
      persistAgents(agents, agent.id);
      return {
        agents,
        selectedId: agent.id,
        feeds: { ...s.feeds, [agent.id]: s.feeds[agent.id] ?? [] }
      };
    }),
  removeAgent: (id) =>
    set((s) => {
      const agents = s.agents.filter(a => a.id !== id);
      const { [id]: _gone, ...feeds } = s.feeds;
      const selectedId = s.selectedId === id ? (agents[0]?.id ?? null) : s.selectedId;
      persistAgents(agents, selectedId);
      return { agents, feeds, selectedId };
    }),
  reconcileWithLivePtys: (livePtyIds) =>
    set((s) => {
      const live = new Set(livePtyIds);
      // Keep agents with no PTY (synthetic) or whose PTY is still alive.
      const agents = s.agents.filter((a) => !a.ptyId || live.has(a.ptyId));
      if (agents.length === s.agents.length) return s;
      const feeds: Record<string, string[]> = {};
      for (const a of agents) feeds[a.id] = s.feeds[a.id] ?? [];
      const selectedId = agents.some((a) => a.id === s.selectedId)
        ? s.selectedId
        : (agents[0]?.id ?? null);
      persistAgents(agents, selectedId);
      return { agents, feeds, selectedId };
    }),
  setAddAgentOpen: (open) => set({ addAgentOpen: open }),
  setFullscreen: (id) => set({ fullscreenAgentId: id }),
  setFullscreenFile: (path) => set({ fullscreenFilePath: path }),
  setSidebarWidth: (px) => {
    const clamped = Math.min(1200, Math.max(320, Math.round(px)));
    try { window.localStorage.setItem(LS_SIDEBAR_WIDTH, String(clamped)); } catch { /* noop */ }
    set({ sidebarWidth: clamped });
  },
  setSidebarTab: (tab) => {
    try { window.localStorage.setItem(LS_SIDEBAR_TAB, tab); } catch { /* noop */ }
    set({ sidebarTab: tab });
  }
}));

export function selectedAgent(s: State): Agent | undefined {
  return s.agents.find(a => a.id === s.selectedId);
}
