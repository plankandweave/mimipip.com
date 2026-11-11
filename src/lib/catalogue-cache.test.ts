import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { cachedCatalogue, CATALOGUE_READ_DEADLINE_MS, kvKey } from "./catalogue-cache";

const NEVER = new Promise<never>(() => {});
/** Resolve to "hung" if `p` has not settled within `ms` of real time. */
const within = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<"hung">((r) => setTimeout(() => r("hung"), ms))]);

// 28 September 2026: a module-level map of in-flight promises made every
// visitor on an isolate await whichever request asked first. On Workers a
// cancelled request's promise never settles, so everyone behind it hung to
// Cloudflare's 100 s limit (524) and the key stayed poisoned for the isolate's
// life. A second request must never wait on a first request's read.
test("a read that never settles does not hang the next request for the same key", async () => {
  let calls = 0;
  const read = cachedCatalogue("test-poison", async (k: string) => {
    calls += 1;
    return calls === 1 ? NEVER : `fresh:${k}`;
  });
  void read("same").catch(() => {}); // the cancelled visitor's read
  const second = await within(read("same"), 1_000);
  assert.equal(second, "fresh:same");
  assert.equal(calls, 2, "the second request must do its own read");
});

test("a stalled read fails loudly at the deadline instead of holding the page", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const read = cachedCatalogue("test-deadline", async () => NEVER);
    const pending = read();
    // Let the version lookup and the read start before time moves.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    mock.timers.tick(CATALOGUE_READ_DEADLINE_MS);
    await assert.rejects(pending, /test-deadline did not answer within 8000ms/);
  } finally {
    mock.timers.reset();
  }
});

test("a resolved value is still served from memory without a second read", async () => {
  let calls = 0;
  const read = cachedCatalogue("test-memory", async () => {
    calls += 1;
    return ["a", "b"];
  });
  assert.deepEqual(await read(), ["a", "b"]);
  assert.deepEqual(await read(), ["a", "b"]);
  assert.equal(calls, 1);
});

// 30 Sep 2026: "KV GET failed: 414 … length of 583 exceeds key length limit of
// 512" — a list-of-handles reader could never be cached, so every call went to
// Supabase. Every key must fit KV, and short keys must not change.
test("every cache key fits Workers KV, and short keys are unchanged", async () => {
  const handles = Array.from({ length: 40 }, (_, i) => `a-rather-long-design-handle-${i}`);
  const long = await kvKey("catalogue:1727700000000:products-by-handles:", [handles]);
  assert.ok(new TextEncoder().encode(long).length <= 512, `key is ${long.length} bytes`);
  assert.match(long, /^catalogue:1727700000000:products-by-handles:sha256:[0-9a-f]{64}$/);
  assert.equal(long, await kvKey("catalogue:1727700000000:products-by-handles:", [handles]));
  assert.notEqual(long, await kvKey("catalogue:1727700000000:products-by-handles:", [handles.slice(1)]));
  assert.equal(await kvKey("catalogue:1:product-by-handle:", ["ochre-drift"]), 'catalogue:1:product-by-handle:["ochre-drift"]');
});
