---
title: "Launching Munder Difflin v0.2.3"
description: "Munder Difflin v0.2.3 makes the floor multi-provider: Claude Code, Antigravity (Gemini), and OpenAI Codex can now work as first-class hive participants."
date: 2026-06-09
category: story
categoryLabel: Story
type: Non-technical
primaryKeyword: "munder difflin v0.2.3"
secondaryKeywords: ["munder difflin release", "multi-provider agents", "antigravity gemini agents", "codex hive agents"]
tags: ["Story", "Release", "Multi-Agent", "Claude Code", "Codex", "Open Source"]
author:
  name: Chaitanya Giri
  initials: CG
faq:
  - q: "What's new in Munder Difflin v0.2.3?"
    a: "v0.2.3 is the multi-provider release. The floor is no longer Claude-only: Claude Code, Antigravity (Gemini via agy), and OpenAI Codex can work as hive participants. It also moves recurring missions into a dedicated Schedules tab, adds terminal work-order handoff for hookless providers, and replaces localtunnel with tunnelmole for Slack and webhook ingress."
  - q: "Can Antigravity agents participate in the hive?"
    a: "Yes. Antigravity workers run through the agy CLI. Because agy does not expose Claude-style append-system-prompt or settings hooks, Munder Difflin injects the hive identity and protocol as the initial prompt and uses a native agy-hook bridge to normalize lifecycle events into the existing hook pipeline."
  - q: "Can Codex agents read inbox mail and message back?"
    a: "Yes. In v0.2.3, Codex receives the hive protocol as its initial prompt, outbox messages are drained by the provider-agnostic router, and inbox mail reaches Codex through the renderer idle inbox-wake nudge."
  - q: "Why did Slack and webhook ingress move to tunnelmole?"
    a: "The previous localtunnel/loca.lt ingress started serving a browser interstitial that broke Slack URL verification and saved webhook URLs. v0.2.3 uses tunnelmole, where POST requests pass straight through, and failed tunnel startup now surfaces as a real error."
---

<div class="callout tldr"><span class="ic">TL;DR</span><p><strong>Munder Difflin v0.2.3</strong> makes the
floor <strong>multi-provider</strong>. Claude Code is still first-class, and now <strong>Antigravity</strong>
(Gemini through <code>agy</code>) and <strong>OpenAI Codex</strong> can join the same hive as working agents.
Schedules get their own Command-Center tab, hookless providers receive terminal <strong>WORK ORDER FROM HIVE</strong>
handoffs, and Slack/webhook ingress moves from localtunnel to <strong>tunnelmole</strong>.</p></div>

Munder Difflin started as a local harness for Claude Code agents. The core idea was not "run one terminal with
a nicer frame." It was: give terminal agents a shared memory, mailboxes, a router, and one GOD orchestrator you
can talk to while the team keeps working.

In v0.2.3, that idea stops being Claude-only.

The floor is now **multi-provider**. Claude Code, Antigravity, and Codex workers can sit in the same office,
receive work from the same hive, and report back through the same coordination layer. The implementation details
are different for each provider, because their CLIs expose different control surfaces. The user-facing result is
the important part: your agent team no longer has to be one model family wearing different names.

## The floor is multi-provider

The headline change is first-class **Antigravity** support. A worker can now run the Antigravity CLI (`agy`) as
a full hive participant, backed by Gemini and your Antigravity subscription rather than a separate API key.

Antigravity does not provide the same hooks Claude Code does. There is no Claude-style `--append-system-prompt`
or `--settings` hook path to lean on. So v0.2.3 takes a provider-specific route:

- the agent's hive identity and protocol are injected as the session's initial prompt;
- a native `agy-hook` bridge normalizes Antigravity lifecycle events into the existing hook pipeline;
- the worker gets the same live status and inbox-drain behavior as a Claude worker.

That means Antigravity can participate in the hive instead of living beside it as a generic terminal.

## Codex can message back

Codex support also crosses an important line in this release.

Before v0.2.3, a Codex terminal could spawn, but it did not really know the hive protocol. It did not reliably
read inbox mail or write outbox messages, which meant it was present on the floor without being a proper
collaborator.

Now Codex is treated as an inbox-capable provider:

- the hive protocol is injected as its initial positional prompt;
- its outbox is drained by the provider-agnostic router;
- inbox mail reaches it through the renderer's idle inbox-wake nudge.

The release notes describe this as "non-hive-aware-but-inbox-capable," which is the useful distinction. Codex
does not need Claude's hook model to become useful in the office. It needs a reliable protocol handoff and a
path for mail to reach the terminal when it is idle.

## Terminal work orders for hookless providers

Different CLIs expose different lifecycle hooks. v0.2.3 adds a practical fallback for providers that do not have
an inbox-drain path: the hive can type a terminal work order directly into the session.

When mail arrives for one of those agents, it receives a clear `WORK ORDER FROM HIVE` in its terminal. If the
renderer is not available, Munder Difflin falls back to bouncing the message to the GOD agent instead of silently
dropping it.

This is not as elegant as a native hook. It is better: it is honest about the provider's control surface and still
keeps the agent in the team.

## Schedules get their own tab

Recurring missions have been part of the system for a while: you can ask the floor to run a task every hour,
re-engage a quiet team, or keep a reviewer checking in. In v0.2.3, those missions move into a dedicated
**Schedules** tab in the Command Center.

That tab now owns recurring auto-dispatched missions and the adaptive heartbeat, instead of hiding them inside
an inline section. The change is small in code surface and large in day-to-day use: schedules are no longer a
secondary control. They are one of the main ways you run a persistent agent office.

## Slack and webhooks move to tunnelmole

The release also fixes a boring but important ingress problem.

Slack and generic webhook ingress used `localtunnel` / `loca.lt`. That path became unreliable because the public
tunnel now serves a browser interstitial. Browser interstitials are fatal for machine-to-machine POSTs: Slack's
`url_verification` request fails, and saved webhook URLs break even when the app thinks the tunnel started.

v0.2.3 moves both `slack.ts` and `webhook.ts` to **tunnelmole**. POSTs pass straight through, and if the tunnel
fails to start, the app surfaces a real error instead of pretending there is a usable public URL.

## What this release means

The v0.2.x line has been about making the floor durable enough to trust: observability, schedules, persistence,
context gauges, circuit breakers, and polish. v0.2.3 widens the actual team.

You can keep Claude Code as the orchestrator and add an Antigravity worker. You can bring Codex into the same
mailbox and memory loop. You can schedule work that lands in whichever provider makes sense. And when an outside
system sends work into the office through Slack or a webhook, the ingress path is less fragile.

The important part is not that every provider behaves identically. They do not. The important part is that the
hive now has provider-specific handoffs that make each one useful without pretending their CLIs are the same.

## Get v0.2.3

Munder Difflin is free, open source, and local-first on macOS, Windows, and Linux. Download v0.2.3 from the
[releases page](https://github.com/chaitanyagiri/munder-difflin/releases/latest), install the CLIs you want on
your `PATH` (`claude`, `agy`, and/or `codex`), and add them to the floor as workers.

Full release notes are in the [CHANGELOG](https://github.com/chaitanyagiri/munder-difflin/blob/main/CHANGELOG.md).
