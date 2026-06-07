import * as pty from 'node-pty';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { resolveCommand, userShellPath } from './shellEnv';
import { projectDir } from './transcript';

/**
 * Michael's silent prep assistant.
 *
 * Runs a HIDDEN interactive claude session (Haiku) that NEVER appears on the
 * office floor, agent list, or registry. Given a short, possibly vague
 * instruction the user parked for Michael, it explores read-only and rewrites
 * it into a self-contained context-rich prompt Michael can execute immediately.
 *
 * Uses an interactive PTY (not `claude -p`) so enrichment draws from the
 * user's normal interactive plan quota — not the separate Agent SDK credit that
 * moves to a claim-required pool from 2026-06-15.
 *
 * Session lifecycle: spawn → boot quiet → bracketed-paste prompt + \r →
 * idle-settle → transcript extract → kill. Ephemeral per-enrich (no /clear
 * needed; each call gets a fresh session and its own JSONL).
 */

/** Haiku 4.5 — fast, draws from interactive plan quota (not Agent SDK credit). */
const ASSISTANT_MODEL = 'claude-haiku-4-5';

/** ms of PTY silence that signals the TUI is ready for input (boot complete). */
const BOOT_QUIET_MS = 1500;
/** Hard cap: send the prompt at most this many ms after spawn (handles stalls). */
const BOOT_MAX_MS = 7000;
/**
 * ms of PTY silence after the prompt that signals response is complete.
 * Includes a small write-to-disk margin so the JSONL record is flushed.
 */
const IDLE_SETTLE_MS = 3500;
/** Absolute safety net for the whole enrichment round-trip. */
const DEFAULT_TIMEOUT_MS = 180_000;

export interface EnrichRequest {
  /** The raw instruction the user wants enriched. */
  message: string;
  /** Michael's working directory — the assistant's default cwd. */
  cwd: string;
  /** Registered project repos the assistant may read to gather context. */
  repos?: string[];
  /** Base claude command from config (only its binary name is used). */
  command?: string;
  /** Model override; defaults to Haiku 4.5. */
  model?: string;
  /** Hard cap so a runaway run can't wedge the queue. */
  timeoutMs?: number;
  /** Extra env merged over the resolved shell env (e.g. the shared MemPalace). */
  env?: Record<string, string>;
}

export interface EnrichResult {
  ok: boolean;
  /** The enriched, self-contained prompt for Michael. */
  prompt?: string;
  error?: string;
}

function buildTaskPrompt(message: string, cwd: string, repos: string[]): string {
  const repoList = repos.length
    ? repos.map((r) => `  - ${r}`).join('\n')
    : '  (none registered — work from the home directory above)';
  return [
    "You are Michael's silent prep assistant inside the Munder Difflin agent harness.",
    'Michael is the orchestrator who will act on the prompt you produce — autonomously, with no human in the loop.',
    'You are NOT visible to the user and you do NOT perform the task yourself. Your only job is to turn a short,',
    'possibly vague instruction into a single, self-contained, context-rich prompt that Michael can execute immediately.',
    '',
    `Your working directory is Michael's home: ${cwd}`,
    'Project repositories you may read to gather context (cd into the relevant one):',
    repoList,
    '',
    'Do this:',
    '1. Decide which project/directory this instruction concerns and cd into the most relevant repo',
    '   (or stay in the home directory if it is a hive/coordination task).',
    '2. Explore READ-ONLY to gather the concrete context Michael needs: exact file paths, current state,',
    '   relevant code, conventions, the active branch, and any constraints or gotchas. NEVER modify, create,',
    '   or delete files, and never run destructive or write commands.',
    "3. Rewrite the instruction into ONE clear prompt for Michael. Preserve the user's original intent exactly —",
    '   do not invent new scope. State the target directory, the specific files/symbols involved, the concrete',
    '   goal, and anything you discovered that Michael should know before starting.',
    '',
    'Output ONLY the final prompt text for Michael. No preamble, no explanation, no markdown code fences,',
    'no "Here is the prompt". Just the prompt itself.',
    '',
    '--- ORIGINAL INSTRUCTION FROM THE USER ---',
    message
  ].join('\n');
}

/**
 * Extract the last assistant text block from the transcript JSONL written
 * at or after `spawnedAt`. Looks in the projectDir for cwd, picks the file
 * with the most-recent mtime (the one this session wrote), and returns the
 * final text content block.
 */
function extractLastAssistantText(cwd: string, spawnedAt: number): string | null {
  try {
    const dir = projectDir(cwd);
    if (!existsSync(dir)) return null;

    const candidates: { f: string; mtime: number }[] = [];
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.jsonl')) continue;
      try {
        const mtime = statSync(path.join(dir, f)).mtimeMs;
        // Include files touched up to 5 s before spawn to handle pre-existing
        // sessions; we want the one written by this call, so we sort by mtime
        // and take the newest.
        if (mtime >= spawnedAt - 5000) candidates.push({ f, mtime });
      } catch { /* file removed between readdir and stat — skip */ }
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.mtime - a.mtime);

    const lines = readFileSync(path.join(dir, candidates[0].f), 'utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;
      let rec: { type?: unknown; message?: { content?: unknown[] } };
      try { rec = JSON.parse(trimmed); } catch { continue; }
      if (rec.type !== 'assistant') continue;
      const content = rec.message?.content;
      if (!Array.isArray(content)) continue;
      for (let j = content.length - 1; j >= 0; j--) {
        const block = content[j] as { type?: unknown; text?: unknown };
        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
          return block.text.trim();
        }
      }
    }
    return null;
  } catch { return null; }
}

export function enrichMessage(req: EnrichRequest): Promise<EnrichResult> {
  return new Promise((resolve) => {
    const message = (req.message ?? '').trim();
    if (!message) { resolve({ ok: false, error: 'empty message' }); return; }
    if (!req.cwd || !existsSync(req.cwd)) {
      resolve({ ok: false, error: `working directory does not exist: ${req.cwd}` });
      return;
    }

    const binary = (req.command || 'claude').trim().split(/\s+/)[0] || 'claude';
    const exe = resolveCommand(binary);
    const repos = (req.repos ?? []).filter((r) => r && existsSync(r) && r !== req.cwd);
    const taskPrompt = buildTaskPrompt(message, req.cwd, repos);

    const args: string[] = [
      '--model', req.model || ASSISTANT_MODEL,
      '--permission-mode', 'bypassPermissions',
      '--disallowedTools', 'Edit', 'Write', 'NotebookEdit',
    ];
    // --add-dir follows --disallowedTools; the leading -- signals the end of
    // the variadic tool list to the CLI parser.
    for (const r of repos) { args.push('--add-dir', r); }

    const spawnedAt = Date.now();
    let ptyProc: pty.IPty;
    try {
      ptyProc = pty.spawn(exe, args, {
        name: 'xterm-color',
        cols: 220,
        rows: 50,
        cwd: req.cwd,
        env: {
          ...process.env,
          PATH: userShellPath(),
          ...(req.env ?? {}),
        } as Record<string, string>,
      });
    } catch (e) {
      resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
      return;
    }

    let settled = false;
    let promptSent = false;
    let bootTimer: NodeJS.Timeout | null = null;
    let idleTimer: NodeJS.Timeout | null = null;
    // Declared before finish() so the closure can reference them.
    let bootMaxTimer: NodeJS.Timeout;
    let globalTimer: NodeJS.Timeout;

    const kill = () => { try { ptyProc.kill(); } catch { /* noop */ } };

    const finish = (r: EnrichResult) => {
      if (settled) return;
      settled = true;
      if (bootTimer) { clearTimeout(bootTimer); bootTimer = null; }
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      clearTimeout(bootMaxTimer);
      clearTimeout(globalTimer);
      kill();
      resolve(r);
    };

    const captureAndFinish = () => {
      const text = extractLastAssistantText(req.cwd, spawnedAt);
      finish(text
        ? { ok: true, prompt: text }
        : { ok: false, error: 'no assistant response found in transcript' });
    };

    const sendPrompt = () => {
      if (settled || promptSent) return;
      promptSent = true;
      if (bootTimer) { clearTimeout(bootTimer); bootTimer = null; }
      // Bracketed paste + enter (same mechanism as submitToPty in useHive.ts).
      ptyProc.write(`\x1b[200~${taskPrompt}\x1b[201~`);
      setTimeout(() => { if (!settled) ptyProc.write('\r'); }, 140);
    };

    bootMaxTimer = setTimeout(sendPrompt, BOOT_MAX_MS);
    globalTimer = setTimeout(
      () => finish({ ok: false, error: 'enrichment timed out' }),
      req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    ptyProc.onData(() => {
      if (!promptSent) {
        // Boot phase: reset quiet timer on every byte; send prompt once quiet.
        if (bootTimer) clearTimeout(bootTimer);
        bootTimer = setTimeout(sendPrompt, BOOT_QUIET_MS);
      } else {
        // Response phase: reset idle timer; capture once output goes quiet.
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(captureAndFinish, IDLE_SETTLE_MS);
      }
    });

    // If the session exits cleanly before we detect idle, try to capture anyway.
    ptyProc.onExit(() => { if (!settled) captureAndFinish(); });
  });
}
