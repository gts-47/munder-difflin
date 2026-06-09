'use strict';

// Pure trigger-decision logic for the Slack mention filter.
// Extracted as plain CommonJS so test/slack.test.cjs can require() it directly
// without a TypeScript compile step — same pattern as compact-gate.cjs.
//
// Responsibilities:
//   - isMention: ev.type==='app_mention' OR text includes <@botUserId>
//   - activatedThreads: bounded FIFO set of thread roots where the bot was mentioned
//   - shouldTrigger: combines channel filter, self-loop safety, mention/thread check

/** Maximum number of thread roots to remember. FIFO eviction above this limit
 *  prevents unbounded memory growth in long-running bots. */
const ACTIVATED_THREADS_MAX = 500;

/**
 * Bounded FIFO set of thread timestamps where the bot was @-mentioned.
 * Once the bot is mentioned in a thread, all subsequent replies in that
 * thread trigger onMessage — until the entry is FIFO-evicted.
 */
class ActivatedThreads {
  constructor(maxSize = ACTIVATED_THREADS_MAX) {
    this.maxSize = maxSize;
    this._set = new Set();
    this._order = []; // FIFO eviction queue — parallel to _set
  }

  add(threadTs) {
    if (this._set.has(threadTs)) return; // already tracked
    if (this._set.size >= this.maxSize) {
      const oldest = this._order.shift();
      if (oldest !== undefined) this._set.delete(oldest);
    }
    this._set.add(threadTs);
    this._order.push(threadTs);
  }

  has(threadTs) { return this._set.has(threadTs); }
  get size()    { return this._set.size; }
}

/**
 * Decide whether a Slack event should trigger onMessage.
 *
 * @param ev              - The `payload.event` object (any shape, may be partial)
 * @param botUserId       - Cached bot user id (string) or null if not yet known
 * @param channelId       - Channel filter (string) or null/undefined for any channel
 * @param activatedThreads - Mutable ActivatedThreads instance (mutated on mention)
 * @returns {{ trigger: boolean, text: string }} — trigger: whether to fire onMessage;
 *          text: the raw ev.text string (stripping is done in the caller)
 */
function shouldTrigger(ev, botUserId, channelId, activatedThreads) {
  if (!ev) return { trigger: false, text: '' };

  // Channel filter
  const channelOk = !channelId || ev.channel === channelId;
  if (!channelOk) return { trigger: false, text: '' };

  // Self-loop + subtype safety: never trigger on edits/joins/bot posts.
  // ev.subtype is set for message-changed, channel-join, etc.
  if (ev.subtype || ev.bot_id) return { trigger: false, text: '' };

  const text = typeof ev.text === 'string' ? ev.text : '';

  // Is this an @-mention of the bot?
  const isMention =
    ev.type === 'app_mention' ||
    (ev.type === 'message' && botUserId != null && text.includes(`<@${botUserId}>`));

  // Is this a reply inside a thread where the bot was already mentioned?
  const isActivatedThread = !!(ev.thread_ts && activatedThreads.has(ev.thread_ts));

  if (!isMention && !isActivatedThread) return { trigger: false, text: '' };

  // On mention: activate the thread so future replies in it also trigger.
  // Use thread_ts if the mention is itself a reply, else the message's own ts.
  if (isMention) {
    const threadRoot = ev.thread_ts || ev.ts;
    if (threadRoot) activatedThreads.add(threadRoot);
  }

  return { trigger: true, text };
}

module.exports = { shouldTrigger, ActivatedThreads, ACTIVATED_THREADS_MAX };
