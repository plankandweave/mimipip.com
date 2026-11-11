// A phone number here resolves an ACCOUNT — corporate_members.phone is the
// bridge between a handset Supabase Auth has proved and the portal it opens
// (migration 0156). So these are not formatting preferences; a parse that
// silently mangles a number is a person who cannot sign in, and a parse that
// accepts too much is a lookup against a number nobody owns.
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMobile, toE164, toIndianMobile } from "./phone";

test("accepts the shapes a person actually types", () => {
  for (const raw of [
    "9876543210",
    "+91 98765 43210",
    "+919876543210",
    "91 9876543210",
    "098765 43210",
    "0091 98765 43210",
    " 98765-43210 ",
  ]) {
    assert.equal(toIndianMobile(raw), "9876543210", `failed on ${raw}`);
  }
});

// The bug this module was written to avoid, and which it has since replaced in
// the storefront: a helper that stripped a leading "91" no matter how long the
// string was. Indian mobiles begin 6–9, so a number starting 91 is perfectly
// ordinary — that helper truncated it to eight digits and then rejected it as
// invalid, and a whole series of real customers could not sign in by phone.
test("a number in the 91 series survives, and is not mistaken for a +91 prefix", () => {
  assert.equal(toIndianMobile("9198765432"), "9198765432");
  assert.equal(toIndianMobile("+919198765432"), "9198765432");
});

test("rejects what is not an Indian mobile", () => {
  for (const raw of [
    "",
    null,
    undefined,
    "12345",              // too short
    "98765432101",        // too long
    "1234567890",         // landline-style, does not begin 6–9
    "5876543210",         // begins 5
    "abcdefghij",
  ]) {
    assert.equal(toIndianMobile(raw), "", `should have rejected ${String(raw)}`);
  }
});

test("E.164 is what Supabase Auth is handed", () => {
  assert.equal(toE164(toIndianMobile("98765 43210")), "+919876543210");
});

test("a number is shown back the way it was read", () => {
  assert.equal(formatMobile("+919876543210"), "98765 43210");
  // Unparseable input is echoed rather than blanked: a field that silently
  // empties itself is worse than one showing what you typed.
  assert.equal(formatMobile("nonsense"), "nonsense");
});
