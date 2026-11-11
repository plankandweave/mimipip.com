import assert from "node:assert/strict";
import test from "node:test";
import { shippingLineFor } from "./shipping";

test("the order copy drawn at payment labels its delivery line from what the order stored", () => {
  assert.equal(shippingLineFor(0, "express", 1), null, "free delivery prints no line");
  assert.deepEqual(shippingLineFor(1500, "express", 1), { label: "Express delivery", amount: 1500 });
  assert.deepEqual(shippingLineFor(2500, "express", 1), { label: "Courier (small order) + Express delivery", amount: 2500 });
  assert.deepEqual(shippingLineFor(1000, "standard", 1), { label: "Courier (small order)", amount: 1000 });
});
