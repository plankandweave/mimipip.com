import assert from "node:assert/strict";
import { test } from "node:test";
import { taxHeads } from "./gst";

test("a partner order into another state previews IGST, not GST", () => {
  // Vijay Sales, Telangana: 116.4 sq ft × ₹90 = ₹10,472.21, GST ₹1,885.
  assert.deepEqual(taxHeads(1885, 18, "Telangana"), [{ label: "IGST 18%", amount: 1885 }]);
});

test("an order into Maharashtra splits CGST and SGST to the paisa", () => {
  const heads = taxHeads(1884.99, 18, "Maharashtra");
  assert.deepEqual(heads.map(h => h.label), ["CGST 9%", "SGST 9%"]);
  assert.equal(heads[0].amount, 942.5);
  assert.equal(Math.round((heads[0].amount + heads[1].amount) * 100), 188499);
});

test("no state chosen yet says plain GST", () => {
  assert.deepEqual(taxHeads(100, 18, null), [{ label: "GST 18%", amount: 100 }]);
  assert.deepEqual(taxHeads(100, 18, ""), [{ label: "GST 18%", amount: 100 }]);
});
