import test from "node:test";
import assert from "node:assert/strict";
import { finishedCarouselUrls, brandDeliveredCarousel } from "./finished-carousel";

const urls = Array.from({ length: 5 }, (_, i) => `https://media.zyvorah.com/marketing-media/ahimsa/room-${i}.jpg`);
test("finished carousel preserves all five exports in delivery order despite a single preview", () => {
  assert.deepEqual(finishedCarouselUrls({ finished_carousel_urls: urls, image_url: urls[0] }), urls);
  assert.equal(finishedCarouselUrls({ carousel_frames: [{ image_url: urls[0] }] }), null);
});
test("delivered rooms cannot bypass logo and wallpaper-name composition on any slide", async () => {
  const calls: unknown[] = [];
  const result = await brandDeliveredCarousel(urls, "Shared Ground", async (url, w, h, spec) => {
    calls.push({ url, w, h, spec });
    return `branded:${url}`;
  });
  assert.deepEqual(result, urls.map(url => `branded:${url}`));
  assert.deepEqual(calls, urls.map(url => ({ url, w: 1080, h: 1350, spec: {
    title: "Shared Ground", sub: "Mural wallpaper", text: "lower", wordmark: true,
    preserveSource: true, position: "centre",
  } })));
  await assert.rejects(brandDeliveredCarousel(urls, "  ", async () => "unbranded"), /design name/);
  assert.deepEqual(finishedCarouselUrls({ room_carousel_urls: urls }), urls);
});
test("partial, duplicate and untrusted deliveries fail instead of falling back to catalogue renders", () => {
  for (const value of [[], [urls[0]], [urls[0], urls[0]], [...urls, ...urls, urls[0]], [urls[0], "https://example.com/photo.jpg"], [urls[0], "https://media.zyvorah.com/ahimsa/flat.png"], [urls[0], null]]) {
    assert.throws(() => finishedCarouselUrls({ finished_carousel_urls: value }));
  }
});
