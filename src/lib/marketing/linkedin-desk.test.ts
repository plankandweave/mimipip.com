// The LinkedIn rules the founder set on 26 Sep 2026, pinned.
//   npx tsx --test src/lib/marketing/linkedin-desk.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { activityUrnFromUrl, foldCaption, isLinkedInDay, runway, runwayDays, manualLinkedInSlots } from "./linkedin-desk";
import { checkCaption } from "./safety";

const GOOD = `A hotel lobby has about eight seconds to tell a guest where they are.

We think a wall should do most of that talking. Here, a wide botanical mural sets the pace of the room: slow, generous, unmistakably this place and no other.

What should a guest feel in the first eight seconds of your lobby?

#HospitalityDesign #InteriorDesign #Wallpaper`;

test("overdue approved posts remain visible after connection; in-flight and invalidated approvals never become manual actions", () => {
  const post = { status: "queued", approved_at: "2026-09-27", safety_passed: true, regenerate_requested_at: null };
  const slots = [
    { day_key: "2026-10-01", status: "planned", post },
    { day_key: "2026-10-02", status: "planned", post },
    { day_key: "2026-10-03", status: "planned", post },
    { day_key: "2026-09-30", status: "planned", post: { ...post, status: "approved" } },
    { day_key: "2026-09-29", status: "planned", post: { ...post, status: "published" } },
    { day_key: "2026-09-28", status: "planned", post: { ...post, regenerate_requested_at: "x" } },
    { day_key: "2026-09-27", status: "removed", post },
    { day_key: "2026-09-26", status: "planned", post: { ...post, safety_passed: false } },
  ];
  assert.deepEqual(manualLinkedInSlots(slots, "2026-10-02", true).map(s => s.day_key), ["2026-10-01"]);
  assert.deepEqual(manualLinkedInSlots(slots, "2026-10-02", false).map(s => s.day_key), ["2026-10-01", "2026-10-02"]);
});

test("posting days are Monday to Friday, never the weekend", () => {
  assert.equal(isLinkedInDay("2026-10-05"), true); // Mon
  assert.equal(isLinkedInDay("2026-10-06"), true); // Tue
  assert.equal(isLinkedInDay("2026-10-09"), true); // Fri
  assert.equal(isLinkedInDay("2026-10-10"), false); // Sat
  assert.equal(isLinkedInDay("2026-10-11"), false); // Sun
});

test("the runway covers every posting day of the next four weeks, from tomorrow", () => {
  const days = runwayDays("2026-09-26"); // a Saturday
  assert.equal(days[0], "2026-09-28");
  assert.equal(days.length, 20);
  assert.equal(days[days.length - 1], "2026-10-23");
  // On a Tuesday, that Tuesday is today, not the runway.
  assert.equal(runwayDays("2026-09-29")[0], "2026-09-30");
});

test("the runway counts what Astra still owes and what is approved", () => {
  const post = (approved: boolean) => ({ status: "queued", approved_at: approved ? "x" : null, safety_passed: true, regenerate_requested_at: null });
  const rw = runway(
    [
      { day_key: "2026-09-29", status: "planned", post: post(true) },
      { day_key: "2026-09-30", status: "planned", post: post(false) },
      { day_key: "2026-10-01", status: "removed", post: null },
      { day_key: "2026-10-06", status: "idea", post: null },
    ],
    "2026-09-26",
  );
  assert.equal(rw.approved, 1);
  assert.equal(rw.toReview, 1);
  assert.equal(rw.unfinished, 1);
  assert.equal(rw.empty, 17); // a removed day is a gap again
  assert.equal(rw.complete, false);
});

test("good LinkedIn copy passes the gate", () => {
  const r = checkCaption(GOOD, { channel: "linkedin" });
  assert.deepEqual(r.issues.filter((i) => i.severity === "block"), []);
});

test("LinkedIn never labels a picture a concept, or claims a client or an installation", () => {
  for (const bad of [
    "A concept study for a boutique hotel lobby in Goa, built around one idea.",
    "For our client, a Bengaluru tech campus, we chose a quiet rhythm.",
    "We installed this mural at a Pune office last month, and the floor changed.",
    "This case study shows what one wall can do for a restaurant's character.",
  ]) {
    const r = checkCaption(bad, { channel: "linkedin" });
    assert.equal(r.ok, false, `should block: ${bad}`);
  }
});

test("the LinkedIn wording rules do not leak into Instagram", () => {
  const r = checkCaption("A concept study in calm: sage, linen and a slow botanical rhythm for a bedroom.", {});
  assert.equal(r.ok, true);
});

test("LinkedIn allows 3,000 characters where Instagram stops at 2,200", () => {
  const long = `${GOOD}\n\n${"A wall sets the pace of a room. ".repeat(70)}`;
  assert.ok(long.length > 2200 && long.length < 3000);
  assert.equal(checkCaption(long, { channel: "linkedin" }).ok, true);
  assert.equal(checkCaption(long, {}).ok, false);
});

test("the preview folds the text where LinkedIn does", () => {
  const { head, rest } = foldCaption(GOOD);
  assert.ok(head.length <= 210);
  assert.ok(rest.length > 0);
  assert.equal(`${head} ${rest}`.replace(/\s+/g, " "), GOOD.replace(/\s+/g, " "));
  assert.deepEqual(foldCaption("Short."), { head: "Short.", rest: "" });
});

test("a pasted post link becomes the URN the numbers are pulled by", () => {
  assert.equal(activityUrnFromUrl("https://www.linkedin.com/feed/update/urn:li:activity:7245012345678901234/"), "urn:li:activity:7245012345678901234");
  assert.equal(activityUrnFromUrl("https://www.linkedin.com/posts/zyvorah_walls-activity-7245012345678901234-AbCd"), "urn:li:activity:7245012345678901234");
  assert.equal(activityUrnFromUrl("https://www.linkedin.com/company/zyvorah/"), null);
});
