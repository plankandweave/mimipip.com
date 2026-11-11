// The materials page says "Linen Textured — from ₹X / sq ft", and X is a
// MINIMUM over every live design that offers the finish. On 7 October 2026 the
// page said ₹230 while 36 live designs (Ahimsa, Piano Walls) sold Linen
// Textured at ₹200: the read behind it saw an arbitrary 1,000 of the
// catalogue's 1,271 (design, finish) rows, because Supabase caps an unpaged
// response there, and a minimum over a sample is not a minimum. The reader
// now pages the whole table; this file pins the reduction it feeds — that the
// answer is the lowest rate wherever that row falls, and that the rules the
// comments in `reduceMaterialOffers` describe still hold.
import { test } from "node:test";
import assert from "node:assert/strict";
import { reduceMaterialOffers } from "./queries";

type Row = Parameters<typeof reduceMaterialOffers>[0][number];

const linen = { slug: "linen-touch", name: "Linen Textured", coming_soon: false };
const matte = { slug: "smooth-matt", name: "Soft Matte", coming_soon: false };
const wallpaper = (price_tier = "standard") => ({ category: "wallpaper", ready_sizes: null, price_tier });

const row = (materials: Row["materials"], rate: number, products: Row["products"] = wallpaper()): Row => ({
  price_per_sqft: rate,
  materials,
  products,
});

test("the from-price is the lowest rate across EVERY row, wherever it falls", () => {
  // 1,270 designs at ₹300 and ₹230, then one at ₹200 as the very last row —
  // the row a 1,000-row cap would have dropped.
  const rows: Row[] = [];
  for (let i = 0; i < 1270; i++) rows.push(row(linen, i % 2 ? 300 : 230));
  rows.push(row(linen, 200));
  const [offer] = reduceMaterialOffers(rows);
  assert.equal(offer.slug, "linen-touch");
  assert.equal(offer.pricePerSqft, 200);
});

test("the rate is read off the row as a string too (PostgREST numerics)", () => {
  const [offer] = reduceMaterialOffers([
    { ...row(linen, 0), price_per_sqft: "230.00" },
    { ...row(linen, 0), price_per_sqft: "200.00" },
  ]);
  assert.equal(offer.pricePerSqft, 200);
});

test("wallpaper finishes come first, cheapest first", () => {
  const offers = reduceMaterialOffers([row(linen, 230), row(matte, 200), row(linen, 300)]);
  assert.deepEqual(offers.map((o) => [o.slug, o.pricePerSqft]), [["smooth-matt", 200], ["linen-touch", 230]]);
});

test("a coming_soon finish is priced only from the tier that can buy it", () => {
  const soon = { ...linen, coming_soon: true };
  const [offer] = reduceMaterialOffers([
    row(soon, 230),                       // standard tier: nobody can pay this rate
    row(soon, 400, wallpaper("autograph")),
  ]);
  assert.equal(offer.pricePerSqft, 400);
  assert.equal(offer.restricted, true);
  assert.equal(offer.autographRate, 400);
});

test("the Autograph rate is tracked beside the catalogue-wide rate, never instead of it", () => {
  const [offer] = reduceMaterialOffers([row(linen, 400, wallpaper("autograph")), row(linen, 230)]);
  assert.equal(offer.pricePerSqft, 230);
  assert.equal(offer.autographRate, 400);
  assert.equal(offer.restricted, false);
});

test("borders and zero rates are not finishes", () => {
  const border = { slug: "border", name: "Border", coming_soon: false };
  assert.deepEqual(reduceMaterialOffers([row(border, 150), row(linen, 0), row(linen, -1)]), []);
});
