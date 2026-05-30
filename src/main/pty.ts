import * as pty from 'node-pty';
import type { WebContents } from 'electron';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

interface PtySession {
  id: string;
  proc: pty.IPty;
  cwd: string;
  command: string;
}

export interface SpawnOptions {
  id: string;
  cwd: string;
  command: string;       // e.g. 'claude'
  args?: string[];
  cols?: number;
  rows?: number;
  /** Extra environment for the child (merged over the resolved shell env). */
  env?: Record<string, string>;
}

export class PtyManager {
  private sessions = new Map<string, PtySession>();
  private webContents: WebContents | null = null;

  attachWebContents(wc: WebContents) {
    this.webContents = wc;
  }

  /** Resolve a bare command (e.g. 'claude') against the user's PATH +
   *  common install locations. Needed because Electron's spawn env on
   *  macOS launches without the user's interactive shell PATH. */
  private resolveCommand(command: string): string {
    if (command.includes('/')) return command;
    // Try `which` against an interactive shell so we pick up nvm/asdf/brew paths.
    try {
      const res = spawnSync(process.env.SHELL ?? '/bin/zsh', ['-ilc', `which ${command}`], {
        encoding: 'utf8',
        timeout: 3000
      });
      const path = res.stdout.trim().split('\n').pop();
      if (path && existsSync(path)) return path;
    } catch { /* fall through */ }
    // Common explicit locations
    const candidates = [
      `/opt/homebrew/bin/${command}`,
      `/usr/local/bin/${command}`,
      `${process.env.HOME ?? ''}/.local/bin/${command}`,
      `${process.env.HOME ?? ''}/.claude/local/${command}`
    ];
    for (const c of candidates) if (existsSync(c)) return c;
    // Last resort — let node-pty try; will fail with ENOENT if missing.
    return command;
  }

  spawn(opts: SpawnOptions): { ok: boolean; error?: string } {
    if (this.sessions.has(opts.id)) {
      return { ok: false, error: `pty already exists for id ${opts.id}` };
    }
    if (!existsSync(opts.cwd)) {
      return { ok: false, error: `cwd does not exist: ${opts.cwd}` };
    }
    const resolved = this.resolveCommand(opts.command);
    try {
      // Build a user-shell PATH so child can resolve subprocess deps.
      const userPath = (() => {
        try {
          const res = spawnSync(process.env.SHELL ?? '/bin/zsh', ['-ilc', 'echo -n "$PATH"'], {
            encoding: 'utf8',
            timeout: 3000
          });
          return res.stdout.trim() || process.env.PATH || '';
        } catch {
          return process.env.PATH || '';
        }
      })();

      const proc = pty.spawn(resolved, opts.args ?? [], {
        name: 'xterm-256color',
        cols: opts.cols ?? 100,
        rows: opts.rows ?? 30,
        cwd: opts.cwd,
        env: {
          ...process.env,
          PATH: userPath,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          // Help apps that look for a real interactive shell
          FORCE_COLOR: '1',
          // Per-agent hive identity (AGENT_ID, HIVE_ROOT, …) when provided.
          ...(opts.env ?? {})
        } as Record<string, string>
      });

      this.sessions.set(opts.id, { id: opts.id, proc, cwd: opts.cwd, command: resolved });

      proc.onData((data) => {
        this.webContents?.send(`pty:data:${opts.id}`, data);
      });
      proc.onExit(({ exitCode, signal }) => {
        this.webContents?.send(`pty:exit:${opts.id}`, { exitCode, signal });
        this.sessions.delete(opts.id);
      });

      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  write(id: string, data: string): { ok: boolean; error?: string } {
    const s = this.sessions.get(id);
    if (!s) return { ok: false, error: `no pty: ${id}` };
    try {
      s.proc.write(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  resize(id: string, cols: number, rows: number): { ok: boolean; error?: string } {
    const s = this.sessions.get(id);
    if (!s) return { ok: false, error: `no pty: ${id}` };
    try {
      s.proc.resize(cols, rows);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  kill(id: string): { ok: boolean; error?: string } {
    const s = this.sessions.get(id);
    if (!s) return { ok: false, error: `no pty: ${id}` };
    try {
      s.proc.kill();
      this.sessions.delete(id);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  list(): Array<{ id: string; cwd: string; command: string; pid: number }> {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      cwd: s.cwd,
      command: s.command,
      pid: s.proc.pid
    }));
  }

  killAll() {
    for (const s of this.sessions.values()) {
      try { s.proc.kill(); } catch { /* noop */ }
    }
    this.sessions.clear();
  }
}
