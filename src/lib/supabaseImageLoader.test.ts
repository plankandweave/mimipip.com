import { test } from "node:test";
import assert from "node:assert/strict";
import loader from "./supabaseImageLoader";

const SUPA = "https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public";

// 28 September 2026: every partner logo on every partner page was broken
// because the loader sent corporate-logos through Supabase's render/image
// transform endpoint, a paid feature this tenant does not have (every call
// answers 403 FeatureNotEnabled). A non-migrated public object is served as
// stored — its cache-buster included — and never rewritten to render/image.
test("a corporate logo is served as the stored object, not through render/image", () => {
  const src = `${SUPA}/corporate-logos/homelane.jpeg?v=1788359802057`;
  for (const width of [480, 1200, 2400]) {
    const out = loader({ src, width, quality: 75 });
    assert.equal(out, src);
    assert.ok(!out.includes("/render/image/"), `render/image reintroduced for width ${width}`);
  }
});

test("a migrated product image still resolves to a /media rendition", () => {
  const src = `${SUPA}/product-images/sea-lace/hero.png`;
  assert.equal(loader({ src, width: 480 }), "https://zyvorah.com/media/product-images/sea-lace/hero.png@480.webp");
  assert.equal(loader({ src, width: 2400 }), "https://zyvorah.com/media/product-images/sea-lace/hero.png");
});

test("local assets and data URIs pass through untouched", () => {
  assert.equal(loader({ src: "/zyvorah-wordmark.svg", width: 480 }), "/zyvorah-wordmark.svg");
  assert.equal(loader({ src: "data:image/png;base64,AAAA", width: 480 }), "data:image/png;base64,AAAA");
});
