import assert from "node:assert/strict";
import test from "node:test";
import { assertAllPrintableLines, paidLineAmounts } from "./os-paid-lines";

test("paid website line snapshots keep design, add-ons, and discount in exact balance", () => {
  const result = paidLineAmounts([
    { id: "katha", lineTotal: 30_350, installationTotal: 350 },
    { id: "ikat", lineTotal: 20_000 },
  ], { subtotal: 50_350, discount: 5_035, shipping: 1_000, total: 46_315 });
  assert.deepEqual(result.get("katha"), {
    lineTotalInr: 27_315,
    installationTotalInr: 315,
    personalisationTotalInr: 0,
    exclusivityTotalInr: 0,
  });
  assert.equal(result.get("ikat")?.lineTotalInr, 18_000);
  assert.equal([...result.values()].reduce((sum, line) => sum + line.lineTotalInr, 0), 45_315);
});

test("odd paise are assigned once and all paid components still reconcile", () => {
  const result = paidLineAmounts([
    { id: "a", lineTotal: 3, installationTotal: 1, personalisationTotal: 1 },
    { id: "b", lineTotal: 3, exclusivityTotal: 1 },
  ], { subtotal: 6, discount: 1, shipping: 0, total: 5 });
  assert.equal([...result.values()].reduce((sum, line) => sum + line.lineTotalInr, 0), 5);
  for (const line of result.values()) {
    assert.ok(line.lineTotalInr >= line.installationTotalInr + line.personalisationTotalInr + line.exclusivityTotalInr);
  }
});

test("inconsistent saved totals fail closed before an OS invoice is created", () => {
  assert.throws(() => paidLineAmounts([
    { id: "a", lineTotal: 300 },
  ], { subtotal: 301, discount: 0, shipping: 0, total: 301 }), /do not reconcile/);
  assert.throws(() => paidLineAmounts([
    { id: "a", lineTotal: 300, installationTotal: 301 },
  ], { subtotal: 300, discount: 0, shipping: 0, total: 300 }), /add-ons exceed/);
});

test("mixed or unprintable baskets fail before creating a partial OS invoice", () => {
  assert.doesNotThrow(() => assertAllPrintableLines(["wall-a", "wall-b"], ["wall-b", "wall-a"]));
  assert.throws(() => assertAllPrintableLines(["wall", "service"], ["wall"]), /cannot account for/);
  assert.throws(() => assertAllPrintableLines(["wall"], ["other"]), /cannot account for/);
});
