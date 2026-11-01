import { PUBLIC_ASSETS } from "./public-assets.generated";

/**
 * TAASH — the keepsake edition, as a thing the site can show.
 *
 * The current 132-page edition is the shared source for the website preview
 * and the downloadable private review. `scripts/build-taash-book-assets.sh`
 * regenerates the public pages from the book builder's review renders so the
 * two cannot drift.
 *
 * A slot whose file is missing renders as a labelled placeholder rather than a
 * broken image, so a re-export never leaves a hole in the page and nobody has
 * to remember which pictures were derived from what.
 *
 * "Is it there yet?" is answered from src/lib/public-assets.generated.ts, which
 * scripts/gen-public-manifest.mjs regenerates before every build. It is NOT
 * answered by looking at the filesystem: the site is served by a Cloudflare
 * Worker, which has no public/ directory, so an existsSync() probe there says
 * "missing" about files it is itself serving correctly — which is exactly how
 * the whole book section came to render as placeholders in production while
 * every JPEG was live at /taash-book/*.jpg.
 */

/** Every gated picture that exists in public/, as of the last build. */
const PRESENT = new Set(PUBLIC_ASSETS);

export const TAASH_BOOK_DIR = "/taash-book";
export const TAASH_BOOK_PAGE_COUNT = 132;
export const TAASH_BOOK_ASSET_VERSION = "2026-10-08";
export const TAASH_BOOK_PRICE_INR = 4950;

export function taashBookPageSrc(index: number): string {
  return `${TAASH_BOOK_DIR}/pages/${String(index).padStart(3, "0")}.jpg?v=${TAASH_BOOK_ASSET_VERSION}`;
}

export type BookSlot = {
  id: string;
  /** File under public/taash-book. Written by the asset script. */
  file: string;
  /** What the reader is looking at. */
  caption: string;
  /** Which pages of TAASH-Text-PRINT.pdf it is built from, for the script. */
  pages?: [number, number];
  /** Folder under public/. Defaults to the book's own. */
  dir?: string;
};

/**
 * The two behind-the-scenes photographs: reading the original print, and
 * testing it at wall scale.
 *
 * STAGED, NOT LIVE. The section is out of /mati until the photographs exist
 * (Roheena, 4 September 2026) — a heading and two paragraphs leading to two
 * empty frames is worse than not telling the story yet. These slots and their
 * captions are kept because the copy and the framing are settled and only the
 * pictures are missing; drop the two files into public/taash-bts/ and restore
 * the section from git (see the commit that removed it) rather than rewriting
 * it from scratch.
 *
 * They are photographs of a process rather than pages of the book, so they live
 * in their own folder.
 */
export const BTS_DIR = "/taash-bts";

export const BTS_SLOTS: BookSlot[] = [
  {
    id: "bts-reading",
    file: "reading-the-print.jpg",
    caption: "Reading the original language of the print",
    dir: BTS_DIR,
  },
  {
    id: "bts-testing",
    file: "testing-at-wall-scale.jpg",
    caption: "Testing rhythm, scale and colour for the wall",
    dir: BTS_DIR,
  },
];

/** The product shot: the real dust jacket mapped onto a board. */
export const BOOK_COVER: BookSlot = {
  id: "cover",
  file: "book-3q.jpg",
  caption: "TAASH, the keepsake edition — printed throughout, in a slipcase",
};

/**
 * The book in the same plain register as the revised edition: what it contains,
 * what a customer can learn from it, and what arrives.
 */
export const BOOK_STORY: { head: string; body: string }[] = [
  {
    head: "The complete collection",
    body:
      "See all 21 wallpapers and the three grounds in one place. Every repeat is shown at its fixed print scale. Every mural is shown as one complete design.",
  },
  {
    head: "Made for choosing",
    body:
      "Each design is followed by room settings and a short, clear explanation. You can compare the bold walls, the quieter patterns and the pale textured grounds before choosing for your room.",
  },
  {
    head: "A book to keep",
    body:
      "Printed throughout and section-sewn so it opens comfortably. The cover carries Bisaat — Gehra, the bold checkerboard that began the collection.",
  },
];

/** The colophon: the measurements, set as a sentence at the foot the way a book
 *  states itself on its own last page. */
const BOOK_COLOPHON_SPEC =
  "132 pages · 220 × 295 mm · printed throughout · section-sewn · first edition pre-order";

/**
 * The colophon reads to whoever is holding the page. India sees the price it
 * can pay; everywhere else the book is an enquiry, because it ships in its own
 * packaging rather than the wallpaper tube whose delivery every other price
 * includes — quoting a converted figure would promise a shipment we have not
 * priced. See TaashBookExperience for the matching call to action.
 */
export function bookColophon(countryCode: string): string {
  return countryCode === "IN"
    ? `${BOOK_COLOPHON_SPEC} · ₹4,950 including GST and delivery across India.`
    : `${BOOK_COLOPHON_SPEC} · available to pre-order within India; enquire for delivery elsewhere.`;
}

/**
 * The two houses' marks, for the masthead lockup.
 *
 * Both or neither: a real logotype beside a typeset name is not two houses at
 * equal size, it is one brand and one caption — which is the opposite of what a
 * collaboration masthead has to say. So until Mati's mark is in the repository
 * the page sets BOTH names in its own serif, and the day the file lands they
 * both become marks with no code change.
 *
 * Drop Mati's wordmark at public/brand/mati-wordmark.svg (an .svg with
 * fill="currentColor" takes the page's Kaajal ink, like Zyvorah's does; a
 * transparent .png also works).
 */
export const MATI_MARK = "/brand/mati-wordmark.svg";
export const ZYVORAH_MARK = "/brand/zyvorah-wordmark.svg";

export function houseMarksReady(): boolean {
  return [MATI_MARK, ZYVORAH_MARK].every((m) => PRESENT.has(m));
}

/** Whether the rendition for a slot exists yet, as of the last build. */
export function bookAssetReady(slot: BookSlot): boolean {
  return PRESENT.has(`${slot.dir ?? TAASH_BOOK_DIR}/${slot.file}`);
}

export function bookAssetSrc(slot: BookSlot): string {
  return `${slot.dir ?? TAASH_BOOK_DIR}/${slot.file}?v=${TAASH_BOOK_ASSET_VERSION}`;
}
