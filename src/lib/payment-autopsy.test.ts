import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyGatewayPayments } from "./payment-autopsy";

// Order #89, 9 October 2026: Abigail Chandonnet (Canada) placed a USD 613
// (₹30,439) order, opened the payment window twice and closed it within
// seven seconds both times. The gateway order sat 'created' with zero
// payment attempts — the shape of a window that offered her nothing she
// could pay with. This classification is what finally told somebody.
test("a window opened and never attempted reads as no_attempts (order #89)", () => {
  const out = classifyGatewayPayments(
    "order_Tm2Grjg8KG6Kub",
    { id: "order_Tm2Grjg8KG6Kub", status: "created", amount: 61300, amount_paid: 0, currency: "USD", attempts: 0 },
    [],
  );
  assert.deepEqual(out, { kind: "no_attempts" });
});

test("a failed attempt carries the gateway's own reason", () => {
  const out = classifyGatewayPayments(
    "order_X",
    { id: "order_X", status: "attempted", amount: 61300, amount_paid: 0, currency: "USD", attempts: 2 },
    [
      { id: "pay_1", order_id: "order_X", status: "failed", amount: 61300, currency: "USD", method: "card", error_code: "BAD_REQUEST_ERROR", error_description: "International cards are not supported for this merchant", error_source: "business", error_step: "payment_initiation", error_reason: "international_transaction_not_allowed", created_at: 100 },
      { id: "pay_2", order_id: "order_X", status: "failed", amount: 61300, currency: "USD", method: "card", error_code: "BAD_REQUEST_ERROR", error_description: "Payment failed", created_at: 50 },
      { id: "pay_other", order_id: "order_Y", status: "failed", amount: 999, currency: "INR" },
    ],
  );
  assert.equal(out.kind, "failed");
  if (out.kind !== "failed") return;
  // Two attempts on THIS order; the other order's payment is not ours.
  assert.equal(out.attempts, 2);
  // The newest attempt's story, Razorpay's words, is the detail a human reads.
  assert.match(out.detail, /International cards are not supported/);
  assert.match(out.detail, /international_transaction_not_allowed/);
  assert.deepEqual(out.methods, ["card"]);
});

test("a captured payment the site never heard about reads as captured", () => {
  const out = classifyGatewayPayments(
    "order_X",
    { id: "order_X", status: "paid", amount: 3043900, amount_paid: 3043900, currency: "INR" },
    [{ id: "pay_ok", order_id: "order_X", status: "captured", amount: 3043900, currency: "INR" }],
  );
  assert.deepEqual(out, { kind: "captured", paymentId: "pay_ok" });
});

test("captured is believed only when amount and currency match the order", () => {
  const short = classifyGatewayPayments(
    "order_X",
    { id: "order_X", status: "paid", amount: 3043900, amount_paid: 3043900, currency: "INR" },
    [{ id: "pay_bad", order_id: "order_X", status: "captured", amount: 100, currency: "INR" }],
  );
  assert.notEqual(short.kind, "captured");
  const partial = classifyGatewayPayments(
    "order_X",
    { id: "order_X", status: "attempted", amount: 3043900, amount_paid: 100, currency: "INR" },
    [{ id: "pay_bad", order_id: "order_X", status: "captured", amount: 3043900, currency: "INR" }],
  );
  assert.notEqual(partial.kind, "captured");
});

test("authorized-but-uncaptured is surfaced as its own emergency", () => {
  const out = classifyGatewayPayments(
    "order_X",
    { id: "order_X", status: "attempted", amount: 61300, amount_paid: 0, currency: "USD" },
    [{ id: "pay_auth", order_id: "order_X", status: "authorized", amount: 61300, currency: "USD" }],
  );
  assert.equal(out.kind, "authorized");
  if (out.kind === "authorized") {
    assert.equal(out.paymentId, "pay_auth");
    assert.match(out.detail, /never captured/);
  }
});
