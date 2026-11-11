import { test } from "node:test";
import assert from "node:assert/strict";
import { LOST_AFTER_DAYS, NURTURE_DAYS, nurtureDecision, sampleNurtureEmail } from "./sample-nurture";

const DAY = 86_400_000;
const delivered = new Date("2026-10-12T09:00:00Z");
const at = (days: number) => new Date(delivered.getTime() + days * DAY);

const input = {
  name: "Deepali Choudhary",
  designTitle: "Tropical Reverie",
  designHandle: "tropical-reverie",
  finish: "Soft Matte",
  imageUrl: null,
  whatsappUrl: "https://wa.me/917499916485?text=hi",
  unsubscribeUrl: "https://zyvorah.com/api/newsletter/unsubscribe?token=t",
};

test("the founder's cadence: alternate days for a week, weekly for a month, monthly for six months", () => {
  assert.deepEqual([...NURTURE_DAYS.slice(0, 4)], [0, 2, 4, 6]);
  const weekly = NURTURE_DAYS.slice(4, 8);
  assert.deepEqual(weekly.map((d, i) => d - (i ? weekly[i - 1] : 6)), [7, 7, 7, 7]);
  const monthly = NURTURE_DAYS.slice(8);
  assert.equal(monthly.length, 6);
  assert.deepEqual(monthly.map((d, i) => d - (i ? monthly[i - 1] : 34)), [30, 30, 30, 30, 30, 30]);
  assert.equal(LOST_AFTER_DAYS, 244);
});

test("the confirmation goes on delivery, then each message on its day", () => {
  assert.deepEqual(nurtureDecision(delivered, 0, at(0)), { kind: "send", step: 0 });
  assert.deepEqual(nurtureDecision(delivered, 1, at(1)), { kind: "wait" });
  assert.deepEqual(nurtureDecision(delivered, 1, at(2)), { kind: "send", step: 1 });
  assert.deepEqual(nurtureDecision(delivered, 8, at(63)), { kind: "wait" });
  assert.deepEqual(nurtureDecision(delivered, 8, at(64)), { kind: "send", step: 8 });
});

test("a missed run sends only the latest due message, never a backlog", () => {
  assert.deepEqual(nurtureDecision(delivered, 1, at(5)), { kind: "send", step: 2 });
  assert.deepEqual(nurtureDecision(delivered, 0, at(14)), { kind: "send", step: 4 });
});

test("marked lost a month after the last message, not before", () => {
  assert.deepEqual(nurtureDecision(delivered, NURTURE_DAYS.length, at(230)), { kind: "wait" });
  assert.deepEqual(nurtureDecision(delivered, NURTURE_DAYS.length, at(244)), { kind: "lost" });
});

test("fourteen different messages, the first asking for the order", () => {
  const all = NURTURE_DAYS.map((_, i) => sampleNurtureEmail(i, input));
  assert.equal(new Set(all.map((m) => m.subject)).size, NURTURE_DAYS.length);
  assert.equal(new Set(all.map((m) => m.text)).size, NURTURE_DAYS.length);
  assert.match(all[0].subject, /Tropical Reverie sample has arrived/);
  assert.match(all[0].text, /delivered/);
  assert.match(all[0].text, /Would you like to place the order/);
  for (const m of all) {
    assert.match(m.text, /^Dear Deepali,/);
    assert.match(m.html, /Team Zyvorah/);
    assert.match(m.html, /Unsubscribe/);
  }
});

test("written for the customer: nothing internal, nothing about how it was sent", () => {
  const banned = [
    /\bZVY\b/i, /order #?\d/i, /\b(AI|artificial|automat\w*|bot|algorithm|sequence|nurture|cron|step|template|follow-?up|CRM|lead|pipeline|system|database)\b/i,
    /\bRoheena\b/i, /\bOS\b/, /Magnitude/i, /Mimaki/i, /\blost\b/i, /\bconver(t|sion)/i, /reminder/i,
  ];
  for (let i = 0; i < NURTURE_DAYS.length; i++) {
    const { subject, text } = sampleNurtureEmail(i, input);
    for (const re of banned) {
      assert.doesNotMatch(`${subject}\n${text}`, re, `message ${i} says ${re}`);
    }
  }
});

test("no name, no finish, no unsubscribe token: still a complete, polite message", () => {
  const m = sampleNurtureEmail(0, { ...input, name: null, finish: null, unsubscribeUrl: null });
  assert.match(m.text, /^Hello,/);
  assert.doesNotMatch(m.text, / in null| undefined/);
  assert.doesNotMatch(m.html, /Unsubscribe/);
});
