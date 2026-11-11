// Delhivery needs a mobile it can ring (founder, 14 October 2026). The portal
// asks for it where the parcel's address is given, for every account except
// Vijay Sales, whose parcels all go to the one receiver the OS already knows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { receiverMobile } from "./receiver-mobile";

test("keeps a valid mobile as ten digits, however it was typed", () => {
  for (const typed of ["9000000002", "+91 90000 00002", "09000000002", "90000-00002"]) {
    assert.deepEqual(receiverMobile("homelane", typed), { ok: true, value: "9000000002" }, typed);
  }
});

test("a partner other than Vijay Sales cannot leave it blank", () => {
  for (const blank of ["", "   ", null, undefined]) {
    const out = receiverMobile("homelane", blank);
    assert.equal(out.ok, false);
    if (!out.ok) assert.match(out.error, /mobile number of the person who will receive/);
  }
});

test("Vijay Sales may leave it blank — the OS carries the receiver's mobile", () => {
  assert.deepEqual(receiverMobile("vijay-sales", ""), { ok: true, value: null });
  assert.deepEqual(receiverMobile("vijay-sales", "9000000002"), { ok: true, value: "9000000002" });
});

test("a landline or a short number is refused for everyone, Vijay Sales included", () => {
  for (const slug of ["homelane", "vijay-sales"]) {
    for (const typed of ["022 6171 1919", "98765432", "1234567890", "not a number"]) {
      const out = receiverMobile(slug, typed);
      assert.equal(out.ok, false, `${slug}: ${typed}`);
      if (!out.ok) assert.match(out.error, /isn't a mobile number/);
    }
  }
});
