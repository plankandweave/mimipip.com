import { test } from "node:test";
import assert from "node:assert/strict";
import { customerCode, parseQuotationNumber, partLabel, partName, partReference, quotationLabel, quotationNumber } from "./numbering";

test("customer codes read the way the customer would say them", () => {
  assert.equal(customerCode("Knowledge Realty Trust"), "KRT");
  assert.equal(customerCode("LTIMindtree Limited"), "LTM");
  assert.equal(customerCode("Vijay Sales India Private Limited"), "VSL");
  assert.equal(customerCode("Homevista Decor and Furnishings Private Limited"), "HDF");
  assert.equal(customerCode("Shades"), "SHD");
  assert.equal(customerCode("Moco Design Studio"), "MDS");
  assert.match(customerCode("A"), /^[A-Z]{3}$/);
});

test("the ZYV/Q reference and its revision label", () => {
  assert.equal(quotationNumber("KRT", 1, "2026-27"), "ZYV/Q/2026-27/KRT-01");
  assert.equal(quotationLabel("ZYV/Q/2026-27/KRT-01", 1), "ZYV/Q/2026-27/KRT-01 · Rev. 1");
  assert.deepEqual(parseQuotationNumber("ZYV/Q/2026-27/KRT-01"), { fy: "2026-27", code: "KRT", serial: 1 });
  assert.equal(parseQuotationNumber("ZYV/2026-27/0001"), null);
});

test("each of the two documents carries the number with its own suffix, and the row keeps the bare number", () => {
  assert.equal(partReference("ZYV/Q/2026-27/KRT-01", "supply"), "ZYV/Q/2026-27/KRT-01-S");
  assert.equal(partReference("ZYV/Q/2026-27/KRT-01", "install"), "ZYV/Q/2026-27/KRT-01-I");
  assert.equal(partLabel("ZYV/Q/2026-27/KRT-01", 2, "install"), "ZYV/Q/2026-27/KRT-01-I · Rev. 2");
  assert.equal(partName("supply"), "Supply quotation");
  assert.equal(partName("install"), "Installation quotation");
  // The suffix is a render-time label; the stored number still parses.
  assert.equal(parseQuotationNumber("ZYV/Q/2026-27/KRT-01-S"), null);
});
