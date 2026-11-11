import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mediaUrl } from "./project-media";

test("mediaUrl resolves a bare key against the R2 project domain", () => {
  assert.equal(mediaUrl("shorelight/cover.jpg"), "https://media.zyvorah.com/shorelight/cover.jpg");
});

test("mediaUrl maps a migrated Supabase product-image URL to its /media form", () => {
  // Shorelight's amenity spreads reuse product images by their stored URL;
  // after the product-images migration those only answer from /media.
  assert.equal(
    mediaUrl(
      "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/discussion-lounge/Zyvorah-Discussion-lounge-Discussion-lounge.png",
    ),
    "https://zyvorah.com/media/product-images/discussion-lounge/Zyvorah-Discussion-lounge-Discussion-lounge.png",
  );
});

test("mediaUrl passes other absolute URLs through untouched", () => {
  const u = "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/order-copies/x.pdf";
  assert.equal(mediaUrl(u), u);
  assert.equal(mediaUrl("https://media.zyvorah.com/shorelight/cover.jpg"), "https://media.zyvorah.com/shorelight/cover.jpg");
});
