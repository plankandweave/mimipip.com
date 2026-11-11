// Twice a day, unless there is a reason (founder, 9 October 2026): "Nothing
// needs to run hourly. Things can run once at 8 am and once at 2 pm. We don't
// need to run anything so much."
//
// This pins the shape of cron-worker/worker.mjs so a later change cannot
// quietly put a job back on a ten-minute loop: every schedule that fires more
// than twice a day must be one of the named exceptions below, carrying exactly
// the jobs its reason covers. And because the 08:00 tick is before working
// hours, no job that writes to customers may ride it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROUTES } from "../../cron-worker/worker.mjs";

const routes = ROUTES as Record<string, string[]>;

/** How many times a day a 5-field cron fires (minute × hour field sizes). */
function firesPerDay(expr: string): number {
  const [minute, hour] = expr.trim().split(/\s+/);
  const count = (field: string, size: number): number => {
    if (field === "*") return size;
    let n = 0;
    for (const part of field.split(",")) {
      const step = part.match(/^\*\/(\d+)$/);
      const range = part.match(/^(\d+)-(\d+)$/);
      if (step) n += Math.ceil(size / Number(step[1]));
      else if (range) n += Number(range[2]) - Number(range[1]) + 1;
      else n += 1;
    }
    return n;
  };
  return count(minute, 60) * count(hour, 24);
}

/** The only schedules allowed to fire more than twice a day, and the jobs
 *  each reason covers. The reasons are written beside the keys in worker.mjs. */
const EXCEPTIONS: Record<string, string[]> = {
  // Hourly 09:30–18:30 IST: a stalled checkout or a named cart is a sale to
  // save the same working day; a launch has an hour; a letter mid-send resumes.
  "0 4-13 * * *": [
    "/api/cron/stalled-checkouts",
    "/api/cron/cart-followups",
    "/api/cron/launch-mail?send=1",
    "/api/cron/newsletter?resume=1",
  ],
  // Uptime monitor and the two queues that carry work already approved.
  "*/10 * * * *": ["/api/cron/sentinel", "/api/cron/site-batch-drive", "/api/cron/partner-release"],
  // The only room-render engine.
  "*/2 * * * *": ["/api/cron/studio-drain"],
};

/** Routes that write to customers (email, list sends, review invitations,
 *  approved outreach). Never on the 08:00 tick. */
const WRITES_TO_CUSTOMERS = [
  "/api/cron/review-request",
  "/api/cron/execute-decisions",
  "/api/cron/ads-invite",
  "/api/cron/optin-notice",
  "/api/cron/sample-nurture",
  "/api/cron/newsletter",
  "/api/cron/launch-mail?send=1",
  "/api/cron/cart-followups",
  "/api/cron/newsletter?resume=1",
];

test("the cadence parser counts what Cloudflare fires", () => {
  assert.equal(firesPerDay("30 2 * * *"), 1);
  assert.equal(firesPerDay("0 6,12 * * *"), 2);
  assert.equal(firesPerDay("0 4-13 * * *"), 10);
  assert.equal(firesPerDay("*/10 * * * *"), 144);
  assert.equal(firesPerDay("*/2 * * * *"), 720);
});

test("nothing runs more than twice a day except the named exceptions", () => {
  const frequent = Object.keys(routes).filter((expr) => firesPerDay(expr) > 2);
  assert.deepEqual(frequent.sort(), Object.keys(EXCEPTIONS).sort(), "a new frequent schedule needs a reason in EXCEPTIONS and in worker.mjs");
  for (const [expr, jobs] of Object.entries(EXCEPTIONS)) {
    assert.deepEqual([...routes[expr]].sort(), [...jobs].sort(), `${expr} carries only the jobs its reason covers`);
  }
});

test("the twice-a-day ticks are 08:00 and 14:00 IST", () => {
  // Cloudflare crons are UTC: 02:30 UTC = 08:00 IST, 08:30 UTC = 14:00 IST.
  assert.ok(routes["30 2 * * *"].includes("/api/cron/daily-report"), "the brief stays at 08:00");
  for (const job of ["corporate-attention", "portfolio-attention", "trade-payouts", "outreach-inbox", "site-films", "voice-followups"]) {
    assert.ok(routes["30 2 * * *"].includes(`/api/cron/${job}`), `${job} at 08:00`);
    assert.ok(routes["30 8 * * *"].includes(`/api/cron/${job}`), `${job} at 14:00`);
  }
});

test("no job that writes to customers rides the 08:00 tick", () => {
  const morning = Object.entries(routes)
    .filter(([expr]) => expr.startsWith("30 2 "))
    .flatMap(([, jobs]) => jobs);
  const early = morning.filter((job) => WRITES_TO_CUSTOMERS.includes(job));
  assert.deepEqual(early, [], `customer mail leaves 09:00–19:00 IST only: ${early.join(", ")}`);
});

test("the customer-mail tick is 14:00 IST Monday to Saturday, never Sunday", () => {
  for (const job of ["review-request", "execute-decisions", "ads-invite", "optin-notice"]) {
    assert.ok(routes["30 8 * * MON-SAT"].includes(`/api/cron/${job}`), job);
  }
});

test("the quotation desk runs only on demand: never scheduled, never expected, still callable", () => {
  // Founder, 11 October 2026: "I don't need the quotation desk to run every
  // day. It can run only when I actually use it."
  const scheduled = Object.values(routes).flat().filter((p) => p.startsWith("/api/cron/quotation-desk"));
  assert.deepEqual(scheduled, [], "no schedule may call the quotation desk");
  const root = join(import.meta.dirname, "..", "..");
  const health = readFileSync(join(root, "src", "app", "api", "admin", "cron-health", "route.ts"), "utf8");
  const map = health.slice(health.indexOf("EXPECTED_INTERVAL_HOURS"), health.indexOf("const TOLERANCE"));
  assert.doesNotMatch(map, /["']quotation-desk["']\s*:/, "an expected interval would raise a permanent stale alert");
  assert.ok(existsSync(join(root, "src", "app", "api", "cron", "quotation-desk", "route.ts")), "the manual route stays");
});
