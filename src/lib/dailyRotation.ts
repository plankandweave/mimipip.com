// Deterministic daily reshuffle of the homepage — no cron job, no stored
// state, nothing that can fail silently or serve stale data. The picks are a
// pure function of "today" (anchored to 5:00 AM IST, not midnight), so every
// request already sees the day's look, and it flips the instant 5 AM IST
// arrives for every visitor, everywhere, with zero moving parts.

const IST_OFFSET_MIN = 5 * 60 + 30;

/** The logical "showcase day" — flips at 5:00 AM IST, not midnight. */
export function logicalDayKey(now: Date = new Date()): string {
  const istMs = now.getTime() + IST_OFFSET_MIN * 60_000;
  const ist = new Date(istMs);
  // Treat the day as starting at 5 AM: anything before 05:00 IST still
  // belongs to the previous logical day.
  if (ist.getUTCHours() < 5) ist.setUTCDate(ist.getUTCDate() - 1);
  return ist.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * The logical showcase day as an integer (days since epoch, 5 AM IST anchored)
 * — for round-robin rotations that must actually ADVANCE every day. A seeded
 * shuffle can hand back the same winner several days running; `% n` on this
 * cannot.
 */
export function logicalDayIndex(now: Date = new Date()): number {
  return Math.floor(Date.parse(`${logicalDayKey(now)}T00:00:00Z`) / 86_400_000);
}

function hashSeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle seeded by `seedKey` — same key always yields the same order. */
export function seededShuffle<T>(arr: T[], seedKey: string): T[] {
  const rand = mulberry32(hashSeed(seedKey));
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Existing brand pastels only (see zyvorah-brand-and-design) — never invent a
// new colour for a rotating UI element.
export const TILE_PALETTE = ["bg-blush", "bg-sky", "bg-sage", "bg-peach", "bg-lavender"];

/**
 * The window of `size` items from `arr` for turn number `turn`, advancing a
 * whole window per turn rather than sliding by one — consecutive turns share
 * as little as the list allows, instead of showing three of yesterday's four.
 *
 * The window wraps, so a list that isn't a whole number of windows long still
 * cycles through every item (6 items, window of 4: 0-3, 4-5-0-1, 2-5, back to
 * 0-3). Items are never repeated WITHIN a window; a list shorter than `size`
 * is returned whole, in order.
 *
 * `turn` must count the TURNS OF THE SURFACE ITSELF, not calendar days, for
 * anything shown only every Nth day (a rotating spotlight's contents, say).
 * Pass a day index for such a surface and it is confined to one residue class
 * mod N, where `turn * size mod arr.length` is CONSTANT whenever N * size
 * shares a factor with the list length — the rotation silently freezes on one
 * window and the rest of the list becomes unreachable. That is not
 * hypothetical: three signature collections, six picks each and a window of
 * four pinned every collection to a fixed four. Pinned by
 * `signature-rotation.test.ts`.
 */
export function turnWindow<T>(arr: T[], size: number, turn: number): T[] {
  if (arr.length <= size) return [...arr];
  const start = ((turn * size) % arr.length + arr.length) % arr.length;
  return Array.from({ length: size }, (_, i) => arr[(start + i) % arr.length]);
}
