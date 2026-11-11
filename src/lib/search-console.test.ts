import test from "node:test";
import assert from "node:assert/strict";
import { settledWindow } from "./search-console";

/**
 * Search Console finalises data 2-3 days late. A window ending yesterday comes
 * back looking complete and is not — it under-reports clicks and impressions
 * for its last days, which would show up in the brief as a decline that never
 * happened. The window must therefore end BEFORE the unsettled zone, and this
 * is the only piece of that decision that can be tested without the API.
 */

const NOW = new Date("2026-09-25T08:00:00Z");

test("the window ends three days back, never yesterday", () => {
  const { to } = settledWindow(7, NOW);
  assert.equal(to, "2026-09-22");
  assert.notEqual(to, "2026-09-24", "yesterday's data is not final yet");
});

test("a seven-day window covers seven days inclusive", () => {
  const { from, to } = settledWindow(7, NOW);
  assert.equal(from, "2026-09-16");
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  assert.equal(days, 7);
});

test("a twenty-eight day window covers twenty-eight days inclusive", () => {
  const { from, to } = settledWindow(28, NOW);
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  assert.equal(days, 28);
  assert.equal(to, "2026-09-22");
});

test("a one-day window is a single settled day, not a range", () => {
  const { from, to } = settledWindow(1, NOW);
  assert.equal(from, to);
  assert.equal(to, "2026-09-22");
});

test("the window moves with the clock rather than being pinned to a date", () => {
  const later = settledWindow(7, new Date("2026-10-05T08:00:00Z"));
  assert.equal(later.to, "2026-10-02");
  assert.equal(later.from, "2026-09-26");
});
