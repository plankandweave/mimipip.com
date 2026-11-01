/**
 * Fixed finished sizes for Canvas Wall Art.
 *
 * A canvas prints EDGE TO EDGE: the artwork fills its finished size, so any
 * size whose shape differs from the artwork's crops the artwork — and on a
 * piece painted with its own border, a crop reads as damage, not as a choice.
 *
 * So a design is NOT snapped to a standard shape. The ladder below supplies
 * only the SCALE — how big small/medium/large are for a piece of roughly this
 * shape — and the finished size is then cut to the artwork's OWN proportion
 * (see canvasReadySizesFor). Snapping to the nearest ladder shape used to
 * crop up to ~8% off an off-ratio artwork; deriving the short edge instead
 * keeps that under ~1% (only the half-inch rounding), so what the customer
 * receives is the whole picture.
 *
 * Sizes are inches, portrait (width < height, or equal), as stored in
 * products.ready_sizes. A landscape flat is transposed.
 */

export type SizeTier = "s" | "m" | "l";

export const SIZE_TIERS: SizeTier[] = ["s", "m", "l"];

export const TIER_LABEL: Record<SizeTier, string> = {
  s: "Small",
  m: "Medium",
  l: "Large",
};

export type CanvasLadder = {
  /** "2:3" — the shape, which is also the key. */
  key: string;
  /** width / height, portrait. */
  ratio: number;
  sizes: Record<SizeTier, [number, number]>;
};

export const CANVAS_LADDERS: CanvasLadder[] = [
  { key: "1:1", ratio: 1, sizes: { s: [24, 24], m: [36, 36], l: [48, 48] } },
  { key: "4:5", ratio: 0.8, sizes: { s: [24, 30], m: [36, 45], l: [48, 60] } },
  { key: "3:4", ratio: 0.75, sizes: { s: [24, 32], m: [36, 48], l: [48, 64] } },
  { key: "2:3", ratio: 2 / 3, sizes: { s: [24, 36], m: [32, 48], l: [48, 72] } },
  { key: "3:5", ratio: 0.6, sizes: { s: [24, 40], m: [30, 50], l: [36, 60] } },
  { key: "1:2", ratio: 0.5, sizes: { s: [24, 48], m: [30, 60], l: [36, 72] } },
];

/** The ladder closest in shape to an artwork of this aspect (width / height).
 *  Compared on log-ratio so "one eighth too tall" counts the same either way.
 *  Used ONLY to choose the tier SCALE — the finished shape comes from the
 *  artwork itself, never from the ladder it landed nearest to. */
export function canvasLadderFor(imageRatio: number): CanvasLadder {
  const portrait = imageRatio > 1 ? 1 / imageRatio : imageRatio;
  const safe = Number.isFinite(portrait) && portrait > 0 ? portrait : 0.75;
  return CANVAS_LADDERS.reduce((best, l) =>
    Math.abs(Math.log(l.ratio / safe)) < Math.abs(Math.log(best.ratio / safe)) ? l : best,
  );
}

/** How much of the artwork a finished size crops away, 0–1. Zero when the
 *  shapes agree — which is the point of picking the ladder by aspect. */
export function cropLoss(imageRatio: number, widthIn: number, heightIn: number): number {
  const sizeRatio = widthIn / heightIn;
  if (!Number.isFinite(imageRatio) || imageRatio <= 0 || !Number.isFinite(sizeRatio) || sizeRatio <= 0) return 0;
  return 1 - Math.min(imageRatio, sizeRatio) / Math.max(imageRatio, sizeRatio);
}

/** Finished edges are cut to the half inch — fine enough that the residual
 *  crop is invisible (<1%), coarse enough to stay a sayable size. */
const roundHalfInch = (n: number) => Math.round(n * 2) / 2;

/**
 * The ready sizes for an artwork: the artwork's OWN proportion at each tier's
 * scale, transposed for a landscape flat. An empty/absent tier pick means all
 * three.
 *
 * The long edge comes from the nearest ladder (so a piece of this shape is
 * sized like its neighbours and prices stay in a familiar band); the short
 * edge is then derived from the true aspect rather than taken from the
 * ladder. An artwork that genuinely matches a ladder shape is unaffected —
 * it produces exactly the sizes it always did.
 */
export function canvasReadySizesFor(
  imageRatio: number,
  tiers?: SizeTier[] | null,
): [number, number][] {
  const ladder = canvasLadderFor(imageRatio);
  const safe = Number.isFinite(imageRatio) && imageRatio > 0 ? imageRatio : 0.75;
  const landscape = safe > 1;
  // short ÷ long, so it applies the same either orientation.
  const shortOverLong = landscape ? 1 / safe : safe;
  const picked = tiers?.length ? SIZE_TIERS.filter((t) => tiers.includes(t)) : SIZE_TIERS;
  const order = picked.length ? picked : SIZE_TIERS;
  return order.map((t) => {
    const [lw, lh] = ladder.sizes[t];
    const longEdge = Math.max(lw, lh);
    const shortEdge = roundHalfInch(longEdge * shortOverLong);
    return (landscape ? [longEdge, shortEdge] : [shortEdge, longEdge]) as [number, number];
  });
}

/** The Studio used to name absolute sizes ("2x3", "4x6") rather than tiers.
 *  Old callers and saved presets still send those, so keep translating them. */
const LEGACY_SIZE_TIER: Record<string, SizeTier> = {
  "2x2": "s", "3x3": "m", "4x4": "l",
  "2x3": "s", "3x4": "m", "4x6": "l",
};

/** Anything the API is handed — tiers, legacy size keys, junk — as clean tiers.
 *  Nothing recognised returns null, meaning "all three". */
export function normaliseTiers(input: unknown): SizeTier[] | null {
  const raw = Array.isArray(input) ? input.map(String) : [];
  const tiers = raw
    .map((k) => (SIZE_TIERS.includes(k as SizeTier) ? (k as SizeTier) : LEGACY_SIZE_TIER[k]))
    .filter(Boolean) as SizeTier[];
  const unique = SIZE_TIERS.filter((t) => tiers.includes(t));
  return unique.length ? unique : null;
}
