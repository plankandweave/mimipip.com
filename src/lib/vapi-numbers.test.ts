import { test } from "node:test";
import assert from "node:assert/strict";
import { describeVapiNumbers } from "./vapi-numbers";

test("no numbers says one must be bought or imported", () => {
  assert.match(describeVapiNumbers([]), /owns no phone number yet/);
});

test("a number names its id so the secret can be set", () => {
  const s = describeVapiNumbers([{ id: "pn_1", number: "+918000000000", provider: "vapi", status: "active" }]);
  assert.match(s, /owns one number: \+918000000000 \(vapi, active\), id pn_1/);
  assert.match(s, /set VAPI_PHONE_NUMBER_ID/);
});

test("a malformed reply is not mistaken for an empty account", () => {
  assert.equal(describeVapiNumbers({ error: "x" }), "Vapi did not return a phone-number list");
});
