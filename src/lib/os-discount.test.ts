// The discount rule, in the only place it can be read at a glance: a discount
// exists because we owe money back, because we got something wrong, or because
// the customer scanned the QR on their install insert. Nothing else discounts
// an order, and the insert code is retail-only — a dealer already buys at
// contract price, so a referral on top is the same money twice.
//
// discountRefusalFor is the buyer-dependent half. validateOsDiscount is the
// half that talks to the OS and is exercised by its callers; what is worth
// pinning here is that a "valid" answer with no stated reason, or with a
// reason someone invented, still buys nobody anything.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_REASONS, discountRefusalFor, type DiscountCheck } from "./os-discount";

const RETAIL = { isTradeAccount: false };
const DEALER = { isTradeAccount: true };

const referral: DiscountCheck = { valid: true, pct: 15, issuedFor: "install_insert_referral" };
const creditNote: DiscountCheck = { valid: true, pct: 20, issuedFor: "credit_note" };
const errorFix: DiscountCheck = { valid: true, pct: 10, issuedFor: "error_correction" };

test("a retail customer's install-insert code applies", () => {
  assert.equal(discountRefusalFor(referral, RETAIL), null);
});

test("the same code is refused for a dealer — contract price is their discount", () => {
  assert.equal(discountRefusalFor(referral, DEALER), "trade_account");
});

test("what we owe back is owed to dealers too", () => {
  assert.equal(discountRefusalFor(creditNote, DEALER), null);
  assert.equal(discountRefusalFor(errorFix, DEALER), null);
});

test("a refusal from the OS survives the buyer check unchanged", () => {
  for (const reason of ["unknown_code", "already_redeemed", "expired", "not_allowed"] as const) {
    assert.equal(discountRefusalFor({ valid: false, reason }, RETAIL), reason);
  }
});

test("a discount with a reason we do not recognise is refused", () => {
  // What an invented code looks like by the time it reaches here: the OS
  // either never heard of it, or heard of it and could not say why it exists.
  const invented = { valid: true, pct: 25, issuedFor: "black_friday" } as unknown as DiscountCheck;
  assert.equal(discountRefusalFor(invented, RETAIL), null, "buyer check alone does not catch it");
  // …which is why validateOsDiscount refuses it before this point: only a
  // reason in ALLOWED_REASONS ever produces a { valid: true } DiscountCheck.
  // Guard that the allowlist is the three reasons and nothing has crept in.
  assert.deepEqual([...ALLOWED_REASONS].sort(), [
    "credit_note",
    "error_correction",
    "install_insert_referral",
  ]);
});
