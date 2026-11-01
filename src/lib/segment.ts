import { pipeline, RawImage, type ImageSegmentationPipeline } from "@xenova/transformers";
import sharp from "sharp";

const MODEL_ID = "Xenova/segformer-b0-finetuned-ade-512-512";
let segmenterPromise: Promise<ImageSegmentationPipeline> | null = null;

function getSegmenter() {
  segmenterPromise ??= pipeline("image-segmentation", MODEL_ID) as Promise<ImageSegmentationPipeline>;
  return segmenterPromise;
}

/**
 * Detects the "wall" region of a room photo and returns an RGBA PNG the same
 * pixel size as the source, where the alpha channel is 255 on wall pixels and
 * 0 everywhere else (furniture, floor, ceiling, windows, people...). Falls
 * back to a fully-opaque (all-wall) mask if no wall segment is found, so the
 * caller degrades to today's no-occlusion behaviour rather than hiding
 * everything.
 */
export async function segmentWallMask(
  srcBuf: Buffer,
): Promise<{ png: Buffer; width: number; height: number; foundWall: boolean }> {
  const meta = await sharp(srcBuf, { failOn: "none" }).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  const segmenter = await getSegmenter();
  const arrayBuf = srcBuf.buffer.slice(srcBuf.byteOffset, srcBuf.byteOffset + srcBuf.byteLength) as ArrayBuffer;
  const image = await RawImage.fromBlob(new Blob([arrayBuf]));
  const segments = await segmenter(image);

  const wall = segments.find((s) => s.label.toLowerCase() === "wall");
  let alpha: Buffer;
  let foundWall = false;

  if (wall) {
    foundWall = true;
    // mask.data is a flat 0-255 single-channel array. transformers.js already
    // upsamples it to the source's native resolution, so this is normally a
    // straight copy — only resize (forcing back to 1 channel; sharp silently
    // expands to 3 on resize otherwise) in the rare case it doesn't match.
    const raw = Buffer.from(wall.mask.data);
    if (wall.mask.width === width && wall.mask.height === height) {
      alpha = raw;
    } else {
      alpha = await sharp(raw, { raw: { width: wall.mask.width, height: wall.mask.height, channels: 1 } })
        .resize(width, height, { fit: "fill" })
        .toColourspace("b-w")
        .raw()
        .toBuffer();
    }
  } else {
    alpha = Buffer.alloc(width * height, 255);
  }

  const white = Buffer.alloc(width * height * 3, 255);
  const png = await sharp(white, { raw: { width, height, channels: 3 } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();

  return { png, width, height, foundWall };
}

// Solid objects that, mounted on or standing in front of the wall, genuinely
// bury a mural's focal subject — the failure the scene guard catches (a mirror
// hung across a horse's face). Matched by substring against ADE20k labels.
//
// Two classes, because the small segformer model splits an ornate mural into
// "wall"/"painting"/"curtain" — so those are the SUBJECT, never occluders, and
// normal low/side furniture (sofa, table, lamp, rug, cushion) doesn't cover the
// subject either. We therefore only trip on:
//   MOUNTED — objects that hang over the wall at eye level (mirror, TV, clock…)
//   TALL    — objects that stand in front and reach UP into the focal zone
// each further gated by WHERE the object sits (centroid must be central, and
// high enough), which is what separates the entryway mirror from a corner plant.
const MOUNTED_OCCLUDERS = [
  "mirror", "television", "monitor", "screen", "clock", "cabinet",
  "wardrobe", "bookcase", "refrigerator", "fireplace",
];
const TALL_OCCLUDERS = ["plant", "tree", "sculpture", "statue"];

export type OcclusionResult = { score: number; occluder: string | null; foundWall: boolean };

/**
 * Detects whether a room scene buries the mural's focal subject behind a solid
 * object. Returns a 0..1 score = the largest share of the focal band (the
 * upper-central region where a mural's subject/face sits) covered by a
 * qualifying occluder. A mirror/TV/clock hung centrally, or a tall plant/
 * sculpture reaching up into the centre, scores high; a low sofa, a side lamp,
 * or the mural's own busy pattern score 0. Degrades to 0 (allow) if the
 * segmentation model can't run — the guard must never block the pipeline.
 */
export async function focalOcclusion(
  srcBuf: Buffer,
  opts: { x0?: number; x1?: number; y0?: number; y1?: number } = {},
): Promise<OcclusionResult> {
  const { x0 = 0.25, x1 = 0.75, y0 = 0.05, y1 = 0.55 } = opts;

  const segmenter = await getSegmenter();
  const arrayBuf = srcBuf.buffer.slice(srcBuf.byteOffset, srcBuf.byteOffset + srcBuf.byteLength) as ArrayBuffer;
  const image = await RawImage.fromBlob(new Blob([arrayBuf]));
  const segments = await segmenter(image);

  const foundWall = segments.some((s) => s.label.toLowerCase() === "wall");
  let score = 0;
  let occluder: string | null = null;

  for (const s of segments) {
    const label = s.label.toLowerCase();
    const mounted = MOUNTED_OCCLUDERS.some((k) => label.includes(k));
    const tall = TALL_OCCLUDERS.some((k) => label.includes(k));
    if (!mounted && !tall) continue;

    const mw = s.mask.width;
    const mh = s.mask.height;
    const data = s.mask.data;
    const bx0 = Math.floor(mw * x0), bx1 = Math.max(bx0 + 1, Math.ceil(mw * x1));
    const by0 = Math.floor(mh * y0), by1 = Math.max(by0 + 1, Math.ceil(mh * y1));
    const bandPixels = (bx1 - bx0) * (by1 - by0);

    // One pass: object centroid (where it sits) + how much of the focal band it covers.
    let total = 0, sumX = 0, sumY = 0, inBand = 0;
    for (let y = 0; y < mh; y++) {
      const row = y * mw;
      const yInBand = y >= by0 && y < by1;
      for (let x = 0; x < mw; x++) {
        if (data[row + x] <= 127) continue;
        total++; sumX += x; sumY += y;
        if (yInBand && x >= bx0 && x < bx1) inBand++;
      }
    }
    if (!total) continue;
    const cxN = sumX / total / mw;
    const cyN = sumY / total / mh;
    const bandFrac = inBand / bandPixels;

    // Position gate: a mounted object must sit centrally and no lower than mid-
    // wall; a tall object must be central and reach high (its mass up near the
    // subject, not a knee-height pot). Off to the side or low → not occluding.
    const passes = mounted
      ? cxN >= 0.2 && cxN <= 0.8 && cyN <= 0.6
      : cxN >= 0.3 && cxN <= 0.7 && cyN <= 0.4;
    if (!passes || bandFrac < 0.03) continue;

    if (bandFrac > score) {
      score = bandFrac;
      occluder = label;
    }
  }

  return { score: Math.min(1, score), occluder, foundWall };
}
