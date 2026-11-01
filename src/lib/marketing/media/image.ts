// Sharp-based still composition. Takes owned scene renders (already photoreal —
// the design shown in a real room) and turns them into finished Instagram feed
// posts, carousel slides, and stories with subtle Zyvorah framing.
//
// Crucially: the source imagery is the site's OWN room renders and flat
// patterns. Nothing here fabricates a room or hints at how anything is printed —
// it only frames what we already own. The synthesized-lifestyle lane (a
// generated room seeded with our real pattern) lives behind the provider
// abstraction in ../providers and feeds the SAME compositor once a scene exists.

import {
  wordmarkSvg,
  monogramSvg,
  wordmarkAspect,
  MIN_PRIMARY_HEIGHT,
  esc,
  bottomScrimSvg,
  topScrimSvg,
  lowerThirdSvg,
  upperThirdSvg,
  storyHouseSvg,
  badgeSvg,
  PALETTE,
  SANS_TEXT,
} from "./brand";
// brand.ts sets FONTCONFIG_PATH at module evaluation. Sharp must load after it:
// otherwise librsvg can cache the host's fallback faces before our bundled
// Playfair/Inter files are visible, even while fc-match later reports success.
import sharp, { type OverlayOptions } from "sharp";
import { fetchImage } from "./fetch";
import { CANVAS } from "./types";
import { socialLayout } from "./social-layout";

export type StillSpec = {
  title: string; // design name, e.g. "Mayur (मयूर)"
  sub?: string; // e.g. "sized to your wall · from ₹200/sq ft"
  badge?: { label: string; bg?: string };
  wordmark?: boolean; // default true
  /** Supplied whole artwork: retain its colour and texture during resize. */
  preserveSource?: boolean;
  /**
   * The DETAIL beat: a macro of the artwork. `zoom` is the magnification over
   * cover-fit (2.4 ≈ "a hand's width of the drawing"), `x`/`y` the focal point
   * in 0..1 of the source. The window is extracted from the full-resolution
   * source BEFORE the canvas resize, so the mark and the grain stay sharp.
   */
  crop?: { zoom: number; x?: number; y?: number };
  /**
   * cover (default) fills the canvas and trims the overflow. contain shows the
   * whole artwork on a `ground` colour — "the figure is never cut" for a
   * devotional design.
   */
  fit?: "cover" | "contain";
  ground?: string;
  /** Where the words sit. lower (default) is the lower-third over a scrim;
   *  upper keeps a Story's tap zone clear; none leaves the picture alone. */
  text?: "lower" | "upper" | "none";
  /**
   * "editorial-story" is the fullbleed-editorial-v2 Story language (founder,
   * 25 Sep 2026): the image bleeds to the frame's edges and the words live in
   * a designed serif type block — never the old centred letterbox. The
   * compositor picks the page shape from the source's own aspect; see
   * composeEditorialStory.
   */
  layout?: "editorial-story";
  /**
   * Where a cover-fit crop keeps its weight. Default "attention" lets sharp
   * pick the busiest region, which is right for an incidental photograph and
   * WRONG for a mural: the room renders are composed pictures with the wall
   * deliberately centred, and attention drifts off it toward a window or a
   * clothing rail. On 25 Sep 2026 the Ace of Spades — the whole subject of the
   * post — was cut off its own card that way (founder: "the mural should be
   * central to this view and not cut off"). A wall beat passes "centre" to
   * keep the composition the render already has.
   */
  position?: "attention" | "centre" | "south";
  /** Carousel only: the flat artwork, shown whole as the penultimate slide. */
  flatUrl?: string;
  /** Small-caps kicker above the editorial title, e.g. "ZYVORAH · TAASH". */
  kicker?: string;
  /** One quiet line under the editorial title. */
  line?: string;
};

const svg = (s: string) => Buffer.from(s);

/**
 * REFUSE TO COMPOSE IN THE WRONG FACE. Renders a probe line in each brand
 * family and the same line in a deliberately nonexistent family; if the pixels
 * come out identical, the family did not resolve and every frame would silently
 * ship in a substitute font — the exact "the fonts are changing" failure of
 * 25 Sep 2026. The media container calls this at boot and dies loudly instead.
 */
let fontHealth: Promise<{ ok: boolean; missing: string[]; error?: string }> | null = null;

/** Each brand family and the TTF it must resolve to. The check is on the FILE
 *  fontconfig picks, because a pixel comparison against a "nonexistent"
 *  family cannot tell Inter apart from the fallback — fonts.conf makes Inter
 *  the fallback for every unknown family, so on 25 Sep 2026 the probe rendered
 *  Inter twice, found the pixels identical, and refused every October frame
 *  with "Inter did not resolve" while Inter was resolving perfectly. */
const BRAND_FONT_FILES: Record<string, RegExp> = {
  "Playfair Display": /Playfair-/,
  "Noto Serif Devanagari": /NotoSerifDevanagari-/,
  Inter: /Inter-/,
};

export function brandFontHealth(): Promise<{ ok: boolean; missing: string[]; error?: string }> {
  fontHealth ??= (async () => {
    try {
      const { execFileSync } = await import("node:child_process");
      const missing: string[] = [];
      for (const [family, file] of Object.entries(BRAND_FONT_FILES)) {
        // fc-match answers with the file fontconfig would actually use for
        // this family — the same resolution librsvg makes when it draws.
        const got = execFileSync("fc-match", ["-f", "%{file}", family]).toString().trim();
        if (!file.test(got)) missing.push(`${family} → ${got.split("/").pop() || "(nothing)"}`);
      }
      if (missing.length) return { ok: false, missing };
      // fc-match sees fontconfig, but Sharp can still render a substitute.
      // Compare actual pixels before allowing a finished frame to be saved.
      const probe = async (family: string) => sharp(Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="90"><text x="10" y="65" font-family="${family}" font-size="60">Story room</text></svg>`,
      )).raw().toBuffer();
      const [serif, sans] = await Promise.all([probe("Playfair Display"), probe("Inter")]);
      return serif.equals(sans)
        ? { ok: false, missing: [], error: "Sharp renders Playfair and Inter identically; brand fonts are not active" }
        : { ok: true, missing: [] };
    } catch (e) {
      // No fc-match on this host (macOS dev boxes): fall back to a pixel
      // check that the three families draw DIFFERENTLY from each other.
      // Weaker, but it cannot mistake the fallback for a resolved face.
      try {
        const probe = async (family: string) => {
          const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="90">
            <rect width="420" height="90" fill="#fff"/>
            <text x="10" y="60" font-family="${family}" font-size="44" fill="#000">Zyvorah 1</text>
          </svg>`;
          return sharp(Buffer.from(doc)).raw().toBuffer();
        };
        const [a, b, c] = await Promise.all(Object.keys(BRAND_FONT_FILES).map(probe));
        const distinct = !a.equals(b) && !b.equals(c) && !a.equals(c);
        return distinct
          ? { ok: true, missing: [] }
          : { ok: false, missing: [], error: `brand families do not draw distinctly (no fc-match to ask; ${String(e)})` };
      } catch (e2) {
        return { ok: false, missing: [], error: String(e2) };
      }
    }
  })();
  return fontHealth;
}

export async function assertBrandFonts(): Promise<void> {
  const h = await brandFontHealth();
  if (!h.ok) {
    throw new Error(
      h.error
        ? `brand font probe failed: ${h.error}`
        : `brand fonts did not resolve: ${h.missing.join(", ")} — fontconfig is not seeing public/fonts. ` +
            `Refusing to compose: every frame would ship in a substitute face.`,
    );
  }
}

/** A crop window over a `sw`×`sh` source: the cover-fit window for a `w`×`h`
 *  canvas, shrunk by `zoom`, centred on the focal point and clamped inside. */
export function cropWindow(
  sw: number,
  sh: number,
  w: number,
  h: number,
  crop: { zoom: number; x?: number; y?: number },
): { left: number; top: number; width: number; height: number } {
  const zoom = Math.max(1, crop.zoom);
  // Cover-fit: the largest w:h window that fits the source.
  const scale = Math.min(sw / w, sh / h);
  const width = Math.max(16, Math.round((w * scale) / zoom));
  const height = Math.max(16, Math.round((h * scale) / zoom));
  const fx = Math.min(1, Math.max(0, crop.x ?? 0.5));
  const fy = Math.min(1, Math.max(0, crop.y ?? 0.5));
  const left = Math.round(Math.min(Math.max(0, fx * sw - width / 2), sw - width));
  const top = Math.round(Math.min(Math.max(0, fy * sh - height / 2), sh - height));
  return { left, top, width, height };
}

/**
 * Compose one framed still on a `w`×`h` canvas from a single source image
 * (cover-fit), with scrim + lower-third + wordmark + optional badge.
 */
export async function composeStill(
  sourceUrl: string,
  w: number,
  h: number,
  spec: StillSpec,
): Promise<Buffer> {
  if (spec.layout === "editorial-story") return composeEditorialStory(sourceUrl, w, h, spec);
  // A macro needs the source at full size: the storage transform's default
  // width would hand back a 1440px copy and a 2.4× window of that is soft.
  const src = await fetchImage(sourceUrl, spec.crop ? Math.max(w * Math.ceil(spec.crop.zoom), 2400) : Math.max(w, 1440));

  let img = sharp(src);
  if (spec.crop) {
    const meta = await img.metadata();
    if (meta.width && meta.height) {
      img = img.extract(cropWindow(meta.width, meta.height, w, h, spec.crop));
    }
  }

  // Cover-fit the render to the canvas (fill, crop overflow), gentle sharpen.
  const resized = (spec.fit === "contain"
    ? img.resize(w, h, { fit: "contain", background: spec.ground ?? PALETTE.cloud })
    : img.resize(w, h, { fit: "cover", position: spec.position ?? (spec.crop ? "centre" : "attention") })
  );
  const base = await (spec.preserveSource ? resized : resized.modulate({ saturation: 1.02 }).sharpen()).toBuffer();

  const text = spec.text ?? "lower";
  const layers: OverlayOptions[] = [];
  if (text === "lower") {
    layers.push(
      { input: svg(bottomScrimSvg(w, h)) },
      { input: svg(lowerThirdSvg(w, h, spec.title, spec.sub, spec.kicker)) },
    );
  } else if (text === "upper") {
    layers.push({ input: svg(topScrimSvg(w, h)) }, { input: svg(upperThirdSvg(w, h, spec.title, spec.sub)) });
  }

  if (spec.wordmark !== false) {
    // The monogram, top-left — the same mark, size and inset the Story uses.
    // This used to be the full lockup in the opposite corner, which is why the
    // grid and the Stories looked like two different brands. The full lockup
    // still signs the closing card, where it is the statement rather than an
    // overlay on someone's room.
    const layout = socialLayout(w, h);
    const markH = layout.logoHeight;
    layers.push({
      input: svg(monogramSvg({ color: "#FFFFFF", height: markH })),
      top: layout.logoTop,
      left: layout.left,
    });
  }

  if (spec.badge) {
    // Below the monogram, same left edge — the two share the corner without
    // colliding, and the badge reads as a sub-line to the mark.
    layers.push({
      input: svg(badgeSvg(w, spec.badge.label, spec.badge.bg ?? PALETTE.blush)),
      top: Math.round(h * 0.042) + Math.round(w * 0.046) + Math.round(w * 0.018),
      left: Math.round(w * 0.09),
    });
  }

  return sharp(base)
    .composite(layers)
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

/**
 * The editorial Story page (fullbleed-editorial-v2). Three shapes, chosen by
 * the source's own geometry so nothing is ever a floating letterbox:
 *
 * - PORTRAIT source (would keep ≥55% of itself under a 9:16 cover — the same
 *   arithmetic as src/lib/image-orientation.ts): full bleed to all four
 *   edges, bottom-anchored so any crop comes off the ceiling and never the
 *   floor, the type block over a scrim at the foot.
 * - LANDSCAPE source: the image bleeds edge-to-edge across the top of the
 *   page, bottom-anchored (the floor survives), and the serif type block owns
 *   the lower third on the ground colour — a designed page, not a leftover.
 * - CONTAIN (a devotional figure that must never be cut): the whole artwork
 *   on the ground colour inside the image region, same type block below.
 */
export async function composeEditorialStory(
  sourceUrl: string,
  w: number,
  h: number,
  spec: StillSpec,
): Promise<Buffer> {
  await assertBrandFonts();
  const src = await fetchImage(sourceUrl, Math.max(w, 1440));
  const ground = spec.ground ?? PALETTE.cloud;

  // A STORY IS ALWAYS A FULL PICTURE (founder, 26 Sep 2026: "the images will
  // always be full and the text will be aligned").
  //
  // This used to letterbox a landscape render into the top of the frame and
  // fill the rest with a flat colour slab, because a 3:2 room cover-cropped to
  // 9:16 keeps only about a third of its width. The arithmetic was right and
  // the result was wrong: the desk filled with frames that were half picture
  // and half empty block. A Story is a full-screen surface and the picture has
  // to own it; the crop comes off the CEILING (position "south") so the floor
  // and the furniture survive, which is what keeps a cropped room reading as a
  // room at all.
  //
  // `contain` survives only where the plan has explicitly marked a design
  // whole (art.detail_mode = "whole"), where the figure must not be cut.
  const whole = spec.fit === "contain";
  const hasWords = Boolean(spec.title?.trim() || spec.line?.trim() || spec.kicker?.trim());

  const layers: OverlayOptions[] = [];
  const base = await (whole
    ? sharp(src).resize(w, h, { fit: "contain", background: ground })
    : sharp(src).resize(w, h, { fit: "cover", position: "south" })
  )
    .modulate({ saturation: 1.02 })
    .sharpen()
    .toBuffer();

  if (hasWords) {
    layers.push({ input: svg(storyHouseSvg(w, h, { title: spec.title, kicker: spec.kicker, line: spec.line ?? spec.sub })) });
  }

  // NO FLOATING MONOGRAM ON A STORY. Instagram prints the account name across
  // the top-left of a Story itself, so a mark there is both buried (the
  // founder saw "zyvorah." printed straight through ours) and redundant — the
  // frame's collection label is below Instagram's chrome. Moving a mark to
  // the top right only trades a collision for clutter. Feed and carousel keep
  // their monogram because Instagram draws its chrome outside those pictures.

  return sharp(base).composite(layers).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

/** A single 4:5 feed post from the best available scene (or the flat pattern). */
export async function composeFeed(sourceUrl: string, spec: StillSpec): Promise<Buffer> {
  return composeStill(sourceUrl, CANVAS.feed.w, CANVAS.feed.h, spec);
}

/** A 9:16 story frame. */
export async function composeStory(sourceUrl: string, spec: StillSpec): Promise<Buffer> {
  return composeStill(sourceUrl, CANVAS.story.w, CANVAS.story.h, spec);
}

/**
 * A carousel: an opening framed "hero" slide, then clean full-bleed scene
 * slides (no heavy text — let the rooms speak), then a closing brand card.
 * Returns one JPEG buffer per slide (2–10 slides, IG's limit).
 */
export async function composeCarousel(
  sceneUrls: string[],
  spec: StillSpec,
): Promise<Buffer[]> {
  const { w, h } = CANVAS.feed;
  // Reserve room for the flat slide and the closing card so a design with many
  // renders cannot crowd out the two slides that carry the storytelling.
  const scenes = sceneUrls.slice(0, spec.flatUrl ? 6 : 7);
  const slides: Buffer[] = [];

  // 1) Hero slide with the lower-third + badge.
  slides.push(await composeStill(scenes[0], w, h, { ...spec, position: spec.position ?? "centre" }));

  // 2..n) Quiet scene slides — just a small wordmark, no lower-third. Centre,
  // not attention: these are composed murals and the crop keeps the picture the
  // render already made (see StillSpec.position).
  for (const url of scenes.slice(1)) {
    const src = await fetchImage(url, Math.max(w, 1440));
    const base = await sharp(src).resize(w, h, { fit: "cover", position: "centre" }).sharpen().toBuffer();
    // The same monogram, in the same corner, at the same size as slide 1 and as
    // every Story — the swipe should not change brand halfway through.
    const wm = monogramSvg({ color: "#FFFFFF", height: Math.round(w * 0.046) });
    slides.push(
      await sharp(base)
        .composite([
          { input: svg(topScrimSvg(w, h, 0.28)) },
          {
            input: svg(wm),
            top: Math.round(h * 0.042),
            left: Math.round(w * 0.09),
          },
        ])
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer(),
    );
  }

  // The penultimate slide: the artwork itself, whole, on the collection's mat.
  // A room render answers "what would this look like in a house"; only the flat
  // answers "what IS this drawing" — and the swipe is the one place the brand
  // can show it without breaking the shop-window rule that a card never fronts
  // a flat (founder, 25 Sep 2026: the post should carry "the flat image or more
  // storytelling to it").
  if (spec.flatUrl) {
    slides.push(
      await composeStill(spec.flatUrl, w, h, {
        title: spec.title,
        sub: "the artwork, whole",
        fit: "contain",
        ground: spec.ground ?? PALETTE.cloud,
        wordmark: false,
      }),
    );
  }

  // Closing card: cloud background, centred wordmark + one-line CTA.
  slides.push(await composeClosingCard(spec.sub));
  return slides;
}

/** A calm end-card: cloud canvas, wordmark, and a single line. */
export async function composeClosingCard(line?: string): Promise<Buffer> {
  const { w, h } = CANVAS.feed;
  // PRIMARY: the sign-off. The mark is the whole point of this card, so it is
  // sized well clear of the floor rather than at it.
  const cardH = Math.max(Math.round(w * 0.1), MIN_PRIMARY_HEIGHT);
  const wm = wordmarkSvg({ color: PALETTE.charcoal, height: cardH, placement: "primary" });
  // This asked for Georgia — never bundled, and not a face the brand uses — and
  // hand-rolled its own two-character escape, so it slipped past BOTH guards:
  // the family audit, which only ever rendered the lower third, and esc(), which
  // is where glyph coverage is enforced. It looked correct only because macOS
  // substitutes a font silently. Everything drawn here goes through esc() now.
  const text = line
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
        <text x="${w / 2}" y="${Math.round(h * 0.6)}" text-anchor="middle"
          font-family="${SANS_TEXT}" font-size="${Math.round(w * 0.032)}"
          fill="${PALETTE.slate}" letter-spacing="0.5">${esc(line)}</text>
      </svg>`
    : "";
  return sharp({
    create: { width: w, height: h, channels: 3, background: PALETTE.cloud },
  })
    .composite([
      { input: svg(wm), top: Math.round(h * 0.44), left: Math.round((w - cardH * wordmarkAspect("primary")) / 2) },
      ...(text ? [{ input: svg(text) }] : []),
    ])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
