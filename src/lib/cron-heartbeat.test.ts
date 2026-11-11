// Every cron the Cloudflare worker dispatches must write a heartbeat row.
//
// The reason this test exists is written at the top of cron-run.ts: the
// marketing cron failed silently for 29 days, was fixed, and went silent
// again for two days — both times nothing recorded that the job had stopped
// succeeding. `withCronRun` is the cure, and a scheduled route that skips it
// is invisible again. cron_runs is also what /api/admin/cron-health reads, so
// an unwrapped job shows there as "never ran" whether it is healthy or dead.
//
// This is a static check on purpose: it costs nothing, runs in CI, and covers
// routes added in future without anyone remembering this rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");

/** Every distinct /api/cron/<job> the worker is scheduled to hit. */
function scheduledJobs(): string[] {
  const worker = readFileSync(join(root, "cron-worker", "worker.mjs"), "utf8");
  // Only the ROUTES map — the file also mentions paths in comments.
  const map = worker.slice(worker.indexOf("const ROUTES"), worker.indexOf("async function tick"));
  const jobs = new Set<string>();
  for (const m of map.matchAll(/["']\/api\/cron\/([a-z0-9-]+)(?:\?[^"']*)?["']/g)) jobs.add(m[1]);
  return [...jobs].sort();
}

test("the worker's route map is readable and non-trivial", () => {
  const jobs = scheduledJobs();
  assert.ok(jobs.length >= 10, `expected the worker to schedule many crons, parsed ${jobs.length}`);
  assert.ok(jobs.includes("daily-report"), "sanity: daily-report should be scheduled");
});

test("every scheduled cron has an expected interval, or it can never be called stale", () => {
  // cron-health only computes `stale` when EXPECTED_INTERVAL_HOURS has an entry
  // for the job (`expected !== undefined`). A job missing from that map shows a
  // last-run time and nothing else — it cannot go red however long it has been
  // dead. Writing a heartbeat row is only half of being monitored.
  const health = readFileSync(join(root, "src", "app", "api", "admin", "cron-health", "route.ts"), "utf8");
  const map = health.slice(health.indexOf("EXPECTED_INTERVAL_HOURS"), health.indexOf("const TOLERANCE"));
  const missing = scheduledJobs().filter((job) => !new RegExp(`["']${job}["']\\s*:`).test(map));
  assert.deepEqual(
    missing,
    [],
    `these scheduled crons have no expected interval, so cron-health can never flag them stale: ${missing.join(", ")}`,
  );
});

// Jobs cron-health expects that the worker does NOT fire, each with who does.
const FIRED_ELSEWHERE: Record<string, string> = {
  "analytics-snapshot": ".github/workflows/analytics-snapshot.yml",
};

test("every expected interval belongs to a job something still schedules", () => {
  // The reverse of the test above. When a cron is retired from the worker
  // (marketing-week, 26 Sep 2026: "marketing composes on demand only") but
  // left in EXPECTED_INTERVAL_HOURS, cron-health raises a permanent alert for
  // a job that is correctly silent — and a standing false red teaches everyone
  // to ignore the page that exists to catch the real one.
  const health = readFileSync(join(root, "src", "app", "api", "admin", "cron-health", "route.ts"), "utf8");
  const map = health.slice(health.indexOf("EXPECTED_INTERVAL_HOURS"), health.indexOf("const TOLERANCE"));
  const expected = [...map.matchAll(/^\s*["']([a-z0-9-]+)["']\s*:/gm)].map((m) => m[1]);
  assert.ok(expected.length >= 10, `sanity: parsed ${expected.length} expected intervals`);
  const scheduled = new Set(scheduledJobs());
  const orphans = expected.filter((job) => !scheduled.has(job) && !(job in FIRED_ELSEWHERE));
  assert.deepEqual(
    orphans,
    [],
    `cron-health expects these jobs but nothing schedules them, so they will alert forever: ${orphans.join(", ")}`,
  );
});

test("every scheduled cron route records a run via withCronRun", () => {
  const unwrapped: string[] = [];
  for (const job of scheduledJobs()) {
    const src = readFileSync(join(root, "src", "app", "api", "cron", job, "route.ts"), "utf8");
    const imports = /from\s+["']@\/lib\/cron-run["']/.test(src);
    // The job name in the wrapper is the key cron_runs is grouped by, so a
    // typo there is as bad as no wrapper at all.
    const wraps = new RegExp(`withCronRun\\(\\s*["']${job}["']`).test(src);
    if (!imports || !wraps) unwrapped.push(job);
  }
  assert.deepEqual(
    unwrapped,
    [],
    `these scheduled crons write no heartbeat row, so a silent failure would go unnoticed: ${unwrapped.join(", ")}`,
  );
});
