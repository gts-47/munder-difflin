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
/** Per-message file cap — any extras beyond this are silently dropped. */
const MAX_FILES_PER_MESSAGE = 10;

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
 * @returns {{ trigger: boolean, text: string, files: object[] }} — trigger: whether to
 *          fire onMessage; text: the raw ev.text string (stripping is done in the caller);
 *          files: raw Slack file metadata extracted from ev.files[] (empty when none).
 */
function shouldTrigger(ev, botUserId, channelId, activatedThreads) {
  if (!ev) return { trigger: false, text: '', files: [] };

  // Channel filter
  const channelOk = !channelId || ev.channel === channelId;
  if (!channelOk) return { trigger: false, text: '', files: [] };

  // Self-loop + subtype safety: never trigger on bot posts, edits, joins, etc.
  // file_share IS allowed through — a file upload is eligible if it @-mentions the
  // bot or lands in an activated thread. All other subtypes remain blocked.
  if (ev.bot_id || (ev.subtype && ev.subtype !== 'file_share')) {
    return { trigger: false, text: '', files: [] };
  }

  const text = typeof ev.text === 'string' ? ev.text : '';

  // Is this an @-mention of the bot?
  const isMention =
    ev.type === 'app_mention' ||
    (ev.type === 'message' && botUserId != null && text.includes(`<@${botUserId}>`)) ||
    (ev.subtype === 'file_share' && botUserId != null && text.includes(`<@${botUserId}>`));

  // Is this a reply inside a thread where the bot was already mentioned?
  const isActivatedThread = !!(ev.thread_ts && activatedThreads.has(ev.thread_ts));

  if (!isMention && !isActivatedThread) return { trigger: false, text: '', files: [] };

  // On mention: activate the thread so future replies in it also trigger.
  // Use thread_ts if the mention is itself a reply, else the message's own ts.
  if (isMention) {
    const threadRoot = ev.thread_ts || ev.ts;
    if (threadRoot) activatedThreads.add(threadRoot);
  }

  // Extract file metadata from the event (file_share events carry ev.files[]).
  // Cap at MAX_FILES_PER_MESSAGE; only include entries that have a downloadable URL.
  const files = (Array.isArray(ev.files) ? ev.files : [])
    .filter((f) => f && typeof f.url_private === 'string' && f.url_private)
    .slice(0, MAX_FILES_PER_MESSAGE)
    .map((f) => ({
      id: f.id,
      url_private: f.url_private,
      name: typeof f.name === 'string' ? f.name : undefined,
      mimetype: typeof f.mimetype === 'string' ? f.mimetype : undefined,
      size: typeof f.size === 'number' ? f.size : undefined,
    }));

  return { trigger: true, text, files };
}

module.exports = { shouldTrigger, ActivatedThreads, ACTIVATED_THREADS_MAX, MAX_FILES_PER_MESSAGE };
