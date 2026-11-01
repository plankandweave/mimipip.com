// Wall dimensions, converted one way.
//
// A pure module — no DOM, no server machinery — so both capture screens can
// import it and a node:test can cover it. It exists because there are now two
// places a person types a wall size (the measurement link a store employee
// holds, and the portfolio dashboard a building's own team signs into), and two
// copies of this arithmetic is two answers to "how big is that wall".

export const MM_PER_IN = 25.4;
const MM_PER_FT = MM_PER_IN * 12;

export const mmFromFeet = (ft: number, inch: number) =>
  Math.round((ft * 12 + inch) * MM_PER_IN);

/** Millimetres back to feet and inches, with the carry applied.
 *
 *  The carry is not a nicety. 2743 mm is 107.99 inches, which floors to 8 ft and
 *  then ROUNDS to 12 in — so a wall entered as 9 ft reads back as "8′ 12″". The
 *  stored millimetres were right, but the person who had just typed 9 was being
 *  told they had measured something else, on the one screen whose entire job is
 *  to be trusted about numbers. */
export function feetFromMm(mm: number): { ft: number; inch: number } {
  const totalIn = mm / MM_PER_IN;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  if (inch >= 12) { ft += 1; inch = 0; }
  return { ft, inch };
}

/** "9′" / "8′ 6″" — how a size is read back to whoever typed it. */
export function showFeet(mm: number): string {
  const { ft, inch } = feetFromMm(mm);
  return inch ? `${ft}′ ${inch}″` : `${ft}′`;
}

export const sqft = (widthMm: number, heightMm: number) =>
  (widthMm / MM_PER_FT) * (heightMm / MM_PER_FT);

/** A typed number from a field that may contain anything. */
export const num = (v: string): number => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Commercial walls are large — a lobby run is tens of metres and a double-
 *  height atrium is metres tall — so the bounds here are deliberately wide.
 *  The authoritative check stays server-side in wallSizeRejection(); this is
 *  the same rule stated early enough to stop someone typing millimetres into a
 *  feet box and only finding out after they have walked away. */
export const MIN_SIDE_MM = 100;
export const MAX_WALL_WIDTH_MM = 80_000;
export const MAX_WALL_HEIGHT_MM = 6_000;

/**
 * Millimetres from a measurement somebody SPOKE ALOUD, or null.
 *
 * Used when reading a walkthrough: the narration may contain "this one's about
 * ten metres wide", and that is worth keeping as an estimate. Everything else
 * must come back null.
 *
 * Deliberately narrow, and the narrowness is the point. A wall with no size is
 * obviously unfinished and gets measured; a wall carrying a plausible invented
 * size gets quoted, printed and delivered wrong. So an unrecognised unit is
 * null rather than a guess, and anything outside believable architecture is
 * null rather than clamped into range — a "wall" of 2 mm or 400 m is a
 * mis-hearing, and the honest answer to a mis-hearing is nothing at all.
 */
export function spokenSizeToMm(value: unknown, unit: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = String(unit ?? "").trim().toLowerCase();
  const mm =
    u.startsWith("mm") || u.startsWith("millim") ? n
    : u.startsWith("cm") || u.startsWith("centim") ? n * 10
    : u.startsWith("m") ? n * 1000            // metre, metres, m
    : u.startsWith("ft") || u === "f" || u.startsWith("feet") || u.startsWith("foot") ? n * MM_PER_IN * 12
    : u.startsWith("in") ? n * MM_PER_IN
    : null;
  if (mm === null) return null;
  const rounded = Math.round(mm);
  return rounded >= MIN_SIDE_MM && rounded <= MAX_WALL_WIDTH_MM ? rounded : null;
}

/** Null when the size is plausible, else what to tell the person holding the
 *  phone — phrased as something they can act on, standing where they are. */
export function sizeProblem(widthMm: number, heightMm: number): string | null {
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm)) return "Add a width and a height.";
  if (widthMm <= 0 || heightMm <= 0) return "Add a width and a height.";
  if (widthMm < MIN_SIDE_MM || heightMm < MIN_SIDE_MM) {
    return "That is under 100 mm — check whether the units are right.";
  }
  if (heightMm > MAX_WALL_HEIGHT_MM) {
    return `Height must be ${MAX_WALL_HEIGHT_MM / 1000} m or less. For a taller run, split it into two walls.`;
  }
  if (widthMm > MAX_WALL_WIDTH_MM) {
    return `A single wall must be ${MAX_WALL_WIDTH_MM / 1000} m or less — split a longer run into two walls.`;
  }
  return null;
}
