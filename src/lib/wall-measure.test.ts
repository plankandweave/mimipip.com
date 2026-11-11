// The arithmetic two capture screens now share.
//
// The carry case below is a real regression: a wall entered as 9 ft used to read
// back as "8′ 12″" because 2743 mm is 107.99 inches, which floors to 8 ft and
// rounds to 12 in. The millimetres were right, but the screen whose whole job is
// to be trusted about numbers was telling someone they had measured something
// they had not.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  feetFromMm, mmFromFeet, showFeet, sizeProblem, spokenSizeToMm, sqft, num,
  MAX_WALL_HEIGHT_MM, MAX_WALL_WIDTH_MM,
} from "./wall-measure";

test("feet and inches survive the round trip", () => {
  for (const [ft, inch] of [[9, 0], [8, 6], [12, 11], [1, 1], [40, 0]] as const) {
    const mm = mmFromFeet(ft, inch);
    assert.deepEqual(feetFromMm(mm), { ft, inch }, `${ft}ft ${inch}in`);
  }
});

test("9 ft reads back as 9 ft, not 8 ft 12 in", () => {
  const mm = mmFromFeet(9, 0);         // 2743 mm
  assert.deepEqual(feetFromMm(mm), { ft: 9, inch: 0 });
  assert.equal(showFeet(mm), "9′");
});

test("a whole number of feet drops the inches", () => {
  assert.equal(showFeet(mmFromFeet(12, 0)), "12′");
  assert.equal(showFeet(mmFromFeet(8, 6)), "8′ 6″");
});

test("area is in square feet", () => {
  // A 10 ft x 10 ft wall is 100 sq ft.
  assert.ok(Math.abs(sqft(mmFromFeet(10, 0), mmFromFeet(10, 0)) - 100) < 0.05);
});

test("a typed field yields a number, or zero, never NaN", () => {
  assert.equal(num("12"), 12);
  assert.equal(num("12.5 ft"), 12.5);
  assert.equal(num(""), 0);
  assert.equal(num("abc"), 0);
});

// Reading a walkthrough. The walker said "about ten metres wide" and that is
// worth keeping as an estimate; everything else must come back as nothing.
//
// The asymmetry here is the whole point and is not a style choice: a wall with
// NO size is obviously unfinished and gets measured before it is printed. A wall
// carrying a plausible invented size is quoted, printed and delivered wrong. So
// every uncertain case resolves to null.
test("a spoken measurement converts; the units people actually say are covered", () => {
  assert.equal(spokenSizeToMm(10, "m"), 10_000);
  assert.equal(spokenSizeToMm(10, "metres"), 10_000);
  assert.equal(spokenSizeToMm(350, "cm"), 3_500);
  assert.equal(spokenSizeToMm(2400, "mm"), 2_400);
  assert.equal(spokenSizeToMm(10, "ft"), 3_048);
  assert.equal(spokenSizeToMm(10, "feet"), 3_048);
  assert.equal(spokenSizeToMm(36, "in"), 914);
});

test("an unrecognised or missing unit yields nothing, never a guess", () => {
  for (const [v, u] of [
    [10, ""], [10, null], [10, undefined], [10, "units"], [10, "big"],
    ["ten", "m"], [null, "m"], [0, "m"], [-5, "m"], [NaN, "m"],
  ] as [unknown, unknown][]) {
    assert.equal(spokenSizeToMm(v, u), null, `${String(v)} ${String(u)} should not convert`);
  }
});

test("a mis-hearing is dropped rather than clamped into range", () => {
  // Clamping would turn a mis-heard number into a confident wrong one.
  assert.equal(spokenSizeToMm(2, "mm"), null);      // too small to be a wall
  assert.equal(spokenSizeToMm(400, "m"), null);     // 400 m of lobby
  assert.equal(spokenSizeToMm(100_000, "mm"), null);
});

test("a plausible commercial wall passes; the implausible ones say what to do", () => {
  // A 30 m lobby run at 4 m tall is an ordinary commercial wall, and must not
  // be refused by bounds set for a bedroom.
  assert.equal(sizeProblem(30_000, 4_000), null);

  assert.match(sizeProblem(0, 2_000) ?? "", /width and a height/);
  assert.match(sizeProblem(50, 2_000) ?? "", /under 100 mm/);
  assert.match(sizeProblem(2_000, MAX_WALL_HEIGHT_MM + 1) ?? "", /split it into two walls/);
  assert.match(sizeProblem(MAX_WALL_WIDTH_MM + 1, 2_000) ?? "", /split a longer run/);
});
