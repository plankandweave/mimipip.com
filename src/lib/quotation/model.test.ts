import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryWorkingDays, lineAmount, lineSize, partsOf, quotationProblems, quotationTotals, termsFor } from "./model";
import { KRT_QUOTATION } from "./krt-fixture";
import { exGst, inclGst, installRateExGst } from "./rates";
import { MATERIAL_SPECS, fill, materialSpec } from "./material-specs";

test("the KRT quotation adds up to the rupee, as sent", () => {
  const t = quotationTotals(KRT_QUOTATION);
  assert.deepEqual(t.byMaterial, [
    { material: "outdoor-wall-film", sqft: 2392 },
    { material: "non-woven", sqft: 1102 },
  ]);
  assert.equal(t.totalSqft, 3494);
  assert.deepEqual(t.pricing.map((p) => [p.kind, p.material, p.amount]), [
    ["supply", "outdoor-wall-film", 8_37_200],
    ["supply", "non-woven", 1_86_778],
    ["install", "outdoor-wall-film", 1_43_520],
    ["install", "non-woven", 38_570],
  ]);
  // Two companies, two invoices: supply by Magnitude Brands, installation by
  // Magnitude Spaces (Roheena, 6 October 2026), each with its own GST.
  assert.equal(t.supply.issuer.legalName, "Magnitude Brands Private Limited");
  assert.equal(t.supply.issuer.gstin, "27AATCM2315A1ZP");
  assert.deepEqual([t.supply.subtotal, t.supply.gst, t.supply.total], [10_23_978, 1_84_316, 12_08_294]);
  assert.equal(t.install?.issuer.legalName, "Magnitude Spaces Private Limited");
  assert.equal(t.install?.issuer.gstin, "27AAKCA7438B1ZQ");
  assert.deepEqual([t.install?.subtotal, t.install?.gst, t.install?.total], [1_82_090, 32_776, 2_14_866]);
  assert.equal(t.subtotal, 12_06_068);
  assert.equal(t.gst, 2_17_092);
  assert.equal(t.total, 14_23_160);
  assert.equal(t.totalInWords, "Rupees Fourteen Lakh Twenty-Three Thousand One Hundred and Sixty only.");
  assert.deepEqual(quotationProblems(KRT_QUOTATION), []);
});

test("one quotation, two documents: each carries its own short scope and payment terms; supply states the delivery time", () => {
  assert.deepEqual(partsOf(KRT_QUOTATION), ["supply", "install"]);
  const supply = termsFor(KRT_QUOTATION, "supply");
  const install = termsFor(KRT_QUOTATION, "install");
  // Roheena, 6 October 2026: supply half with the order and half before
  // dispatch; installation half before it begins and half on completion.
  assert.match(supply.join(" "), /50% advance with the purchase order, and the balance 50% before dispatch/);
  assert.ok(!/installation begins/.test(supply.join(" ")), "the supply document does not carry the installation schedule");
  assert.match(install.join(" "), /50% before installation begins, and the balance 50% on completion/);
  assert.ok(!/before dispatch/.test(install.join(" ")), "the installation document does not carry the supply schedule");
  // The measurements are done: no re-measurement clause on either document.
  assert.ok(![...supply, ...install].some((t) => /measurement/i.test(t)));
  // 3,494 sq ft at 800 a day is 5 days of work; plus a fifth, 6 working days.
  assert.ok(supply.includes("Delivery: 6 working days from the date of the order."));
  assert.ok(!install.some((t) => /Delivery/.test(t)));
  assert.deepEqual(partsOf({ rates: [{ material: "canvas", supplyExGst: 211.86, installExGst: null }] }), ["supply"]);
});

test("delivery days: the floor's 800 sq ft a day, plus a fifth, rounded up to whole working days", () => {
  assert.equal(deliveryWorkingDays(3_494), 6);
  assert.equal(deliveryWorkingDays(8_000), 12, "10 days of work reads as 12 working days");
  assert.equal(deliveryWorkingDays(1), 2);
  assert.equal(deliveryWorkingDays(800), 2);
  assert.equal(deliveryWorkingDays(801), 3);
});

test("each wall is priced on its own, per document, and sized only when it is one rectangle", () => {
  // Wall 1: 1,448 sq ft of outdoor film — ₹350 supply, ₹60 installation.
  assert.equal(lineAmount(KRT_QUOTATION, KRT_QUOTATION.lines[0], "supply"), 5_06_800);
  assert.equal(lineAmount(KRT_QUOTATION, KRT_QUOTATION.lines[0], "install"), 86_880);
  // Wall 4: 500 sq ft of non-woven at 169.49 → ₹84,745, rounded like every line.
  assert.equal(lineAmount(KRT_QUOTATION, KRT_QUOTATION.lines[3], "supply"), 84_745);
  // The walls add up to the material lines the pricing table shows.
  const t = quotationTotals(KRT_QUOTATION);
  const walls = KRT_QUOTATION.lines.reduce((s, l) => s + (lineAmount(KRT_QUOTATION, l, "supply") ?? 0), 0);
  assert.ok(Math.abs(walls - t.supply.subtotal) <= KRT_QUOTATION.lines.length, "per-wall rounding stays within a rupee a wall");
  // A material we do not fit has no installation amount.
  assert.equal(lineAmount({ rates: [{ material: "canvas", supplyExGst: 211.86, installExGst: null }] }, { material: "canvas", sqft: 40 }, "install"), null);
  assert.equal(lineSize({ widthMm: 9450, heightMm: 3300 }), "9.45 m × 3.3 m");
  assert.equal(lineSize({ widthMm: null, heightMm: 3300 }), null);
  assert.equal(lineSize({}), null);
});

test("a line on a material with no rate, or with no area, is named as a problem", () => {
  const broken = {
    ...KRT_QUOTATION,
    lines: [...KRT_QUOTATION.lines, { seq: 8, location: "Lift lobby", basis: "", material: "canvas", sqft: 0 }],
  };
  const problems = quotationProblems(broken);
  assert.ok(problems.some((p) => p.includes("Line 8") && p.includes("no area")), problems.join("\n"));
  assert.ok(problems.some((p) => p.includes("canvas") && p.includes("no rate")), problems.join("\n"));
  assert.throws(() => quotationTotals(broken), /no rate for material "canvas"/);
});

test("installation is a separate line and never quoted on a material we do not fit", () => {
  const t = quotationTotals({
    lines: [{ seq: 1, location: "Boardroom", basis: "", material: "canvas", sqft: 40 }],
    rates: [{ material: "canvas", supplyExGst: 211.86, installExGst: null }],
    gstRate: 0.18,
  });
  assert.equal(t.pricing.length, 1);
  assert.equal(t.pricing[0].kind, "supply");
  assert.equal(t.install, null, "no installation part when nothing is installed");
});

test("the rate card: catalogue prices are backed out of GST, flat-rate accounts keep their rate, outdoor film is its own", () => {
  assert.equal(exGst(200), 169.49);
  assert.equal(exGst(300), 254.24);
  assert.equal(inclGst(169.49), 200);
  assert.equal(installRateExGst({ outdoor: false, installable: true }), 35);
  assert.equal(installRateExGst({ outdoor: true, installable: true }), null);
  assert.equal(installRateExGst({ outdoor: false, installable: false }), null);
});

test("every material in the library can front a sheet, and the KRT ones say what the KRT sheet said", () => {
  const keys = new Set<string>();
  for (const m of MATERIAL_SPECS) {
    assert.ok(!keys.has(m.key), `duplicate key ${m.key}`);
    keys.add(m.key);
    assert.ok(m.name && m.shortName && m.intro && m.note && m.disclaimer, m.key);
    assert.ok(m.stats.length === 0 || m.stats.length === 3, `${m.key}: three stats or none`);
    assert.equal(m.suits.points.length, 4, `${m.key}: four reasons`);
    assert.ok(m.groups.length >= 1 && m.groups.every((g) => g.rows.length >= 1), m.key);
    for (const line of [m.intro, m.note, m.suits.heading]) {
      assert.ok(!fill(line, "the walls").includes("{for}"));
    }
  }
  for (const line of KRT_QUOTATION.lines) assert.ok(materialSpec(line.material), line.material);
  const film = materialSpec("outdoor-wall-film")!;
  assert.deepEqual(film.stats.map((s) => s.value), ["5 years", "−40 to 60 °C", "0.1 mm"]);
  assert.ok(film.groups.some((g) => g.rows.some((r) => r.v === "28 N/25 mm")));
  assert.match(film.disclaimer, /not a guarantee/);
  assert.equal(fill(film.intro, "the KRT boundary wall").slice(0, 46), "The film we will use for the KRT boundary wall");
});
