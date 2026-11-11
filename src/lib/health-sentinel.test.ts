// The sentinel's paging rules, without a database or a network.
//
// 6 Oct 2026: the print engine was down for 64 minutes at night and nothing
// said so. These pin what the sentinel does about the next one — and, as
// important, what it does NOT do: page her for a one-minute deploy restart, or
// every ten minutes for the length of an outage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALERT_AFTER_TICKS,
  aiAccountMail,
  REMIND_EVERY_TICKS,
  SENTINEL_TICK_STATUSES,
  TARGETS,
  decide,
  downLine,
  looksHealthy,
  mailsFor,
  parseDownLine,
  probe,
  type PastTick,
} from "./health-sentinel";

const NOW = "2026-10-05T19:59:00.000Z"; // 01:29 IST
/** Finished ticks, newest first, ten minutes apart, each with this error. */
const ticks = (errors: (string | null)[]): PastTick[] =>
  errors.map((error, i) => ({ started_at: new Date(Date.parse(NOW) - (i + 1) * 600_000).toISOString(), error }));

const answer = (status: number, body: string) => async () => ({ status, text: async () => body });
const noSleep = async () => {};

test("healthy means 200 AND the service saying so — an error page with a 200 is not up", () => {
  assert.equal(looksHealthy(200, '{"status":"ok","commit":"abc"}'), true);
  assert.equal(looksHealthy(502, '{"status":"error","code":502,"message":"Application failed to respond"}'), false);
  assert.equal(looksHealthy(200, "<html>Just a moment…</html>"), false);
  assert.equal(looksHealthy(200, '{"status":"degraded"}'), false);
});

test("a probe reports the engine's real 502 from the night it was down", async () => {
  const r = await probe(TARGETS[0], answer(502, '{"status":"error","code":502,"message":"Application failed to respond"}'), { sleep: noSleep });
  assert.equal(r.ok, false);
  assert.match(r.detail, /answered 502/);
});

test("a probe rides out a restart: one bad answer then a good one is UP", async () => {
  let n = 0;
  const flaky = async () => (++n === 1 ? { status: 502, text: async () => "bad gateway" } : { status: 200, text: async () => '{"status":"ok"}' });
  const r = await probe(TARGETS[0], flaky, { sleep: noSleep });
  assert.equal(r.ok, true);
  assert.equal(n, 2);
});

test("a probe that gets no answer at all is down, with the reason", async () => {
  const dead = async () => {
    throw new Error("connect ECONNREFUSED");
  };
  const r = await probe(TARGETS[1], dead, { tries: 2, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.match(r.detail, /no answer.*ECONNREFUSED/);
});

test("the line a failing tick leaves behind reads back to the same targets", () => {
  assert.deepEqual(parseDownLine(downLine(["os", "engine"])), ["engine", "os"]);
  assert.deepEqual(parseDownLine(null), []);
  assert.deepEqual(parseDownLine("fetch failed"), []);
});

test("first tick down: nothing is sent — a deploy restart must not page her", () => {
  const d = decide(["engine"], ticks([null, null]), NOW);
  assert.deepEqual([d.alert, d.remind, d.recovered], [[], [], []]);
});

test("down on two ticks running: ONE alert, dated from the first tick that saw it", () => {
  assert.equal(ALERT_AFTER_TICKS, 2);
  const past = ticks(["DOWN: engine", null]);
  const d = decide(["engine"], past, NOW);
  assert.deepEqual(d.alert, [{ key: "engine", since: past[0].started_at }]);
  assert.deepEqual(d.remind, []);
});

test("third tick down and after: silence until the 3-hour reminder", () => {
  for (let before = 2; before < 1 + REMIND_EVERY_TICKS; before++) {
    const d = decide(["engine"], ticks(Array(before).fill("DOWN: engine")), NOW);
    assert.deepEqual([d.alert, d.remind], [[], []], `mailed again after ${before + 1} ticks down`);
  }
  const past = ticks(Array(1 + REMIND_EVERY_TICKS).fill("DOWN: engine"));
  const d = decide(["engine"], past, NOW);
  assert.equal(d.remind.length, 1);
  assert.equal(d.remind[0].since, past[past.length - 1].started_at);
});

test("back up after she was told: one recovered mail; back up after a blip: none", () => {
  const told = decide([], ticks(["DOWN: engine", "DOWN: engine", null]), NOW);
  assert.equal(told.recovered.length, 1);
  const blip = decide([], ticks(["DOWN: engine", null]), NOW);
  assert.deepEqual(blip.recovered, []);
});

test("each service is judged on its own streak", () => {
  // engine told last tick; the OS has only just gone down.
  const d = decide(["engine", "os"], ticks(["DOWN: engine", "DOWN: engine", null]), NOW);
  assert.deepEqual([d.alert, d.remind], [[], []]);
  const next = decide(["engine", "os"], ticks(["DOWN: engine, os", "DOWN: engine", "DOWN: engine", null]), NOW);
  assert.deepEqual(next.alert.map((a) => a.key), ["os"]);
});

test("no history and nothing down: nothing to say", () => {
  assert.deepEqual(decide([], [], NOW), { alert: [], remind: [], recovered: [] });
  assert.deepEqual(mailsFor(decide([], [], NOW), [{ key: "engine", ok: true, detail: "200 ok" }], NOW), []);
});

test("the alert says what is down, since when in IST, and what stops — and escapes what the service sent back", () => {
  const past = ticks(["DOWN: engine", null]);
  const mails = mailsFor(decide(["engine"], past, NOW), [{ key: "engine", ok: false, detail: "answered 502: <b>bad</b>" }], NOW);
  assert.equal(mails.length, 1);
  assert.match(mails[0].subject, /^Print engine is DOWN — since 6 Oct, 01:19 IST$/);
  assert.match(mails[0].html, /sent to the printer/);
  assert.ok(mails[0].html.includes("&lt;b&gt;bad&lt;/b&gt;") && !mails[0].html.includes("<b>bad</b>"));
  // the same incident, retried, must be the same mail to Resend
  const again = mailsFor(decide(["engine"], past, NOW), [{ key: "engine", ok: false, detail: "x" }], NOW);
  assert.equal(again[0].idempotencyKey, mails[0].idempotencyKey);
});

test("a request without the secret cannot become the sentinel's memory", () => {
  // withCronRun writes a cron_runs row for EVERY request, including the 401 it
  // gives a stranger (seen in production within minutes of going live: the
  // patrol's own unauthenticated probe left one). Read back as a tick it would
  // say "all was up" — resetting a down-streak, so the alert never fires.
  // Only rows from ticks that probed may count.
  assert.deepEqual(SENTINEL_TICK_STATUSES, [200, 500]);
  const route = readFileSync(join(import.meta.dirname, "..", "app", "api", "cron", "sentinel", "route.ts"), "utf8");
  assert.match(route, /\.in\("status", SENTINEL_TICK_STATUSES\)/, "the route must read back only its own authenticated ticks");
});

test("the sentinel is scheduled, and mails nobody but the founder", () => {
  const root = join(import.meta.dirname, "..", "..");
  const worker = readFileSync(join(root, "cron-worker", "worker.mjs"), "utf8");
  assert.match(worker, /"\*\/10 \* \* \* \*": \[[^\]]*"\/api\/cron\/sentinel"/, "the cron worker must fire /api/cron/sentinel every 10 minutes");
  const route = readFileSync(join(root, "src", "app", "api", "cron", "sentinel", "route.ts"), "utf8");
  assert.match(route, /withCronRun\("sentinel"/);
  const recipients = [...route.matchAll(/[\w.+-]+@[\w-]+\.[\w.]+/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(recipients)], ["roheena@plankandweave.com"]);
});

// 9 October 2026: the Anthropic account refused the site's key ("invalid
// x-api-key"). Eight outreach-inbox runs failed over two days; the OS's AI
// desks were failing the same way. Every failure was a cron_runs row and a
// log line — nothing reached her. The sentinel already has the ledger open
// every ten minutes; it reads those rows too.
const refusal = (job: string, minutesAgo: number, error: string | null) => ({
  job,
  started_at: new Date(Date.parse(NOW) - minutesAgo * 60_000).toISOString(),
  error,
});
const KEY_REFUSED =
  'Anthropic account refused the outreach classifier: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}';
const NO_CREDIT =
  '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}';

test("a run the Anthropic account refused mails her at the next tick, naming the job and the fix", () => {
  const mail = aiAccountMail([refusal("outreach-inbox", 4, KEY_REFUSED), refusal("quotation-desk", 9, KEY_REFUSED)], NOW);
  assert.ok(mail, "a refused key must produce a mail");
  assert.match(mail.subject, /Anthropic/);
  assert.match(mail.subject, /refused/i);
  assert.match(mail.html, /outreach-inbox/);
  assert.match(mail.html, /quotation-desk/);
  assert.match(mail.html, /ANTHROPIC_API_KEY/, "the mail must say which secret to replace");
  assert.match(mail.html, /zyvorah-store/, "…and where it lives");
});

test("one mail per day while it lasts, not one per tick: the idempotency key is the IST day", () => {
  const a = aiAccountMail([refusal("outreach-inbox", 4, KEY_REFUSED)], NOW)!;
  const b = aiAccountMail([refusal("quotation-desk", 2, KEY_REFUSED)], new Date(Date.parse(NOW) + 3 * 3_600_000).toISOString())!;
  assert.equal(a.idempotencyKey, b.idempotencyKey);
  assert.match(a.idempotencyKey, /2026-10-06$/, "01:29 IST on 6 Oct is 6 Oct, not the UTC 5 Oct");
  const c = aiAccountMail([refusal("outreach-inbox", 4, KEY_REFUSED)], new Date(Date.parse(NOW) + 24 * 3_600_000).toISOString())!;
  assert.notEqual(a.idempotencyKey, c.idempotencyKey, "the next day it is said again");
});

test("an empty account is told apart from a refused key", () => {
  const mail = aiAccountMail([refusal("quotation-desk", 1, NO_CREDIT)], NOW)!;
  assert.match(mail.subject, /credit/i);
  assert.doesNotMatch(mail.subject, /refused the key/i);
});

test("an ordinary failed run, or the sentinel's own DOWN tick, is not an account problem", () => {
  assert.equal(aiAccountMail([refusal("sentinel", 1, "DOWN: engine")], NOW), null);
  assert.equal(aiAccountMail([refusal("newsletter", 1, "DIED: no completion recorded within 30 minutes")], NOW), null);
  assert.equal(aiAccountMail([refusal("quotation-desk", 1, '529 {"type":"error","error":{"type":"overloaded_error"}}')], NOW), null);
  assert.equal(aiAccountMail([], NOW), null);
});

test("the sentinel reads the ledger for refusals with the same rows the mail is built from", () => {
  const route = readFileSync(join(import.meta.dirname, "..", "app", "api", "cron", "sentinel", "route.ts"), "utf8");
  assert.match(route, /aiAccountMail\(/, "the route must ask for the account mail");
  assert.match(route, /AI_ACCOUNT_WINDOW_MS/, "…over the agreed window");
});
