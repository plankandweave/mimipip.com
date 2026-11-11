// The preview must equal what checkout_cart_v2 charges, or the customer sees
// one total and pays another.
import { test } from "node:test";
import assert from "node:assert/strict";
import { discountAmount, refusalCopy, waivesCourier, appliedLabel } from "./discount-display";

test("an OS code stays capped at 50%, as it always was", () => {
  assert.equal(discountAmount(10000, { valid: true, pct: 80 }), 5000, "older server: no capPct means 50");
  assert.equal(discountAmount(10000, { valid: true, pct: 80, capPct: 50 }), 5000);
  assert.equal(discountAmount(10000, { valid: true, pct: 15, capPct: 50 }), 1500);
});

test("a collaboration takes the whole wall", () => {
  assert.equal(discountAmount(32480, { valid: true, pct: 100, capPct: 100 }), 32480);
});

test("the rupee ceiling holds", () => {
  assert.equal(discountAmount(40000, { valid: true, pct: 100, capPct: 100, maxValueInr: 25000 }), 25000);
  assert.equal(discountAmount(20000, { valid: true, pct: 100, capPct: 100, maxValueInr: 25000 }), 20000);
});

test("nothing off for a refused code or an empty basket", () => {
  assert.equal(discountAmount(10000, { valid: false, reason: "expired" }), 0);
  assert.equal(discountAmount(0, { valid: true, pct: 100, capPct: 100 }), 0);
  assert.equal(discountAmount(10000, null), 0);
});

test("courier is waived only by a valid code that says so", () => {
  assert.equal(waivesCourier({ valid: true, pct: 100, freeShipping: true }), true);
  assert.equal(waivesCourier({ valid: false, freeShipping: true }), false);
  assert.equal(waivesCourier({ valid: true, pct: 15 }), false);
});

test("a personal code tells the wrong buyer whose it is, masked", () => {
  assert.match(refusalCopy({ valid: false, reason: "wrong_email", personalTo: "p•••a@example.com" }), /p•••a@example\.com/);
  assert.match(refusalCopy({ valid: false, reason: "wrong_design" }), /particular design/);
  assert.equal(refusalCopy({ valid: false, reason: "whatever" }), "That code isn't valid.");
});

test("the applied line names a collaboration and its ceiling, in the page's currency", () => {
  const money = (n: number) => `INR ${n.toLocaleString("en-IN")}`;
  assert.equal(appliedLabel({ valid: true, pct: 100, capPct: 100, issuedFor: "creator_collab", maxValueInr: 25000 }, money), "Collaboration (100% off wallpaper, up to INR 25,000)");
  assert.equal(appliedLabel({ valid: true, pct: 15, capPct: 50, issuedFor: "install_insert_referral" }, money), "Discount (15% off wallpaper)");
});
