// Pins the weekly letter's sender (newsletter-send.ts). The case behind it:
// 8 October 2026, 215 of 563 sent before the request died, nobody resumed it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  newsletterIdempotencyKey,
  personalise,
  sendInBatches,
  UNSUB_PLACEHOLDER,
  type Claimed,
} from "./newsletter-send";
import { ROUTES } from "../../cron-worker/worker.mjs";

const root = join(import.meta.dirname, "..", "..");
const always = () => true;

/** A fake ledger with the database's one promise: a person is claimed once. */
function ledger(audience: string[]) {
  const claimed = new Set<string>();
  const recorded = new Map<string, boolean>();
  const mailed: string[] = [];
  const keys: string[] = [];
  return {
    claimed, recorded, mailed, keys,
    claim: async (limit: number): Promise<Claimed[]> => {
      const next = audience.filter((e) => !claimed.has(e)).slice(0, limit);
      next.forEach((e) => claimed.add(e));
      return next.map((email) => ({ email, name: null, unsubscribe_token: `tok-${email}`, retry: false }));
    },
    send: async (r: Claimed, key: string) => {
      mailed.push(r.email);
      keys.push(key);
      return { ok: true, id: `re_${r.email}` };
    },
    record: async (email: string, ok: boolean) => {
      recorded.set(email, ok);
    },
  };
}

const people = (n: number) => Array.from({ length: n }, (_, i) => `p${i}@x.in`);

test("a run sends everyone once and records each send", async () => {
  const l = ledger(people(563));
  const r = await sendInBatches(l, { issueId: "i", inWindow: always });
  assert.equal(r.stopped, "done");
  assert.equal(r.sent, 563);
  assert.equal(new Set(l.mailed).size, 563);
  assert.equal(l.mailed.length, 563);
  assert.equal(l.recorded.size, 563);
});

test("a run that runs out of time stops, and the next run carries on without repeating anyone", async () => {
  const l = ledger(people(563));
  let t = 0;
  // Each send costs 350 ms of wall clock, as on 8 October.
  const send = async (r: Claimed, k: string) => { t += 350; return l.send(r, k); };
  const first = await sendInBatches({ ...l, send, now: () => t }, { issueId: "i", inWindow: always, budgetMs: 60_000 });
  assert.equal(first.stopped, "budget");
  assert.ok(first.sent > 100 && first.sent < 563, `first run sent ${first.sent}`);
  let rounds = 1;
  for (;;) {
    t = 0;
    const next = await sendInBatches({ ...l, send, now: () => t }, { issueId: "i", inWindow: always, budgetMs: 60_000 });
    rounds += 1;
    if (next.stopped === "done") break;
    assert.ok(rounds < 20);
  }
  assert.equal(l.mailed.length, 563, "nobody mailed twice");
  assert.equal(new Set(l.mailed).size, 563, "nobody left out");
});

test("nothing is sent outside working hours, and a run stops the moment they end", async () => {
  const l = ledger(people(50));
  const closed = await sendInBatches(l, { issueId: "i", inWindow: () => false });
  assert.deepEqual(closed, { sent: 0, failed: 0, stopped: "window" });
  assert.equal(l.claimed.size, 0, "nobody is even claimed outside the window");

  let open = 5;
  const r = await sendInBatches(l, { issueId: "i", inWindow: () => open-- > 0 });
  assert.equal(r.stopped, "window");
  assert.ok(r.sent < 50);
});

test("a retried claim carries the same idempotency key as the first attempt", () => {
  assert.equal(newsletterIdempotencyKey("6403c9a0", "A@X.in "), newsletterIdempotencyKey("6403c9a0", "a@x.in"));
  assert.notEqual(newsletterIdempotencyKey("6403c9a0", "a@x.in"), newsletterIdempotencyKey("2e625211", "a@x.in"));
});

test("each send passes its key to the mailer", async () => {
  const l = ledger(people(3));
  await sendInBatches(l, { issueId: "iss", inWindow: always });
  assert.deepEqual(l.keys, people(3).map((e) => `newsletter/iss/${e}`));
});

test("a failed send is recorded as failed and the run goes on", async () => {
  const l = ledger(people(4));
  const send = async (r: Claimed, k: string) => (r.email === "p1@x.in" ? { ok: false, id: null } : l.send(r, k));
  const r = await sendInBatches({ ...l, send }, { issueId: "i", inWindow: always });
  assert.equal(r.sent, 3);
  assert.equal(r.failed, 1);
  assert.equal(l.recorded.get("p1@x.in"), false);
});

test("the letter is rendered once and each person gets their own unsubscribe link", () => {
  const html = `<a href="https://zyvorah.com/api/newsletter/unsubscribe?token=${UNSUB_PLACEHOLDER}">Unsubscribe</a>`;
  const out = personalise(html, "3f2a-uuid");
  assert.ok(out.includes("token=3f2a-uuid"));
  assert.ok(!out.includes(UNSUB_PLACEHOLDER));
});

test("the working-hours cron resumes a letter left mid-send", () => {
  assert.ok(ROUTES["0 4-13 * * *"].includes("/api/cron/newsletter?resume=1"));
  assert.ok(ROUTES["30 8 * * THU"].includes("/api/cron/newsletter"));
});

test("the route sends through the claimed batches, never the old one-request loop", () => {
  const src = readFileSync(join(root, "src", "app", "api", "cron", "newsletter", "route.ts"), "utf8");
  assert.ok(src.includes("newsletter_claim_batch"));
  assert.ok(src.includes("sendInBatches"));
  assert.ok(!src.includes('"newsletter_recipients"'), "the unclaimed recipient list is how 8 October lost 348 people");
});
