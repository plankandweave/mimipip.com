// The calendar is copy the founder approved and prices customers will act on,
// posted verbatim by an autonomous engine — so the guarantees that matter are
// structural: the right design on the right day, no design spent twice, and
// every caption still clearing the same brand-safety gate the rotation clears.
// These run without the catalogue (pure data), so they actually run.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAMPAIGN_FEED,
  CAMPAIGN_MANUAL,
  CAMPAIGN_WINDOW,
  campaignFeedSlot,
  inCampaignWindow,
} from "./campaign";
import { checkCaption } from "./safety";

// The price tier each collection sells at, GST-included. If a caption cites a
// rupee figure it must equal this — the same rule the safety gate enforces
// against the live from-price. Encoding it here catches a caption drifting from
// its collection's price without a database.
const PRICE_BY_COLLECTION: Record<string, number> = {
  Katha: 300,
  "Stallion Spirit": 300,
  "Maharaja's Court": 300,
  TAASH: 400,
  Dwadasha: 300,
};

test("the calendar is one design per day across 24 Sep – 23 Oct", () => {
  assert.equal(CAMPAIGN_FEED.length, 30);
  const days = CAMPAIGN_FEED.map((s) => s.dayKey);
  assert.deepEqual(days, [...days].sort(), "days are not in order");
  assert.equal(days[0], "2026-09-24");
  assert.equal(days[days.length - 1], "2026-10-23");
  assert.equal(new Set(days).size, 30, "two posts share a day");
});

test("no design is used in two arcs — the no-repeat rule", () => {
  // Ten designs, each running a three-day Wall→Detail→Word arc, consecutively.
  const counts = new Map<string, number>();
  for (const s of CAMPAIGN_FEED) counts.set(s.handle, (counts.get(s.handle) ?? 0) + 1);
  assert.equal(counts.size, 10, "expected exactly ten distinct designs");
  for (const [handle, n] of counts) assert.equal(n, 3, `${handle} does not appear exactly three times`);

  for (let i = 0; i < CAMPAIGN_FEED.length; i += 3) {
    const arc = CAMPAIGN_FEED.slice(i, i + 3);
    assert.equal(new Set(arc.map((s) => s.handle)).size, 1, `arc at ${arc[0].dayKey} mixes designs`);
    assert.deepEqual(arc.map((s) => s.beat), ["wall", "detail", "word"], `arc at ${arc[0].dayKey} is out of beat`);
  }
});

test("each beat maps to a fixed pillar and a single-image format", () => {
  for (const s of CAMPAIGN_FEED) {
    assert.equal(s.format, "feed", `${s.dayKey} is not a single still`);
    const expected = s.beat === "word" ? "collection_story" : "reveal";
    assert.equal(s.pillar, expected, `${s.dayKey} (${s.beat}) has the wrong pillar`);
  }
});

test("every caption is postable and clears the safety gate", () => {
  // Earlier campaign copy is historical. Check slots still in the release window.
  for (const s of CAMPAIGN_FEED.filter((slot) => slot.dayKey >= "2026-10-20")) {
    const fromPrice = PRICE_BY_COLLECTION[s.collection];
    assert.ok(fromPrice, `no price tier known for collection "${s.collection}"`);
    const result = checkCaption(s.caption, { fromPrice });
    assert.ok(
      result.ok,
      `${s.dayKey} ${s.design} blocked: ${result.issues.filter((i) => i.severity === "block").map((i) => i.detail).join("; ")}`,
    );
    assert.ok(s.caption.length > 20 && s.caption.length <= 2200, `${s.dayKey} caption length is out of range`);
  }
});

test("the gate has teeth: a caption's price must match its collection tier", () => {
  // Negative control — prove the green result above could have been red. Take a
  // slot that actually cites a price and feed the WRONG tier: it must block.
  const right = 300;
  const caption = "Royal Peacock brings quiet ceremony to the room. Explore the design from ₹300/sq ft.";
  assert.ok(checkCaption(caption, { fromPrice: right }).ok, "should pass at the right price");
  const wrong = checkCaption(caption, { fromPrice: right + 5 });
  assert.ok(!wrong.ok, "a wrong price must be blocked — the gate is not enforcing price");
  assert.ok(wrong.issues.some((i) => i.code === "wrong_price"));
});

test("the campaign owns its window; the launch day carries no feed slot", () => {
  assert.ok(inCampaignWindow(CAMPAIGN_WINDOW.start));
  assert.ok(inCampaignWindow(CAMPAIGN_WINDOW.end));
  assert.ok(!inCampaignWindow("2026-09-22"), "day before the window leaked in");
  assert.ok(!inCampaignWindow("2026-10-24"), "day after the window leaked in");

  // 23 Sep is inside the window but is the bespoke TALK/SEE/DECIDE launch — the
  // engine must find no feed slot and therefore compose nothing (not a generic
  // fallback post).
  assert.ok(inCampaignWindow("2026-09-23"));
  assert.equal(campaignFeedSlot("2026-09-23"), undefined);
  assert.ok(campaignFeedSlot("2026-09-24"), "first design day is missing");
});

test("the Stories never reuse a feed arc's design — the rule holds across all 18", () => {
  assert.equal(CAMPAIGN_MANUAL.filter((m) => m.kind === "launch").length, 3);
  const stories = CAMPAIGN_MANUAL.filter((m) => m.kind === "story");
  assert.equal(stories.length, 8);
  const feedHandles = new Set(CAMPAIGN_FEED.map((s) => s.handle));
  for (const st of stories) {
    assert.ok(st.handle, `story on ${st.dayKey} has no design`);
    assert.ok(!feedHandles.has(st.handle!), `story design ${st.handle} is already a feed arc`);
  }
});
