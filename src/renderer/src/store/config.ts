// Mirrors src/main/config.ts. Kept as a renderer-side type-only module
// so we don't have to reach into the preload package to type-check.

import {
  AGENT_PROVIDER_PRESETS,
  providerPreset,
  inferAgentProvider,
  isClaudeProvider,
  type AgentProvider
} from '@shared/agentProvider';

export {
  AGENT_PROVIDER_PRESETS,
  providerPreset,
  inferAgentProvider,
  isClaudeProvider,
  type AgentProvider
};

/** A recurring auto-dispatched mission (mirrors src/main/config.ts). */
export interface ScheduledMission {
  id: string;
  label: string;
  intervalMs: number;
  to: string;
  body: string;
  enabled: boolean;
  autoCompact?: boolean;
  lastFiredAt?: number;
  kind?: 'dispatch' | 'heartbeat';
  quietThresholdMs?: number;
}

/** Circuit-breaker thresholds (mirrors src/main/config.ts CircuitBreakerConfig). */
export interface CircuitBreakerConfig {
  enabled?: boolean;
  hardStop?: boolean;
  repeatedToolLimit?: number;
  errorStormLimit?: number;
  tokenVelocityPerMin?: number;
}

export interface HarnessConfig {
  onboardingComplete: boolean;
  harnessHome: string | null;
  registeredRepos: string[];
  autoMode: boolean;
  defaultCommand: string;
  /** Default model for newly spawned agents (e.g. 'claude-sonnet-4-6[1m]'); unset = CLI default. */
  defaultModel?: string;
  semanticMemory: boolean;
  embeddingModel: 'minilm' | 'embeddinggemma';
  missions?: ScheduledMission[];
  opsStandupSeeded?: boolean;
  heartbeatSeeded?: boolean;
  notifications?: boolean;
  slackEnabled?: boolean;
  slackSigningSecret?: string;
  slackBotToken?: string;
  slackChannelId?: string;
  slackPort?: number;
  costCapUsd?: number;
  /** Hard total-token ceiling across active agents (the user-facing budget). */
  costCapTokens?: number;
  /** Per-agent total-token ceiling, keyed by agent id. Overrides the floor budget
   *  for that agent's meter and trips the breaker for it alone. */
  agentTokenCaps?: Record<string, number>;
  maxTurns?: number;
  circuitBreaker?: CircuitBreakerConfig;
}

/** The Sonnet model with the 1M-token context window — used for Michael's prep
 *  assistant (cheap, large-context context gathering). Mirrors ASSISTANT_MODEL
 *  in src/main/assistant.ts; keep the two in sync. */
export const ASSISTANT_MODEL = 'claude-sonnet-4-6[1m]';

export interface ModelOption {
  /** undefined = use the CLI default (no --model flag) */
  id?: string;
  label: string;
}

/** The models offered in the "add agent" picker and the per-agent selector.
 *  `[1m]` selects the 1M-token context window variant. */
export const AGENT_MODELS: ModelOption[] = [
  { id: undefined, label: 'default' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8' },
  { id: 'claude-opus-4-8[1m]', label: 'Opus 4.8 · 1M' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: ASSISTANT_MODEL, label: 'Sonnet 4.6 · 1M' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' }
];

/** Gemini models offered when an agent runs on the Antigravity CLI (`agy`).
 *  `--model` is free-form, so these are presets — the command field stays
 *  editable. Run `agy models` (once logged in) for the live list. */
export const ANTIGRAVITY_MODELS: ModelOption[] = [
  { id: undefined, label: 'default' },
  { id: 'gemini-3-pro', label: 'Gemini 3 Pro' },
  { id: 'gemini-3-flash', label: 'Gemini 3 Flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }
];

/** The model preset list for a given provider's picker. */
export function modelsForProvider(provider: AgentProvider): ModelOption[] {
  return provider === 'antigravity' ? ANTIGRAVITY_MODELS : AGENT_MODELS;
}

/** Build the command line to feed into spawnPty, honoring the provider's flags,
 *  autoMode, and an optional per-agent model override. Claude keeps the user's
 *  configured `defaultCommand`; other providers use their preset binary so the
 *  app works without Claude installed. */
export function buildSpawnCommand(
  config: Pick<HarnessConfig, 'defaultCommand' | 'autoMode'>,
  model?: string,
  provider: AgentProvider = inferAgentProvider(config.defaultCommand)
): string {
  const preset = providerPreset(provider);
  const base =
    provider === 'claude'
      ? config.defaultCommand || preset.defaultCommand
      : provider === 'custom'
        ? config.defaultCommand || ''
        : preset.defaultCommand;
  let cmd = base;
  if (preset.supportsModel && model && preset.modelFlag) cmd = `${cmd} ${preset.modelFlag} ${model}`;
  if (config.autoMode && preset.autoFlag) cmd = `${cmd} ${preset.autoFlag}`;
  return cmd;
}
