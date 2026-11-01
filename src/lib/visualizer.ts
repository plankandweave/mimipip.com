/**
 * Crop model shared by the room visualizer, the cart (crop_data jsonb)
 * and, later, the print-file generator: the design image is cover-fitted
 * to the wall's aspect ratio, zoomed, then panned with normalised offsets.
 */
export type CropData = {
  /** Source-resolution advisory captured with the approved composition. */
  quality?: { version: number; ppi: number; sourceWidth: number; sourceHeight: number; wallWidthCm: number; wallHeightCm: number; zoom: number; band: string; basis: string; checkedAt: string };
  /** The labelled room and collection stay with the approved crop through fulfilment. */
  concept?: { requiresPreparation?: boolean; referenceImageUrl?: string; slug: string; title: string; roomLabel: string; wallId: string; batchId: string; configurationHash: string };
  imageUrl: string;
  wallWidthCm: number;
  wallHeightCm: number;
  /** 0..1 — position of the visible window inside the overflow, left→right */
  offsetX: number;
  /** 0..1 — position of the visible window inside the overflow, top→bottom */
  offsetY: number;
  /** ≥1 — extra zoom beyond cover fit */
  zoom: number;
  /** mirror the design left↔right / top↔bottom — the printed file must match
   *  what the customer framed, so these persist through crop_data to print. */
  flipH?: boolean;
  flipV?: boolean;
  /** Multiple walls papered as ONE continuous run — each width in cm; they sum
   *  into wallWidthCm and a corner joint falls at each cumulative seam. Absent /
   *  ≤1 entry means a single wall. */
  walls?: number[];
  /** Doors, windows and large furniture as openings, divisions as vertical
   *  seam/joint lines. Positions in cm from the run's left edge; `sillCm` is
   *  how far the opening's bottom edge sits above the floor (absent / 0 = a
   *  floor-anchored door). Small marks and every window are planning overlays
   *  (print through, as always); floor-anchored marks that QUALIFY (≥60 cm
   *  wide and ≥70% of wall height — see lib/openings.ts) are excluded from
   *  print AND billing, recorded in openingsPlan below. `kind: "headboard"`
   *  marks a bed headboard: always floor-anchored, so it follows exactly the
   *  door rules (lib/openings.ts) — the tag only tells production what it is. */
  doors?: { widthCm: number; heightCm: number; offsetCm: number; sillCm?: number; kind?: "headboard" }[];
  divisions?: number[];
  /** Bill-time snapshot of the opening-aware panel plan (lib/openings.ts).
   *  Present ONLY when at least one door qualified for exclusion; downstream
   *  documents (order-copy PDF, OS payload) render THIS, never a re-derivation
   *  from live rules — the customer paid against these exact numbers. */
  openingsPlan?: {
    rulesPanelCm: number;
    rulesOverlapCm: number;
    qualifyingDoors: number[];
    /** Left→right; printHeightCm 0 = panel skipped (full-height opening). */
    panels: { widthCm: number; printHeightCm: number }[];
    excludedSqft: number;
    chargeableSqft: number;
  } | null;
  /** source image width/height ratio — stored so the crop is self-contained
   *  (the print pipeline can rebuild the exact window without loading the image) */
  imageAspect?: number;
  /** native source pixel dimensions — used to compute the print resolution */
  sourceW?: number;
  sourceH?: number;
  /** optional on-site installation add-on (Bengaluru, Mumbai & Pune), ₹/sq ft; its
   *  cost is already included in the item's line_total. Stored on the order so
   *  ops/invoice know installation was purchased. */
  installation?: { ratePerSqft: number; total: number } | null;
  /** Approved, wall-fixed lettering rendered automatically before panels are split. */
  textOverlay?: import("./text-overlay").TextOverlay | null;
  /** Legacy charge descriptor; the printable layout is textOverlay. */
  personalisation?: { childName: string; fee: number } | null;
  /** Bespoke-customisation product: the customer's note + which design it's for,
   *  so the studio knows what to customise. */
  bespoke?: { note: string; forHandle?: string; forTitle?: string } | null;
  /** Customer's explicit sign-off on the composition shown above, captured at
   *  Add to Cart — the audit trail for "I expected a different part of the
   *  artwork" disputes. Required before an item can be added. */
  approval?: { approvedAt: string; panelArrangement: string } | null;
  /** Legacy orders only: records the old promise to confirm a preset size.
   * New purchases use exact selected dimensions and set this to null. */
  sizeAssumed?: { preset: string; chosenAt: string } | null;
  /** Seamless repeat. Present ONLY for designs the studio marked as a tile;
   *  absent means the design is one composition scaled to the wall, which is
   *  how every mural behaved before this existed. See SeamlessSpec. */
  seamless?: SeamlessSpec | null;
};

/**
 * A seamless design is a TILE, not a picture of a wall: it repeats at a fixed
 * physical size rather than being stretched to whatever wall it lands on. A
 * 60 cm tile is 60 cm on a 3 m wall and 60 cm on a 12 m wall — that is the
 * whole point, and it is why the repeat is set once in Studio and not exposed
 * as a customer control. Scaling it per wall would resize the motif, which is
 * exactly the "it just scaled the whole thing up" failure this replaces.
 */
export type SeamlessSpec = {
  /** Physical width of ONE tile on the wall, in cm. Height follows from the
   *  artwork's own aspect, so a tile is never distorted. */
  repeatWidthCm: number;
};

/**
 * One tile's footprint expressed in the caller's wall units — px for the
 * visualiser (where the wall is WALL_W wide), cm for the print pipeline.
 * `unitsPerWall` is how many of those units span wallWidthCm.
 */
export function tileSpan(
  unitsPerWall: number,
  wallWidthCm: number,
  imageAspect: number,
  repeatWidthCm: number,
) {
  const safeRepeat = Math.max(1, repeatWidthCm);
  const safeWall = Math.max(1, wallWidthCm);
  const tileW = (safeRepeat / safeWall) * unitsPerWall;
  return { tileW, tileH: tileW / Math.max(imageAspect, 0.0001) };
}

// The wallpaper prints in vertical strips at FULL roll width, split EQUALLY
// across the wall — the Mimaki engine's model since the full-width jam fix
// (Roheena 2026-07-26; the old 25" two-up module is retired). The OS rule
// `zyvorah.print.max_panel_mm` caps the PRINTED strip — content plus a 15 mm
// pattern-match overlap on each edge — at 1300 mm, keeping the knife ≥25 mm
// inside the 1350 mm media. Shared by the approval UI, the panel-layout card,
// the order-proof PDF and the order-copy PDF, so what the customer signs off
// on is where production seams actually fall.
// These constants are the OFFLINE FALLBACK for the live rules: server surfaces
// fetch the current values from the OS via lib/print-rules.ts (endpoint
// /api/zyvorah/print-rules), so a production rule change propagates here
// WITHOUT a website deploy. Update the fallbacks only if the OS rule moves and
// you want the same truth when the OS is unreachable.
export const MAX_PANEL_CM = 130; // 1300 mm — fallback for zyvorah.print.max_panel_mm
export const PANEL_OVERLAP_CM = 1.5; // 15 mm — fallback for zyvorah.print.overlap_mm
const CM_PER_IN = 2.54;

/** cm of printable panel width for a material: its roll width, capped at the
 *  max printed-strip rule (a roll can be wider than a strip, never the reverse). */
export function rollCmFromMm(mm?: number | null, maxPanelCm: number = MAX_PANEL_CM): number {
  const rollCm = mm && mm > 0 ? mm / 10 : maxPanelCm;
  return Math.min(rollCm, maxPanelCm);
}

/**
 * Panel count, mirroring the engine's split exactly: start from
 * ceil(width / cap), then keep splitting while a strip's share PLUS both
 * pattern-match overlaps would overflow the cap. A single piece prints with
 * no overlap, so the overlap check never forces a needless two-strip split.
 */
export function pieceCount(
  widthCm: number,
  panelCm: number = MAX_PANEL_CM,
  overlapCm: number = PANEL_OVERLAP_CM,
): number {
  if (!(widthCm > 0) || !(panelCm > 0)) return 1;
  let n = widthCm > panelCm ? Math.ceil(widthCm / panelCm) : 1;
  if (n > 1) while (widthCm / n + 2 * overlapCm > panelCm) n++;
  return n;
}

/**
 * Per-panel printed widths in cm, left → right: an EQUAL division of the wall
 * (wall ÷ n, like the machine cuts it) — the last entry only absorbs the
 * rounding remainder, it is not a narrow balance panel.
 */
export function panelWidthsCm(
  widthCm: number,
  panelCm: number = MAX_PANEL_CM,
  overlapCm: number = PANEL_OVERLAP_CM,
): number[] {
  const n = pieceCount(widthCm, panelCm, overlapCm);
  if (n <= 1) return [Math.max(0, widthCm)];
  const each = Math.round((widthCm / n) * 100) / 100;
  const widths = Array<number>(n).fill(each);
  widths[n - 1] = Math.max(0, Math.round((widthCm - each * (n - 1)) * 100) / 100);
  return widths;
}

export function panelArrangementLabel(
  widthCm: number,
  panelCm: number = MAX_PANEL_CM,
  overlapCm: number = PANEL_OVERLAP_CM,
): string {
  const n = pieceCount(widthCm, panelCm, overlapCm);
  if (n < 2) return `1 panel (${Math.round(widthCm / CM_PER_IN)} in wide, no joins)`;
  return `${n} equal panels of ~${Math.round(widthCm / n / CM_PER_IN)} in each — hang left to right`;
}

/** Displayed image size (px) for a wall of wallW×wallH px, cover-fitted then zoomed. */
export function coverLayout(
  wallW: number,
  wallH: number,
  imageAspect: number,
  zoom: number,
) {
  const baseW = Math.max(wallW, wallH * imageAspect);
  const imgW = baseW * zoom;
  const imgH = imgW / imageAspect;
  return { imgW, imgH };
}

/**
 * The crop window as fractions of the source image — exactly what the
 * print pipeline needs to reproduce the preview.
 */
export function cropRect(crop: CropData, imageAspect: number) {
  const wallAspect = crop.wallWidthCm / crop.wallHeightCm;
  const { imgW, imgH } = coverLayout(wallAspect, 1, imageAspect, crop.zoom);
  const w = wallAspect / imgW;
  const h = 1 / imgH;
  return {
    x: crop.offsetX * (1 - w),
    y: crop.offsetY * (1 - h),
    w,
    h,
  };
}

const CM_PER_INCH = 2.54;

/**
 * Everything the print pipeline needs from a stored crop, self-contained
 * (uses crop.imageAspect, no image load required). Returns the source-image
 * window in both fractions and pixels, plus the effective print DPI at the
 * chosen wall size. `sourcePx` falls back to the fractional rect when the
 * source pixel dimensions weren't captured.
 */
/**
 * What the print pipeline needs for a SEAMLESS design. There is no crop window
 * here — the master is built by repeating the whole tile, so the only questions
 * are how big one tile prints and how many fit.
 *
 * Fractional counts are deliberate and are NOT rounded up to whole tiles: a
 * wall is whatever size it is, and a repeat that ends mid-motif at the ceiling
 * is what wallpaper does. Rounding would silently resize the motif — the very
 * thing the fixed repeat exists to prevent.
 */
export function seamlessPlan(crop: CropData) {
  const spec = crop.seamless!;
  const aspect = crop.imageAspect ?? 1;
  const { tileW: tileWcm, tileH: tileHcm } = tileSpan(
    crop.wallWidthCm, crop.wallWidthCm, aspect, spec.repeatWidthCm,
  );
  const sourceW = crop.sourceW ?? 0;
  const sourceH = crop.sourceH ?? 0;
  // Resolution is a property of ONE tile at its printed size — repeating it
  // adds pixels but never detail, so this is the honest number to report.
  const tileWidthIn = tileWcm / CM_PER_INCH;
  const tileHeightIn = tileHcm / CM_PER_INCH;
  const dpiX = tileWidthIn > 0 ? sourceW / tileWidthIn : 0;
  const dpiY = tileHeightIn > 0 ? sourceH / tileHeightIn : 0;
  return {
    tileWcm,
    tileHcm,
    colsExact: crop.wallWidthCm / tileWcm,
    rowsExact: crop.wallHeightCm / tileHcm,
    effectiveDpi: Math.round(Math.min(dpiX || 0, dpiY || 0)),
    wallWidthIn: crop.wallWidthCm / CM_PER_INCH,
    wallHeightIn: crop.wallHeightCm / CM_PER_INCH,
  };
}

export function printPlan(crop: CropData) {
  const aspect = crop.imageAspect ?? crop.wallWidthCm / crop.wallHeightCm;
  const rect = cropRect(crop, aspect); // {x,y,w,h} as fractions of the source
  const sourceW = crop.sourceW ?? 0;
  const sourceH = crop.sourceH ?? 0;
  const pxRect = {
    x: Math.round(rect.x * sourceW),
    y: Math.round(rect.y * sourceH),
    w: Math.round(rect.w * sourceW),
    h: Math.round(rect.h * sourceH),
  };
  const wallWidthIn = crop.wallWidthCm / CM_PER_INCH;
  const wallHeightIn = crop.wallHeightCm / CM_PER_INCH;
  const dpiX = wallWidthIn > 0 ? pxRect.w / wallWidthIn : 0;
  const dpiY = wallHeightIn > 0 ? pxRect.h / wallHeightIn : 0;
  return {
    rect, // fractions 0..1
    pxRect, // source pixels (0 if source dims unknown)
    effectiveDpi: Math.round(Math.min(dpiX || 0, dpiY || 0)),
    wallWidthIn,
    wallHeightIn,
  };
}

/** Human-readable pattern-scale percentage for the zoom control. */
export function scalePercent(zoom: number): number {
  return Math.round(zoom * 100);
}
