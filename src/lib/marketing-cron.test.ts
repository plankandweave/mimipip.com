import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import worker, { ROUTES } from "../../cron-worker/worker.mjs";

const config = ts.parseConfigFileTextToJson("wrangler.jsonc", readFileSync(new URL("../../cron-worker/wrangler.jsonc", import.meta.url), "utf8")).config;

test("every deployed cron expression has a handler and every handler is deployed", () => {
  assert.deepEqual([...config.triggers.crons].sort(), Object.keys(ROUTES).sort());
});

test("each posting tick dispatches marketing exactly once, and 20:30 publishes only", async () => {
  const fire = async (cron: string, hour: number) => {
    const calls: string[] = [];
    await worker.scheduled({ cron, scheduledTime: Date.UTC(2026, 8, 26, hour) }, {
      SITE_ORIGIN: "https://zyvorah.com", CRON_SECRET: "test",
      SITE: { fetch: async (req: Request) => { calls.push(new URL(req.url).pathname); return new Response("ok"); } },
    }, {});
    return calls;
  };
  for (const hour of [6, 12]) {
    const calls = await fire("0 6,12 * * *", hour);
    assert.equal(calls.filter((p) => p === "/api/cron/marketing").length, 1);
  }
  // The evening slot publishes approved, timed posts — never composes or spends.
  assert.deepEqual(await fire("0 15 * * *", 15), ["/api/cron/marketing-publish"]);
});

test("the normal release is never before 11:30 IST, and the evening post still has a tick", () => {
  // 11:30 and 17:30 IST (06:00, 12:00 UTC); 20:30 IST (15:00 UTC) for the
  // evening post — approved posts go out on their own day only, so a day
  // without an evening tick would drop the evening post.
  assert.ok(config.triggers.crons.includes("0 6,12 * * *"));
  assert.ok(config.triggers.crons.includes("0 15 * * *"));
});

test("the cron worker waits longer than the longest compose run it dispatches", async () => {
  // A route the cron worker cancels records NOTHING — no catch, no timer, no
  // row (12–13 October 2026: every compose run that reached a reel vanished
  // at the old five-minute limit, and cron health could only say DIED). So
  // the wait must cover instagram-daily's whole composing budget plus its
  // longest single slot (a run starts a slot only when that slot's full
  // budget still fits, so the two together are its worst case), with room
  // for the summary and brief that follow, and stay inside the fifteen
  // minutes a scheduled invocation may run.
  const { TICK_TIMEOUT_MS } = await import("../../cron-worker/worker.mjs");
  const src = readFileSync(new URL("./marketing/pipeline.ts", import.meta.url), "utf8");
  const runBudget = Number(src.match(/CADENCE_RUN_BUDGET_MS = (\d+) \* 60_000/)?.[1]) * 60_000;
  const reelBudget = Number(src.match(/reel: (\d[\d_]*) \}/)?.[1].replace(/_/g, ""));
  assert.ok(runBudget > 0 && reelBudget > 0, "could not read the budgets from pipeline.ts");
  assert.ok(runBudget <= TICK_TIMEOUT_MS - 2 * 60_000, `instagram-daily may compose for ${runBudget / 60000} min but the cron worker waits only ${TICK_TIMEOUT_MS / 60000}`);
  assert.ok(reelBudget < runBudget, "a single reel must fit inside the run budget");
  assert.ok(TICK_TIMEOUT_MS <= 14 * 60_000, "a scheduled invocation is killed at fifteen minutes");
});
