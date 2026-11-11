import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAnswer, pincodeAgreesWithState } from "./pincode-resolver";

test("the two-line answer is parsed and the locality kept", () => {
  assert.deepEqual(parseAnswer("PINCODE: 411039\nLOCALITY: Bhosari", "Maharashtra"), { pincode: "411039", locality: "Bhosari" });
});

test("NONE, chatter, or a PIN that contradicts the state gives no answer", () => {
  assert.equal(parseAnswer("PINCODE: NONE\nLOCALITY: NONE", "Maharashtra"), null);
  assert.equal(parseAnswer("I think it is around 411039 somewhere", "Maharashtra"), null);
  // An Ahmedabad PIN offered for a Maharashtra store — the postal circle disagrees.
  assert.equal(parseAnswer("PINCODE: 380004\nLOCALITY: Shahibaug", "Maharashtra"), null);
  assert.equal(pincodeAgreesWithState("380004", "Gujarat"), true);
  assert.equal(pincodeAgreesWithState("380004", "Unknown State"), true);
});
