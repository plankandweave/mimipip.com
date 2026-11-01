// Whole designs, one after another; cut only where the wallpaper ends
// (Roheena, 25 October 2026, on the slivers at every join of EBD Gurgaon
// walls 1 and 2: "Let them go in serial order, starting one after the other,
// and whatever has to be cut is cut at the outer edges … If it's ending, it
// can cut off, but if it's not ending and it's actually got a turn, then the
// same design should turn.")
//
// Walls joined by a turn (`turns_into_next`) are ONE run, laid as one strip:
// every design whole at the band's height, in the order the walls carry them,
// and the strip cut into the walls at the corners — a design that reaches a
// corner carries on round it onto the next wall. A wall that does not turn is
// a run of one. What is too long comes off the run's two free ends only; where
// it goes is split so the cut misses a whole object if any split can, halved
// otherwise (the 14 October "nothing is cut off" rule, kept as the tie-break).
// Nothing is squeezed, stretched, repeated or painted, and a run its designs
// cannot cover fails with the reason.

/** One piece of a design on one wall: `from`/`to` are fractions of the
 *  design's width; `atMm`/`lenMm` are where it sits on the wall. */
export type RunStrip = { id: string; from: number; to: number; atMm: number; lenMm: number };

export type RunWall = {
  seq: number; widthMm: number; heightMm: number; turnsIntoNext: boolean; designIds: readonly string[];
};
export type RunDesign = { aspect: number | null; subjects?: ReadonlyArray<{ x0: number; x1: number }> | null; code?: string | null };

export type RunPlan = {
  /** The pieces each wall carries, left to right. */
  strips: Map<number, RunStrip[]>;
  /** Walls that cannot be laid, with the reason (every wall of a failed run). */
  errors: Map<number, string>;
};

/** A run may not take more than this share of an end design off. */
export const MAX_END_TRIM = 0.5;
/** Heights within this share of each other are one band. */
const HEIGHT_TOLERANCE = 0.01;

/** The runs of walls in survey order: a wall that turns joins the next. */
export function wallRuns(walls: readonly RunWall[]): RunWall[][] {
  const sorted = [...walls].sort((a, b) => a.seq - b.seq);
  const runs: RunWall[][] = [];
  let cur: RunWall[] = [];
  for (const w of sorted) {
    cur.push(w);
    if (!w.turnsIntoNext) { runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  return runs;
}

/** The designs a run lays, in order: each wall's chain in survey order, a
 *  design that appears twice laid once. */
export function runOrder(run: readonly RunWall[]): string[] {
  return [...new Set(run.flatMap((w) => w.designIds))];
}

/**
 * How far into the first design the run starts, given `overflow` mm to take
 * off its two ends. Each end may lose at most MAX_END_TRIM of its design;
 * within that, the split nearest the middle whose two cuts both miss every
 * object, or the one nearest half when none does. Null when no split keeps
 * both ends within the limit.
 */
export function startTrim(
  overflow: number,
  first: { widthMm: number; subjects: ReadonlyArray<{ x0: number; x1: number }> },
  last: { widthMm: number; subjects: ReadonlyArray<{ x0: number; x1: number }> },
): number | null {
  if (overflow <= 0) return 0;
  const lo = Math.max(0, overflow - last.widthMm * MAX_END_TRIM);
  const hi = Math.min(overflow, first.widthMm * MAX_END_TRIM);
  if (lo > hi + 1e-6) return null;
  const half = Math.min(hi, Math.max(lo, overflow / 2));
  const clear = (x: number, d: typeof first) =>
    !d.subjects.some((s) => x > Math.min(s.x0, s.x1) * d.widthMm && x < Math.max(s.x0, s.x1) * d.widthMm);
  const steps = 200;
  let best: number | null = null;
  for (let i = 0; i <= steps; i++) {
    const t = lo + ((hi - lo) * i) / steps;
    if (!clear(t, first) || !clear(last.widthMm - (overflow - t), last)) continue;
    if (best == null || Math.abs(t - half) < Math.abs(best - half)) best = t;
  }
  return best ?? half;
}

export function planSerialRuns(walls: readonly RunWall[], designOf: (id: string) => RunDesign | null | undefined): RunPlan {
  const strips = new Map<number, RunStrip[]>();
  const errors = new Map<number, string>();
  for (const run of wallRuns(walls)) {
    const fail = (why: string) => { for (const w of run) errors.set(w.seq, why); };
    const names = run.map((w) => w.seq).join(" → ");
    const label = run.length > 1 ? `Walls ${names} (one run round the corners)` : `Wall ${names}`;
    const h = run[0]!.heightMm;
    const odd = run.find((w) => Math.abs(w.heightMm - h) > h * HEIGHT_TOLERANCE);
    if (odd) {
      fail(`${label}: wall ${odd.seq} is ${odd.heightMm} mm high and wall ${run[0]!.seq} is ${h} mm — a run round a corner must be one height; measure again or mark the corner as an end.`);
      continue;
    }
    const order = runOrder(run);
    if (!order.length) { fail(`${label}: no designs on it.`); continue; }
    const runW = run.reduce((s, w) => s + w.widthMm, 0);
    const laid: { id: string; widthMm: number; subjects: ReadonlyArray<{ x0: number; x1: number }> }[] = [];
    let total = 0;
    let missing: string | null = null;
    for (const id of order) {
      if (total >= runW) break;
      const d = designOf(id);
      if (!d?.aspect || !(d.aspect > 0)) { missing = d?.code ?? id; break; }
      const widthMm = d.aspect * h;
      laid.push({ id, widthMm, subjects: d.subjects ?? [] });
      total += widthMm;
    }
    if (missing) { fail(`${label}: the pixel size of ${missing} is not known, so it cannot be laid whole.`); continue; }
    if (total < runW) {
      fail(`${label}: its designs laid whole cover ${(total / 1000).toFixed(2)} m of ${(runW / 1000).toFixed(2)} m — it needs another design (never a repeat or flat colour).`);
      continue;
    }
    const overflow = total - runW;
    // One design on its own: both ends are its own, so the cut is centred.
    const t0 = laid.length === 1 ? overflow / 2 : startTrim(overflow, laid[0]!, laid[laid.length - 1]!);
    if (t0 == null) {
      fail(`${label}: laying its designs whole would cut more than half of an end design off — it needs a design that fits better.`);
      continue;
    }
    // Each design's place on the run, starting t0 before the run's first edge.
    let x = -t0;
    const placed = laid.map((d) => { const p = { ...d, s: x, e: x + d.widthMm }; x += d.widthMm; return p; });
    let wx = 0;
    for (const w of run) {
      const a = wx, b = wx + w.widthMm;
      const mine: RunStrip[] = [];
      for (const p of placed) {
        const lo = Math.max(a, p.s), hi = Math.min(b, p.e);
        if (hi - lo <= 0.5) continue;
        mine.push({ id: p.id, from: (lo - p.s) / p.widthMm, to: (hi - p.s) / p.widthMm, atMm: lo - a, lenMm: hi - lo });
      }
      strips.set(w.seq, mine);
      wx = b;
    }
  }
  return { strips, errors };
}
