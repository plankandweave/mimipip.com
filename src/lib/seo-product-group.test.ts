import assert from "node:assert/strict";
import test from "node:test";
import { productGroupJsonLd } from "./seo";

test("product group variants carry their own merchant description", () => {
  const description = "A made-to-measure botanical mural.";
  const data = productGroupJsonLd({
    handle: "garden-study",
    title: "Garden Study",
    description,
    image: "https://zyvorah.com/media/garden-study.jpg",
    variants: [
      {
        sku: "ZYV-GARDEN-STUDY-8X10-CANVAS",
        label: "8 ft × 10 ft · Canvas",
        sizeText: "8 ft × 10 ft",
        materialName: "Canvas",
        materialSlug: "canvas",
        price: 24000,
        areaSqFt: 80,
        url: "https://zyvorah.com/products/garden-study?size=8x10&material=canvas",
      },
    ],
  });

  assert.equal(data.description, description);
  assert.equal(data.hasVariant[0]?.description, description);
});
