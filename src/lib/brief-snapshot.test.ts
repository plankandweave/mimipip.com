import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readBriefSnapshot } from "./brief-snapshot";
import { briefDecisions } from "./brief-decisions";

// 14 October 2026: intel_snapshot hit a statement timeout at 02:30Z, the route
// returned 500, and the 08:00 brief was never sent — every agent's section,
// filed overnight, reached nobody. A failed store read must cost the brief one
// block, never the whole mail.

const quiet = () => {};

test("a statement timeout is carried as an error, not thrown", async () => {
  const r = await readBriefSnapshot(
    async () => ({ data: null, error: { message: "canceling statement due to statement timeout" } }),
    1000,
    quiet,
  );
  assert.deepEqual(r.snap, {});
  assert.equal(r.unauthorized, false);
  assert.match(r.error ?? "", /statement timeout/);
});

test("a rejected call is carried as an error", async () => {
  const r = await readBriefSnapshot(async () => { throw new Error("fetch failed"); }, 1000, quiet);
  assert.deepEqual(r.snap, {});
  assert.ok(r.error);
});

test("a call that hangs is dropped at its budget", async () => {
  const started = Date.now();
  const r = await readBriefSnapshot(() => new Promise(() => {}), 50, quiet);
  assert.ok(r.error);
  assert.ok(Date.now() - started < 1500);
});

test("a refused key is still reported as unauthorized", async () => {
  const r = await readBriefSnapshot(async () => ({ data: null, error: { message: "unauthorized" } }), 1000, quiet);
  assert.equal(r.unauthorized, true);
});

test("an answer is passed through", async () => {
  const r = await readBriefSnapshot(async () => ({ data: { orders: [1] }, error: null }), 1000, quiet);
  assert.deepEqual(r.snap, { orders: [1] });
  assert.equal(r.error, null);
});

test("the brief route does not 500 when the store snapshot fails", () => {
  const src = readFileSync("src/app/api/cron/daily-report/route.ts", "utf8");
  assert.ok(src.includes("readBriefSnapshot("), "route must read the snapshot through readBriefSnapshot");
  assert.ok(
    !/includes\("unauthorized"\)\s*\?\s*401\s*:\s*500/.test(src),
    "route still turns a failed snapshot into a 500 and sends no brief",
  );
});

test("an unread store is not reported as a day with no sales", () => {
  const base = {
    briefFor: "2026-10-15", sections: [], missing: [], orders_paid: 0, abandoned_carts: 0, conv7: null,
    social: { available: true, publishedYesterday: 1, awaitingReview: 0, approvedWaiting: 0, failed: 0, blocked: 0, collabsWaiting: 0 },
    adChannels: { flags: [] },
  };
  const unread = briefDecisions({ ...base, snapshot_error: "statement timeout" });
  assert.ok(!unread.some((d) => d.finding.startsWith("No paid customer orders")));
  assert.ok(unread.some((d) => d.status === "unknown" && /could not be read/i.test(d.finding)));
  const quietDay = briefDecisions(base);
  assert.ok(quietDay.some((d) => d.finding.startsWith("No paid customer orders")));
});
