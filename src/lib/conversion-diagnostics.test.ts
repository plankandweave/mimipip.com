import assert from "node:assert/strict";
import test from "node:test";
import { diagnosticWindow, cartSignalCounts } from "./conversion-diagnostics";

test("diagnostic windows use complete IST days across UTC midnight", () => {
  assert.deepEqual(diagnosticWindow(7, new Date("2026-10-06T20:00:00Z")), {
    days: 7, from: "2026-09-30", to: "2026-10-06",
  });
  assert.equal(diagnosticWindow(NaN).days, 28);
  assert.equal(diagnosticWindow(10000).days, 90);
  assert.equal(diagnosticWindow(-2).days, 1);
});

test("blocked browser signals cannot erase successful server additions or double-count them", () => {
  assert.deepEqual(cartSignalCounts({ cart: 0, cart_add: 8 }), { serverConfirmed: 8, browserReported: 0 });
  assert.deepEqual(cartSignalCounts({ cart: 8, cart_add: 8 }), { serverConfirmed: 8, browserReported: 8 });
  assert.deepEqual(cartSignalCounts({ cart: 20 }), { serverConfirmed: 0, browserReported: 20 });
});
