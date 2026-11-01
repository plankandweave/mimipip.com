import "server-only";
import {
  OPENING_EXCLUSION_ENABLED,
  planOpenings,
  openingsForEngine,
  type Door,
  type OpeningsPlan,
} from "./openings";
import { fetchPrintRules } from "./print-rules";

/**
 * Opening exclusion for PARTNER orders — the adapter between the portal's
 * millimetre payload and the canonical algorithm in lib/openings.ts.
 *
 * The algorithm is not re-implemented here and must never be: retail, the
 * partner portal and the print engine's plan_openings() all have to agree on
 * which marks qualify and where seams land, or billed area and printed area
 * drift apart. This file only parses, validates, converts mm → cm and hands
 * off.
 *
 * The portal talks in mm everywhere (wall size, band spans), so openings do
 * too. lib/openings.ts is centimetres, floor-anchored, measured from the run's
 * left edge — the conversion happens once, here.
 */

export { parseOpenings, openingQualifies, type OpeningInput, type ParseResult } from "./openings-input";

export type WallOpenings = {
  /** The plan, or null when nothing was marked / the rollout gate is closed. */
  plan: OpeningsPlan | null;
  /** Chargeable sq ft, or null to mean "bill the plain rectangle". */
  chargeableSqft: number | null;
  /** What to persist in corporate_orders.openings — null when there is nothing. */
  snapshot: unknown | null;
  /** The engine wire shape for the OS payload (empty when nothing qualified). */
  engineOpenings: { xMm: number; yMm: number; widthMm: number; heightMm: number }[];
  excludedSqft: number;
};

const NONE: WallOpenings = {
  plan: null, chargeableSqft: null, snapshot: null, engineOpenings: [], excludedSqft: 0,
};

/**
 * Plan one partner wall. Panel rules come from the OS (lib/print-rules.ts) so
 * partner seams match what the machine will actually do, and the values used
 * are snapshotted into the order — a rule change next month must not rewrite
 * last month's invoice.
 *
 * Returns NONE when the rollout gate is closed. That gate is deliberate and
 * load-bearing: billing a reduced area while the engine still prints full
 * rectangles would give the film away, so until NEXT_PUBLIC_OPENINGS_EXCLUSION
 * and the OS's ZYVORAH_ENGINE_OPENINGS are both on, marks stay planning
 * overlays exactly as they were on retail.
 */
export async function planWallOpenings(
  wallWidthMm: number,
  wallHeightMm: number,
  doors: Door[],
): Promise<WallOpenings> {
  if (!OPENING_EXCLUSION_ENABLED || doors.length === 0) return NONE;

  const rules = await fetchPrintRules();
  const plan = planOpenings({
    runWidthCm: wallWidthMm / 10,
    wallHeightCm: wallHeightMm / 10,
    doors,
    panelCm: rules.maxPanelCm,
    overlapCm: rules.overlapCm,
  });

  // Nothing qualified (every mark too small) — the wall bills and prints whole,
  // and the marks are worth keeping only as the survey record they are.
  if (plan.qualifyingDoors.length === 0 || plan.excludedSqft <= 0) {
    return {
      ...NONE,
      snapshot: {
        doors,
        plan: {
          qualifyingDoors: [],
          disqualifiedDoors: plan.disqualifiedDoors,
          excludedSqft: 0,
          chargeableSqft: plan.chargeableSqft,
          rulesPanelCm: plan.rulesPanelCm,
          rulesOverlapCm: plan.rulesOverlapCm,
        },
      },
    };
  }

  return {
    plan,
    chargeableSqft: plan.chargeableSqft,
    excludedSqft: plan.excludedSqft,
    snapshot: {
      doors,
      plan: {
        qualifyingDoors: plan.qualifyingDoors,
        disqualifiedDoors: plan.disqualifiedDoors,
        panels: plan.panels.map((p) => ({
          widthCm: Math.round(p.widthCm * 100) / 100,
          printHeightCm: Math.round(p.printHeightCm * 100) / 100,
        })),
        excludedSqft: plan.excludedSqft,
        chargeableSqft: plan.chargeableSqft,
        rulesPanelCm: plan.rulesPanelCm,
        rulesOverlapCm: plan.rulesOverlapCm,
      },
    },
    // Reuse the canonical mapper rather than inlining a third copy of the mm
    // conversion (retail's os-sync.ts already inlines a second one).
    engineOpenings: openingsForEngine(plan, doors),
  };
}

/**
 * Rebuild the engine payload from a PERSISTED snapshot
 * (corporate_orders.openings), for the pushes that happen after order time —
 * a payment-first partner freezing a draft, or the desk retrying a failed
 * push.
 *
 * Re-planning here would be a bug, not a convenience: the partner was billed
 * against the plan stored at order time, and the OS panel rules may have moved
 * since. This reads that snapshot and nothing else — the same discipline
 * os-sync.ts applies to retail's crop_data.openingsPlan.
 */
export function engineOpeningsFromStored(raw: unknown): {
  openings: { xMm: number; yMm: number; widthMm: number; heightMm: number }[];
  excludedSqft: number | null;
  chargeableSqft: number | null;
} {
  const empty = { openings: [], excludedSqft: null, chargeableSqft: null };
  if (!raw || typeof raw !== "object") return empty;
  const s = raw as {
    doors?: unknown;
    plan?: { qualifyingDoors?: unknown; excludedSqft?: unknown; chargeableSqft?: unknown };
  };
  const doors = Array.isArray(s.doors) ? (s.doors as Door[]) : null;
  const qualifying = Array.isArray(s.plan?.qualifyingDoors) ? (s.plan!.qualifyingDoors as number[]) : null;
  const excludedSqft = Number(s.plan?.excludedSqft);
  if (!doors || !qualifying?.length || !(excludedSqft > 0)) return empty;

  const openings = openingsForEngine({ qualifyingDoors: qualifying }, doors);
  if (!openings.length) return empty;
  const chargeableSqft = Number(s.plan?.chargeableSqft);
  return {
    openings,
    excludedSqft,
    chargeableSqft: Number.isFinite(chargeableSqft) ? chargeableSqft : null,
  };
}
