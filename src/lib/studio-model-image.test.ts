import { strict as assert } from "node:assert";
import { test } from "node:test";
import sharp from "sharp";
import { imageForModel, MODEL_IMAGE_MAX_BYTES, imageBlock } from "./studio-model-image";

test("a photograph goes to the model as its 1600px JPEG rendition", async () => {
  const png = await sharp({ create: { width: 3200, height: 2400, channels: 3, background: "#8C7B6B" } }).png().toBuffer();
  const shown = await imageForModel(png, "image/png");
  assert.ok(shown);
  assert.equal(shown.media_type, "image/jpeg");
  const meta = await sharp(Buffer.from(shown.data, "base64")).metadata();
  assert.equal(meta.width, 1600);
  assert.equal(meta.format, "jpeg");
  assert.deepEqual(imageBlock(shown).source.type, "base64");
});

test("when the rendition cannot be made, a small original goes as it is and a large one is left out", async () => {
  const broken = async () => { throw new Error("sharp unavailable on this runtime"); };
  const small = Buffer.alloc(1000, 1);
  const shown = await imageForModel(small, "image/webp", broken);
  assert.deepEqual(shown, { data: small.toString("base64"), media_type: "image/webp" });
  assert.equal((await imageForModel(small, "application/octet-stream", broken))?.media_type, "image/jpeg");
  const big = Buffer.alloc(MODEL_IMAGE_MAX_BYTES + 1, 1);
  assert.equal(await imageForModel(big, "image/jpeg", broken), null);
});

test("a rendition that is still over the limit falls back to the same rule", async () => {
  const oversized = async () => Buffer.alloc(MODEL_IMAGE_MAX_BYTES + 1, 2);
  assert.equal(await imageForModel(Buffer.alloc(MODEL_IMAGE_MAX_BYTES + 1, 1), "image/jpeg", oversized), null);
  const small = Buffer.alloc(10, 1);
  assert.equal((await imageForModel(small, "image/jpeg", oversized))?.data, small.toString("base64"));
});
