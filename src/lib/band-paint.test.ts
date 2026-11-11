import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { gapPaint, stripPiece } from "@/lib/band-paint";

// A gap of brushwork: every pixel row a different orange, the way a painted
// patch averages row by row, with the shadow of an object across its lower
// quarter. A colour per row streaked Narol wall 1 and a gradient carried the
// shadow into walls 2, 3 and 6 (7 October 2026); the paint is one flat colour.
async function brushGap(w: number, h: number) {
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    const jitter = (y * 7919) % 41 - 20; // ±20 per channel, row to row
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      px[i] = 235 + Math.max(-20, Math.min(20, jitter));
      px[i + 1] = 130 + jitter;
      px[i + 2] = 40 + Math.round(jitter / 2);
      // The shadow of the object beside the gap, at floor height.
      if (y > h * 0.75) { px[i] -= 40; px[i + 1] -= 40; }
    }
  }
  return sharp(px, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

test("gap paint is one flat colour: no streaks, no shadow band", async () => {
  const h = 768;
  const src = await brushGap(60, h);
  const paint = await gapPaint(src, { left: 10, width: 40 }, { width: 200, height: h }, "right");
  const { data, info } = await sharp(paint).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 200);
  assert.equal(info.height, h);
  const at = (x: number, y: number) => {
    const i = (y * info.width + x) * info.channels;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  };
  const first = at(0, 0);
  for (let y = 0; y < h; y += 7) for (const x of [0, 100, 199]) assert.deepEqual(at(x, y), first, `(${x},${y}) is the one colour`);
  // The colour is the panel's, not the shadow's: the dark floor band covers a
  // quarter of the gap and must not pull the paint towards it.
  assert.ok(Math.abs(first[1]! - 130) <= 12, `paint green ${first[1]} is the panel's ~130, not the shadow's ~90`);
});

// A gap that spans two colour panels: the paint continues the panel it
// touches, never their average (a grey-blue slab between pink and cyan).
test("gap paint continues the panel it touches", async () => {
  const h = 300;
  const pink = { r: 233, g: 78, b: 119 }, cyan = { r: 79, g: 195, b: 217 };
  const src = await sharp({ create: { width: 200, height: h, channels: 3, background: pink } })
    .composite([{ input: await sharp({ create: { width: 100, height: h, channels: 3, background: cyan } }).png().toBuffer(), left: 100, top: 0 }])
    .png().toBuffer();
  const colour = async (touches: "left" | "right") => {
    const p = await gapPaint(src, { left: 40, width: 120 }, { width: 50, height: h }, touches);
    const { data } = await sharp(p).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return { r: data[0], g: data[1], b: data[2] };
  };
  assert.deepEqual(await colour("left"), pink, "paint left of the gap is the pink it touches");
  assert.deepEqual(await colour("right"), cyan, "paint right of the gap is the cyan it touches");
});

// EBD Gurgaon, 25 October 2026: the first serial run failed every wall with
// "bad extract area" — a resize → extract → resize chain in one sharp
// pipeline. A piece is cropped in the source's pixels, then scaled once.
test("a serial-run piece is exactly the asked columns at exactly the asked size", async () => {
  // 400 × 100: four 100 px panels, red · green · blue · white.
  const W = 400, H = 100, px = Buffer.alloc(W * H * 3);
  const panel = [[230, 30, 30], [30, 200, 30], [30, 30, 230], [250, 250, 250]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px.set(panel[Math.floor(x / 100)]!, (y * W + x) * 3);
  const src = await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  // The middle two panels (green, blue), scaled to a band 60 px high.
  const out = await stripPiece(src, W, H, 0.25, 0.75, 120, 60);
  const { data, info } = await sharp(out).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height], [120, 60]);
  const at = (x: number) => [...data.subarray((30 * info.width + x) * 3, (30 * info.width + x) * 3 + 3)];
  assert.ok(at(20)[1]! > 150 && at(20)[0]! < 80, "left half is the green panel");
  assert.ok(at(100)[2]! > 150 && at(100)[0]! < 80, "right half is the blue panel");
  // A piece to the design's very edge, as at a run's end.
  const end = await stripPiece(src, W, H, 0.9, 1, 7, 60);
  assert.deepEqual([(await sharp(end).metadata()).width, (await sharp(end).metadata()).height], [7, 60]);
});
