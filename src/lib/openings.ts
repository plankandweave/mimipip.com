/**
 * Large-opening exclusion (Roheena 2026-08-02): doors and full-height furniture
 * the customer marks are neither PRINTED nor BILLED. Panel seams pin to each
 * qualifying opening's edges, the panel over it prints only the strip above
 * (plus a small trim allowance), and a full-height opening's panel is skipped
 * entirely. The customer pays for exactly what prints.
 *
 * CANONICAL ALGORITHM — the print engine implements the SAME rules in
 * plan_openings() (print-platform/mimaki-app/backend/main.py). Change the
 * constants or the geometry in lockstep or billed area and printed area drift
 * apart. Qualification (which marks are big enough) lives ONLY here — the
 * engine trusts every opening it receives.
 */
import { pieceCount, type CropData } from "./visualizer";
import { areaSqFt } from "./pricing";

/**
 * ROLLOUT GATE. The website must not bill reduced areas until the WHOLE chain
 * honours openings — OS web-order schema deployed AND print engine deployed
 * AND ZYVORAH_ENGINE_OPENINGS=1 set on the OS. An older OS would silently
 * strip the unknown `openings` field and print the full wall the customer
 * did not pay for. Set NEXT_PUBLIC_OPENINGS_EXCLUSION=1 on Vercel (and
 * redeploy) only after those two are live; until then doors stay what they
 * always were — planning overlays.
 */
export const OPENING_EXCLUSION_ENABLED = process.env.NEXT_PUBLIC_OPENINGS_EXCLUSION === "1";

/** A mark must be at least this wide to qualify — switchboards and small
 *  niches stay planning overlays and print through, as before. */
export const QUALIFY_MIN_WIDTH_CM = 60;
/** …and at least this fraction of the wall's height (a door, a wardrobe —
 *  not a sideboard). */
export const QUALIFY_MIN_HEIGHT_FRAC = 0.7;
/** Opening within this of full wall height → its panel is skipped outright. */
export const FULL_HEIGHT_EPS_CM = 2.0;
/** The short strip prints to this far below the opening's top edge — trim
 *  allowance so the installer tucks the edge, pattern matched. */
export const TRIM_ABOVE_OPENING_CM = 5.0;
/** A segment (exposed sliver or opening) thinner than this is unprintable —
 *  the opening causing it is disqualified and prints full. */
export const MIN_SEGMENT_CM = 8.0;
/** Float / mm-roundtrip tolerance. */
export const GEOM_EPS_CM = 0.05;

export type Door = NonNullable<CropData["doors"]>[number];

/** A door sits on the floor; a window's sill lifts it clear of it. Only a
 *  floor-anchored opening can come off the print and the bill. */
export function isFloorAnchored(d: Pick<Door, "sillCm">): boolean {
  return (d.sillCm ?? 0) <= GEOM_EPS_CM;
}

export type OpeningPanel = {
  widthCm: number;
  /** Height that PRINTS, measured from the wall top (the strip above a door).
   *  Equals the wall height for a normal panel; 0 when the panel is skipped. */
  printHeightCm: number;
  skipped: boolean;
  /** True when this panel sits over a qualifying opening (short or skipped). */
  opening: boolean;
};

export type OpeningsPlan = {
  /** Left→right, matching production seams (openings pin them). */
  panels: OpeningPanel[];
  /** Cumulative boundaries in cm, panels.length + 1 entries, [0 … runWidth]. */
  boundsCm: number[];
  /** Indices into the doors[] array that qualified and took effect. */
  qualifyingDoors: number[];
  /** Doors big enough to qualify but disqualified by a sliver segment —
   *  they print full; the UI owes the customer an honest message. */
  disqualifiedDoors: number[];
  /** Wall area that will NOT print (skipped panels + hidden part below each
   *  short strip) — exactly what comes off the bill. */
  excludedSqft: number;
  /** areaSqFt(run, height) − excludedSqft: what the customer pays for. */
  chargeableSqft: number;
  /** Saved sq ft attributed per qualifying door index (for "you save ₹X"). */
  perDoorSavedSqft: Record<number, number>;
  /** The rule inputs the plan was computed with — snapshotted into crop_data
   *  so downstream documents render bill-time truth even if rules move. */
  rulesPanelCm: number;
  rulesOverlapCm: number;
};

type Span = { left: number; right: number; heightCm: number; doorIdxs: number[] };

/**
 * Compute the opening-aware panel layout + billing for a wall run. Call it
 * unconditionally: with no doors (or none qualifying) it returns the plain
 * equal-division layout with zero exclusions.
 */
export function planOpenings(args: {
  runWidthCm: number;
  wallHeightCm: number;
  doors?: Door[] | null;
  panelCm: number;
  overlapCm: number;
}): OpeningsPlan {
  const { runWidthCm, wallHeightCm, panelCm, overlapCm } = args;
  const doors = args.doors ?? [];

  // 1. Qualify by size — width ≥ 60 cm AND height ≥ 70% of the wall — and
  //    by sitting on the floor. A window (sill above the floor) never
  //    qualifies: the engine's plan_openings prints one strip ABOVE an opening
  //    and a window would need paper below it too, so it is drawn for the
  //    installer and prints through in full.
  const spans: Span[] = [];
  for (let i = 0; i < doors.length; i++) {
    const d = doors[i];
    const left = Math.max(0, Math.min(d.offsetCm, runWidthCm));
    const right = Math.max(0, Math.min(d.offsetCm + d.widthCm, runWidthCm));
    const qualifies =
      isFloorAnchored(d) &&
      right - left + GEOM_EPS_CM >= QUALIFY_MIN_WIDTH_CM &&
      d.heightCm + GEOM_EPS_CM >= QUALIFY_MIN_HEIGHT_FRAC * wallHeightCm;
    if (!qualifies || right - left <= GEOM_EPS_CM) continue;
    spans.push({ left, right, heightCm: Math.min(d.heightCm, wallHeightCm), doorIdxs: [i] });
  }

  // 2. Merge overlapping/adjacent spans; a merged span shortens to the
  //    SHALLOWEST member (printing more is the safe direction).
  spans.sort((a, b) => a.left - b.left || a.right - b.right);
  const merged: Span[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.left <= last.right + GEOM_EPS_CM) {
      last.right = Math.max(last.right, s.right);
      last.heightCm = Math.min(last.heightCm, s.heightCm);
      last.doorIdxs.push(...s.doorIdxs);
    } else {
      merged.push({ ...s, doorIdxs: [...s.doorIdxs] });
    }
  }

  // 3. Drop (left-to-right, repeat until clean) any span leaving a sliver —
  //    same deterministic order as the engine. Zero gap (flush) is fine.
  const disqualifiedDoors: number[] = [];
  let changed = true;
  while (changed && merged.length) {
    changed = false;
    for (let i = 0; i < merged.length; i++) {
      const prevR = i > 0 ? merged[i - 1].right : 0;
      const nextL = i + 1 < merged.length ? merged[i + 1].left : runWidthCm;
      const s = merged[i];
      const sliver = MIN_SEGMENT_CM - GEOM_EPS_CM;
      const leftGap = s.left - prevR;
      const rightGap = nextL - s.right;
      if (
        (leftGap > GEOM_EPS_CM && leftGap < sliver) ||
        (rightGap > GEOM_EPS_CM && rightGap < sliver) ||
        s.right - s.left < sliver
      ) {
        disqualifiedDoors.push(...s.doorIdxs);
        merged.splice(i, 1);
        changed = true;
        break;
      }
    }
  }

  // 4. Alternating exposed/opening segments, each panelized independently with
  //    the SAME pieceCount the plain layout uses.
  type Seg = { left: number; right: number; span: Span | null };
  const segs: Seg[] = [];
  let cursor = 0;
  for (const s of merged) {
    if (s.left - cursor > GEOM_EPS_CM) segs.push({ left: cursor, right: s.left, span: null });
    segs.push({ left: s.left, right: s.right, span: s });
    cursor = s.right;
  }
  if (runWidthCm - cursor > GEOM_EPS_CM) segs.push({ left: cursor, right: runWidthCm, span: null });
  if (!segs.length) segs.push({ left: 0, right: runWidthCm, span: null });

  const boundsCm: number[] = [0];
  const panels: OpeningPanel[] = [];
  const perDoorSavedSqft: Record<number, number> = {};
  let savedCm2 = 0;
  for (const seg of segs) {
    const segW = seg.right - seg.left;
    const n = pieceCount(segW, panelCm, overlapCm);
    for (let j = 1; j <= n; j++) {
      boundsCm.push(seg.left + (segW * j) / n);
      const w = segW / n;
      if (!seg.span) {
        panels.push({ widthCm: w, printHeightCm: wallHeightCm, skipped: false, opening: false });
        continue;
      }
      const skip = seg.span.heightCm + FULL_HEIGHT_EPS_CM >= wallHeightCm;
      const printH = skip
        ? 0
        : Math.min(wallHeightCm, wallHeightCm - seg.span.heightCm + TRIM_ABOVE_OPENING_CM);
      panels.push({ widthCm: w, printHeightCm: printH, skipped: skip, opening: true });
      const saved = w * (wallHeightCm - printH);
      savedCm2 += saved;
      // Attribute the saving to the span's first door — enough for the UI's
      // per-door "you save ₹X" line even when spans merged.
      const attr = seg.span.doorIdxs[0];
      perDoorSavedSqft[attr] = (perDoorSavedSqft[attr] ?? 0) + saved / (30.48 * 30.48);
    }
  }
  boundsCm[boundsCm.length - 1] = runWidthCm;

  const excludedSqft = Math.round((savedCm2 / (30.48 * 30.48)) * 1000) / 1000;
  const fullSqft = areaSqFt(runWidthCm, wallHeightCm);
  for (const k of Object.keys(perDoorSavedSqft)) {
    perDoorSavedSqft[Number(k)] = Math.round(perDoorSavedSqft[Number(k)] * 1000) / 1000;
  }
  return {
    panels,
    boundsCm,
    qualifyingDoors: merged.flatMap((s) => s.doorIdxs),
    disqualifiedDoors,
    excludedSqft,
    chargeableSqft: Math.max(0, Math.round((fullSqft - excludedSqft) * 1000) / 1000),
    perDoorSavedSqft,
    rulesPanelCm: panelCm,
    rulesOverlapCm: overlapCm,
  };
}

/** The snapshot persisted in crop_data — bill-time truth for downstream
 *  documents (order-copy PDF, invoices), never re-derived from live rules. */
export function openingsSnapshot(plan: OpeningsPlan): NonNullable<CropData["openingsPlan"]> {
  return {
    rulesPanelCm: plan.rulesPanelCm,
    rulesOverlapCm: plan.rulesOverlapCm,
    qualifyingDoors: plan.qualifyingDoors,
    panels: plan.panels.map((p) => ({
      widthCm: Math.round(p.widthCm * 100) / 100,
      printHeightCm: Math.round(p.printHeightCm * 100) / 100,
    })),
    excludedSqft: plan.excludedSqft,
    chargeableSqft: plan.chargeableSqft,
  };
}

/** Qualifying openings in the OS web-order wire shape: mm integers, run
 *  coordinates from the left edge, floor-anchored (yMm 0 — a window never
 *  qualifies, so none reaches the engine). */
export function openingsForEngine(
  plan: Pick<OpeningsPlan, "qualifyingDoors">,
  doors: Door[] | null | undefined,
): { xMm: number; yMm: number; widthMm: number; heightMm: number }[] {
  return plan.qualifyingDoors
    .map((i) => doors?.[i])
    .filter((d): d is Door => !!d)
    .map((d) => ({
      xMm: Math.round(d.offsetCm * 10),
      yMm: 0,
      widthMm: Math.round(d.widthCm * 10),
      heightMm: Math.round(d.heightCm * 10),
    }));
}

/** Customer-facing arrangement label, openings-aware — replaces
 *  panelArrangementLabel when a plan has exclusions. */
export function openingsArrangementLabel(plan: OpeningsPlan): string {
  const n = plan.panels.length;
  const printed = plan.panels.filter((p) => !p.skipped).length;
  const short = plan.panels.filter((p) => p.opening && !p.skipped).length;
  const skipped = n - printed;
  const CM_PER_IN = 2.54;
  const widths = plan.panels.map((p) => Math.round(p.widthCm / CM_PER_IN));
  const base =
    n < 2
      ? `1 panel (${widths[0]} in wide, no joins)`
      : `${n} panels of ~${widths.join("/")} in — hang left to right`;
  const notes: string[] = [];
  if (short) notes.push(`${short} print${short === 1 ? "s" : ""} short, stopping above the opening`);
  if (skipped) notes.push(`${skipped} not printed (full-height opening)`);
  return notes.length ? `${base}; ${notes.join("; ")}` : base;
}

/**
 * Bed headboards (2026-10-06). A parent asked for her daughter's wall "but
 * there is a headboard cutting the wall" — so the customer can mark one the
 * way she marks a door. A headboard IS a floor-anchored mark: it rides in the
 * same doors[] list, qualifies (or not) by the same size rules above, and
 * reaches the bill, the order copy and the print engine through the same
 * path. `kind` only names it for the customer and for production; the
 * geometry never branches on it beyond keeping it on the floor and on the wall.
 */
export const HEADBOARD_DEFAULT_WIDTH_CM = 5.5 * 30.48; // a queen/king bed in an Indian home
export const HEADBOARD_DEFAULT_HEIGHT_CM = 3.5 * 30.48;

export function isHeadboard(d: Pick<Door, "kind">): boolean {
  return d.kind === "headboard";
}

/** Keep a headboard on the floor and inside the wall: no sill, width and
 *  height no bigger than the wall, left edge between 0 and run − width. */
export function placeHeadboard(d: Door, runWidthCm: number, wallHeightCm: number): Door {
  const widthCm = Math.max(0, Math.min(d.widthCm, runWidthCm));
  const heightCm = Math.max(0, Math.min(d.heightCm, wallHeightCm));
  const offsetCm = Math.max(0, Math.min(Number.isFinite(d.offsetCm) ? d.offsetCm : 0, runWidthCm - widthCm));
  return { widthCm, heightCm, offsetCm, kind: "headboard" };
}

/** A new headboard at the default size (shrunk to fit a small wall), centred. */
export function newHeadboard(runWidthCm: number, wallHeightCm: number): Door {
  const widthCm = Math.min(HEADBOARD_DEFAULT_WIDTH_CM, runWidthCm);
  return placeHeadboard(
    { widthCm, heightCm: HEADBOARD_DEFAULT_HEIGHT_CM, offsetCm: (runWidthCm - widthCm) / 2, kind: "headboard" },
    runWidthCm,
    wallHeightCm,
  );
}

/** Headboards clamped to the wall they now sit on; every other mark as is.
 *  Applied wherever the marks are read, so a wall made narrower after the
 *  headboard went up never prices or prints a headboard hanging off it. */
export function placeMarks<T extends Door>(doors: T[], runWidthCm: number, wallHeightCm: number): T[] {
  return doors.map((d) => {
    if (!isHeadboard(d)) return d;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { sillCm, ...rest } = d; // a headboard never floats
    return { ...rest, ...placeHeadboard(d, runWidthCm, wallHeightCm) } as T;
  });
}

/** Left edge after dragging by `dxPx` on a preview drawn at `pxPerCm`. */
export function dragOffsetCm(startOffsetCm: number, dxPx: number, pxPerCm: number, widthCm: number, runWidthCm: number): number {
  const moved = pxPerCm > 0 ? startOffsetCm + dxPx / pxPerCm : startOffsetCm;
  return Math.max(0, Math.min(moved, runWidthCm - widthCm));
}
