// Brand overlay primitives for composed media — the wordmark, the palette, and
// SVG builders for the subtle framing/captions that make a raw scene render read
// as a Zyvorah post. Everything here is drawn as SVG and composited by Sharp.
//
// FONTS. This previously asked for "Georgia, 'Times New Roman', serif" and said it
// shipped no font files because it used a system stack. Both halves were wrong:
//
//   1. The site is NOT serif. globals.css sets --font-display to Plus Jakarta Sans
//      and --font-sans to Inter. The compositor never mirrored the site it claimed to.
//   2. Vercel's serverless runtime ships no fonts at all, so librsvg resolved
//      Georgia to nothing and rendered every glyph as a tofu box — silently. The
//      first post the engine produced (2026-08-26, midnight-charge) had boxes where
//      the wordmark, title and subtitle should be, and was queued as a success.
//
// The TTFs in public/fonts are now the source of truth — the same files the
// OG-image routes already read — found via fonts/fonts.conf. Referencing a family
// that is not one of these will render boxes again, so keep to these two.
//
// Design language mirrors the site: cloud-white, charcoal ink, the real logo
// dot, generous whitespace, calm.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { socialLayout, wrap } from "./social-layout";

/** The bundled faces. Traced into the marketing function by next.config.ts. */
const FONT_DIR = join(process.cwd(), "public", "fonts");

// Point fontconfig at the bundled TTFs before Sharp loads librsvg. This must run
// on module load — once librsvg has initialised its font set, changing the
// environment has no effect, and the failure is silent boxes rather than an error.
if (!process.env.FONTCONFIG_PATH) {
  process.env.FONTCONFIG_PATH = process.cwd() + "/fonts";
}

export const PALETTE = {
  cloud: "#FAFAF7",
  charcoal: "#0F0F0F",
  slate: "#525252",
  cyan: "#48b3d7",
  blush: "#F5E6E8",
  lavender: "#E8E4F0",
  sage: "#E4EDE4",
  peach: "#F5E8E0",
  sky: "#E4EBF5",
} as const;

// THE TWO VOICES — the only font-family values any composed pixel may carry.
//
// On 25 September 2026 the founder saw one Story in a serif, its neighbour in
// a sans, and a third in whatever the host substituted, and named it: "no
// fonts should change — these are basic hygienes." So the families are TOKENS,
// exported from here and nowhere else. brand.test.ts fails the build if a
// media module spells out a font-family of its own, and the media container
// refuses to boot if either voice cannot actually render (assertBrandFonts in
// image.ts). Between the two, a frame in the wrong face cannot be produced.
export const SERIF_DISPLAY = "Playfair Display, Noto Serif Devanagari";
export const SANS_TEXT = "Inter";

// GLYPH COVERAGE. Fixing the tofu boxes proved a narrower version of the same
// bug: the text rendered, but "₹200/sq ft" came out as a box, because none of
// the four bundled TTFs carries U+20B9. A font can be present and correct and
// still lack the one character that matters most in a price.
//
// So coverage is read from the font files themselves at module load, and any
// character they cannot draw is either substituted by an explicit rule or
// REFUSED. Refusing is deliberate: this pipeline's entire failure history is
// silence — an unrenderable slot that fails loudly costs a day, an unrenderable
// slot that publishes costs the brand.
const FONT_FILES = [
  "Inter-400.ttf",
  "Inter-700.ttf",
  "Jakarta-700.ttf",
  "Jakarta-800.ttf",
  // Devanagari. The catalogue's names are Sanskrit — "Mayur (मयूर)",
  // "Surajgati (सूरजगति)", "Vriksha (वृक्ष)" — and on the first real week-ahead
  // run three of seven days were refused for exactly this. The refusal was the
  // guard working, but a third of the catalogue cannot be a permanent exception,
  // and the Latin half of the name is a transliteration, not the name. Noto Sans
  // Devanagari, SIL Open Font License, from Google Fonts.
  "NotoDevanagari-400.ttf",
  "NotoDevanagari-700.ttf",
  // Serif display for the editorial Story language (fullbleed-editorial-v2).
  // The founder's brief (25 Sep 2026): full-page image, "very Robb Report",
  // never a floating letterbox — and a monograph voice needs a serif. Playfair
  // Display for Latin, Noto Serif Devanagari so a design's actual name is set
  // in the same register as its transliteration. Both SIL OFL, Google Fonts.
  "Playfair-600.ttf",
  "NotoSerifDevanagari-600.ttf",
];

/**
 * Characters the bundled fonts lack, with what to draw instead.
 *
 * Empty, and worth keeping empty. ₹ lived here because none of the four Latin
 * faces carried it, so prices rendered as "Rs 200/sq ft". Adding Noto Sans
 * Devanagari for the catalogue's Sanskrit names brought U+20B9 with it — an
 * Indian typeface carries the rupee — so the substitution retired itself and
 * the price is drawn as ₹ again, which is what it should always have said.
 *
 * The mechanism stays because the next missing glyph will not announce itself
 * either. Prefer covering a script to substituting for it: a substitution is a
 * small permanent lie about the brand's own words.
 */
const SUBSTITUTIONS: Record<string, string> = {};

let coverage: Set<number> | null = null;
/** Which of FONT_FILES were actually readable at runtime. A refusal that names
 *  this turns "the glyph is missing" into "this font never arrived", which are
 *  different problems with different fixes — and the second is invisible from
 *  outside a serverless function you cannot call. */
let loadedFonts: string[] = [];

/** Codepoints the bundled fonts can actually draw, read from their cmap tables. */
export function bundledCoverage(): Set<number> {
  if (coverage) return coverage;
  const cps = new Set<number>();
  loadedFonts = [];
  for (const name of FONT_FILES) {
    try {
      for (const cp of cmapCodepoints(readFileSync(join(FONT_DIR, name)))) cps.add(cp);
      loadedFonts.push(name);
    } catch {
      // A missing font file is not this function's problem to report — the
      // render itself will fail visibly, and coverage staying empty would
      // refuse everything rather than quietly drawing boxes.
    }
  }
  coverage = cps;
  return cps;
}

/** Every codepoint in a TrueType cmap (formats 4 and 12 — what these files use). */
function cmapCodepoints(buf: Buffer): number[] {
  const out: number[] = [];
  const numTables = buf.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + 16 * i;
    if (buf.toString("ascii", rec, rec + 4) !== "cmap") continue;
    const cmapOff = buf.readUInt32BE(rec + 8);
    const nSub = buf.readUInt16BE(cmapOff + 2);
    for (let j = 0; j < nSub; j++) {
      const sub = cmapOff + buf.readUInt32BE(cmapOff + 4 + 8 * j + 4);
      const format = buf.readUInt16BE(sub);
      if (format === 4) {
        const segX2 = buf.readUInt16BE(sub + 6);
        for (let k = 0; k < segX2 / 2; k++) {
          const end = buf.readUInt16BE(sub + 14 + 2 * k);
          const start = buf.readUInt16BE(sub + 16 + segX2 + 2 * k);
          if (start === 0xffff) continue;
          for (let cp = start; cp <= end && cp !== 0xffff; cp++) out.push(cp);
        }
      } else if (format === 12) {
        const nGroups = buf.readUInt32BE(sub + 12);
        for (let k = 0; k < nGroups; k++) {
          const g = sub + 16 + 12 * k;
          const start = buf.readUInt32BE(g);
          const end = buf.readUInt32BE(g + 4);
          for (let cp = start; cp <= end; cp++) out.push(cp);
        }
      }
    }
  }
  return out;
}

/**
 * XML-escape text going into an SVG, and guarantee every glyph can be drawn.
 *
 * Substitutes what we have a rule for; throws on anything else. The caller sees
 * a failed slot naming the exact character, which is the whole point — the
 * alternative is a box in a published image that no automated check can see.
 */
export function esc(s: string): string {
  let text = s;
  for (const [from, to] of Object.entries(SUBSTITUTIONS)) text = text.split(from).join(to);

  const have = bundledCoverage();
  if (have.size > 0) {
    const missing = [...text].filter(
      (ch) => !have.has(ch.codePointAt(0)!) && ch !== "\n" && ch !== "\t",
    );
    if (missing.length > 0) {
      const shown = [...new Set(missing)]
        .map((ch) => `"${ch}" (U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")})`)
        .join(", ");
      throw new Error(
        `Cannot render ${shown} — no bundled font carries it. ` +
          `Loaded ${loadedFonts.length}/${FONT_FILES.length} fonts from ${FONT_DIR} ` +
          `[${loadedFonts.join(", ") || "none"}], ${have.size} codepoints. ` +
          `If a font you expect is missing from that list it was never deployed; ` +
          `otherwise add a substitution or a face that covers the glyph.`,
      );
    }
  }

  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// THE LOGO. This used to be a typographic imitation: the word "zyvorah" set in
// Plus Jakarta Sans with a cyan dot floated to its right. That is not the brand's
// logo. The real mark is a heavy condensed grotesque with a solid dot tight
// against the "h", over a wide-tracked lowercase "wallpapers" descriptor — a
// different weight, different proportions, a different dot in a different place
// and colour, and a descriptor the imitation did not have at all.
//
// It is now the actual artwork, as outlined paths. Two consequences worth naming:
// paths need no font, so the logo cannot tofu the way type can; and because the
// files are the source of truth, the mark cannot silently drift from the brand's.
const LOGO_DIR = join(process.cwd(), "public", "brand");

/** Both lockups, with their true aspect ratios measured from the artwork. */
const LOCKUPS = {
  full: { file: "zyvorah-logo.svg", aspect: 186.51 / 64.81 },
  wordmark: { file: "zyvorah-wordmark.svg", aspect: 186.51 / 57.609 },
} as const;

// WHICH LOCKUP, AND WHY IT IS NOT A QUESTION OF SPACE.
//
// "wallpapers" is part of the mark, not an ornament to shed when a corner gets
// tight. So the choice is made by what the placement IS, never by how much room
// is left — deciding on size alone means the layout quietly edits the logo, and
// the first anyone knows is a published post with half a mark on it.
//
//   primary — the piece's own brand statement: the single mark on a feed still,
//             a reel's titled frame, the closing card. The full lockup, always.
//   repeat  — a mark on a surface whose primary already carried the full lockup:
//             carousel slides 2..n. The wordmark alone, deliberately.
//
// A placement with no primary anywhere in the piece is not a "repeat".
export type Placement = "primary" | "repeat";

/**
 * The descriptor is 7.201 of the lockup's 64.81 units tall. Below about 9px of
 * rendered cap height it stops being type and becomes a grey smear under the
 * mark — worse than absent, because it reads as a printing fault.
 *
 * So a primary placement too small to carry it is a LAYOUT bug, and is refused
 * as one. Silently substituting the wordmark would hide the mistake in exactly
 * the place it matters, and shipping the smear would be worse still.
 */
const MIN_DESCRIPTOR_PX = 9;
const DESCRIPTOR_BAND = (64.81 - 57.609) / 64.81;
export const MIN_PRIMARY_HEIGHT = Math.ceil(MIN_DESCRIPTOR_PX / DESCRIPTOR_BAND);

const logoCache = new Map<string, string>();

function readLockup(variant: keyof typeof LOCKUPS): string {
  const cached = logoCache.get(variant);
  if (cached) return cached;
  const svg = readFileSync(join(LOGO_DIR, LOCKUPS[variant].file), "utf8");
  logoCache.set(variant, svg);
  return svg;
}

/**
 * The Zyvorah logo, tinted and sized for a placement.
 *
 * `placement` defaults to `primary`: the whole mark is the default, and dropping
 * the descriptor has to be asked for by name.
 */
export function wordmarkSvg(
  opts: { color?: string; height?: number; placement?: Placement } = {},
  readAsset: (variant: "full" | "wordmark") => string = readLockup,
): string {
  const color = opts.color ?? PALETTE.charcoal;
  const h = Math.round(opts.height ?? MIN_PRIMARY_HEIGHT);
  const placement = opts.placement ?? "primary";

  if (placement === "primary" && h < MIN_PRIMARY_HEIGHT) {
    throw new Error(
      `A primary logo placement is ${h}px tall; "wallpapers" needs at least ` +
        `${MIN_PRIMARY_HEIGHT}px to be readable. Give the mark more room, or — only if ` +
        `this piece already carries the full lockup elsewhere — mark it placement: "repeat".`,
    );
  }

  const variant = placement === "primary" ? "full" : "wordmark";
  const w = Math.round(h * LOCKUPS[variant].aspect);

  // The colour is substituted rather than left as currentColor: librsvg resolves
  // currentColor from a cascade this standalone document does not have, and the
  // failure mode is an invisible mark rather than an error.
  return readAsset(variant)
    .replace(/currentColor/g, color)
    .replace("<svg ", `<svg width="${w}" height="${h}" `);
}

/** The logo's aspect ratio, so callers can lay out around it without guessing. */
export function wordmarkAspect(placement: Placement = "primary"): number {
  return LOCKUPS[placement === "primary" ? "full" : "wordmark"].aspect;
}

// THE MARK ON A PICTURE.
//
// The full lockup — "zyvorah." plus "wallpapers" — is a sign-off for a page or
// a closing card. Laid over a room render it competes with the room: on
// 25 September 2026 the founder saw it dominating one Story's corner and absent
// from the next, and read the pair, correctly, as a brand with no rules.
//
// So imagery carries a MONOGRAM instead: the brand's own stylised Z and its
// full stop, one colour, no square, no descriptor — the compact mark a title
// like Architectural Digest uses on a photograph. White on a picture, and the
// dot white with it: the blue dot belongs to the app icon, where it sits on a
// coloured square, not to a photograph where it reads as a stray speck.
//
// Drawn from the same Z_PATH as the app icon (src/lib/brand-mark.ts), so the
// letterform cannot drift from the brand's, and being a path it can never tofu.
const MONOGRAM_Z_PATH =
  "M 1.0625 0 L 1.0625 -8.125 L 14.875 -45.09375 L 1.671875 -45.09375 L 1.671875 -55.578125 L 28.625 -55.578125 L 28.625 -46.546875 L 15.5625 -9.953125 L 28.78125 -9.953125 L 28.78125 0 Z M 1.0625 0 ";

/** Width ÷ height of the monogram, so callers can place it without guessing. */
export const MONOGRAM_ASPECT = 46 / 56;

/**
 * The picture mark: the stylised Z and its full stop, in ONE colour.
 * `height` is the cap height of the Z in pixels.
 */
export function monogramSvg(opts: { color?: string; height?: number } = {}): string {
  const color = opts.color ?? "#FFFFFF";
  const h = Math.round(opts.height ?? 44);
  const w = Math.round(h * MONOGRAM_ASPECT);
  // The glyph is authored on a 56-unit cap height with its baseline at y=0;
  // the dot sits on that baseline, to the right of the Z's own width.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 46 56" width="${w}" height="${h}">
    <g transform="translate(0, 56)" fill="${color}"><path d="${MONOGRAM_Z_PATH}"/></g>
    <circle cx="38.5" cy="50" r="5.2" fill="${color}"/>
  </svg>`;
}

/** A soft bottom-to-top scrim so overlaid text stays legible over any render. */
export function bottomScrimSvg(w: number, h: number, strength = 0.55): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.45" stop-color="#0F0F0F" stop-opacity="0"/>
        <stop offset="1" stop-color="#0F0F0F" stop-opacity="${strength}"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#s)"/>
  </svg>`;
}

export { wrap } from "./social-layout";

/**
 * A lower-third text block: a short kicker (e.g. design name) and an optional
 * sub-line (e.g. "sized to your wall · from ₹200/sq ft"). White text over the
 * scrim. Positioned near the bottom of a `w`×`h` canvas.
 */
export function lowerThirdSvg(
  w: number,
  h: number,
  title: string,
  sub?: string,
  kicker?: string,
): string {
  // ONE VOICE. This set its title in Plus Jakarta Sans while the Story set the
  // same design's name in Playfair, so a post and its own Story looked like two
  // brands — which is exactly what the founder saw on 25 September 2026 ("the
  // fonts are changing… there's no brand consistency"). The feed now carries
  // the same editorial type as the Story: small-caps kicker, hairline rule,
  // serif display name, one quiet line. If this ever diverges from
  // editorialBlockSvg again, the grid will tell on it.
  const x = Math.round(w * 0.09);
  const titleLines = wrap(title, 20);
  if (titleLines.length > 2) throw new Error("Title exceeds the two-line house layout; shorten the display title before rendering.");
  const titleSize = Math.round(w * 0.068);
  const subSize = Math.round(w * 0.028);
  const kickerSize = Math.round(w * 0.024);

  // Laid out upward from the foot so the block sits where the Story's does.
  const footY = socialLayout(w, h).titleFoot;
  const subY = sub ? footY : footY + subSize;
  const titleBottom = subY - (sub ? Math.round(subSize * 2.1) : 0);
  const titleTop = titleBottom - (titleLines.length - 1) * Math.round(titleSize * 1.16);

  const titleTspans = titleLines
    .map((ln, i) => `<tspan x="${x}" y="${titleTop + i * Math.round(titleSize * 1.16)}">${esc(ln)}</tspan>`)
    .join("");

  // y is a BASELINE, so the title's cap top is ~0.72em above titleTop. The rule
  // clears that by a real gap and the kicker sits above the rule — otherwise the
  // hairline lands on the first letter, which is what the first render did.
  const capTop = titleTop - Math.round(titleSize * 0.72);
  const ruleY = capTop - Math.round(titleSize * 0.34);
  const kickerY = ruleY - Math.round(kickerSize * 0.85);
  const kickerSvg = kicker
    ? `<text x="${x}" y="${kickerY}" font-family="${SANS_TEXT}"
         font-size="${kickerSize}" fill="#FFFFFF" font-weight="700"
         letter-spacing="${Math.round(kickerSize * 0.32)}">${esc(kicker.toUpperCase())}</text>
       <rect x="${x}" y="${ruleY}" width="${Math.round(w * 0.065)}" height="2" fill="#FFFFFF" opacity="0.85"/>`
    : "";

  const subSvg = sub
    ? `<text x="${x}" y="${subY}" font-family="${SANS_TEXT}" font-size="${subSize}"
         fill="#FFFFFF" font-weight="700">${esc(sub)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    ${kickerSvg}
    <text font-family="${SERIF_DISPLAY}" font-weight="600"
      font-size="${titleSize}" fill="#FFFFFF">${titleTspans}</text>
    ${subSvg}
  </svg>`;
}

/** A small pastel pill badge (e.g. "Founder's Favourite"), top-left. */
export function badgeSvg(w: number, label: string, bg: string = PALETTE.blush): string {
  const fontSize = Math.round(w * 0.026);
  const padX = Math.round(fontSize * 1.1);
  const textW = label.length * fontSize * 0.56;
  const pillW = Math.round(textW + padX * 2);
  const pillH = Math.round(fontSize * 2.2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pillW}" height="${pillH}">
    <rect rx="${pillH / 2}" width="${pillW}" height="${pillH}" fill="${bg}"/>
    <text x="${pillW / 2}" y="${Math.round(pillH * 0.68)}" text-anchor="middle"
      font-family="${SANS_TEXT}" font-size="${fontSize}" fill="${PALETTE.charcoal}"
      letter-spacing="0.5">${esc(label)}</text>
  </svg>`;
}

/**
 * The editorial Story's type block (fullbleed-editorial-v2): a designed page
 * footer, not a floating caption. Small-caps kicker, hairline rule, serif
 * display title (Playfair / Noto Serif Devanagari), one quiet line, and the
 * site as a colophon. Drawn for a `w`×`h` block; the compositor decides
 * whether it sits on a solid ground below the image (landscape sources) or
 * over a scrim on a full-bleed one (portrait sources) — `dark` picks the ink.
 */
export function editorialBlockSvg(
  w: number,
  h: number,
  opts: { kicker?: string; title: string; line?: string; dark?: boolean },
): string {
  const ink = opts.dark ? "#FFFFFF" : PALETTE.charcoal;
  const muted = opts.dark ? "rgba(255,255,255,0.72)" : PALETTE.slate;
  const x = Math.round(w * 0.09);
  const kickerSize = Math.round(w * 0.024);
  const titleSize = Math.round(w * 0.068);
  const lineSize = Math.round(w * 0.028);
  let y = Math.round(h * 0.16);
  const parts: string[] = [];
  if (opts.kicker) {
    parts.push(
      `<text x="${x}" y="${y}" font-family="${SANS_TEXT}" font-size="${kickerSize}" fill="${muted}" letter-spacing="${Math.round(kickerSize * 0.32)}">${esc(opts.kicker.toUpperCase())}</text>`,
    );
    y += Math.round(kickerSize * 1.5);
    parts.push(`<rect x="${x}" y="${y}" width="${Math.round(w * 0.065)}" height="2" fill="${ink}" opacity="0.85"/>`);
    y += Math.round(titleSize * 1.35);
  } else {
    y += Math.round(titleSize * 0.6);
  }
  const titleLines = wrap(opts.title, 18).slice(0, 2);
  parts.push(
    `<text font-family="${SERIF_DISPLAY}" font-weight="600" font-size="${titleSize}" fill="${ink}">${titleLines
      .map((ln, i) => `<tspan x="${x}" y="${y + i * Math.round(titleSize * 1.16)}">${esc(ln)}</tspan>`)
      .join("")}</text>`,
  );
  y += titleLines.length * Math.round(titleSize * 1.16) + Math.round(lineSize * 0.9);
  if (opts.line) {
    const lines = wrap(opts.line, 44).slice(0, 2);
    parts.push(
      `<text font-family="${SANS_TEXT}" font-size="${lineSize}" fill="${muted}">${lines
        .map((ln, i) => `<tspan x="${x}" y="${y + i * Math.round(lineSize * 1.5)}">${esc(ln)}</tspan>`)
        .join("")}</text>`,
    );
  }
  // Colophon, pinned to the block's foot regardless of how much ran above.
  parts.push(
    `<text x="${x}" y="${h - Math.round(h * 0.09)}" font-family="${SANS_TEXT}" font-size="${kickerSize}" fill="${muted}" letter-spacing="${Math.round(kickerSize * 0.28)}">ZYVORAH.COM</text>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${parts.join("")}</svg>`;
}

/** One full-bleed Story language, matching the approved Taash opening frames.
 * Keep the headline in the bundled serif and the quiet furniture in Inter. */
export function storyHouseSvg(
  w: number,
  h: number,
  opts: { title: string; kicker?: string; line?: string },
): string {
  const x = Math.round(w * 0.067);
  const right = w - x;
  const small = Math.round(w * 0.022);
  const headline = Math.round(w * 0.07);
  const cta = /taash/i.test(opts.kicker ?? "") ? "SEE THE TAASH COLLECTION" : "DISCOVER ZYVORAH";
  const shopY = Math.round(h * .895);
  const lines = wrap(opts.title, 26).slice(0, 2);
  const titleY = Math.round(h * (lines.length > 1 ? 0.65 : 0.68));
  // Instagram already names the account over the upper-left of the Story.
  // No second brand/collection credit or rule belongs under that chrome.
  // The shopping furniture is plain Inter, right-aligned above the reply bar.
  // It is visual copy only; the exact-design native Link sticker is optional.
  const subLines = wrap(opts.line?.trim() || "Wallpaper only.", 43).slice(0, 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="story-shade" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#000" stop-opacity=".30"/>
        <stop offset=".20" stop-color="#000" stop-opacity="0"/>
        <stop offset=".48" stop-color="#000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity=".68"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#story-shade)"/>
    <text font-family="${SERIF_DISPLAY}" font-weight="600" font-size="${headline}" fill="#fff">${lines.map((line, i) => `<tspan x="${x}" y="${titleY + i * Math.round(headline * 1.13)}">${esc(line)}</tspan>`).join("")}</text>
    ${subLines.length ? `<line x1="${x}" x2="${x + Math.round(w * .13)}" y1="${Math.round(h * .805)}" y2="${Math.round(h * .805)}" stroke="#fff" stroke-width="2"/>` : ""}
    <text font-family="${SANS_TEXT}" font-size="${Math.round(w * .028)}" fill="#fff">${subLines.map((line, i) => `<tspan x="${x}" y="${Math.round(h * .84) + i * Math.round(w * .042)}">${esc(line)}</tspan>`).join("")}</text>
    <g aria-label="Link cue" transform="translate(${right - Math.round(w * .26) - Math.round(w * .045)},${shopY - Math.round(w * .024)})" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><rect x="1" y="9" width="21" height="12" rx="6" transform="rotate(-35 11 15)"/><rect x="14" y="2" width="21" height="12" rx="6" transform="rotate(-35 24 8)"/></g>
    <text x="${right}" y="${shopY}" text-anchor="end" font-family="${SANS_TEXT}" font-size="${Math.round(w * .028)}" fill="#fff">Shop this wallpaper</text>
    <text x="${x}" y="${Math.round(h * .925)}" font-family="${SANS_TEXT}" font-size="${small}" letter-spacing="3" fill="#fff">${esc(cta)}</text>
    <text x="${x}" y="${Math.round(h * .965)}" font-family="${SANS_TEXT}" font-size="${Math.round(w * .019)}" letter-spacing="4" fill="#fff">ZYVORAH.COM</text>
  </svg>`;
}

/** A top-down scrim for a Story: the words sit in the upper third, so the
 *  darkening runs from the top and the tap zone at the bottom stays clean. */
export function topScrimSvg(w: number, h: number, strength = 0.5): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="t" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0F0F0F" stop-opacity="${strength}"/>
        <stop offset="0.42" stop-color="#0F0F0F" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#t)"/>
  </svg>`;
}

/**
 * The Story's words: title and a one-line hook in the upper third. Below the
 * safe zone Instagram draws over (the profile strip), above the poll/tap area
 * the brief keeps clear.
 */
export function upperThirdSvg(w: number, h: number, title: string, sub?: string): string {
  const titleLines = wrap(title, 20).slice(0, 2);
  const titleSize = Math.round(w * 0.062);
  const subSize = Math.round(w * 0.032);
  const x = Math.round(w * 0.08);
  const baseY = Math.round(h * 0.17);
  const titleTspans = titleLines
    .map((ln, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : titleSize * 1.1}">${esc(ln)}</tspan>`)
    .join("");
  const subLines = sub ? wrap(sub, 38).slice(0, 3) : [];
  const subY = baseY + (titleLines.length - 1) * titleSize * 1.1 + titleSize * 1.15;
  const subSvg = subLines.length
    ? `<text font-family="${SANS_TEXT}" font-size="${subSize}" fill="#FAFAF7" opacity="0.92" letter-spacing="0.3">${subLines
        .map((ln, i) => `<tspan x="${x}" y="${Math.round(subY + i * subSize * 1.35)}">${esc(ln)}</tspan>`)
        .join("")}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <text y="${baseY}" font-family="${SERIF_DISPLAY}" font-weight="600"
      font-size="${titleSize}" fill="#FFFFFF" letter-spacing="0.3">${titleTspans}</text>
    ${subSvg}
  </svg>`;
}

/** A cover is authored for the profile crop, never grabbed from the film. */
export function reelCoverTextSvg(title:string,sub:string,kicker?:string):string {
 return lowerThirdSvg(1080,1350,title,sub,kicker)
   .replace('height="1350"','height="1920"')
   .replace(/\by="([\d.]+)"/g,(_,y)=>`y="${Number(y)+285}"`);
}
