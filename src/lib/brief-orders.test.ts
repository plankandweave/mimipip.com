import test from "node:test";
import assert from "node:assert/strict";
import { briefOrders } from "./brief-orders";

test("owner sample cannot inflate retail conversion or customer cash", () => {
  const result = briefOrders([
    { payment_status: "paid", email: " Roheena@PlankAndWeave.com ", placed_via: "sample", total: 200 },
    { payment_status: "paid", email: "buyer@plankandweave.com", placed_via: "sample", total: 200 },
    { payment_status: "paid", email: "buyer@example.com", placed_via: "web", total: 16000 },
    { payment_status: "paid", email: null, total: 10000 },
    { payment_status: "pending", email: "other@example.com", total: 20000 },
  ]);
  assert.equal(result.owner.length, 1);
  assert.equal(result.unidentified.length, 1);
  assert.equal(result.samples.length, 1);
  assert.equal(result.retail.length, 1);
  assert.equal(result.customerRevenue, 16200);
  assert.equal(result.retailRevenue, 16000);
});

test("only owner validations means zero customer sales", () => {
  const result = briefOrders([{ payment_status: "paid", email: "roheena@zyvorah.com", total: 200 }]);
  assert.equal(result.customer.length, 0);
  assert.equal(result.customerRevenue, 0);
  assert.equal(result.retail.length, 0);
});
