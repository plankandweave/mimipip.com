// Pure geometry for composing a band of appliance creatives. No sharp, no
// database, no `server-only`: every decision about WHERE a design sits and
// WHERE a run may be cut is a function of numbers, so it is unit-tested in
// band-geometry.test.ts and the composer (corporate-band-compose.ts) only
// applies the answers.
//
// Roheena, 6 October 2026, on the Narol proposal:
//  - "the floor line should always match, irrespective of whether there's a
//    column that breaks it" — one floor height for the whole store;
//  - "start with the complete vacuum cleaner showing and move the blue line
//    on the right so that can get cut off" — a cut lands in background;
//  - "the mobile just looks totally off … we should not have those cuts,
//    just a colour patch there" — never through an appliance.

/** A subject (an appliance, a figure) inside a design, as fractions of the
 *  design's width and height, left/top origin. */
export type SubjectBox = { x0: number; x1: number; y0: number; y1: number; label?: string };

export type CompositionStyle = "blocks" | "scene";

export type DesignGeometry = {
  /** Where the floor / platform line sits, as a fraction of the design's
   *  height from the top. Null when the design has no floor (a pattern). */
  floorY: number | null;
  subjects: SubjectBox[];
  /** The visual language the design speaks: "blocks" (each object alone on
   *  its own flat colour panel) or "scene" (objects share one continuous
   *  scene — overlaps, shadows, ground props). Undefined = not yet measured. */
  style?: CompositionStyle | null;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** The store's floor line from the designs it uses: the median of their
 *  floors, so one odd design does not drag every other one. Null when no
 *  design has a floor. */
export function medianFloor(floors: ReadonlyArray<number | null | undefined>): number | null {
  const xs = floors.filter((f): f is number => typeof f === "number" && Number.isFinite(f)).map(clamp01).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2;
}

/**
 * Fit a design into a band of height `canvasH` so that its floor lands on
 * the band's floor line.
 *
 * The design is scaled to the SMALLEST height that still covers the band
 * once its floor is pinned at `targetFloorY`: the part above its floor must
 * reach the band's top and the part below must reach the band's bottom. The
 * design then overflows on one side, and `top` (≤ 0) is where its top edge
 * sits relative to the band — the overflow is cropped, never left white.
 * A design with no floor, or a band with no floor line, is a plain
 * height-fit (`scale` = canvasH / designH, `top` = 0), which is what the
 * composer always did.
 */
export function fitToFloor(
  design: { w: number; h: number; floorY: number | null },
  targetFloorY: number | null,
  canvasH: number,
): { height: number; width: number; top: number; scaleUp: number } {
  const plain = { height: canvasH, width: Math.max(1, Math.round(canvasH * (design.w / design.h))), top: 0, scaleUp: 1 };
  if (design.floorY == null || targetFloorY == null) return plain;
  const f = clamp01(design.floorY);
  const t = clamp01(targetFloorY);
  // Degenerate floors (at the very top or bottom) cannot anchor anything.
  if (f <= 0.02 || f >= 0.98 || t <= 0.02 || t >= 0.98) return plain;
  const above = t / f;             // height needed so f·h ≥ t·canvasH
  const below = (1 - t) / (1 - f); // height needed so (1−f)·h ≥ (1−t)·canvasH
  const scaleUp = Math.max(1, above, below);
  const height = Math.round(canvasH * scaleUp);
  const width = Math.max(1, Math.round(height * (design.w / design.h)));
  // Pin the floor: design floor at f·height must sit at t·canvasH.
  const top = Math.round(t * canvasH - f * height);
  return { height, width, top: Math.min(0, Math.max(canvasH - height, top)) || 0, scaleUp };
}

/**
 * APPLIANCES AS BIG AS THE WALL (Roheena, 14 October 2026, with a photograph
 * of a finished Vijay Sales store: "everything needs to be made as big as the
 * height … the fridges are as big as 7 ft … everything is scaled up, just
 * keeping the floor line"). The designs draw their appliances in the lower
 * half of the frame with empty colour above; fitted to the band, a wall read
 * as half empty. Each design is now enlarged until its tallest appliance
 * standing on the floor reaches FILL_TOP_MARGIN of the top, its floor pinned
 * to the store's line — never past MAX_FILL_SCALE, and never smaller than
 * the plain floor fit. A design with no measured floor or subjects keeps the
 * plain fit.
 */
export const FILL_TOP_MARGIN = 0.07;
export const MAX_FILL_SCALE = 2.4;

export function fillToHeight(
  design: { w: number; h: number; floorY: number | null; subjects?: ReadonlyArray<SubjectBox> | null },
  targetFloorY: number | null,
  canvasH: number,
  topMargin = FILL_TOP_MARGIN,
): { height: number; width: number; top: number; scaleUp: number } {
  const base = fitToFloor(design, targetFloorY, canvasH);
  if (design.floorY == null || targetFloorY == null) return base;
  const f = clamp01(design.floorY);
  const t = clamp01(targetFloorY);
  // Only what stands on the floor sets the height: a phone lying in front of
  // the line, or a cup on a counter, does not.
  const standing = (design.subjects ?? []).filter((b) => Math.abs(Math.max(b.y0, b.y1) - f) <= 0.08);
  if (!standing.length) return base;
  const tallest = Math.min(...standing.map((b) => Math.min(b.y0, b.y1)));
  const span = f - tallest;
  if (span <= 0.05 || t - topMargin <= 0.05) return base;
  const wanted = canvasH * ((t - topMargin) / span);
  const height = Math.round(Math.max(base.height, Math.min(canvasH * MAX_FILL_SCALE, wanted)));
  const width = Math.max(1, Math.round(height * (design.w / design.h)));
  const top = Math.round(t * canvasH - f * height);
  return { height, width, top: Math.min(0, Math.max(canvasH - height, top)) || 0, scaleUp: height / canvasH };
}

/** NOTHING IS CUT OFF (Roheena, 14 October 2026: "bake these rules —
 *  nothing should be cut off"). The tip of the tallest appliance, once the
 *  design is placed on the store's floor line and enlarged to the wall's
 *  height, stays at least TIP_MARGIN of the band height below the top edge.
 *  The measured subject boxes are loose, so a tip that close to the edge is
 *  already touching it in the picture (walls 2 and 8: stick vacuums with
 *  their heads shaved). A design that fails gives its place to designs that
 *  pass, like `holdsFloorLine`; a wall of only such designs is still made
 *  from them, and never enlarged further (`maxRunScale`). */
export const TIP_MARGIN = 0.04;

export function tipsStayInFrame(
  design: { w: number; h: number; floorY: number | null; subjects?: ReadonlyArray<SubjectBox> | null },
  targetFloorY: number | null,
  canvasH: number,
): boolean {
  if (design.floorY == null || !(design.subjects ?? []).length) return true;
  const g = fillToHeight(design, targetFloorY, canvasH);
  const tallest = Math.min(...(design.subjects ?? []).map((b) => Math.min(b.y0, b.y1)));
  return (g.top + tallest * g.height) / canvasH >= TIP_MARGIN;
}

/** The version of the band composition rules (this file and
 *  corporate-band-compose.ts). The composer stamps every band it makes with
 *  it, and the site refuses a band from a composer whose version differs:
 *  on 7 October 2026 a media container that had not restarted after a
 *  release composed Narol with yesterday's rules, and the result looked
 *  finished. Bump on ANY change to either file — band-geometry.test.ts
 *  fails until you do. */
export const BAND_RULES_VERSION = "2026-10-25.4";

/** The most a design may be enlarged to put its floor on the store's line.
 *  Past this the floor is not worth the picture: Narol wall 4 (7 October
 *  2026) lifted a speaker drawn with its floor at 88% to a 78% line by
 *  enlarging it 1.83×, and the wall showed the bottom half of two speakers
 *  with a third of the band painted over. A design that cannot reach the
 *  line within this keeps its plain height fit and, in a multi-design band,
 *  gives its place to designs that can (`holdsFloorLine`). */
export const MAX_FLOOR_SCALE = 1.25;

export function holdsFloorLine(
  design: { w: number; h: number; floorY: number | null }, targetFloorY: number | null, canvasH: number,
): boolean {
  return fitToFloor(design, targetFloorY, canvasH).scaleUp <= MAX_FLOOR_SCALE;
}

/**
 * Where a run that ends mid-design may be cut.
 *
 * `visibleW` is how much of the design (at its composed width `designW`)
 * fits before the band ends. The cut moves LEFT from there to the nearest
 * background gap — a column no subject crosses — so no appliance is sliced.
 * The space it gives up (`fill`) is painted from that gap, a colour patch.
 * With no subject information, or when the only gap would give up more than
 * `maxGiveUp` of the visible width, the cut stays where the band ends: a
 * sliced appliance is bad, but a band that is mostly patch is worse.
 */
export function safeCut(
  visibleW: number,
  designW: number,
  subjects: ReadonlyArray<SubjectBox>,
  opts: { marginFrac?: number; maxGiveUp?: number; maxFill?: number } = {},
): { cutX: number; fill: number; gapStart: number; movedForSubject: boolean } {
  const margin = (opts.marginFrac ?? 0.015) * designW;
  const maxGiveUp = opts.maxGiveUp ?? 0.45;
  const none = { cutX: visibleW, fill: 0, gapStart: visibleW, movedForSubject: false };
  if (visibleW >= designW || !subjects.length) return none;

  const boxes = subjects
    .map((s) => ({ x0: clamp01(Math.min(s.x0, s.x1)) * designW - margin, x1: clamp01(Math.max(s.x0, s.x1)) * designW + margin }))
    .filter((b) => b.x1 > b.x0)
    .sort((a, b) => a.x0 - b.x0);
  const inside = boxes.find((b) => visibleW > b.x0 && visibleW < b.x1);
  if (!inside) return none; // already in a gap

  // The gap ends where this subject begins; it starts where the previous one ends.
  const cutX = Math.floor(inside.x0);
  const prev = boxes.filter((b) => b.x1 <= inside.x0).sort((a, b) => b.x1 - a.x1)[0];
  const gapStart = Math.ceil(prev ? prev.x1 : 0);
  // With `maxFill` the limit is how much of the BAND gets painted, not how
  // much of this copy is given up: a sliver of a phone at a wall's end gives
  // up nearly all of a tiny visible run and is still worth moving (Narol
  // wall 3), while a third of a wall in paint never is (wall 4).
  const tooMuch = opts.maxFill != null
    ? visibleW - cutX > opts.maxFill
    : (visibleW - cutX) / visibleW > maxGiveUp;
  if (cutX <= gapStart || tooMuch) return none;
  return { cutX, fill: visibleW - cutX, gapStart, movedForSubject: true };
}

/** How many subjects a design carries; 0 when unmeasured. */
/** Whether a design may hold a place in a multi-design floor-line band.
 *  Objects that stand on a ground (floorY) hold the line; a pattern with no
 *  objects fills as background. A top-down FLAT LAY — subjects but no floor —
 *  can do neither: its gadgets lie at angles beside neighbours standing on
 *  the store's line (Narol wall 1, 6 October 2026: cameras and phones strewn
 *  on teal next to rows of standing toasters). An unmeasured design (no
 *  geometry yet) composes as it always did and is measured next time. */
export function standsInBand(g: DesignGeometry | null | undefined): boolean {
  if (!g) return true;
  return g.floorY != null || g.subjects.length === 0;
}

/** The share of a wall's designs the flat-lay filter must leave standing. */
export const MIN_STANDING_SHARE = 0.6;

/**
 * The designs that hold a place in the band: those that stand on a floor
 * (standsInBand) — but never fewer than MIN_STANDING_SHARE of the chain. The
 * floor is a model's measurement and it can split one uniform set: on EBD
 * Gurgaon (25 October 2026) it gave a floor to 3 of 10 flat-lay electronics
 * designs, so wall 1 kept 2 of its 5 designs and wall 2 kept 1, and the rest
 * of each wall was left to the image model as a blank patch. When the
 * standing designs are that few, the chain is one language and composes
 * whole, as a chain with no floor at all always did.
 */
export function standingOrAll(
  ids: readonly string[],
  geometryOf: (id: string) => DesignGeometry | null | undefined,
): string[] {
  const standing = ids.filter((id) => standsInBand(geometryOf(id)));
  return standing.length > 0 && standing.length >= Math.ceil(ids.length * MIN_STANDING_SHARE) ? standing : [...ids];
}

/**
 * What a composed band becomes on its wall. A patch the image model could
 * not complete is flat paint where artwork should be, so the wall FAILS with
 * the reason — never `composed` with a note (EBD Gurgaon, 25 October 2026:
 * walls 1 and 2 were "composed" with 6 m and 10 m of plain colour after the
 * OpenAI key was rejected). A failed wall has no artwork, is retried, and
 * stops the proposal like any other failed wall.
 */
export function bandOutcome(out: { notes?: readonly string[] | null; incomplete?: readonly string[] | null }):
  { status: "composed" | "compose_failed"; warning: string | null } {
  const incomplete = out.incomplete ?? [];
  if (incomplete.length) {
    const keyRejected = incomplete.some((e) => /\b401\b|incorrect api key|invalid api key|no openai key/i.test(e));
    const why = keyRejected
      ? "the OpenAI key was rejected (or missing), so every patch the image model must complete fails until the key is replaced"
      : incomplete[0]!;
    return {
      status: "compose_failed",
      warning: `Not composed: ${incomplete.length} patch${incomplete.length === 1 ? "" : "es"} of this wall would print as flat colour — ${why}.`.slice(0, 600),
    };
  }
  const notes = out.notes ?? [];
  return { status: "composed", warning: notes.length ? `Composer: ${notes.join(" · ")}`.slice(0, 600) : null };
}

export const subjectCount = (g: DesignGeometry | null | undefined) => g?.subjects?.length ?? 0;

/** One visual language per band (Narol wall 5, 6 October 2026: overlapping
 *  TVs with shadows and a phone on the ground butted against clean
 *  one-object-per-panel blocks read as two different wallpapers). When a
 *  wall's chain carries BOTH languages, the scene designs are dropped and
 *  the block designs tile their share; a chain of only scenes, only blocks,
 *  or unmeasured designs is left as allocated. */
export function sameLanguage(
  ids: readonly string[],
  styleOf: (id: string) => CompositionStyle | null | undefined,
): string[] {
  const hasBlocks = ids.some((id) => styleOf(id) === "blocks");
  const hasScene = ids.some((id) => styleOf(id) === "scene");
  if (!hasBlocks || !hasScene) return [...ids];
  return ids.filter((id) => styleOf(id) !== "scene");
}

/** One column of the artwork averaged to a single pixel. */
export type ColumnRGB = readonly [number, number, number];

/** Where the colour-block background changes panel: the x positions (in
 *  column units) where the column-averaged colour jumps. A flat colour patch
 *  holds a near-constant column average even with an appliance on it, so a
 *  windowed jump marks a panel boundary. */
export function colourBoundaries(
  cols: ReadonlyArray<ColumnRGB>, win = 8, minDelta = 90,
): number[] {
  const n = cols.length;
  if (n < win * 2 + 2) return [];
  const deltas = new Array<number>(n).fill(0);
  const mean = (a: number, b: number): [number, number, number] => {
    let r = 0, g = 0, bl = 0;
    for (let i = a; i < b; i++) { r += cols[i]![0]; g += cols[i]![1]; bl += cols[i]![2]; }
    const w = b - a;
    return [r / w, g / w, bl / w];
  };
  for (let x = win; x < n - win; x++) {
    const L = mean(x - win, x), R = mean(x, x + win);
    deltas[x] = Math.abs(L[0] - R[0]) + Math.abs(L[1] - R[1]) + Math.abs(L[2] - R[2]);
  }
  const out: number[] = [];
  let last = -2 * win;
  for (let x = win; x < n - win; x++) {
    const d = deltas[x]!;
    if (d < minDelta || x - last <= 2 * win) continue;
    let isMax = true;
    for (let k = Math.max(0, x - win); k <= Math.min(n - 1, x + win); k++) {
      if (deltas[k]! > d) { isMax = false; break; }
    }
    if (isMax) { out.push(x); last = x; }
  }
  return out;
}

/** The strongest windowed colour jump within `win` columns of x. */
function jumpNear(cols: ReadonlyArray<ColumnRGB>, x: number, win: number): number {
  const mean = (a: number, b: number) => {
    let r = 0, g = 0, bl = 0;
    for (let i = a; i < b; i++) { r += cols[i]![0]; g += cols[i]![1]; bl += cols[i]![2]; }
    const w = b - a;
    return [r / w, g / w, bl / w];
  };
  let best = 0;
  for (let c = Math.max(win, x - win); c <= Math.min(cols.length - win, x + win); c++) {
    const L = mean(c - win, c), R = mean(c, c + win);
    best = Math.max(best, Math.abs(L[0]! - R[0]!) + Math.abs(L[1]! - R[1]!) + Math.abs(L[2]! - R[2]!));
  }
  return best;
}

/** A soft panel edge must jump at least this much, in the pure top strip
 *  and in the full-height average alike. */
export const SOFT_PANEL_DELTA = 36;

/**
 * The panel edges of a colour-block design. `full` is each column averaged
 * over the whole height; `top` over a thin strip along the top edge, above
 * the objects, where a panel is pure colour. The full-height edges stay as
 * they always were (a jump of 90). A softer edge — two warm panels side by
 * side, red into orange — is added when the top strip jumps by
 * SOFT_PANEL_DELTA and the full height agrees. On EBD Gurgaon wall 3
 * (25 October 2026) the red→orange edge of ZYVS-WQZ2G8 jumped only 68, so
 * the composer could not end the 8 ft 6 in wall after three whole panels and
 * sliced a phone and a pair of headphones instead.
 */
export function panelBoundaries(
  full: ReadonlyArray<ColumnRGB>, top: ReadonlyArray<ColumnRGB> | null, win = 8,
): number[] {
  const strong = colourBoundaries(full, win);
  if (!top || top.length !== full.length) return strong;
  const soft = colourBoundaries(top, win, SOFT_PANEL_DELTA)
    .filter((x) => jumpNear(full, x, win) >= SOFT_PANEL_DELTA)
    .filter((x) => !strong.some((s) => Math.abs(s - x) <= 2 * win));
  return [...strong, ...soft].sort((a, b) => a - b);
}

/** safeCut, then the cut pulled back onto the last colour-block boundary
 *  before it — a band must end on a full patch, never on a sliver of the
 *  next one (Narol walls 1 and 2, 6 October 2026: slivers of lime and teal
 *  at panel edges read as printing errors). The fill slab is confined to the
 *  final patch before the cut so the mirrored paint never carries a second
 *  boundary onto the wall. maxPull caps how much visible run a snap may give
 *  up; the subject margin still holds. */
export function cutOnPatch(
  visibleW: number,
  designW: number,
  subjects: ReadonlyArray<SubjectBox>,
  boundaries: readonly number[],
  maxPull: number,
  opts: { maxFill?: number } = {},
): { cutX: number; fill: number; gapStart: number; movedForSubject: boolean; snapped: boolean } {
  const base = safeCut(visibleW, designW, subjects, opts);
  const margin = Math.round(designW * 0.015);
  const lastEndBefore = Math.max(
    0, ...subjects.map((s) => s.x1 * designW).filter((e) => e <= base.cutX),
  );
  const floorX = base.movedForSubject
    ? base.gapStart
    : Math.min(base.cutX, Math.ceil(lastEndBefore + margin));
  const snap = [...boundaries]
    .filter((b) => b > floorX + 2 && b < base.cutX - 2 && base.cutX - b <= maxPull)
    .sort((a, b) => a - b)
    .pop();
  const cutX = snap ?? base.cutX;
  const snapped = snap != null;
  if (!snapped && !base.movedForSubject) return { ...base, snapped };
  // The slab painted over the given-up remainder: background of the FINAL
  // patch only — from the later of the patch's start and the gap's start.
  const prevBoundary = [...boundaries].filter((b) => b < cutX - 2).sort((a, b) => a - b).pop() ?? 0;
  let gapStart = Math.max(floorX, prevBoundary);
  if (cutX - gapStart < 12) gapStart = Math.max(0, cutX - 12);
  return { cutX, fill: visibleW - cutX, gapStart, movedForSubject: base.movedForSubject, snapped };
}

/**
 * Does a wall need a dense composition? A header band reads fine with one
 * appliance per metre; a large panel (the staircase bay at Narol, 2.79 ×
 * 2.08 m, carried one oven) needs more. Large = taller than 1.5 m and over
 * 3 m², or not a band at all (aspect under 2.2).
 */
export function wantsDenseComposition(widthMm: number, heightMm: number): boolean {
  const areaM2 = (widthMm * heightMm) / 1e6;
  const aspect = heightMm > 0 ? widthMm / heightMm : 0;
  return heightMm > 1500 && areaM2 > 3 && aspect < 2.2;
}

/** The fewest subjects a composition of this wall should carry. */
export function minSubjectsFor(widthMm: number, heightMm: number): number {
  if (!wantsDenseComposition(widthMm, heightMm)) return 1;
  return Math.max(4, Math.round(((widthMm * heightMm) / 1e6) * 1.2));
}

/** Prefix every floor-synergy note carries in the batch warnings, so a new
 *  review cycle can replace the old one's notes and nothing else. */
export const SYNERGY_PREFIX = "Floor synergy: ";

/** Strip a previous cycle's synergy notes so re-composition judges afresh. */
export function withoutSynergyNotes(warnings: readonly string[] | null | undefined): string[] {
  return (warnings ?? []).filter((w) => !w.startsWith(SYNERGY_PREFIX));
}

/** When `composition_style` (migration 20261006140000) began being asked for. */
export const STYLE_ERA = "2026-10-06T14:00:00Z";

/** Whether a design's stored geometry can be composed from as it stands.
 *  Never measured is not current. Nor is a measurement that predates the style
 *  question and never got one: such a design reads as "unstyled" for ever, and
 *  the one-visual-language rule silently does nothing for it. */
export function geometryIsCurrent(
  row: { geometry_measured_at: string | null; composition_style: string | null },
): boolean {
  if (!row.geometry_measured_at) return false;
  if (row.composition_style) return true;
  return Date.parse(row.geometry_measured_at) >= Date.parse(STYLE_ERA);
}

/**
 * Where a crop window of length `win` may sit along a `span` (px) without
 * cutting any object: every box is wholly inside or wholly outside. Of the
 * windows that qualify, the one holding the most whole objects wins, then
 * the one closest to `prefer` (the window centre we would otherwise use).
 * Null when no window qualifies, or when there are no objects to judge by.
 *
 * Narol, 7 October 2026: one-design walls were cropped around a focal point
 * with no regard to the objects — a toaster and two televisions sliced at
 * the edges of the narrow bays, and VS1's 3 × 3 grid lost the tops of its
 * top row and half of its bottom row on the 2.8 × 2.1 m panel.
 */
export function wholeSubjectWindow(
  span: number, win: number, boxes: ReadonlyArray<{ a: number; b: number }>, prefer: number, margin = 0,
): number | null {
  if (!boxes.length) return null;
  if (win >= span) return 0;
  const max = span - win;
  const clampOff = (o: number) => Math.max(0, Math.min(max, Math.round(o)));
  const cands = new Set<number>([0, max]);
  for (const { a, b } of boxes) { cands.add(clampOff(a - margin)); cands.add(clampOff(b + margin - win)); }
  let best: { off: number; whole: number; dist: number } | null = null;
  for (const off of cands) {
    const end = off + win;
    let whole = 0;
    let ok = true;
    for (const { a, b } of boxes) {
      if (b <= off || a >= end) continue;
      if (a >= off && b <= end) { whole++; continue; }
      ok = false; break;
    }
    if (!ok || whole === 0) continue;
    const dist = Math.abs(off + win / 2 - prefer);
    if (!best || whole > best.whole || (whole === best.whole && dist < best.dist)) best = { off, whole, dist };
  }
  return best ? best.off : null;
}

/**
 * When no window keeps every object whole (a narrow bay over a wide design),
 * the crop centres on one object and any object the window's edge would
 * slice is painted over with the background beside it. Returns, in window
 * coordinates, each stretch to paint and the clean gap to take its colour
 * from. An object the window holds whole is left alone.
 *
 * Whole pixels only: object boxes are fractions scaled to pixels, and the
 * image library refuses a fractional extract — the first Narol run with this
 * rule threw on walls 2 and 6 and left them uncomposed (7 October 2026).
 */
export function edgePaints(
  off: number, win: number, boxes: ReadonlyArray<{ a: number; b: number }>, margin = 0,
): { from: number; to: number; gapFrom: number; gapTo: number }[] {
  const end = off + win;
  const sorted = [...boxes].sort((p, q) => p.a - q.a);
  const out: { from: number; to: number; gapFrom: number; gapTo: number }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const { a, b } = sorted[i]!;
    if (a < off && b > off) {
      const next = sorted.slice(i + 1).find((x) => x.a >= b);
      const to = Math.min(end, b + margin);
      const gapTo = Math.min(end, next ? next.a - margin : end);
      if (gapTo - to >= 2) out.push(px({ from: 0, to: to - off, gapFrom: to - off, gapTo: gapTo - off }, win));
    } else if (a < end && b > end) {
      const prev = sorted.slice(0, i).reverse().find((x) => x.b <= a);
      const from = Math.max(off, a - margin);
      const gapFrom = Math.max(off, prev ? prev.b + margin : off);
      if (from - gapFrom >= 2) out.push(px({ from: from - off, to: win, gapFrom: gapFrom - off, gapTo: from - off }, win));
    }
  }
  return out;
}

/** A paint stretch on whole pixels inside the window: the paint still covers
 *  the whole sliced object (rounded outward) and its gap stays clean of it
 *  (rounded inward). */
function px(
  p: { from: number; to: number; gapFrom: number; gapTo: number }, win: number,
): { from: number; to: number; gapFrom: number; gapTo: number } {
  const w = Math.round(win);
  const clamp = (n: number) => Math.max(0, Math.min(w, n));
  const from = clamp(Math.floor(p.from)), to = clamp(Math.ceil(p.to));
  let gapFrom = clamp(Math.ceil(p.gapFrom)), gapTo = clamp(Math.floor(p.gapTo));
  if (gapTo <= gapFrom) { gapFrom = clamp(Math.floor(p.gapFrom)); gapTo = Math.min(w, gapFrom + 1); }
  return { from, to, gapFrom, gapTo };
}

/**
 * Slivers of a neighbouring panel left in a finished band: a strip a few
 * centimetres wide of another colour, where a design's own edge carried the
 * start of its next panel or a cut landed just past a boundary the averaged
 * strip could not see (Nelamangala, 13 October 2026: cream and teal strips at
 * the right end of walls 4, 12 and 14, a three-colour column of the next
 * copy's grid on wall 5). Each one reads as a printing error.
 *
 * `boundaries` are the band x positions where the colour changes in ANY
 * horizontal strip of the band — a partial-height patch (a cream block along
 * the floor) never moves a whole-column average. Only spans no object
 * crosses (`clear`) are looked at, and only a run bounded by a boundary on
 * at least one side and by a boundary or the band's own edge on the other:
 * the background an object stands on is never painted over. Adjacent slivers
 * merge; each is painted from its wider neighbour (`gap`), or from the
 * inside when it touches the band's edge. And only where slivers come from:
 * within `minRun` of a `seam` — the band's two ends, a join between two
 * copies, the start of a paint — never in the middle of a design, whose own
 * narrow panels (a grid's columns) are the artwork.
 */
export function sliverRuns(
  boundaries: readonly number[],
  clear: ReadonlyArray<{ from: number; to: number }>,
  bandW: number,
  minRun: number,
  seams: readonly number[] = [0, bandW],
): { from: number; to: number; gap: { from: number; to: number }; side: "left" | "right" }[] {
  const all = [...new Set(boundaries.map((b) => Math.round(b)))].sort((a, b) => a - b);
  const out: { from: number; to: number; gap: { from: number; to: number }; side: "left" | "right" }[] = [];
  for (const span of clear) {
    const a = Math.max(0, Math.round(span.from)), b = Math.min(bandW, Math.round(span.to));
    if (b - a < 2) continue;
    const inner: number[] = [];
    for (const x of all) {
      if (x <= a + 1 || x >= b - 1) continue;
      if (inner.length && x - inner[inner.length - 1]! <= 3) continue;
      inner.push(x);
    }
    if (!inner.length) continue;
    const edges = [a, ...inner, b];
    // Which edges are colour changes (a boundary or the band's own edge), and
    // which are an object's side.
    const isCut = (i: number) => (i > 0 && i < edges.length - 1) || edges[i] === 0 || edges[i] === bandW;
    const runs = edges.slice(0, -1).map((from, i) => ({
      from, to: edges[i + 1]!,
      sliver: edges[i + 1]! - from < minRun && isCut(i) && isCut(i + 1) && (i > 0 || i + 1 < edges.length - 1),
    }));
    for (let i = 0; i < runs.length; i++) {
      if (!runs[i]!.sliver) continue;
      let j = i;
      while (j + 1 < runs.length && runs[j + 1]!.sliver) j++;
      const from = runs[i]!.from, to = runs[j]!.to;
      if (!seams.some((x) => x >= from - minRun && x <= to + minRun)) { i = j; continue; }
      const left = i > 0 ? runs[i - 1]! : null, right = j + 1 < runs.length ? runs[j + 1]! : null;
      const useLeft = to === bandW ? !!left : from === 0 ? !right : !right || (!!left && left.to - left.from >= right.to - right.from);
      const n = useLeft ? left : right;
      if (n) out.push({ from, to, gap: { from: n.from, to: n.to }, side: useLeft ? "left" : "right" });
      i = j;
    }
  }
  return out;
}

/** The spans of a band no object crosses, from the objects' x extents. */
export function clearSpans(
  objects: ReadonlyArray<{ a: number; b: number }>, bandW: number,
): { from: number; to: number }[] {
  const s = objects.map((o) => ({ a: Math.max(0, o.a), b: Math.min(bandW, o.b) })).filter((o) => o.b > o.a).sort((p, q) => p.a - q.a);
  const out: { from: number; to: number }[] = [];
  let x = 0;
  for (const o of s) {
    if (o.a > x) out.push({ from: x, to: o.a });
    x = Math.max(x, o.b);
  }
  if (x < bandW) out.push({ from: x, to: bandW });
  return out;
}

/**
 * A design whose objects sit one above another — a grid of tiles, a
 * television on a cabinet, a kettle on a microwave — is "stacked"; one whose
 * objects all stand side by side on the floor is a "row". A wall never mixes
 * the two (Roheena, 14 October 2026, Nelamangala walls 4 and 5: "either be
 * all a grid or be all in length, but not a combination … they should all be
 * in line"). Small props (a cup, a phone on the floor: under 18% of the
 * height) never make a design stacked, and an object drawn INSIDE another
 * (a cup in an espresso machine) is not above it.
 */
export type Arrangement = "row" | "stacked";

export function arrangementOf(g: DesignGeometry | null | undefined): Arrangement | null {
  if (!g || !g.subjects.length) return null;
  const big = g.subjects
    .map((s) => ({ x0: Math.min(s.x0, s.x1), x1: Math.max(s.x0, s.x1), y0: Math.min(s.y0, s.y1), y1: Math.max(s.y0, s.y1) }))
    .filter((s) => s.y1 - s.y0 >= 0.18);
  for (const a of big) {
    for (const b of big) {
      if (a === b) continue;
      const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      if (overlap < 0.5 * Math.min(a.x1 - a.x0, b.x1 - b.x0)) continue;
      const tol = 0.15 * Math.min(a.y1 - a.y0, b.y1 - b.y0);
      if (a.y1 <= b.y0 + tol) return "stacked";
    }
  }
  return "row";
}

/** One arrangement per band: when a chain mixes rows and stacked designs the
 *  rows stay (appliances in line); otherwise the chain is left as it is. */
export function oneArrangement(
  ids: readonly string[],
  arrangement: (id: string) => Arrangement | null | undefined,
): string[] {
  const rows = ids.filter((id) => arrangement(id) === "row");
  const stacked = ids.some((id) => arrangement(id) === "stacked");
  return rows.length && stacked ? ids.filter((id) => arrangement(id) !== "stacked") : [...ids];
}

/**
 * Where a design may END in a band, in pixels: a colour boundary no object
 * crosses that closes a panel holding an object, or the design's own right
 * edge. Ending anywhere else leaves an empty panel or a sliced appliance at
 * the wall's end (Nelamangala walls 7 and 8, 14 October 2026: a fridge cut
 * at the edge, a metre of plain yellow where an appliance should be).
 */
export function panelEnds(
  w: number, objects: ReadonlyArray<{ a: number; b: number }>, boundaries: readonly number[], margin = 0,
): number[] {
  const free = (x: number) => !objects.some((o) => x > o.a - margin && x < o.b + margin);
  const cands = [...new Set([...boundaries.filter((b) => b > 0 && b < w && free(b)).map(Math.round), Math.round(w)])].sort((p, q) => p - q);
  const out: number[] = [];
  let prev = 0;
  for (const c of cands) {
    if (objects.some((o) => o.a >= prev - margin && o.b <= c + margin)) out.push(c);
    prev = c;
  }
  return out;
}

/** The colour boundaries inside a design no object crosses: where a panel
 *  may be widened by a few centimetres without touching an appliance. */
export function panelJoins(
  w: number, objects: ReadonlyArray<{ a: number; b: number }>, boundaries: readonly number[], margin = 0, edge = 8,
): number[] {
  return [...new Set(boundaries.map(Math.round))]
    .filter((b) => b > edge && b < w - edge && !objects.some((o) => b > o.a - margin && b < o.b + margin))
    .sort((p, q) => p - q);
}

/** Whole pixels of slack shared across n places, as evenly as integers allow. */
export function spreadSlack(slack: number, n: number): number[] {
  if (n <= 0) return [];
  const s = Math.max(0, Math.round(slack));
  const base = Math.floor(s / n);
  return Array.from({ length: n }, (_, i) => base + (i < s - base * n ? 1 : 0));
}

/**
 * The pieces that fill what is left of a run most closely: up to three
 * prefixes of the chain's designs, each ending on a panel holding an
 * appliance (`panelEnds`), never one design butted against itself (nor
 * against `after`, the design laid just before). Returns the pieces and the
 * width they leave unfilled. Brute force — a chain has a handful of designs
 * and each a handful of panel ends.
 */
export function bestFill(
  room: number,
  designs: ReadonlyArray<{ id: string; ends: readonly number[] }>,
  after: string | null = null,
  maxPieces = 3,
  /** Designs already standing whole on this wall: a piece of one repeats
   *  its first panels on the same wall (Nelamangala wall 3, 14 October
   *  2026: pink headphones at both ends). Never used while the chain has
   *  another design. */
  laid: readonly string[] = [],
): { pieces: { id: string; end: number }[]; slack: number } {
  let best: { pieces: { id: string; end: number }[]; slack: number } = { pieces: [], slack: Math.max(0, room) };
  // Never a design twice on one wall, not even a single-design chain
  // (Nelamangala walls 5 and 2, 14 October 2026: the same orange toaster
  // twice side by side). What is left over is completed by the image model.
  const pool = designs.filter((d) => !laid.includes(d.id));
  const walk = (left: number, last: string | null, acc: { id: string; end: number }[]) => {
    if (left < best.slack) best = { pieces: [...acc], slack: left };
    if (acc.length >= maxPieces || best.slack === 0) return;
    for (const d of pool) {
      if (d.id === last) continue;
      if (acc.some((a2) => a2.id === d.id)) continue;
      for (const e of d.ends) {
        if (e <= 0 || e > left) continue;
        acc.push({ id: d.id, end: e });
        walk(left - e, d.id, acc);
        acc.pop();
      }
    }
  };
  walk(Math.max(0, room), after, []);
  return best;
}

/**
 * Whole-pixel widths for pieces scaled by one factor so they sum exactly to
 * `targetW`: the few centimetres a run falls short of the wall are absorbed
 * by enlarging the WHOLE run a little (and cropping the overflow off the
 * top, the floor line pinned), never by widening empty panels (Nelamangala
 * walls 7, 8 and 10, 14 October 2026: blank patches where the slack was
 * spread). The scale is only ever applied up to `maxScale`.
 */
/** How far a run may be enlarged to close its last few centimetres. The
 *  overflow comes off the TOP with the floor pinned, and fillToHeight has
 *  already stood each design's tallest appliance FILL_TOP_MARGIN from the top;
 *  the measured boxes are loose, so TIP_MARGIN of that headroom is kept back
 *  (Roheena, 14 October 2026: "don't cut off the tops of the vacuum
 *  cleaners"). No run is enlarged more than about 3.5% — what remains is
 *  completed by the image model. */
export function maxRunScale(floorLinePct: number | null): number {
  const floor = floorLinePct ?? 0.85;
  return 1 + Math.max(0, FILL_TOP_MARGIN - TIP_MARGIN) / floor;
}

export function scaledWidths(keeps: readonly number[], targetW: number, maxScale = 1.15): number[] | null {
  const total = keeps.reduce((a, b) => a + b, 0);
  if (!keeps.length || total <= 0 || targetW < total) return null;
  const scale = targetW / total;
  if (scale > maxScale) return null;
  const out = keeps.map((k) => Math.floor(k * scale));
  let short = targetW - out.reduce((a, b) => a + b, 0);
  for (let i = 0; short > 0; i = (i + 1) % out.length) { out[i]!++; short--; }
  return out;
}
