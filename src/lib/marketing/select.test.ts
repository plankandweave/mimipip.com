// Slot keys are the only thing standing between a retry and a double post, and
// between a week composed on Sunday and the daily tick composing it all again.
//
// These test planSchedule rather than planSlots because planSlots needs the
// catalogue, and needing the catalogue is precisely why this file had no tests
// and why the run-index bug survived: `?count=` already reached three, so a
// two-day run would have keyed the second day "#1" while the next morning's
// tick keyed it "#0" — the same day, posted twice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planSchedule } from "./select";

const MON = new Date("2026-09-07T00:00:00Z");

test("a week keys one slot per day, every key #0", () => {
  const week = planSchedule(7, MON);
  assert.equal(week.length, 7);
  for (const s of week) assert.match(s.slotKey, /#0$/, `${s.slotKey} is not the day's first slot`);
  assert.equal(new Set(week.map((s) => s.slotKey)).size, 7, "duplicate keys in one week");
});

test("the week and the daily ticks it anticipates agree on every key", () => {
  // This is the property that matters: on Tuesday morning the daily cron must
  // recognise Sunday's Tuesday slot as already done. If the keys differ it
  // composes a second post and both sit in the review.
  const week = planSchedule(7, MON);
  for (let i = 0; i < 7; i++) {
    const [daily] = planSchedule(1, new Date(MON.getTime() + i * 86_400_000));
    assert.equal(week[i].slotKey, daily.slotKey);
    assert.equal(week[i].pillar, daily.pillar, "the pillar rhythm must not depend on run length");
  }
});

test("the pillar advances across days rather than restarting each run", () => {
  // 29 consecutive ledger rows were all "reveal" because the rhythm was indexed
  // by position within the run, and every run was one slot long.
  const week = planSchedule(7, MON);
  assert.ok(new Set(week.map((s) => s.pillar)).size > 1, "every day drew the same pillar");
});

test("re-planning the same days is identical", () => {
  // A retried cron must not diverge from the run it is retrying.
  assert.deepEqual(planSchedule(7, MON), planSchedule(7, MON));
});

test("days are consecutive and distinct", () => {
  const days = planSchedule(7, MON).map((s) => s.dayKey);
  assert.equal(new Set(days).size, 7);
  assert.deepEqual([...days].sort(), days, "days must come out in order");
});
