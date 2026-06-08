/**
 * Agent providers — the CLI a worker runs on. The app is no longer Claude-only:
 * a worker can run Claude Code, the OpenAI Codex CLI (`codex`), or the
 * Antigravity CLI (`agy`, Gemini models), or any custom command. Each provider
 * declares how to build its spawn command (model flag, auto-mode flag) and
 * whether it accepts the hive's Claude-specific identity injection
 * (`--append-system-prompt` + `--settings`).
 *
 * Shared between main and renderer; keep it dependency-free (no electron, no UI).
 * Mirrors the shape of the upstream provider-preset work (PR #47 / issue #21) so
 * the two reconcile cleanly — this build adds the `antigravity` preset alongside
 * the existing `codex` preset.
 */
import type { CmdGroup } from './claudeCommands';
import { COMMAND_GROUPS as CLAUDE_COMMAND_GROUPS } from './claudeCommands';
import { CODEX_COMMAND_GROUPS } from './codexCommands';

export type AgentProvider = 'claude' | 'codex' | 'antigravity' | 'custom';

export interface AgentProviderPreset {
  id: AgentProvider;
  label: string;
  /** The binary spawned when the user hasn't typed a custom command. */
  defaultCommand: string;
  /** Slash / CLI command reference for this provider. */
  commandGroups: CmdGroup[];
  /** Environment variable to set for non-interactive / first-run suppression. */
  nonInteractiveEnv?: Record<string, string>;
  /** Flag(s) appended to the command string when auto mode is active.
   *  Kept alongside `autoFlag` (same value) for the HEAD consumers that read
   *  `autoModeFlag` via `autoModeFlagForProvider`. */
  autoModeFlag: string;
  /** Show a model picker and splice the model into the command. */
  supportsModel: boolean;
  /** Flag that selects the session model, e.g. `--model`. */
  modelFlag?: string;
  /** Flag appended when the floor is in auto (skip-permissions) mode.
   *  PR #54 consumers read this; mirrors `autoModeFlag`. */
  autoFlag?: string;
  /** Claude Code accepts the hive identity injection (`--append-system-prompt`
   *  + hook `--settings`). Other CLIs don't — they spawn with the shared AGENT_*
   *  env only. Gates the Claude-specific spawn injection in hive.ensureAgent. */
  hiveAware: boolean;
  /** Whether the router may DELIVER inbox mail to this provider (vs bouncing it
   *  to the god). Requires a way for the agent to actually drain its inbox: Claude
   *  via its Stop hook, Antigravity via the agy-hook bridge's Stop→drain, Codex
   *  via the renderer's idle inbox-wake nudge (no hook surface of its own). A
   *  provider with no inbox-drain path (custom) can't, so its mail still bounces.
   *  Distinct from hiveAware: agy/codex are NOT hiveAware (no Claude injection)
   *  but CAN receive inbox. */
  canReceiveInbox: boolean;
  /** For non-hive-aware CLIs that still take an INITIAL prompt to orient the
   *  session (Antigravity's `agy -i "<prompt>"`), the flag to pass it under. The
   *  hive identity+protocol rides in as the first turn — the closest thing to
   *  Claude's `--append-system-prompt` these CLIs offer. undefined = the CLI
   *  takes its initial prompt POSITIONALLY (Codex: `codex "<prompt>"`) and the
   *  injection branch appends it as a quoted trailing arg instead of a flag. */
  initialPromptFlag?: string;
  /** Flag to resume a prior session on respawn, given the recorded session id
   *  (Claude `--resume <sid>`, Antigravity `--conversation <id>`). undefined = no
   *  resume support, spawn fresh. */
  resumeFlag?: string;
}

export const AGENT_PROVIDER_PRESETS: AgentProviderPreset[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    defaultCommand: 'claude',
    commandGroups: CLAUDE_COMMAND_GROUPS,
    autoModeFlag: '--permission-mode bypassPermissions',
    supportsModel: true,
    modelFlag: '--model',
    autoFlag: '--permission-mode bypassPermissions',
    hiveAware: true,
    canReceiveInbox: true,
    resumeFlag: '--resume'
  },
  {
    id: 'codex',
    label: 'Codex',
    defaultCommand: 'codex',
    commandGroups: CODEX_COMMAND_GROUPS,
    // -a never: never prompt for approval; -s workspace-write: sandbox scoped to
    // the workspace (no outbound network). Matches the non-interactive intent of
    // Claude's bypassPermissions while retaining a safety boundary.
    autoModeFlag: '-a never -s workspace-write',
    autoFlag: '-a never -s workspace-write',
    // Suppresses first-run interactive prompts (directory-trust gate, installer).
    nonInteractiveEnv: { CODEX_NON_INTERACTIVE: '1' },
    supportsModel: true,
    modelFlag: '--model',
    // Codex is NOT hiveAware: it has no Claude `--append-system-prompt`/`--settings`
    // hook surface. The hive protocol is injected as Codex's INITIAL prompt, which
    // it takes POSITIONALLY (`codex "<prompt>"`) — hence initialPromptFlag is
    // undefined and hive.ts appends the prompt as a quoted trailing arg.
    hiveAware: false,
    // Codex can receive inbox: it has no Stop hook, but the renderer's idle
    // inbox-wake nudge types the "you have new inbox mail" line into idle Codex
    // PTYs (same path as agy), so mail is delivered rather than bounced to god.
    canReceiveInbox: true,
    initialPromptFlag: undefined,
    // Codex has no stable session-resume CLI flag in the curated reference; spawn
    // fresh on respawn (the protocol is re-injected as the initial prompt anyway).
    resumeFlag: undefined
  },
  {
    id: 'antigravity',
    label: 'Antigravity · Gemini',
    defaultCommand: 'agy',
    commandGroups: [],
    autoModeFlag: '--dangerously-skip-permissions',
    supportsModel: true,
    modelFlag: '--model',
    autoFlag: '--dangerously-skip-permissions',
    hiveAware: false,
    canReceiveInbox: true, // via the agy-hook bridge (Stop→drain); verified agy honors hook decisions
    initialPromptFlag: '-i', // agy --prompt-interactive: orient the session, then continue
    resumeFlag: '--conversation' // agy: resume a previous conversation by ID
  },
  {
    id: 'custom',
    label: 'Custom',
    defaultCommand: '',
    commandGroups: [],
    autoModeFlag: '',
    supportsModel: false,
    autoFlag: '',
    hiveAware: false,
    canReceiveInbox: false // no inbox-drain path → mail bounces to the god
  }
];

export function isAgentProvider(value: unknown): value is AgentProvider {
  return (
    value === 'claude' ||
    value === 'codex' ||
    value === 'antigravity' ||
    value === 'custom'
  );
}

export function normalizeAgentProvider(value: unknown): AgentProvider | undefined {
  return isAgentProvider(value) ? value : undefined;
}

export function providerPreset(provider: AgentProvider): AgentProviderPreset {
  return AGENT_PROVIDER_PRESETS.find((p) => p.id === provider) ?? AGENT_PROVIDER_PRESETS[0];
}

export function isClaudeProvider(provider: AgentProvider | undefined): boolean {
  return provider === 'claude';
}

/** Whether this provider takes the hive's Claude-only identity injection. */
export function isHiveAwareProvider(provider: AgentProvider | undefined): boolean {
  return providerPreset(provider ?? 'claude').hiveAware;
}

/** Whether the router may deliver inbox mail to this provider (else bounce to
 *  the god). True for any provider that can actually drain its inbox — Claude
 *  (Stop hook), Antigravity (agy-hook Stop→drain bridge) and Codex (renderer
 *  idle inbox-wake nudge); false for hookless custom commands. */
export function canReceiveInbox(provider: AgentProvider | undefined): boolean {
  return providerPreset(provider ?? 'claude').canReceiveInbox;
}

/** The bare executable from a command string ('agy --model x' → 'agy'). */
function commandBinary(command: string | undefined): string {
  const first = (command ?? '').trim().split(/\s+/)[0] ?? '';
  // strip a path + extension so 'C:\...\agy.exe' and '/usr/bin/claude' both map
  const leaf = first.split(/[\\/]/).pop() ?? first;
  return leaf.replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase();
}

/** Infer the provider from a command (or honor an explicit override). */
export function inferAgentProvider(command: string | undefined, explicit?: unknown): AgentProvider {
  const normalized = normalizeAgentProvider(explicit);
  if (normalized) return normalized;
  const bin = commandBinary(command);
  if (bin === 'codex') return 'codex';
  if (bin === 'agy' || bin === 'antigravity') return 'antigravity';
  if (bin === 'claude' || !bin) return 'claude';
  return 'custom';
}

export function defaultCommandForProvider(provider: AgentProvider, fallback = ''): string {
  if (provider === 'custom') return fallback;
  return providerPreset(provider).defaultCommand || fallback;
}

/** Returns the preset's auto-mode CLI flag for the given provider. Empty string = no flag. */
export function autoModeFlagForProvider(provider: AgentProvider): string {
  return providerPreset(provider).autoModeFlag ?? '';
}

/** Returns any env vars the provider needs for non-interactive / first-run suppression. */
export function nonInteractiveEnvForProvider(provider: AgentProvider): Record<string, string> {
  return providerPreset(provider).nonInteractiveEnv ?? {};
}

/** Returns the command reference groups for the given provider. */
export function commandGroupsForProvider(provider: AgentProvider): CmdGroup[] {
  return providerPreset(provider).commandGroups ?? [];
}
