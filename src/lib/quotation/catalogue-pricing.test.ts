import { test } from "node:test";
import assert from "node:assert/strict";
import { priceQuotationDesigns, type QuotationDesign } from "./catalogue-pricing";
import { KRT_QUOTATION } from "./krt-fixture";
import { lineAmount, quotationTotals, termsFor } from "./model";
const offers: QuotationDesign[] = [
  { handle: "calm-test", title: "Calm", surfaceSlug: "linen-touch", surface: "Linen feel", rateInclGst: 300 },
  { handle: "taash-test", title: "Taash", surfaceSlug: "linen-touch", surface: "Linen feel", rateInclGst: 400 },
];
const line = { seq: 1, location: "Wall", basis: "Measured", material: "non-woven", sqft: 100 };
test("same surface keeps distinct design rates, with exact website inclusive totals", () => {
  const q = priceQuotationDesigns({ ...KRT_QUOTATION, lines: [{ ...line, productHandle: "calm-test" }, { ...line, seq: 2, productHandle: "taash-test" }] }, offers);
  assert.equal(quotationTotals(q).supply.total, 70000);
  assert.deepEqual(q.lines.map((l) => l.catalogue?.rateInclGst), [300, 400]);
  assert.ok(q.lines.every((l) => l.material === "linen-textured"));
  assert.equal(lineAmount(q, q.lines[0], "supply"), Math.round(30000 / 1.18));
});
test("missing or unavailable designs cannot fall back to material prices", () => {
  assert.throws(() => priceQuotationDesigns({ ...KRT_QUOTATION, lines: [line] }, offers), /link the exact website design/);
  assert.throws(() => priceQuotationDesigns({ ...KRT_QUOTATION, lines: [{ ...line, productHandle: "gone" }] }, offers), /available website/);
});
test("refresh uses the new catalogue rate and website minimum area", () => {
  const q = priceQuotationDesigns({ ...KRT_QUOTATION, lines: [{ ...line, sqft: 6, widthMm: 609.6, heightMm: 914.4, productHandle: "calm-test" }] }, offers);
  assert.equal(quotationTotals(q).supply.total, 6000);
  const refreshed = priceQuotationDesigns(q, [{ ...offers[0], rateInclGst: 400 }]);
  assert.equal(quotationTotals(refreshed).supply.total, 8000);
});
test("outdoor and explicitly commissioned work retain their separate rules", () => {
  const q = priceQuotationDesigns({ ...KRT_QUOTATION, lines: [{ ...line, commissioned: true, bespokeName: "Potential" }, { ...line, seq: 2, material: "outdoor-wall-film" }] }, []);
  assert.equal(quotationTotals(q).supply.total, 70800);
});

test("new bespoke terms and local paper installation do not change legacy quotations", () => {
  const q = priceQuotationDesigns({ ...KRT_QUOTATION, pricingPolicy: "website-bespoke-20261013", installationLocal: true,
    lines: [{ ...line, commissioned: true, bespokeName: "Potential" }, { ...line, seq: 2, commissioned: true, bespokeName: "Open Horizons", material: "outdoor-wall-film" }] }, []);
  assert.deepEqual(q.rates.map((r) => [r.supplyExGst, r.installExGst]), [[250, 35], [350, null]]);
  assert.equal(quotationTotals(q).install?.subtotal, 3500);
  assert.match(quotationTotals(q).supply.lines[0].title!, /Bespoke – Potential/);
  assert.ok(termsFor(q, "supply").some((s) => s.includes("boarding and lodging")));
  assert.ok(termsFor(q, "install").some((s) => s.includes("Scaffolding")));
  assert.ok(!termsFor(KRT_QUOTATION, "supply").some((s) => s.includes("boarding and lodging")));
});
