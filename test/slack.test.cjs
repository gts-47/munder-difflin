'use strict';

const assert = require('assert');
const { shouldTrigger, ActivatedThreads, ACTIVATED_THREADS_MAX } =
  require('../src/main/slack-trigger.cjs');

let failures = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures++;
    console.log(`  ✗ ${name}\n     ${err.message}`);
  }
}

const BOT_ID = 'U12345BOT';
const CHANNEL = 'C99999';

function ev(overrides = {}) {
  return {
    type: 'message',
    channel: CHANNEL,
    text: 'hello',
    ts: '1000.0001',
    thread_ts: undefined,
    bot_id: undefined,
    subtype: undefined,
    ...overrides,
  };
}

(async () => {
  console.log('slack trigger tests (mention + activated-thread filter)');

  // ─── Case 1: plain message, no mention, no active thread → NOT triggered ───

  await test('plain message with no mention and no active thread → NOT triggered', () => {
    const threads = new ActivatedThreads();
    const result = shouldTrigger(ev({ text: 'hello world' }), BOT_ID, null, threads);
    assert.strictEqual(result.trigger, false);
    assert.strictEqual(threads.size, 0, 'thread must not be activated');
  });

  // ─── Case 2: message mentioning bot → triggered + thread activated ──────────

  await test('message with @mention → triggered and thread root activated', () => {
    const threads = new ActivatedThreads();
    const result = shouldTrigger(
      ev({ text: `<@${BOT_ID}> please help`, ts: '1000.0002' }),
      BOT_ID, null, threads
    );
    assert.strictEqual(result.trigger, true);
    assert.ok(result.text.includes('please help'), 'text forwarded');
    assert.ok(threads.has('1000.0002'), 'message ts activated as thread root');
  });

  await test('app_mention event type → triggered even without text mention', () => {
    const threads = new ActivatedThreads();
    const result = shouldTrigger(
      ev({ type: 'app_mention', text: 'do something', ts: '1000.0003' }),
      null, null, threads // botUserId=null — type alone is enough
    );
    assert.strictEqual(result.trigger, true);
    assert.ok(threads.has('1000.0003'), 'app_mention activates thread root');
  });

  // ─── Case 3: reply in activated thread (no mention) → triggered ─────────────

  await test('reply in activated thread without re-mention → triggered', () => {
    const threads = new ActivatedThreads();
    // First: mention activates the thread
    shouldTrigger(ev({ text: `<@${BOT_ID}> start`, ts: '2000.0001' }), BOT_ID, null, threads);
    assert.ok(threads.has('2000.0001'));
    // Then: a plain reply in that thread triggers
    const result = shouldTrigger(
      ev({ text: 'follow-up question', ts: '2000.0002', thread_ts: '2000.0001' }),
      BOT_ID, null, threads
    );
    assert.strictEqual(result.trigger, true, 'thread reply should trigger');
    assert.strictEqual(result.text, 'follow-up question');
  });

  // ─── Case 4: bot's own reply (bot_id set) → NOT triggered ───────────────────

  await test("bot's own threaded reply (bot_id) → NOT triggered (self-loop safety)", () => {
    const threads = new ActivatedThreads();
    // Activate the thread first
    shouldTrigger(ev({ text: `<@${BOT_ID}> hi`, ts: '3000.0001' }), BOT_ID, null, threads);
    // Bot posts a reply — must NOT trigger
    const result = shouldTrigger(
      ev({ text: 'I am the bot response', ts: '3000.0002', thread_ts: '3000.0001', bot_id: 'B_BOT' }),
      BOT_ID, null, threads
    );
    assert.strictEqual(result.trigger, false, 'bot reply must not loop back');
  });

  await test('subtype message (e.g. message_changed) → NOT triggered', () => {
    const threads = new ActivatedThreads();
    const result = shouldTrigger(
      ev({ text: `<@${BOT_ID}> edit`, subtype: 'message_changed' }),
      BOT_ID, null, threads
    );
    assert.strictEqual(result.trigger, false);
  });

  // ─── Case 5: mention inside sub-thread → activates ev.thread_ts ─────────────

  await test('mention in a reply → activates ev.thread_ts (not ev.ts)', () => {
    const threads = new ActivatedThreads();
    const rootTs = '4000.0001';
    const replyTs = '4000.0099';
    // Bot is mentioned in a reply (not a root message)
    const result = shouldTrigger(
      ev({ text: `<@${BOT_ID}> help in thread`, ts: replyTs, thread_ts: rootTs }),
      BOT_ID, null, threads
    );
    assert.strictEqual(result.trigger, true);
    // thread_ts is the key, not ts
    assert.ok(threads.has(rootTs), 'thread root activated');
    assert.ok(!threads.has(replyTs), 'reply ts not stored as root');
  });

  // ─── Case 6: channel filter respected ────────────────────────────────────────

  await test('wrong channel → NOT triggered even with mention', () => {
    const threads = new ActivatedThreads();
    const result = shouldTrigger(
      ev({ text: `<@${BOT_ID}> help`, channel: 'C_OTHER' }),
      BOT_ID, CHANNEL, threads // channelId = CHANNEL, event is in C_OTHER
    );
    assert.strictEqual(result.trigger, false);
    assert.strictEqual(threads.size, 0, 'wrong-channel mention must not activate thread');
  });

  await test('matching channel → triggered', () => {
    const threads = new ActivatedThreads();
    const result = shouldTrigger(
      ev({ text: `<@${BOT_ID}> hello`, channel: CHANNEL }),
      BOT_ID, CHANNEL, threads
    );
    assert.strictEqual(result.trigger, true);
  });

  await test('no channel filter (null) → any channel triggers', () => {
    const threads = new ActivatedThreads();
    const result = shouldTrigger(
      ev({ text: `<@${BOT_ID}> hi`, channel: 'C_RANDOM' }),
      BOT_ID, null, threads
    );
    assert.strictEqual(result.trigger, true);
  });

  // ─── Case 7: activatedThreads bound enforced ─────────────────────────────────

  await test('activatedThreads evicts oldest when cap is reached', () => {
    const maxSize = 3;
    const threads = new ActivatedThreads(maxSize);
    // Fill to cap
    threads.add('t1');
    threads.add('t2');
    threads.add('t3');
    assert.strictEqual(threads.size, maxSize);
    // Add one more — t1 should be evicted (FIFO)
    threads.add('t4');
    assert.strictEqual(threads.size, maxSize, 'size stays at cap');
    assert.ok(!threads.has('t1'), 't1 evicted');
    assert.ok(threads.has('t2'), 't2 still present');
    assert.ok(threads.has('t3'), 't3 still present');
    assert.ok(threads.has('t4'), 't4 added');
  });

  await test('default cap is ACTIVATED_THREADS_MAX', () => {
    assert.strictEqual(ACTIVATED_THREADS_MAX, 500);
    const threads = new ActivatedThreads();
    // Fill to cap + 1 — size must stay at ACTIVATED_THREADS_MAX
    for (let i = 0; i <= ACTIVATED_THREADS_MAX; i++) threads.add(`t${i}`);
    assert.strictEqual(threads.size, ACTIVATED_THREADS_MAX);
    assert.ok(!threads.has('t0'), 't0 evicted');
    assert.ok(threads.has(`t${ACTIVATED_THREADS_MAX}`), 'last entry present');
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────────

  await test('botUserId null → text mention not detected (app_mention still works)', () => {
    const threads = new ActivatedThreads();
    // Text mention with no known botUserId → no trigger
    const r1 = shouldTrigger(ev({ text: `<@UNKNOWN> hi` }), null, null, threads);
    assert.strictEqual(r1.trigger, false);
    // app_mention type still triggers regardless
    const r2 = shouldTrigger(ev({ type: 'app_mention', text: 'hi' }), null, null, threads);
    assert.strictEqual(r2.trigger, true);
  });

  await test('null/undefined event → NOT triggered', () => {
    const threads = new ActivatedThreads();
    assert.strictEqual(shouldTrigger(null, BOT_ID, null, threads).trigger, false);
    assert.strictEqual(shouldTrigger(undefined, BOT_ID, null, threads).trigger, false);
  });

  console.log(failures === 0 ? '\nall passed' : `\n${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
})();
