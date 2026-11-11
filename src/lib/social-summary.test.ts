import test from "node:test";
import assert from "node:assert/strict";
import { summariseSocial, type RawPostRow } from "./social-summary";

/**
 * The brief tells Roheena two things about Instagram that she will act on, and
 * both are claims about the future rather than reports of the past:
 *   "Instagram will stay quiet"
 *   "this channel has never published a post"
 * A wrong "will stay quiet" sends her hunting for a problem that is not there.
 * A missing one lets the channel sit dark for weeks while the brief reports a
 * calm, truthful, useless "nothing went out, nothing is waiting".
 */

const TODAY = "2026-09-25";
const row = (o: Partial<RawPostRow>): RawPostRow => ({ safety_passed: true, review_ready: true, ...o });

test("declined days ahead, with nothing queued, is reported as a channel that will stay quiet", () => {
  // Exactly the live state on 25 Sep 2026: eight slots turned down, none
  // waiting, none approved, nothing ever published.
  const rows = ["2026-09-25", "2026-09-26", "2026-09-27", "2026-10-01"].map((d) =>
    row({ status: "skipped", slot_key: `${d}#0` }),
  );
  const s = summariseSocial(rows, TODAY);
  assert.equal(s.horizonFullyDeclined, true);
  assert.equal(s.declinedAhead, 4);
  assert.equal(s.awaitingReview, 0);
});

test("a declined day in the past does not predict future silence", () => {
  const s = summariseSocial([row({ status: "skipped", slot_key: "2026-09-01#0" })], TODAY);
  assert.equal(s.declinedAhead, 0);
  assert.equal(s.horizonFullyDeclined, false, "a past decline says nothing about the days ahead");
});

test("a declined day does not silence the channel while something is still waiting", () => {
  const s = summariseSocial(
    [
      row({ status: "skipped", slot_key: "2026-09-26#0" }),
      row({ status: "queued", slot_key: "2026-09-27#0" }),
    ],
    TODAY,
  );
  assert.equal(s.awaitingReview, 1);
  assert.equal(s.horizonFullyDeclined, false, "there is something she can still approve");
});

test("a declined day does not silence the channel while something is approved and scheduled", () => {
  const s = summariseSocial(
    [
      row({ status: "skipped", slot_key: "2026-09-26#0" }),
      row({ status: "queued", slot_key: "2026-09-27#0", approved_at: "2026-09-24T10:00:00Z" }),
    ],
    TODAY,
  );
  assert.equal(s.approvedWaiting, 1);
  assert.equal(s.horizonFullyDeclined, false, "an approved post is still coming");
});

test("a post that failed the safety gate is counted apart from one awaiting review", () => {
  // It cannot be approved at all, only rewritten, so it never drains on its own
  // and must not be presented to her as a decision she can make.
  const s = summariseSocial([row({ status: "queued", slot_key: "2026-09-26#0", safety_passed: false })], TODAY);
  assert.equal(s.blocked, 1);
  assert.equal(s.awaitingReview, 0);
});

test("a post sent back for a rewrite is not waiting on her", () => {
  const s = summariseSocial(
    [row({ status: "queued", slot_key: "2026-09-26#0", regenerate_requested_at: "2026-09-24T09:00:00Z" })],
    TODAY,
  );
  assert.equal(s.awaitingReview, 0, "the writer has it, not her");
});

test("never published is stated only when nothing ever published", () => {
  assert.equal(summariseSocial([row({ status: "skipped", slot_key: "2026-09-26#0" })], TODAY).everPublished, false);
  const once = summariseSocial(
    [row({ status: "published", slot_key: "2026-09-20#0", published_at: "2026-09-20T05:00:00Z" })],
    TODAY,
  );
  assert.equal(once.everPublished, true);
});

test("yesterday's posts are counted by the day they published, not the day they were written", () => {
  const s = summariseSocial(
    [
      row({ status: "published", slot_key: "2026-09-25#0", published_at: `${TODAY}T05:00:00Z` }),
      row({ status: "published", slot_key: "2026-09-24#0", published_at: "2026-09-24T05:00:00Z" }),
    ],
    TODAY,
  );
  assert.equal(s.publishedYesterday, 1);
});

test("the oldest waiting post is measured from the day it was meant to go out", () => {
  const s = summariseSocial(
    [
      row({ status: "queued", slot_key: "2026-09-20#0" }),
      row({ status: "queued", slot_key: "2026-09-24#0" }),
    ],
    TODAY,
  );
  assert.equal(s.oldestWaitingDays, 5);
});

test("an unapproved post whose day has passed is a missed day, not a blocked post", () => {
  // 9 Oct 2026: six posts dated 7–8 October were reported as "need production
  // work". No production work can give a post back its day.
  const s = summariseSocial(
    [
      row({ status: "queued", slot_key: "2026-09-25#1005", review_ready: false, review_hold: "This post needs a current publishing date before review." }),
      row({ status: "queued", slot_key: "2026-09-26#1000", review_ready: false, review_hold: "Production incomplete: final export missing" }),
    ],
    TODAY,
  );
  assert.equal(s.missedDays, 1);
  assert.equal(s.blocked, 1, "only the post that still has its day can be unblocked");
});

test("a failure from before yesterday is not reported as a fresh failure every morning", () => {
  // The 28 September Story, unconfirmable once Instagram's 24 hours passed,
  // read "1 failed to publish" in every brief for eleven days.
  const s = summariseSocial(
    [
      row({ status: "failed", slot_key: "2026-09-12#21" }),
      row({ status: "failed", slot_key: "2026-09-25#3" }),
    ],
    TODAY,
  );
  assert.equal(s.failed, 1);
});
