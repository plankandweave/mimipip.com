import test from "node:test";
import assert from "node:assert/strict";
import { imageQuality } from "./image-quality";
import { evidenceType } from "./quality-claim";
const crop = {
  imageUrl: "https://example.com/art.jpg",
  sourceW: 12000,
  sourceH: 12000,
  imageAspect: 1,
  wallWidthCm: 254,
  wallHeightCm: 254,
  zoom: 1,
  offsetX: 0.5,
  offsetY: 0.5,
};
test("resolution follows actual crop and physical size", () => {
  assert.equal(imageQuality(crop)?.ppi, 120);
  assert.equal(imageQuality({ ...crop, zoom: 2 })?.ppi, 60);
  assert.equal(imageQuality({ ...crop, wallWidthCm: 508 })?.ppi, 60);
  assert.equal(imageQuality({ ...crop, sourceW: 0 }), null);
  assert.equal(imageQuality({ ...crop, zoom: NaN }), null);
});
test("repeat resolution follows tile size, not wall size", () => {
  const a = imageQuality({ ...crop, seamless: { repeatWidthCm: 254 } });
  const b = imageQuality({
    ...crop,
    wallWidthCm: 1016,
    seamless: { repeatWidthCm: 254 },
  });
  assert.equal(a?.ppi, b?.ppi);
});
test("evidence rejects disguised files and detects supported image signatures", () => {
  assert.equal(
    evidenceType(new TextEncoder().encode("<svg><script>bad</script></svg>")),
    null,
  );
  assert.equal(
    evidenceType(Uint8Array.from([255, 216, 255, 0]))?.mime,
    "image/jpeg",
  );
  assert.equal(
    evidenceType(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]))?.mime,
    "image/png",
  );
  assert.equal(evidenceType(new Uint8Array()), null);
});
