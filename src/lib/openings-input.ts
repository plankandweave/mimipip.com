import {
  isFloorAnchored,
  QUALIFY_MIN_WIDTH_CM,
  QUALIFY_MIN_HEIGHT_FRAC,
  type Door,
} from "./openings";

/**
 * The partner portal's opening payload → the canonical Door geometry. Pure
 * parsing and validation, kept out of corporate-openings.ts (which is
 * server-only for the OS print rules it fetches) so it can be unit-tested.
 */

/** One opening as the browser sends it. `offsetMm` is always from the wall's
 *  LEFT edge (a "from the right" entry is converted in the form before it is
 *  sent); `sillMm` is the height of the opening's bottom edge above the floor
 *  — absent or 0 for a door, above 0 for a window. A window is drawn and
 *  recorded for the installer but never comes off the print or the bill:
 *  the engine prints one strip above an opening, never one below. */
export type OpeningInput = { widthMm: number; heightMm: number; offsetMm: number; sillMm?: number };

/** More than this on one wall is a survey error, not a wall. */
const MAX_OPENINGS_PER_WALL = 12;
/** mm slack for a partner typing a flush opening as 3000 on a 2999 wall. */
const FIT_TOLERANCE_MM = 2;

export type ParseResult =
  | { ok: true; doors: Door[] }
  | { ok: false; error: string };

/**
 * Validate the client's openings against the wall they belong to. Rejects
 * rather than silently clamping: an opening that doesn't fit means the survey
 * is wrong, and quietly shrinking it would print a wall nobody measured.
 */
export function parseOpenings(raw: unknown, wallWidthMm: number, wallHeightMm: number): ParseResult {
  if (raw == null) return { ok: true, doors: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "openings must be a list" };
  if (raw.length === 0) return { ok: true, doors: [] };
  if (raw.length > MAX_OPENINGS_PER_WALL) {
    return { ok: false, error: `at most ${MAX_OPENINGS_PER_WALL} openings per wall` };
  }

  const doors: Door[] = [];
  for (let i = 0; i < raw.length; i++) {
    const o = raw[i] as Record<string, unknown>;
    const w = Number(o?.widthMm);
    const h = Number(o?.heightMm);
    const x = Number(o?.offsetMm);
    const sill = o?.sillMm == null ? 0 : Number(o.sillMm);
    const n = i + 1;
    if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(x) || !Number.isFinite(sill)) {
      return { ok: false, error: `opening ${n} has a non-numeric measurement` };
    }
    if (w <= 0 || h <= 0) return { ok: false, error: `opening ${n} must have a width and a height` };
    if (x < 0) return { ok: false, error: `opening ${n} cannot start left of the wall` };
    if (sill < 0) return { ok: false, error: `opening ${n} cannot sit below the floor` };
    if (x + w > wallWidthMm + FIT_TOLERANCE_MM) {
      return { ok: false, error: `opening ${n} runs past the wall's right edge` };
    }
    if (sill + h > wallHeightMm + FIT_TOLERANCE_MM) {
      return { ok: false, error: sill > 0 ? `opening ${n} reaches above the top of the wall` : `opening ${n} is taller than the wall` };
    }
    doors.push({ widthCm: w / 10, heightCm: h / 10, offsetCm: x / 10, ...(sill > 0 ? { sillCm: sill / 10 } : {}) });
  }
  return { ok: true, doors };
}

/** Would this opening qualify for exclusion on this wall? The UI needs the
 *  same test the plan applies, so a partner is told BEFORE submitting that a
 *  small niche will print through. Mirrors planOpenings step 1 exactly. */
export function openingQualifies(door: Door, wallHeightCm: number): boolean {
  return (
    isFloorAnchored(door) &&
    door.widthCm >= QUALIFY_MIN_WIDTH_CM &&
    door.heightCm >= QUALIFY_MIN_HEIGHT_FRAC * wallHeightCm
  );
}
