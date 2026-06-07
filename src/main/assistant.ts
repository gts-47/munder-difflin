import { existsSync } from 'node:fs';
import { runHiddenClaude } from './hiddenClaude';

/**
 * Michael's silent prep assistant.
 *
 * Runs a HIDDEN interactive claude session (Haiku) that NEVER appears on the
 * office floor, agent list, or registry. Given a short, possibly vague
 * instruction the user parked for Michael, it explores read-only and rewrites
 * it into a self-contained context-rich prompt Michael can execute immediately.
 *
 * See hiddenClaude.ts for the session lifecycle.
 */

/** Haiku 4.5 — fast, draws from interactive plan quota (not Agent SDK credit). */
const ASSISTANT_MODEL = 'claude-haiku-4-5';

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

export async function enrichMessage(req: EnrichRequest): Promise<EnrichResult> {
  const message = (req.message ?? '').trim();
  if (!message) return { ok: false, error: 'empty message' };
  if (!req.cwd || !existsSync(req.cwd)) {
    return { ok: false, error: `working directory does not exist: ${req.cwd}` };
  }

  const repos = (req.repos ?? []).filter((r) => r && existsSync(r) && r !== req.cwd);
  const taskPrompt = buildTaskPrompt(message, req.cwd, repos);

  const result = await runHiddenClaude(taskPrompt, {
    model: req.model || ASSISTANT_MODEL,
    cwd: req.cwd,
    command: req.command,
    disallowedTools: ['Edit', 'Write', 'NotebookEdit'],
    addDirs: repos,
    timeoutMs: req.timeoutMs,
    env: req.env,
  });

  if (result.ok && result.text) return { ok: true, prompt: result.text };
  return { ok: false, error: result.error };
}
