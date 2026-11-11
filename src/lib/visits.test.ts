import { test } from "node:test";
import assert from "node:assert/strict";
import { recordPageView, VISIT_GAP_MS, type VisitStore } from "./visits";

function memoryStore(): VisitStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

test("the first page view is visit 1, and browsing on stays in it", () => {
  const s = memoryStore();
  const t = 1_000_000;
  assert.equal(recordPageView(s, t), 1);
  assert.equal(recordPageView(s, t + 60_000), 1);
  // Forty minutes of steady browsing is still one visit: the gap is measured
  // from the LAST page view, not the first.
  assert.equal(recordPageView(s, t + 20 * 60_000), 1);
  assert.equal(recordPageView(s, t + 40 * 60_000), 1);
});

test("coming back after the gap is the next visit", () => {
  const s = memoryStore();
  const t = 1_000_000;
  recordPageView(s, t);
  assert.equal(recordPageView(s, t + VISIT_GAP_MS - 1), 1);
  const back = t + VISIT_GAP_MS - 1 + VISIT_GAP_MS;
  assert.equal(recordPageView(s, back), 2);
  assert.equal(recordPageView(s, back + 5_000), 2);
  assert.equal(recordPageView(s, back + 5_000 + 3 * 24 * 60 * 60 * 1000), 3);
});

test("unreadable stored values start the count fresh", () => {
  const s = memoryStore();
  s.setItem("zyv_visits", "garbage");
  assert.equal(recordPageView(s, 5), 1);
});
