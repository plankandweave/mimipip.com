import { test } from "node:test";
import assert from "node:assert/strict";
import { briefEmail, nextSendWindow } from "./collab-brief-email";

// IST = UTC+5:30. A wall-clock time in India, as a Date.
const ist = (isoLocal: string) => new Date(`${isoLocal}+05:30`);

test("inside 9 am to 7 pm on a working day, the brief goes now", () => {
  const t = ist("2026-10-07T11:00:00"); // Wednesday
  assert.equal(nextSendWindow(t).getTime(), t.getTime());
  const sat = ist("2026-10-10T18:59:00");
  assert.equal(nextSendWindow(sat).getTime(), sat.getTime());
});

test("after 7 pm it waits for 9:05 the next working morning", () => {
  assert.equal(nextSendWindow(ist("2026-10-07T21:30:00")).toISOString(), ist("2026-10-08T09:05:00").toISOString());
});

test("before 9 am it waits for 9:05 the same morning", () => {
  assert.equal(nextSendWindow(ist("2026-10-07T06:00:00")).toISOString(), ist("2026-10-07T09:05:00").toISOString());
});

test("never on a Sunday: Saturday evening and all of Sunday wait for Monday", () => {
  const monday = ist("2026-10-12T09:05:00").toISOString();
  assert.equal(nextSendWindow(ist("2026-10-10T20:00:00")).toISOString(), monday);
  assert.equal(nextSendWindow(ist("2026-10-11T12:00:00")).toISOString(), monday);
  assert.equal(nextSendWindow(ist("2026-10-11T06:00:00")).toISOString(), monday);
});

test("the brief carries the code, the link, the deliverables and the hashtags, escaped", () => {
  const { subject, html } = briefEmail({
    name: "Priya Sharma",
    code: "ZYV-PRIYA-7K2Q",
    slug: "priya-sharma",
    discountPct: 100,
    maxValueInr: 25000,
    freeShipping: true,
    codeExpiresAt: "2026-11-15",
    allowedTitles: ["Wildflower Reverie"],
    hashtags: ["ZyvorahWalls", "#ZyvorahxPriya"],
    deliverables: [{ kind: "reel", description: "Before and after <reveal>", due_on: "2026-11-30" }],
  });
  assert.match(subject, /Priya/);
  assert.match(html, /ZYV-PRIYA-7K2Q/);
  assert.match(html, /zyvorah\.com\/c\/priya-sharma/);
  assert.match(html, /up to ₹25,000/);
  assert.match(html, /#ZyvorahWalls #ZyvorahxPriya/);
  assert.match(html, /Instagram Reel/);
  assert.match(html, /&lt;reveal&gt;/);
  assert.doesNotMatch(html, /<reveal>/);
  assert.match(html, /30 November 2026/);
});
