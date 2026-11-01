// The WORD beat: a typographic plate.
//
// The third frame of every arc in "Walls Before Diwali" is not a photograph. It
// is the design's name in Devanagari and in English, what the name means, on a
// saturated ground — with a narrow band of the design itself along the lower
// edge as a signature. The launch triptych (TALK · SEE · DECIDE) is the same
// plate with one big word and no design.
//
// Drawn as SVG and rasterised by Sharp inside the media container, where the
// brand fonts (Plus Jakarta Sans, Inter, Noto Sans Devanagari) are installed.
// Every string passes through esc(), which refuses a character the bundled
// fonts cannot draw — a plate with a tofu box in the name is the one failure
// this pipeline must never publish.

import sharp, { type OverlayOptions } from "sharp";
import { fetchImage } from "./fetch";
import { SERIF_DISPLAY, SANS_TEXT, esc, wordmarkSvg, wordmarkAspect, wrap } from "./brand";
import { matFor } from "./mats";

export { MATS, MAT_BY_COLLECTION } from "./mats";

export type PlateSpec = {
  w: number;
  h: number;
  /** One big word (the launch plates). When set, title/devanagari are the
   *  small line beneath it. */
  word?: string;
  /** The English name, e.g. "Mayur" (without the bracketed Devanagari). */
  title: string;
  devanagari?: string;
  meaning?: string;
  /** Small kicker above the name: the collection. */
  kicker?: string;
  /** rose | teal | brass | indigo | card | saffron | umber | forest, or a hex. */
  mat?: string;
  /** The design, cover-fit into a band along the lower edge. */
  bandUrl?: string;
  wordmark?: boolean;
};

/** Pure: the SVG for the plate's text layer, so it can be tested without Sharp. */
export function plateSvg(spec: PlateSpec): string {
  const { w, h } = spec;
  const mat = matFor(spec.mat);
  const bandH = spec.bandUrl ? Math.round(h * 0.16) : 0;
  const x = Math.round(w * 0.09);
  const usableH = h - bandH;
  const parts: string[] = [];

  parts.push(`<rect width="${w}" height="${h}" fill="${mat.ground}"/>`);

  if (spec.word) {
    // One word, set large and centred, a hairline rule beneath it.
    const size = Math.round(Math.min(w * 0.26, (w * 0.86) / Math.max(3, spec.word.length) / 0.62));
    const cy = Math.round(usableH * 0.5);
    parts.push(
      `<text x="${w / 2}" y="${cy}" text-anchor="middle" font-family="${SERIF_DISPLAY}" font-weight="600" font-size="${size}" fill="${mat.ink}" letter-spacing="${Math.round(size * 0.04)}">${esc(spec.word)}</text>`,
      `<rect x="${Math.round(w * 0.35)}" y="${cy + Math.round(size * 0.22)}" width="${Math.round(w * 0.3)}" height="2" fill="${mat.rule}" opacity="0.8"/>`,
    );
    if (spec.title && spec.title !== spec.word) {
      const sub = Math.round(w * 0.03);
      const lines = wrap(spec.title, 44).slice(0, 3);
      parts.push(
        `<text text-anchor="middle" font-family="${SANS_TEXT}" font-size="${sub}" fill="${mat.ink}" opacity="0.88">${lines
          .map((ln, i) => `<tspan x="${w / 2}" y="${cy + Math.round(size * 0.22) + sub * 2.1 + i * sub * 1.45}">${esc(ln)}</tspan>`)
          .join("")}</text>`,
      );
    }
  } else {
    // Kicker · Devanagari · English · a rule · the meaning.
    const kickerSize = Math.round(w * 0.026);
    const devSize = Math.round(w * 0.15);
    const nameSize = Math.round(w * 0.075);
    const meaningSize = Math.round(w * 0.034);
    let y = Math.round(usableH * (spec.devanagari ? 0.3 : 0.38));
    if (spec.kicker) {
      parts.push(
        `<text x="${x}" y="${y}" font-family="${SANS_TEXT}" font-size="${kickerSize}" fill="${mat.ink}" opacity="0.75" letter-spacing="${Math.round(kickerSize * 0.18)}">${esc(spec.kicker.toUpperCase())}</text>`,
      );
      y += Math.round(kickerSize * 2.2);
    }
    if (spec.devanagari) {
      y += devSize;
      parts.push(
        `<text x="${x}" y="${y}" font-family="${SERIF_DISPLAY}" font-weight="600" font-size="${devSize}" fill="${mat.ink}">${esc(spec.devanagari)}</text>`,
      );
      y += Math.round(devSize * 0.28);
    }
    const nameLines = wrap(spec.title, 18).slice(0, 2);
    y += nameSize;
    parts.push(
      `<text font-family="${SERIF_DISPLAY}" font-weight="600" font-size="${nameSize}" fill="${mat.ink}" letter-spacing="0.5">${nameLines
        .map((ln, i) => `<tspan x="${x}" y="${y + i * Math.round(nameSize * 1.12)}">${esc(ln)}</tspan>`)
        .join("")}</text>`,
    );
    y += (nameLines.length - 1) * Math.round(nameSize * 1.12) + Math.round(nameSize * 0.55);
    parts.push(`<rect x="${x}" y="${y}" width="${Math.round(w * 0.14)}" height="3" fill="${mat.rule}" opacity="0.9"/>`);
    y += Math.round(meaningSize * 2.2);
    if (spec.meaning) {
      const lines = wrap(spec.meaning, 34).slice(0, 4);
      parts.push(
        `<text font-family="${SANS_TEXT}" font-size="${meaningSize}" fill="${mat.ink}" opacity="0.92">${lines
          .map((ln, i) => `<tspan x="${x}" y="${y + i * Math.round(meaningSize * 1.5)}">${esc(ln)}</tspan>`)
          .join("")}</text>`,
      );
    }
  }

  if (spec.bandUrl) {
    // A hairline above the band so the design reads as a signature, not a crop.
    parts.push(`<rect x="0" y="${h - bandH - 2}" width="${w}" height="2" fill="${mat.rule}" opacity="0.6"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${parts.join("")}</svg>`;
}

/** Compose the plate: ground + type, the design band, the wordmark. JPEG out. */
export async function composePlate(spec: PlateSpec): Promise<Buffer> {
  const { w, h } = spec;
  const mat = matFor(spec.mat);
  const layers: OverlayOptions[] = [];

  if (spec.bandUrl) {
    const bandH = Math.round(h * 0.16);
    const src = await fetchImage(spec.bandUrl, Math.max(w, 1440));
    const band = await sharp(src).resize(w, bandH, { fit: "cover", position: "attention" }).toBuffer();
    layers.push({ input: band, top: h - bandH, left: 0 });
  }

  if (spec.wordmark !== false) {
    const markH = Math.round(w * 0.06);
    const wm = wordmarkSvg({ color: mat.ink, height: markH, placement: "primary" });
    layers.push({
      input: Buffer.from(wm),
      top: Math.round(h * 0.055),
      left: w - Math.round(w * 0.09) - Math.round(markH * wordmarkAspect("primary")),
    });
  }

  return sharp(Buffer.from(plateSvg(spec)))
    .composite(layers)
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
