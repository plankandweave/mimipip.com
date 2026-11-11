// The signature spotlight's two rotations, pinned against each other.
//
// This file exists because the failure it guards is SILENT. The homepage
// rotates WHICH signature collection is on stage (one per day) and, within it,
// WHICH of its picks the line shows. Both were driven by the same day index —
// so a collection on stage every Nth day only ever saw day indices from one
// residue class mod N, and `turn * size mod picks` is constant across such a
// class whenever N * size shares a factor with the pick count.
//
// Nothing throws when that happens. The row still renders four handsome cards
// every day; they are simply the SAME four forever, and the rest of the
// collection is unreachable. It went unnoticed until a third signature
// collection was flagged, which froze all three at once — including the two
// that had been rotating perfectly well the day before.
//
// If these fail, the spotlight has stopped showing part of the catalogue.
import { test } from "node:test";
import assert from "node:assert/strict";
import { turnWindow, logicalDayIndex } from "./dailyRotation";

const ROW = 4;

/** What the live page does: the collection's own turn count drives its window. */
function spotlight(collections: number, slot: number, picks: string[], day: number) {
  if (day % collections !== slot) return null;
  return turnWindow(picks, ROW, Math.floor(day / collections));
}

function coverage(collections: number, slot: number, picks: string[], days = 400) {
  const start = logicalDayIndex(new Date("2026-09-05T12:00:00Z"));
  const seen = new Set<string>();
  const windows = new Set<string>();
  for (let d = start; d < start + days; d++) {
    const w = spotlight(collections, slot, picks, d);
    if (!w) continue;
    w.forEach((p) => seen.add(p));
    windows.add(w.join(","));
  }
  return { seen, windows };
}

const SIX = ["a", "b", "c", "d", "e", "f"];

test("every pick reaches the row, at any number of signature collections", () => {
  // 3 collections x 6 picks x a window of 4 is the exact case that froze.
  for (const collections of [1, 2, 3, 4, 5, 6, 8, 12]) {
    for (let slot = 0; slot < collections; slot++) {
      const { seen, windows } = coverage(collections, slot, SIX);
      assert.equal(
        seen.size, SIX.length,
        `${collections} collections, slot ${slot}: only ${[...seen]} ever shown`,
      );
      assert.ok(
        windows.size > 1,
        `${collections} collections, slot ${slot}: window frozen at ${[...windows]}`,
      );
    }
  }
});

test("a pick list that cannot fill the row is returned whole, never padded", () => {
  const short = ["a", "b"];
  assert.deepEqual(turnWindow(short, ROW, 0), short);
  assert.deepEqual(turnWindow(short, ROW, 7), short);
});

test("a window never repeats a design within itself", () => {
  for (let turn = 0; turn < 50; turn++) {
    const w = turnWindow(SIX, ROW, turn);
    assert.equal(new Set(w).size, ROW, `turn ${turn} repeated a design: ${w}`);
  }
});

test("consecutive turns advance a whole window, not one item", () => {
  // 6 picks, window of 4: 0-3 then 4-5-0-1 — an overlap of two is the most the
  // list allows. A sliding window would overlap by three.
  const a = turnWindow(SIX, ROW, 0);
  const b = turnWindow(SIX, ROW, 1);
  const overlap = a.filter((x) => b.includes(x)).length;
  assert.equal(overlap, 2, `turns 0 and 1 overlapped by ${overlap}`);
});
