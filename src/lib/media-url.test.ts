import { test } from "node:test";
import assert from "node:assert/strict";
import { toMediaUrl, mediaRendition, mediaKeyFromUrl, isMediaUrl } from "./media-url";

const SUPA = "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public";

test("a product-images public URL maps to the /media route", () => {
  assert.equal(
    toMediaUrl(`${SUPA}/product-images/taash/jodi/flat.png`),
    "https://zyvorah.com/media/product-images/taash/jodi/flat.png",
  );
});

test("a render/image transform URL maps too, dropping its query", () => {
  assert.equal(
    toMediaUrl(
      `https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/render/image/public/product-images/a/b.jpg?width=640&quality=75`,
    ),
    "https://zyvorah.com/media/product-images/a/b.jpg",
  );
});

test("non-migrated buckets pass through untouched — private-doc's references must round-trip", () => {
  for (const u of [
    `${SUPA}/order-copies/ZVY-1.pdf`,
    `${SUPA}/print-files/x.png`,
    `${SUPA}/marketing-media/reel.mp4`,
    "https://media.zyvorah.com/shorelight/frame-01.jpg",
    "/brand/logo.png",
    "data:image/png;base64,xyz",
  ]) {
    assert.equal(toMediaUrl(u), u);
  }
});

test("renditions: width buckets pick @480/@1200, wide asks get the master", () => {
  const u = "https://zyvorah.com/media/product-images/a/b.jpg";
  assert.equal(mediaRendition(u, 384), `${u}@480.webp`);
  assert.equal(mediaRendition(u, 1080), `${u}@1200.webp`);
  assert.equal(mediaRendition(u, 1920), u);
  // Only media URLs are sized — everything else is untouched.
  assert.equal(mediaRendition(`${SUPA}/order-copies/x.pdf`, 480), `${SUPA}/order-copies/x.pdf`);
});

test("key extraction works from either spelling", () => {
  assert.equal(mediaKeyFromUrl(`${SUPA}/product-images/a/b.jpg`), "product-images/a/b.jpg");
  assert.equal(
    mediaKeyFromUrl("https://zyvorah.com/media/product-images/a/b.jpg"),
    "product-images/a/b.jpg",
  );
  assert.equal(mediaKeyFromUrl(`${SUPA}/order-copies/x.pdf`), null);
  // The bucket's bare R2 domain serves the same keys with no bucket prefix —
  // the commissioned-project flats live there, and the Worker must read them
  // through the binding too (own zone).
  assert.equal(
    mediaKeyFromUrl("https://media.zyvorah.com/vijay-sales/entrance-curated-v2.jpg"),
    "vijay-sales/entrance-curated-v2.jpg",
  );
});

test("isMediaUrl accepts absolute and relative /media forms only", () => {
  assert.ok(isMediaUrl("https://zyvorah.com/media/product-images/a.jpg"));
  assert.ok(isMediaUrl("/media/product-images/a.jpg"));
  assert.ok(!isMediaUrl(`${SUPA}/product-images/a.jpg`));
});

test("fridge-scenes hero photos map to the /media route — they cost 45 MB of storage egress on 6 Oct 2026", () => {
  assert.equal(
    toMediaUrl(`${SUPA}/fridge-scenes/hero/maiolica-kitchen.jpg`),
    "https://zyvorah.com/media/fridge-scenes/hero/maiolica-kitchen.jpg",
  );
  assert.equal(mediaKeyFromUrl(`${SUPA}/fridge-scenes/hero/sunset-kitchen.png`), "fridge-scenes/hero/sunset-kitchen.png");
});
