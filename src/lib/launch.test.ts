// The launch calendar, pinned.
//
// These are commercial promises, not preferences. A collection that goes live
// an hour early has been leaked; one that goes live late has been announced to
// a newsletter list that arrives at an empty page. The dates below are TAASH's
// real ones, so a change that makes these fail is wrong until Roheena moves
// the launch itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type CollectionLaunch,
  phaseOf, isPublic, resolveHomepageLaunch, publicLaunches,
  daysUntilLaunch, countdownLabel, launchDateLabel, sliderHandles,
  teaserStart, windowEnd, teaserKicker,
} from "./launch";

/** TAASH: live 24 Sep 2026 00:00 IST, teasing from the 17th, fronting 14 days. */
const taash: CollectionLaunch = {
  collectionHandle: "taash",
  launchAt: new Date("2026-09-24T00:00:00+05:30"),
  windowDays: 14,
  teaserDays: 7,
  heroHandles: [],
  teaserHandles: [],
  activatedAt: null,
  cancelledAt: null,
  notes: null,
};

const at = (iso: string) => new Date(iso);

test("the collection is invisible until the teaser, and unbuyable until launch", () => {
  // A fortnight out: scheduled, but no business on the homepage.
  assert.equal(phaseOf(taash, at("2026-09-10T12:00:00+05:30")), "upcoming");
  // The day before the teaser.
  assert.equal(phaseOf(taash, at("2026-09-16T23:59:59+05:30")), "upcoming");
  // Teaser opens on the 17th, exactly seven days out.
  assert.equal(phaseOf(taash, at("2026-09-17T00:00:00+05:30")), "teaser");
  assert.equal(phaseOf(taash, at("2026-09-23T23:59:59+05:30")), "teaser");

  // Nothing is buyable before the instant of launch — this is the leak test.
  assert.equal(isPublic(taash, at("2026-09-23T23:59:59+05:30")), false);
  assert.equal(isPublic(taash, at("2026-09-24T00:00:00+05:30")), true);
});

test("the fortnight ends, and the collection survives it", () => {
  assert.equal(phaseOf(taash, at("2026-10-07T23:59:59+05:30")), "live");
  assert.equal(phaseOf(taash, at("2026-10-08T00:00:00+05:30")), "over");
  // Over means "no longer fronting", NEVER "withdrawn". It stays shoppable.
  assert.equal(isPublic(taash, at("2027-01-01T00:00:00+05:30")), true);
});

test("the boundaries are where the dates say they are", () => {
  assert.equal(teaserStart(taash).toISOString(), new Date("2026-09-17T00:00:00+05:30").toISOString());
  assert.equal(windowEnd(taash).toISOString(), new Date("2026-10-08T00:00:00+05:30").toISOString());
});

test("a cancelled launch is cancelled at every instant, past and future", () => {
  // Absolute, or a pulled collection reappears the moment a clock crosses a
  // boundary — the exact failure that makes a cancellation untrustworthy.
  const pulled = { ...taash, cancelledAt: new Date("2026-09-20T00:00:00+05:30") };
  for (const t of ["2026-09-01", "2026-09-18", "2026-09-24", "2026-10-09"]) {
    assert.equal(phaseOf(pulled, at(`${t}T12:00:00+05:30`)), "cancelled");
    assert.equal(isPublic(pulled, at(`${t}T12:00:00+05:30`)), false);
  }
});

test("teaserDays 0 means the collection appears out of nowhere", () => {
  const sudden = { ...taash, teaserDays: 0 };
  assert.equal(phaseOf(sudden, at("2026-09-23T23:59:59+05:30")), "upcoming");
  assert.equal(phaseOf(sudden, at("2026-09-24T00:00:00+05:30")), "live");
});

test("when two launches overlap the newer one leads, and a teaser never displaces a live one", () => {
  // January is scheduled while TAASH is still inside its fortnight — the case
  // that actually happens, not a hypothetical.
  const january: CollectionLaunch = {
    ...taash, collectionHandle: "atelier-jan", launchAt: at("2027-01-01T00:00:00+05:30"),
  };

  // TAASH's launch morning: it leads, January is not even teasing yet.
  let r = resolveHomepageLaunch([taash, january], at("2026-09-24T09:00:00+05:30"));
  assert.equal(r.live?.collectionHandle, "taash");
  assert.equal(r.teaser, null);

  // Both live at once (a January launch inside a longer window): newer wins.
  const longTaash = { ...taash, windowDays: 200 };
  r = resolveHomepageLaunch([longTaash, january], at("2027-01-02T00:00:00+05:30"));
  assert.equal(r.live?.collectionHandle, "atelier-jan");

  // January teasing while TAASH is still live: TAASH keeps the hero, January
  // gets the teaser band. The last days of a launch are not eaten by the next.
  r = resolveHomepageLaunch([longTaash, january], at("2026-12-28T00:00:00+05:30"));
  assert.equal(r.live?.collectionHandle, "taash");
  assert.equal(r.teaser?.collectionHandle, "atelier-jan");
});

test("a finished launch stays public but stops leading", () => {
  const now = at("2026-11-01T00:00:00+05:30");
  assert.equal(resolveHomepageLaunch([taash], now).live, null);
  assert.deepEqual(publicLaunches([taash], now).map((l) => l.collectionHandle), ["taash"]);
});

test("the countdown rounds up, because it is spoken aloud", () => {
  // One minute past midnight on the 23rd is still "tomorrow", never "today".
  assert.equal(countdownLabel(taash, at("2026-09-23T00:01:00+05:30")), "Tomorrow");
  assert.equal(countdownLabel(taash, at("2026-09-23T23:59:00+05:30")), "Tomorrow");
  assert.equal(countdownLabel(taash, at("2026-09-17T00:00:00+05:30")), "In 7 days");
  assert.equal(countdownLabel(taash, at("2026-09-24T00:00:00+05:30")), "Today");
  assert.equal(daysUntilLaunch(taash, at("2026-10-01T00:00:00+05:30")), 0);
});

test("the countdown counts calendar days, not elapsed hours", () => {
  // The bug this pins: a launch with a TIME OF DAY. TAASH lands 18:00 IST on
  // Monday the 7th. On Saturday morning every reader would say "in two days";
  // ceil-of-milliseconds said three, because 2 days 7 hours rounds up. The
  // original test suite missed it because its launch was at midnight, where
  // elapsed time and the calendar agree.
  const evening: CollectionLaunch = { ...taash, launchAt: new Date("2026-09-07T18:00:00+05:30") };
  assert.equal(countdownLabel(evening, at("2026-09-05T11:30:00+05:30")), "In 2 days");
  assert.equal(countdownLabel(evening, at("2026-09-05T23:30:00+05:30")), "In 2 days");
  assert.equal(countdownLabel(evening, at("2026-09-06T00:30:00+05:30")), "Tomorrow");
  // Launch morning is "Today" from midnight, hours before the collection lands.
  assert.equal(countdownLabel(evening, at("2026-09-07T09:00:00+05:30")), "Today");
});

test("the launch date reads in IST wherever the customer is", () => {
  // 23:00 UTC on the 23rd is already the 24th in India. A reader in London
  // must not be told the collection lands on the 23rd.
  assert.equal(launchDateLabel(taash), "24 September");
});

test("the slider always fills, and never shows one design twice", () => {
  // Nobody picked: the collection fills the panes rather than render a gap.
  assert.deepEqual(sliderHandles([], ["a", "b", "c", "d"], 3), ["a", "b", "c"]);
  // A short pick is topped up from the collection.
  assert.deepEqual(sliderHandles(["x"], ["a", "b"], 3), ["x", "a", "b"]);
  // A design named twice cannot take two panes of three.
  assert.deepEqual(sliderHandles(["x", "x"], ["x", "a", "b"], 3), ["x", "a", "b"]);
  // A thin catalogue gives what it has rather than padding with blanks.
  assert.deepEqual(sliderHandles([], ["a"], 3), ["a"]);
});

test("a collaboration is announced by its houses, not by \"Arriving\"", () => {
  // TAASH is Mati's collection as much as Zyvorah's, and the printed book
  // names Mati first. The teaser uppercases this, so the case here is the
  // source's, not the display's.
  assert.equal(teaserKicker(taash), "Mati \u00d7 Zyvorah");
  // A collection Zyvorah made alone has no houses to name, and says the only
  // honest thing left.
  assert.equal(teaserKicker({ ...taash, collectionHandle: "calm" }), "Arriving");
});
