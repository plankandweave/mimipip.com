import { test } from "node:test";
import assert from "node:assert/strict";
import { MBPL_UPI_ID, upiLink } from "./mbpl-payment";
import { isPayLinkShape } from "./pay-document";

test("the UPI link opens our account with the amount and the document as the note", () => {
  const u = upiLink({ ref: "ZYV/2026-27/0123", amount: 4720 });
  assert.ok(u.startsWith("upi://pay?"));
  assert.ok(u.includes(`pa=${encodeURIComponent(MBPL_UPI_ID)}`));
  assert.ok(u.includes("am=4720.00"));
  assert.ok(u.includes("tn=ZYV%2F2026-27%2F0123"));
});

test("with no amount the customer types it", () => {
  assert.ok(!upiLink({ ref: null, amount: null }).includes("am="));
});

test("only a link of the shape the OS prints is ever looked up", () => {
  assert.equal(isPayLinkShape("42", "0123456789abcdef0123456789abcdef"), true);
  assert.equal(isPayLinkShape("0", "0123456789abcdef0123456789abcdef"), false);
  assert.equal(isPayLinkShape("42", "short"), false);
  assert.equal(isPayLinkShape("42/../x", "0123456789abcdef0123456789abcdef"), false);
  assert.equal(isPayLinkShape("42", "0123456789ABCDEF0123456789ABCDEF"), false);
});
