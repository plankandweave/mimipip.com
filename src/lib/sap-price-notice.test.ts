import { test } from "node:test";
import assert from "node:assert/strict";
import { isOffStandardRate, sapNoticeEmail, STANDARD_LIST_RATE } from "@/lib/sap-price-notice-email";

// Roheena, 30 September 2026: "If the price is 200, no emails need to go.
// If the price isn't 200, then it needs to go."

test("the standard ₹200 rate sends nothing", () => {
  assert.equal(STANDARD_LIST_RATE, 200);
  assert.equal(isOffStandardRate(200), false);
  assert.equal(isOffStandardRate(200.001), false);
});

test("any other rate, above or below, is announced", () => {
  assert.equal(isOffStandardRate(350), true);
  assert.equal(isOffStandardRate(180), true);
  assert.equal(isOffStandardRate(200.5), true);
  assert.equal(isOffStandardRate(Number.NaN), false);
});

test("the email says the rate is not 200 and asks for SAP", () => {
  const { subject, html } = sapNoticeEmail({
    account: { id: "a", name: "HomeLane", slug: "homelane" },
    designer: "designer@homelane.com",
    design: { handle: "gilded-<crane>", title: "Gilded <Crane>", tier: "autograph" },
    material: { slug: "soft-matte", name: "Soft Matte", listPricePerSqft: 450 },
    customer: "HL-1 · Asha",
  });
  assert.match(subject, /₹450\/sq ft — not ₹200/);
  assert.match(html, /not the standard ₹200/);
  assert.match(html, /add it to your SAP/i);
  assert.match(html, /Autograph \(exclusive\)/);
  assert.doesNotMatch(html, /<Crane>/, "design names are escaped");
});
