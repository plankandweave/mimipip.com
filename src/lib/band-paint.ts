import sharp from "sharp";

// The paint that carries a background patch on where the artwork stops — at
// the end of a band, or over an object a one-design wall's edge would slice.
//
// Taken from the gap beside it, so the panel simply continues — as ONE flat
// colour, the median of the gap's edge. Each richer version failed on a real
// wall (Narol, 7 October 2026):
//   · mirrored slabs of the gap read as a kaleidoscope (wall 4);
//   · a colour per pixel row turns brushwork into horizontal streaks (wall 1);
//   · a smooth top-to-bottom gradient carries the shadow of the object beside
//     the gap into the paint as a dark band at floor height (walls 2, 3, 6).
// A flat panel of the adjoining colour is what these block designs are made
// of, so it reads as one more panel rather than as a repair.
//
// And only the edge of the gap TOUCHING the paint is read: a gap can span two
// colour panels, and their average is a muddy colour found nowhere in the
// artwork (a grey-blue slab between a pink and a cyan panel).
export const PAINT_ROWS = 64;

export async function gapPaint(
  src: Buffer, gap: { left: number; width: number }, size: { width: number; height: number },
  /** Which end of the gap the paint sits against. */
  touches: "left" | "right",
): Promise<Buffer> {
  const gw = Math.max(1, Math.round(gap.width));
  const take = Math.max(1, Math.min(gw, Math.round(size.height * 0.03)));
  const left = Math.round(gap.left) + (touches === "right" ? gw - take : 0);
  const rows = Math.max(1, Math.min(PAINT_ROWS, size.height));
  const { data, info } = await sharp(src)
    .extract({ left, top: 0, width: take, height: size.height })
    .resize({ width: 1, height: rows, fit: "fill" })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  // The median row, channel by channel: a shadow or a stray stroke across a
  // few rows cannot move it.
  const median = (c: number) => {
    const v: number[] = [];
    for (let i = 0; i < info.height; i++) v.push(data[i * info.channels + c]!);
    v.sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)]!;
  };
  return sharp({
    create: { width: Math.max(1, size.width), height: size.height, channels: 3, background: { r: median(0), g: median(1), b: median(2) } },
  }).png().toBuffer();
}

/**
 * One serial-run piece (serial-run-rules.ts): the design's columns between
 * `from` and `to` (fractions of its width), scaled to exactly outW × outH.
 * Cropped in the source's own pixels, then resized ONCE: sharp keeps a single
 * resize per pipeline, so a resize → extract → resize chain crops against the
 * wrong size (EBD Gurgaon, 25 October 2026: "extract_area: bad extract area"
 * on every wall of the first serial run).
 */
export async function stripPiece(
  buf: Buffer, srcW: number, srcH: number, from: number, to: number, outW: number, outH: number,
): Promise<Buffer> {
  const left = Math.max(0, Math.min(srcW - 1, Math.round(from * srcW)));
  const right = Math.max(left + 1, Math.min(srcW, Math.round(to * srcW)));
  return sharp(buf, { failOn: "none" })
    .extract({ left, top: 0, width: right - left, height: srcH })
    .resize({ width: Math.max(1, outW), height: Math.max(1, outH), fit: "fill" })
    .png().toBuffer();
}
