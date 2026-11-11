import test from "node:test";
import assert from "node:assert/strict";
import { artworkSizeLabel } from "./product-facts";

test("cart and checkout describe fixed dimensions as the artwork size", () => {
  assert.equal(artworkSizeLabel(91.44, 91.44), "3 ft × 3 ft artwork");
  assert.equal(artworkSizeLabel(60.96, 91.44), "2 ft × 3 ft artwork");
});
