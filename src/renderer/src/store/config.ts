// Mirrors src/main/config.ts. Kept as a renderer-side type-only module
// so we don't have to reach into the preload package to type-check.

export interface HarnessConfig {
  onboardingComplete: boolean;
  harnessHome: string | null;
  registeredRepos: string[];
  autoMode: boolean;
  defaultCommand: string;
  semanticMemory: boolean;
  embeddingModel: 'minilm' | 'embeddinggemma';
}

/** Build the command line to feed into spawnPty, honoring autoMode. */
export function buildSpawnCommand(config: Pick<HarnessConfig, 'defaultCommand' | 'autoMode'>): string {
  const base = config.defaultCommand || 'claude';
  return config.autoMode ? `${base} --permission-mode bypassPermissions` : base;
}
