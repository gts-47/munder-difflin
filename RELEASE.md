# Munder Difflin v0.2.4

**A local hive of Claude Code, Antigravity & Codex agents that run themselves** — messaging,
routing, and remembering, coordinated by a GOD orchestrator you talk to. Local-first and open source.

### → [**munderdiffl.in**](https://munderdiffl.in/) — see it in action, then grab a build below

---

## What's new in 0.2.4 — *Codex gets full hive parity*

Three CLIs, one hive. v0.2.4 promotes **Codex** to a first-class, hive-aware participant
and polishes the orchestrator's first impression:

- **Codex lifecycle-hook bridge — full hive parity** — Codex now joins the floor as a fully hive-aware provider. A native lifecycle-hook bridge maps Codex's events into the existing hook pipeline (live status + inbox-drain + outbox routing), discovered through Codex's `config.toml [hooks]` surface, with agy/codex dispatch unified behind one path. Verified running hive-aware in bypass-permissions mode. (#47, #54)
- **God opens to its Terminal by default** — selecting the orchestrator no longer reopens a stale "ASK ME" tab; the command center mounts to its terminal, with ASK ME one click away.
- **Multi-provider landing & launch** — the site now presents Claude Code, Antigravity (Gemini), and OpenAI Codex as equal first-class providers (one-line mobile badge), with a fresh v0.2.4 launch post + technical walkthrough.
- **Resilience fixes** — the heartbeat re-engages the god the moment actionable mail lands (not only on a quiet floor), and the Slack done-summary no longer retries forever on a terminal error (e.g. a bot token missing `chat:write`) — it records + logs once instead of flooding the console.

Everything from **v0.2.3** (first-class Antigravity, Codex inbox support, Schedules tab,
terminal work-orders, tunnelmole ingress) and earlier is included.
See the [CHANGELOG](https://github.com/chaitanyagiri/munder-difflin/blob/main/CHANGELOG.md) for full detail.

---

## ⤓ Downloads

Latest builds for every platform. The macOS build is **universal** — one DMG that runs on both
Apple Silicon and Intel.

### 🍎 macOS
| Build | File |
|---|---|
| Universal (Apple Silicon + Intel) | [`Munder-Difflin-0.2.4-mac-universal.dmg`](https://github.com/chaitanyagiri/munder-difflin/releases/latest/download/Munder-Difflin-0.2.4-mac-universal.dmg) |

### 🪟 Windows
| Build | File |
|---|---|
| Installer (x64) — *recommended* | [`Munder-Difflin-0.2.4-win-x64-setup.exe`](https://github.com/chaitanyagiri/munder-difflin/releases/latest/download/Munder-Difflin-0.2.4-win-x64-setup.exe) |
| Portable (x64, no install) | [`Munder-Difflin-0.2.4-win-x64-portable.exe`](https://github.com/chaitanyagiri/munder-difflin/releases/latest/download/Munder-Difflin-0.2.4-win-x64-portable.exe) |

### 🐧 Linux
| Build | File |
|---|---|
| AppImage (x86_64) | [`Munder-Difflin-0.2.4-linux-x86_64.AppImage`](https://github.com/chaitanyagiri/munder-difflin/releases/latest/download/Munder-Difflin-0.2.4-linux-x86_64.AppImage) |

### 📦 Source
[Source code (zip)](https://github.com/chaitanyagiri/munder-difflin/archive/refs/tags/v0.2.4.zip) ·
[Source code (tar.gz)](https://github.com/chaitanyagiri/munder-difflin/archive/refs/tags/v0.2.4.tar.gz)

> **Verify your download:** [`SHA256SUMS.txt`](https://github.com/chaitanyagiri/munder-difflin/releases/latest/download/SHA256SUMS.txt) — then `shasum -a 256 -c SHA256SUMS.txt` (macOS/Linux) or `Get-FileHash` (Windows).

> The links above always point at the **latest** release (`/releases/latest/download/…`),
> so this page stays correct across versions.

---

## First launch

- **macOS** — the build is **signed with a Developer ID** (hardened runtime). If macOS
  still shows an "unidentified developer" warning on first open, right-click the app →
  **Open** → **Open** once. After that, the first time agents touch a folder you'll get a
  single macOS privacy prompt for Documents/Desktop/Downloads — allow it once and the
  grant sticks (it covers the `claude` agents the app spawns), because the grant is bound
  to the app's stable signature.
- **Windows** — not code-signed yet; SmartScreen may show "Windows protected your PC" →
  **More info** → **Run anyway**.
- **Linux** — make the AppImage executable: `chmod +x Munder-Difflin-*.AppImage`, then run it.

---

## Requirements
- macOS 12+, Windows 10/11, or a modern Linux desktop
- [Claude Code](https://claude.com/claude-code) installed and on your `PATH` (and/or the Antigravity `agy` or OpenAI `codex` CLI for those providers)
- A Claude Code subscription (Munder Difflin drives your existing `claude` CLI — it doesn't replace it)

---

## 🛠 Build from source
```bash
git clone https://github.com/chaitanyagiri/munder-difflin.git
cd munder-difflin
npm install        # rebuilds node-pty for Electron
npm run dev        # launches the app with hot reload
```
Node 18+ and a C/C++ toolchain are required (Xcode CLT on macOS, Build Tools on Windows).
To produce installers yourself: `npm run dist` (current OS), or `dist:mac` / `dist:win` / `dist:linux`.

---

## What's inside
- **The simulation** — every agent is a real `claude` (or `agy` / `codex`) pseudo-terminal, visualized as an avatar on a watchable office floor (`node-pty` · `xterm.js` · Pixi.js).
- **MemPalace** — a markdown-first, semantic memory layer the whole office shares; cross-session recall in ~12ms.
- **GOD orchestrator + hive** — one agent you talk to routes work to specialists and stays autonomous, escalating only critical items (spend, destructive ops, scope) to you natively, through Claude Code's human-in-the-loop prompts.
- **Plugs into your setup** — your subscription, settings, skills, and MCP servers; `/remote-control` reaches the whole floor from your phone.

Full notes in the [CHANGELOG](https://github.com/chaitanyagiri/munder-difflin/blob/main/CHANGELOG.md).

---

## Links
[Website](https://munderdiffl.in/) ·
[Repo](https://github.com/chaitanyagiri/munder-difflin) ·
[Issues](https://github.com/chaitanyagiri/munder-difflin/issues) ·
[Contribute](https://github.com/chaitanyagiri/munder-difflin/blob/main/CONTRIBUTING.md) ·
[Become a patron](https://razorpay.me/@munderdifflinfund)

MIT-licensed. An affectionate parody — not affiliated with NBC's *The Office* or Dunder Mifflin.
