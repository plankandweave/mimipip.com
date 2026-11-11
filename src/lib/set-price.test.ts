// A set price, pinned.
//
// A limited edition's price is a decision, not a calculation, but it is STORED
// as a per-sq-ft rate so that every surface in the store keeps pricing through
// one number. That only holds if the round trip is exact: the rate we store,
// put back through the same fixedSizePrice() the product page, the cart, the
// checkout and the Merchant feed all use, must give back the figure that was
// set — to the rupee. If these fail, a piece is quoting a price nobody chose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setPriceRate, fixedSizePrice, CM_PER_INCH } from "./pricing";

const quoted = (rate: number, wIn: number, hIn: number) =>
  fixedSizePrice(wIn * CM_PER_INCH, hIn * CM_PER_INCH, rate);

test("the two live limited editions quote exactly what was set", () => {
  // Kaalchakra: 72 × 36 in, ₹31,000. The rate is 1722.22…, which does NOT
  // divide evenly — this is the case a naive implementation gets wrong.
  const kaal = setPriceRate(31000, 72, 36);
  assert.ok(kaal, "₹31,000 at 72×36 must be quotable");
  assert.equal(quoted(kaal, 72, 36), 31000);

  // The fish: 48 × 48 in, ₹21,000.
  const fish = setPriceRate(21000, 48, 48);
  assert.ok(fish, "₹21,000 at 48×48 must be quotable");
  assert.equal(quoted(fish, 48, 48), 21000);
});

// The rate must survive the numeric(10,2) column it is written to. The ₹1,000
// retail step is forgiving enough that a coarser rate would usually still land
// on the same figure, so this is a contract about what we STORE, not the thing
// that makes the round trip work — that is the refusal test below.
test("a rate is only returned when it stores at 2dp and still quotes the set price", () => {
  for (const [price, w, h] of [
    [31000, 72, 36], [21000, 48, 48], [16000, 48, 48], [45000, 48, 72], [8000, 24, 36],
  ] as [number, number, number][]) {
    const rate = setPriceRate(price, w, h);
    assert.ok(rate, `₹${price} at ${w}×${h} must be quotable`);
    // What the numeric(10,2) column can hold — no third decimal may sneak in.
    assert.equal(rate, Math.round(rate * 100) / 100, "rate must survive numeric(10,2)");
    assert.equal(quoted(rate, w, h), price, `₹${price} at ${w}×${h} must come back exact`);
  }
});

test("a figure the store cannot quote is refused, never silently moved", () => {
  // ₹31,500 is not a clean retail figure: fixed-size prices land on the
  // nearest ₹1,000. Rounding it to ₹32,000 behind Roheena's back would show a
  // price she did not set, so it must come back null and be reported.
  assert.equal(setPriceRate(31500, 72, 36), null);
  assert.equal(setPriceRate(0, 72, 36), null);
  assert.equal(setPriceRate(-31000, 72, 36), null);
  assert.equal(setPriceRate(31000, 0, 36), null);
  assert.equal(setPriceRate(Number.NaN, 72, 36), null);
});

test("quantity of a set-price piece is a multiple of the set price", () => {
  const rate = setPriceRate(31000, 72, 36)!;
  assert.equal(fixedSizePrice(72 * CM_PER_INCH, 36 * CM_PER_INCH, rate, 2), 62000);
});
