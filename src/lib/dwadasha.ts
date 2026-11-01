/**
 * DWADASHA — the Ganesh collection.
 *
 * Eleven designs (not fourteen — see below), each named for a traditional
 * epithet of Ganesha. English and Devanagari both appear in the title, the
 * same way `sacred-bovine-mother` ("Sneha (स्नेह)") and
 * `sacred-bovine-motherhood` ("Mamta (ममता)") already do in this catalogue.
 *
 * WHY ELEVEN, NOT FOURTEEN: the 14 source files turned out to be pages from a
 * printed catalogue/lookbook, not clean masters — 11 had a permanent "CODE
 * SP-G-0XX WA/WP — Can be customised..." caption baked into the pixels above
 * the painting, `1.png` and `2.png` were duplicates of the same painting, and
 * `14.png` was a full magazine cover (masthead, phone number, barcode) reusing
 * another design's art. The 11 genuine SP-G paintings were cropped to just the
 * artwork rectangle (removing the caption band) — see
 * `~/Downloads/Dwadasha Clean Masters/`, which is what `file` below points
 * into via scripts/dwadasha-art-dir.ts.
 *
 * THE REAL ASPECT RATIOS, measured from the cropped rectangles, are NOT what
 * was assumed while working from the uncropped catalogue pages: 9 of the 11
 * are near-square (~1.01:1), and only 2 are landscape (~1.47:1) — none are
 * the 0.707:1 of the full page. This matters for the wallpaper line's
 * automatic ratio lock in ProductConfigurator.tsx, which only engages outside
 * 1:1.1..1.1:1 — so the 9 near-square designs do NOT auto-lock. Confirmed
 * decision: use the site default as-is for these (locked by default via
 * ProductConfigurator's own logic, customer can uncheck) rather than add
 * special-case code — consistent with "no special projects for this."
 *
 * EACH DESIGN IS TWO PURCHASABLE LINES, not one:
 *   <handle>         category 'wallpaper', linen-touch only, custom-sized.
 *   <handle>-canvas  category 'canvas' ("Canvas Art" family), eco-cotton-canvas
 *                    only, sold from a ready_sizes ladder proportioned to
 *                    THIS design's own real ratio (landscape vs near-square
 *                    get different ladders — see CANVAS_READY_SIZES_* below).
 * There is no schema linking the two rows together as "the same design" —
 * that mechanism does not exist anywhere in this codebase today (checked:
 * Taash, Triple Lift, the existing wallpaper/canvas pairs all stand alone).
 * They are connected only by the shared handle prefix.
 */

export const DWADASHA_TAG = "Dwadasha";
export const DWADASHA_COLLECTION_HANDLE = "dwadasha";
export const DWADASHA_CANVAS_COLLECTION_HANDLE = "canvas-dwadasha";

/** Collection wallpaper rate; the surface does not determine the price. */
export const WALLPAPER_RATE = 300;
export const WALLPAPER_MATERIAL = "linen-touch";

/** Existing site-standard rate for eco-cotton-canvas — unchanged, not new. */
export const CANVAS_RATE = 400;
export const CANVAS_MATERIAL = "eco-cotton-canvas";

/** For the 9 near-square designs (measured ratio ~1.0147:1) — true square
 *  sizes, matching the existing `crimson-reverie` canvas-art precedent
 *  exactly ([[24,24],[36,36],[48,48]]). The ~1.5% deviation from true square
 *  is imperceptible at these sizes. */
export const CANVAS_READY_SIZES_SQUARE: [number, number][] = [
  [24, 24],
  [36, 36],
  [48, 48],
];

/** For the 2 landscape designs (measured ratio ~1.466:1, from the cropped
 *  4222x2880 rectangle) — proportioned so every size is the artwork's exact
 *  shape, no crop. */
export const CANVAS_READY_SIZES_LANDSCAPE: [number, number][] = [
  [29, 20],
  [35, 24],
  [44, 30],
];

export type DwadashaDesign = {
  handle: string;
  englishName: string;
  hindiName: string;
  /** A short, traditional gloss of the epithet. */
  meaning: string;
  /** Filename inside `~/Downloads/Dwadasha Clean Masters/` — already cropped
   *  to just the painting, no catalogue caption. */
  file: string;
  /** 'square' → CANVAS_READY_SIZES_SQUARE; 'landscape' → ..._LANDSCAPE. */
  shape: "square" | "landscape";
};

/**
 * Assigned by looking at each cropped painting and matching it to the epithet
 * whose meaning or a visible motif fits best — not a literal illustration
 * match (this is abstract art), a reasonable thematic one. Three names from
 * the original 14-name list were dropped to fit 11 designs: Kapila,
 * Gajakarnaka, Dhumraketu — kept the more widely-recognised names instead
 * (Vakratunda, Ganapati, etc.). Swap freely if a different name suits a piece
 * better; nothing downstream depends on the specific pairing, only on `file`
 * staying attached to the right pixels.
 */
export const DWADASHA_DESIGNS: DwadashaDesign[] = [
  { handle: "dwadasha-ganapati", englishName: "Ganapati", hindiName: "गणपति", meaning: "Lord of the ganas", file: "CODE SP-G-01.png", shape: "landscape" },
  { handle: "dwadasha-vinayaka", englishName: "Vinayaka", hindiName: "विनायक", meaning: "The supreme leader and remover", file: "SP-G-02.png", shape: "landscape" },
  { handle: "dwadasha-vighnaraja", englishName: "Vighnaraja", hindiName: "विघ्नराज", meaning: "Lord of obstacles", file: "SP-G-03.png", shape: "square" },
  { handle: "dwadasha-sumukha", englishName: "Sumukha", hindiName: "सुमुख", meaning: "He of the auspicious face", file: "SP-G-04.png", shape: "square" },
  { handle: "dwadasha-ganadhyaksha", englishName: "Ganadhyaksha", hindiName: "गणाध्यक्ष", meaning: "Leader of the ganas", file: "SP-G-05.png", shape: "square" },
  { handle: "dwadasha-vikata", englishName: "Vikata", hindiName: "विकट", meaning: "The immense, awe-inspiring one", file: "SP-G-06.png", shape: "square" },
  { handle: "dwadasha-bhalachandra", englishName: "Bhalachandra", hindiName: "भालचन्द्र", meaning: "He who wears the crescent moon on his brow", file: "SP-G-07.png", shape: "square" },
  { handle: "dwadasha-gajanana", englishName: "Gajanana", hindiName: "गजानन", meaning: "The elephant-faced one", file: "SP-G-08.png", shape: "square" },
  { handle: "dwadasha-ekadanta", englishName: "Ekadanta", hindiName: "एकदन्त", meaning: "The one-tusked lord", file: "SP-G-09.png", shape: "square" },
  { handle: "dwadasha-vakratunda", englishName: "Vakratunda", hindiName: "वक्रतुण्ड", meaning: "He of the curved trunk", file: "SP-G-010.png", shape: "square" },
  { handle: "dwadasha-lambodara", englishName: "Lambodara", hindiName: "लम्बोदर", meaning: "He of the ample belly", file: "SP-G-011.png", shape: "square" },
];

/**
 * Two channels for the same story, because they render differently:
 *   - `description` is the collection page's own copy (collections.description).
 *   - `quote`/`credit` is the collection_stories pull-quote block, the only
 *     story kind that needs no photo/video asset (CollectionStory.tsx:34-38)
 *     — there is no behind-the-scenes still or film for this collection yet,
 *     so `video`/`image` blocks would be invisible "slots" until one exists.
 */
export const DWADASHA_STORY = {
  description:
    "Dwadasha is Sanskrit for “twelve” — a name drawn from the Dwadasha Naama " +
    "Stotram, the twelve traditional names of Ganesha recited before any undertaking. " +
    "Each piece in this collection is titled after one of these epithets — Vakratunda, " +
    "Ekadanta, Lambodara, Gajanana, Vinayaka, and more — set in both English and " +
    "Devanagari, so the name itself carries the invocation. The artwork itself is not " +
    "devotional iconography in the traditional sense: it's an abstract interpretation, " +
    "built from the texture and gesture of acrylic on canvas — the same instinct that " +
    "once painted Ganesha across temple and haveli walls centuries ago, carried into a " +
    "contemporary visual language. Where those murals lived on lime plaster and " +
    "pigment, Dwadasha works in paint and canvas grain; where they belonged to a " +
    "single wall, this collection is sized to yours — full wallpaper for a wall, wall " +
    "art for a single statement piece — with every print holding the same proportions " +
    "the artwork was painted in.",
  quote:
    "Dwadasha — the twelve names of Ganesha, carried from temple and haveli walls " +
    "into acrylic on canvas.",
  credit: "From the Dwadasha Naama Stotram, in a contemporary shape",
};
