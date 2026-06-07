/**
 * Closing Time — the graceful, data-loss-free shutdown protocol.
 *
 * Killing the PTYs mid-thought loses whatever the agents were holding in
 * working memory: uncommitted WIP, unrecorded decisions, half-updated
 * memory.md files. "Closing time" closes the floor the way a real office
 * does: the human announces it, every worker packs up and confirms, the
 * manager locks the door.
 *
 *   1. The human clicks "closing time" in the quit dialog.
 *   2. We mail the god agent a shutdown brief: broadcast closing time to the
 *      team; every worker commits/parks WIP, appends state + next steps to
 *      its memory.md, then replies with subject CLOSING-TIME-ACK.
 *   3. The god waits for every ACK (the harness shows live progress by
 *      watching the same inbox traffic), saves its own memory, and sends a
 *      message with subject CLOSING-TIME-COMPLETE.
 *   4. The router observer spots that message → the app tears down and quits.
 *
 * Everything rides the existing hive rails: inbox delivery, the idle
 * inbox-wake nudge, and Stop-hook draining already guarantee the messages
 * get acted on. This module only injects the kickoff mail and watches the
 * routed traffic — it never types into terminals.
 *
 * Runs in the Electron main process.
 */
import type { WebContents } from 'electron';
import type { HiveManager, HiveMessage } from './hive';

export type ClosingTimePhase =
  | 'started' | 'progress' | 'complete' | 'timeout' | 'cancelled';

export interface ClosingTimeEvent {
  phase: ClosingTimePhase;
  /** Workers that have ACKed so far / total workers being waited on. */
  acked: number;
  total: number;
}

/** Subject markers. Deliberately forgiving (case, -/_/space) — agents write
 *  these by hand, so "Closing Time Ack" must count as well as the canonical
 *  CLOSING-TIME-ACK the brief asks for. */
const ACK_RE = /CLOSING[-_\s]*TIME[-_\s]*ACK/i;
const COMPLETE_RE = /CLOSING[-_\s]*TIME[-_\s]*COMPLETE/i;

/** How long to wait before surfacing "this is taking long — force quit?".
 *  Compaction or a long tool call can easily hold an ACK for a few minutes. */
const TIMEOUT_MS = 6 * 60_000;
/** Grace after COMPLETE before tearing down, so the god's final commit/log
 *  writes land on disk and the floor visibly concludes. */
const TEARDOWN_GRACE_MS = 2_500;

export class ClosingTimeController {
  private active = false;
  private godId = 'god';
  private workers = new Set<string>();
  private acked = new Set<string>();
  private timeoutTimer: NodeJS.Timeout | null = null;
  private teardownTimer: NodeJS.Timeout | null = null;

  constructor(
    private hive: HiveManager,
    private getWebContents: () => WebContents | null,
    /** Called once the god concluded — runs the real teardown + app.quit(). */
    private onConcluded: () => void
  ) {}

  isActive(): boolean {
    return this.active;
  }

  /** Kick off the protocol. Returns an error string when the floor cannot run
   *  it (no live god agent) so the UI can fall back to the hard quit. */
  start(): { ok: boolean; error?: string } {
    if (this.active) {
      // Re-pressed while running (e.g. from the timeout view): keep waiting.
      this.armTimeout();
      this.emitState('progress');
      return { ok: true };
    }
    const reg = this.hive.registry();
    this.godId = reg.godId ?? 'god';
    const god = reg.agents[this.godId];
    if (!god || god.archived) {
      return { ok: false, error: 'No orchestrator is running — closing time needs the god agent to collect the reports.' };
    }

    this.workers = new Set(
      Object.keys(reg.agents).filter((id) => {
        const a = reg.agents[id];
        return !a.archived && !a.isGod && !a.isAssistant && id !== this.godId;
      })
    );
    this.acked = new Set();
    this.active = true;

    const names = [...this.workers]
      .map((id) => `${reg.agents[id]?.name ?? id} (${id})`)
      .join(', ') || '(none — the floor is just you)';

    this.hive.send({
      to: 'god',
      act: 'request',
      subject: 'CLOSING TIME — run the shutdown protocol now',
      body: [
        'The human pressed "closing time": the harness will close as soon as you confirm the floor is safe. Run this protocol now, before anything else:',
        '',
        `1. BROADCAST closing time to the team (message with "to":"broadcast"). Current workers: ${names}.`,
        '   Tell each worker to immediately: park or commit any work-in-progress safely, append its current state + concrete next steps to its memory.md, and then reply to you with a message whose subject is exactly "CLOSING-TIME-ACK".',
        '2. WAIT and keep draining your inbox until EVERY worker above has sent its CLOSING-TIME-ACK. Nudge stragglers once if needed.',
        '3. Save your own state: update board.md and append your shift summary to your memory.md.',
        `4. CONCLUDE by sending a message with "to":"human" and the subject exactly "CLOSING-TIME-COMPLETE" — the harness watches for it and closes the app. Do not send it before every worker has acked: the harness independently verifies the ACKs and will reject a premature conclusion.`,
        '',
        this.workers.size === 0
          ? 'There are no workers on the floor right now — do steps 3 and 4 immediately.'
          : 'The prep assistant saves its own memory separately — do NOT wait for it and do not message it.',
        'This is a shutdown: do not start new work and do not accept new tasks.'
      ].join('\n')
    }, 'human');

    this.armTimeout();
    this.emitState('started');
    return { ok: true };
  }

  /** Human changed their mind — stand the floor back up. */
  cancel(): void {
    if (!this.active) return;
    this.cleanup();
    this.emitState('cancelled');
    try {
      this.hive.send({
        to: 'god',
        act: 'inform',
        subject: 'CLOSING TIME CANCELLED',
        body: 'The human cancelled the shutdown — disregard the closing-time protocol and resume normal operation. Any memory saves already done are a bonus, not a problem.'
      }, 'human');
    } catch { /* best-effort */ }
  }

  /** Router observer — called by the hive for every routed message. */
  onRouted(msg: HiveMessage, targets: string[]): void {
    if (!this.active) return;
    // A worker reporting in. Counted only for known workers, and only when the
    // ACK actually reached the god (not e.g. a stray broadcast echo).
    if (ACK_RE.test(msg.subject) && this.workers.has(msg.from) && targets.includes(this.godId)) {
      if (!this.acked.has(msg.from)) {
        this.acked.add(msg.from);
        this.emitState('progress');
      }
      return;
    }
    // The god concluding. COMPLETE is only honored from the god itself — a
    // worker can't (accidentally or otherwise) shut down the whole floor.
    if (COMPLETE_RE.test(msg.subject) && msg.from === this.godId) {
      // Trust but VERIFY: the god is told to wait for every ACK, but the
      // whole point of closing time is that no worker loses unsaved state —
      // so a premature COMPLETE must not close the floor. Workers whose
      // terminal was closed mid-protocol (archived) are excused: their ACK
      // can never arrive and their session is gone either way.
      const reg = this.hive.registry();
      const pending = [...this.workers].filter(
        (id) => !this.acked.has(id) && !reg.agents[id]?.archived
      );
      if (pending.length > 0) {
        const names = pending.map((id) => `${reg.agents[id]?.name ?? id} (${id})`).join(', ');
        this.hive.send({
          to: 'god',
          act: 'refuse',
          subject: 'CLOSING TIME — conclusion rejected, workers still missing',
          body: [
            `The harness is still missing a CLOSING-TIME-ACK from: ${names}.`,
            'The app stays open until every worker has confirmed its memory is saved.',
            'Chase the stragglers (re-send the closing-time instruction to each), wait for their ACKs, then send CLOSING-TIME-COMPLETE again.'
          ].join('\n')
        }, 'human');
        this.emitState('progress');
        return;
      }
      this.cleanup();
      this.active = true; // stays "active" through the grace so the UI holds
      this.emitState('complete');
      this.teardownTimer = setTimeout(() => {
        this.active = false;
        this.onConcluded();
      }, TEARDOWN_GRACE_MS);
    }
  }

  private armTimeout(): void {
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    this.timeoutTimer = setTimeout(() => {
      if (this.active) this.emitState('timeout');
    }, TIMEOUT_MS);
  }

  private cleanup(): void {
    if (this.timeoutTimer) { clearTimeout(this.timeoutTimer); this.timeoutTimer = null; }
    if (this.teardownTimer) { clearTimeout(this.teardownTimer); this.teardownTimer = null; }
    this.active = false;
  }

  private emitState(phase: ClosingTimePhase): void {
    const ev: ClosingTimeEvent = { phase, acked: this.acked.size, total: this.workers.size };
    try { this.getWebContents()?.send('app:closingTime', ev); } catch { /* window tore down */ }
  }
}
