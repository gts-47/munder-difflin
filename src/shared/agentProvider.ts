/**
 * Agent providers — the CLI a worker runs on. The app is no longer Claude-only:
 * a worker can run Claude Code or the Antigravity CLI (`agy`, Gemini models), or
 * any custom command. Each provider declares how to build its spawn command
 * (model flag, auto-mode flag) and whether it accepts the hive's Claude-specific
 * identity injection (`--append-system-prompt` + `--settings`).
 *
 * Shared between main and renderer; keep it dependency-free (no electron, no UI).
 * Mirrors the shape of the upstream provider-preset work (PR #47 / issue #21) so
 * the two reconcile cleanly — this build adds the `antigravity` preset.
 */

export type AgentProvider = 'claude' | 'antigravity' | 'custom';

export interface AgentProviderPreset {
  id: AgentProvider;
  label: string;
  /** The binary spawned when the user hasn't typed a custom command. */
  defaultCommand: string;
  /** Show a model picker and splice the model into the command. */
  supportsModel: boolean;
  /** Flag that selects the session model, e.g. `--model`. */
  modelFlag?: string;
  /** Flag appended when the floor is in auto (skip-permissions) mode. */
  autoFlag?: string;
  /** Claude Code accepts the hive identity injection (`--append-system-prompt`
   *  + hook `--settings`). Other CLIs don't — they spawn with the shared AGENT_*
   *  env only, and direct hive mail to them bounces to the god. */
  hiveAware: boolean;
}

export const AGENT_PROVIDER_PRESETS: AgentProviderPreset[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    defaultCommand: 'claude',
    supportsModel: true,
    modelFlag: '--model',
    autoFlag: '--permission-mode bypassPermissions',
    hiveAware: true
  },
  {
    id: 'antigravity',
    label: 'Antigravity · Gemini',
    defaultCommand: 'agy',
    supportsModel: true,
    modelFlag: '--model',
    autoFlag: '--dangerously-skip-permissions',
    hiveAware: false
  },
  {
    id: 'custom',
    label: 'Custom',
    defaultCommand: '',
    supportsModel: false,
    hiveAware: false
  }
];

export function isAgentProvider(value: unknown): value is AgentProvider {
  return value === 'claude' || value === 'antigravity' || value === 'custom';
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
  if (bin === 'agy' || bin === 'antigravity') return 'antigravity';
  if (bin === 'claude' || !bin) return 'claude';
  return 'custom';
}

export function defaultCommandForProvider(provider: AgentProvider, fallback = ''): string {
  if (provider === 'custom') return fallback;
  return providerPreset(provider).defaultCommand || fallback;
}
