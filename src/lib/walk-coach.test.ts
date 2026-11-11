// The recorder has to talk somebody through a walk they have never done before,
// at arm's length, while they are moving. So the coaching ladder is pinned the
// way the next-step ladder is: always one action, never blame, and never a
// silent screen at the moment somebody is wondering whether it is working.
import { test } from "node:test";
import assert from "node:assert/strict";
import { coachWalker } from "./walk-coach";

const MAX = 180;
const at = (seconds: number, marks: number, sinceMark: number | null = null) =>
  coachWalker({ seconds, marks, maxSeconds: MAX, sinceMark });

test("the first seconds ask for speech, not for a button", () => {
  const c = at(2, 0);
  assert.match(c.say, /say where you are/i);
  // Nothing to press yet — they are still getting their bearings.
  assert.equal(c.urging, false);
});

test("once they have settled, it asks for the mark and makes it loud", () => {
  const c = at(20, 0);
  assert.match(c.say, /mark this wall/i);
  assert.equal(c.urging, true);
});

test("straight after a mark it asks them to describe what they just captured", () => {
  const c = at(30, 1, 1);
  assert.match(c.say, /wall 1 marked/i);
  assert.match(c.say, /say what it should do/i);
  // Not urging: they should be talking, not hunting for the button again.
  assert.equal(c.urging, false);
});

test("a while after a mark it asks for the next one", () => {
  const c = at(60, 2, 30);
  assert.match(c.say, /mark this wall/i);
  assert.equal(c.urging, true);
});

test("near the cap it says so, and what to do about it", () => {
  const withWalls = at(MAX - 5, 3, 20);
  assert.match(withWalls.say, /nearly out of time/i);
  assert.match(withWalls.say, /finish/i);

  // Somebody who has marked nothing is about to lose the walk's whole point,
  // so this is the one moment the prompt gets insistent.
  const without = at(MAX - 5, 0);
  assert.match(without.say, /nearly out of time/i);
  assert.equal(without.urging, true);
});

test("there is never a blank instruction, at any point in a walk", () => {
  for (let s = 0; s <= MAX; s += 5) {
    for (const marks of [0, 1, 5]) {
      for (const since of [null, 0, 3, 40]) {
        const c = coachWalker({ seconds: s, marks, maxSeconds: MAX, sinceMark: since });
        assert.ok(c.say.length > 10, `blank coaching at ${s}s / ${marks} marks`);
        assert.ok(c.say.length < 110, `too long to read while walking: "${c.say}"`);
      }
    }
  }
});

test("nothing in the coaching blames the person", () => {
  for (let s = 0; s <= MAX; s += 10) {
    for (const marks of [0, 2]) {
      const c = coachWalker({ seconds: s, marks, maxSeconds: MAX, sinceMark: 20 });
      for (const bad of ["forgot", "failed", "should have", "error", "invalid", "you didn't"]) {
        assert.ok(!c.say.toLowerCase().includes(bad), `"${bad}" in: ${c.say}`);
      }
    }
  }
});
