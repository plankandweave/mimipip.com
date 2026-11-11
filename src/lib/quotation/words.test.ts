import { test } from "node:test";
import assert from "node:assert/strict";
import { formatInr, formatRate, numberInIndianWords, rupeesInWords } from "./words";

test("the KRT total in words, exactly as the quotation printed it", () => {
  assert.equal(
    rupeesInWords(14_23_160),
    "Rupees Fourteen Lakh Twenty-Three Thousand One Hundred and Sixty only.",
  );
});

test("lakhs and crores, not millions", () => {
  assert.equal(numberInIndianWords(1_00_000), "One Lakh");
  assert.equal(numberInIndianWords(12_06_068), "Twelve Lakh Six Thousand and Sixty-Eight");
  assert.equal(numberInIndianWords(2_50_00_000), "Two Crore Fifty Lakh");
  assert.equal(numberInIndianWords(1_00_00_00_000), "One Hundred Crore");
  assert.equal(numberInIndianWords(0), "Zero");
  assert.equal(numberInIndianWords(105), "One Hundred and Five");
  assert.equal(numberInIndianWords(1_001), "One Thousand and One");
});

test("Indian digit grouping, and a backed-out rate keeps its paise", () => {
  assert.equal(formatInr(14_23_160), "₹14,23,160");
  assert.equal(formatRate(350), "₹350");
  assert.equal(formatRate(169.49), "₹169.49");
  assert.equal(formatRate(254.24), "₹254.24");
});
