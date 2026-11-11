import assert from "node:assert/strict";
import { test } from "node:test";
import { checkShipTo } from "./corporate-ship-to";

test("a blank destination is refused — never assumed from the state", () => {
  const r = checkShipTo({ address: null, city: "Kazipur Dariyapur, Ahmedabad, Gujarat", pincode: null });
  assert.equal(r.ok, false);
});

test("an address without a real PIN is refused", () => {
  assert.equal(checkShipTo({ address: "Vijay Sales, Virar West", pincode: "" }).ok, false);
  assert.equal(checkShipTo({ address: "Vijay Sales, Virar West", pincode: "01234" }).ok, false);
});

test("a full destination passes, PIN whitespace tolerated", () => {
  const r = checkShipTo({ address: "Shahibaug Rd., Ahmedabad", city: "Ahmedabad", pincode: "380 004" });
  assert.deepEqual(r, { ok: true, value: { address: "Shahibaug Rd., Ahmedabad", city: "Ahmedabad", pincode: "380004" } });
});
