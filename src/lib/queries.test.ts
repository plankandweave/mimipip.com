import { test } from "node:test";
import assert from "node:assert/strict";
import { pickFlatImage, sortImages } from "./queries";
import type { ProductImage } from "./types";

const img = (over: Partial<ProductImage>): ProductImage => ({
  url: "x.jpg",
  alt: null,
  position: 0,
  is_featured: false,
  is_flat: false,
  ...over,
});

// 14 September 2026: twenty-four designs were seeded with the flat as their
// only image and `is_featured = true`; once a render was added, the old
// featured-first sort still led with the swatch. The flat is last, full stop.
test("a featured flat never leads — the render does", () => {
  const flat = img({ url: "flat.jpg", is_flat: true, is_featured: true, position: 0 });
  const render = img({ url: "after-bedroom.jpg", position: 1, scene_key: "bedroom" });
  assert.deepEqual(sortImages([flat, render]).map((i) => i.url), ["after-bedroom.jpg", "flat.jpg"]);
});

test("among renders, featured first then by position; the flat still last", () => {
  const flat = img({ url: "flat.jpg", is_flat: true, position: 0 });
  const a = img({ url: "a.jpg", position: 2 });
  const b = img({ url: "b.jpg", position: 3, is_featured: true });
  const c = img({ url: "c.jpg", position: 1 });
  assert.deepEqual(sortImages([flat, a, b, c]).map((i) => i.url), ["b.jpg", "c.jpg", "a.jpg", "flat.jpg"]);
});

test("the flat picker is unaffected: it asks for the flat by name", () => {
  const flat = img({ url: "flat.jpg", is_flat: true, position: 5 });
  const render = img({ url: "r.jpg", is_featured: true });
  assert.equal(pickFlatImage([render, flat])?.url, "flat.jpg");
  // A design with no flat at all falls back to its first picture.
  assert.equal(pickFlatImage([render])?.url, "r.jpg");
});
