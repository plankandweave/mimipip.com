import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_HOMELANE_ACTIVITY,
  HOMELANE_TRAINING_DAY,
  homelaneSection,
  neverSignedInSinceTraining,
  type HomelaneActivity,
} from "./homelane-brief-rules";
import { BRIEF_SECTIONS } from "./briefing-rules";

/**
 * The HomeLane line exists to answer one question every morning after the
 * 30 September 2026 training: are the designers coming? These tests pin that a
 * quiet working day is flagged, a failed count is never printed as "nobody
 * came", and the roster sentence names who is still missing.
 */

const WEDNESDAY = "2026-09-30";
const SUNDAY = "2026-10-04";

function activity(over: Partial<HomelaneActivity> = {}): HomelaneActivity {
  return {
    ...EMPTY_HOMELANE_ACTIVITY,
    accountFound: true,
    members: [
      { email: "asha@homelane.com", name: "Asha" },
      { email: "ravi@homelane.com", name: null },
      { email: "meera@homelane.com", name: "Meera" },
    ],
    ...over,
  };
}

test("the section is registered with the brief", () => {
  assert.ok("homelane-portal" in BRIEF_SECTIONS);
});

test("designers signing in reads green and names them, with first-timers counted", () => {
  const s = homelaneSection(
    activity({
      signedIn: ["asha@homelane.com", "ravi@homelane.com"],
      firstTime: ["ravi@homelane.com"],
      active: ["asha@homelane.com", "ravi@homelane.com", "meera@homelane.com"],
      projectsCreated: 2,
      signedInSinceTraining: ["asha@homelane.com", "ravi@homelane.com", "meera@homelane.com"],
    }),
    WEDNESDAY,
  );
  assert.equal(s.status, "green");
  assert.match(s.headline, /^2 designers signed in \(1 for the first time\), 3 active, 2 projects started/);
  assert.match(s.headline, /3 of 3 listed members have signed in since the 30 September training/);
  assert.match(s.bodyHtml, /Signed in: Asha, ravi@homelane\.com\./);
  assert.match(s.bodyHtml, /Also active on an earlier login: Meera\./);
  assert.match(s.bodyHtml, /Every listed member has signed in at least once/);
});

test("a silent working day is amber and lists who has not turned up", () => {
  const s = homelaneSection(activity({ signedInSinceTraining: ["asha@homelane.com"] }), WEDNESDAY);
  assert.equal(s.status, "amber");
  assert.match(s.headline, /^No HomeLane designer signed in or used the portal yesterday/);
  assert.match(s.headline, /1 of 3 listed members/);
  assert.match(s.bodyHtml, /Not yet signed in: ravi@homelane\.com, Meera\./);
  assert.match(s.bodyHtml, /0 projects started · 0 designs uploaded · 0 orders placed · 0 other actions\./);
});

test("counts in the body are singular when there is one", () => {
  const s = homelaneSection(activity({ active: ["asha@homelane.com"], projectsCreated: 1, designsUploaded: 1, ordersPlaced: 1, otherActions: 1 }), WEDNESDAY);
  assert.match(s.bodyHtml, /1 project started · 1 design uploaded · 1 order placed · 1 other action\./);
});

test("a silent Sunday is information, not a warning", () => {
  const s = homelaneSection(activity(), SUNDAY);
  assert.equal(s.status, "info");
  assert.match(s.headline, /on Sunday/);
});

test("activity on an old login counts as not quiet", () => {
  const s = homelaneSection(activity({ active: ["meera@homelane.com"] }), WEDNESDAY);
  assert.equal(s.status, "green");
  assert.match(s.headline, /^0 designers signed in, 1 active/);
});

test("a failed count is amber with the reason, never zeros", () => {
  const s = homelaneSection(activity({ error: "corporate_audit: timeout" }), WEDNESDAY);
  assert.equal(s.status, "amber");
  assert.match(s.headline, /could not be counted this morning \(corporate_audit: timeout\)/);
  assert.doesNotMatch(s.headline, /0 designers/);
});

test("a missing account is amber and says so", () => {
  const s = homelaneSection(activity({ accountFound: false }), WEDNESDAY);
  assert.equal(s.status, "amber");
  assert.match(s.headline, /no active 'homelane' account/);
});

test("a domain-open account (no member list) still reports the since-training count", () => {
  const s = homelaneSection(
    activity({ members: [], signedIn: ["x@homelane.com"], active: ["x@homelane.com"], signedInSinceTraining: ["x@homelane.com"] }),
    WEDNESDAY,
  );
  assert.equal(s.status, "green");
  assert.match(s.headline, /1 designer has signed in since the 30 September training \(the account keeps no member list/);
});

test("long name lists are capped and html-escaped", () => {
  const members = Array.from({ length: 15 }, (_, i) => ({ email: `d${i}@homelane.com`, name: i === 0 ? "<b>Asha</b>" : null }));
  const s = homelaneSection(activity({ members, signedInSinceTraining: [] }), WEDNESDAY);
  assert.match(s.bodyHtml, /&lt;b&gt;Asha&lt;\/b&gt;/);
  assert.doesNotMatch(s.bodyHtml, /<b>Asha/);
  assert.match(s.bodyHtml, /d11@homelane\.com and 3 more\./);
});

test("neverSignedInSinceTraining is the roster minus everyone seen since the training day", () => {
  const a = activity({ signedInSinceTraining: ["ravi@homelane.com"] });
  assert.deepEqual(neverSignedInSinceTraining(a).map((m) => m.email), ["asha@homelane.com", "meera@homelane.com"]);
  assert.equal(HOMELANE_TRAINING_DAY, "2026-09-30");
});
