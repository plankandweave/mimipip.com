import assert from "node:assert/strict";
import test from "node:test";
import { draftNumber } from "@/lib/number-draft";

test("a half-typed size means the number typed so far", () => {
  assert.equal(draftNumber(""), 0);
  assert.equal(draftNumber("1"), 1);
  assert.equal(draftNumber("10."), 10);
  assert.equal(draftNumber("10.5"), 10.5);
  assert.equal(draftNumber("3048"), 3048);
  assert.equal(draftNumber("."), 0);
  assert.equal(draftNumber("abc"), 0);
});

test("a comma from a phone keypad is a decimal point", () => {
  assert.equal(draftNumber("10,5"), 10.5);
});
