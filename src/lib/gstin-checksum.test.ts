import { test } from "node:test";
import assert from "node:assert/strict";
import { gstinChecksumOk } from "./gst";

// Checkout checks a GSTIN's check digit the moment it is typed. Pinned on the
// two group companies' real GSTINs (src/lib/quotation/issuers.ts), and on a
// one-character slip of each, which must be caught.
test("real GSTINs pass the check digit", () => {
  assert.equal(gstinChecksumOk("27AATCM2315A1ZP"), true); // Magnitude Brands
  assert.equal(gstinChecksumOk("27AAKCA7438B1ZQ"), true); // Magnitude Spaces
  assert.equal(gstinChecksumOk("27aatcm2315a1zp"), true);
});

test("a one-character slip fails", () => {
  assert.equal(gstinChecksumOk("27AATCM2315A1ZQ"), false);
  assert.equal(gstinChecksumOk("27AATCM2315B1ZP"), false);
  assert.equal(gstinChecksumOk("27AAKCA7438B1Z"), false);
  assert.equal(gstinChecksumOk(""), false);
});
