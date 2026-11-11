import test from "node:test";
import assert from "node:assert/strict";
import { kidsCollectionOrder } from "./kids-collection-order";
test("film design leads the kids opening while retaining all filtered members", () => {
  const input = ["nafas-daisy-days", "other-new", "nafas-panda-and-tweet", "nafas-pink-pop", "other-old"];
  assert.deepEqual(kidsCollectionOrder(input, "kids-wallpapers", 1), ["nafas-pink-pop", "nafas-daisy-days", "nafas-panda-and-tweet", "other-new", "other-old"]);
  assert.equal(input[0], "nafas-daisy-days");
  assert.deepEqual(kidsCollectionOrder(["blue-only"], "kids-wallpapers", 1), ["blue-only"]);
});
test("later pages and other collections retain their order", () => {
  const input = ["other", "nafas-pink-pop"];
  assert.equal(kidsCollectionOrder(input, "kids-wallpapers", 2), input);
  assert.equal(kidsCollectionOrder(input, "living-room", 1), input);
});
