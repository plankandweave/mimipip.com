// Printable size bounds for a partner order — pure constants + one pure check.
//
// These lived in corporate-auth.ts, but that module is session machinery
// (next/headers, service-role client) and the media container bundles
// corporate-band-compose, which only ever needed MAX_RUN_MM. Pure limits live
// here; corporate-auth re-exports them so its callers are unchanged.

/**
 * LENGTH and HEIGHT are bounded differently on purpose: height keeps the 15 m
 * sanity bound — nothing we print is taller — and a single CREATIVE may run to
 * one roll's USABLE length. A band longer than that still splits into equal
 * pieces, one order line each (see /api/corporate/band), up to MAX_BAND_MM.
 */
// 38 m, not 39 (Roheena 2026-07-30): a 40 m roll loses ~1.5-2 m to loading —
// the core wrap and holding the web down — before the first printable
// centimetre. That loss is accepted as waste; the cap plans around it.
export const MAX_RUN_MM = 38_000;    // usable length of a 40 m roll
export const MAX_BAND_MM = 76_000;   // two full-roll pieces at most
export const MAX_HEIGHT_MM = 15_000; // 15 m
export const MIN_SIDE_MM = 100;

/** Null when the size is printable, else the reason it is not. */
export function sizeRejection(widthMm: number, heightMm: number): string | null {
  if (widthMm < MIN_SIDE_MM || heightMm < MIN_SIDE_MM) return "size must be at least 100 mm on each side";
  if (heightMm > MAX_HEIGHT_MM) return `height must be ${MAX_HEIGHT_MM / 1000} m or less`;
  if (widthMm > MAX_RUN_MM) return `length must be ${MAX_RUN_MM / 1000} m or less`;
  return null;
}


/** Split a run `total` wide into `n` equal, gap-free, non-overlapping slices —
 *  the ONE partition the band composer uses both to lay designs into panels and
 *  to cut the composite into roll pieces. Rounded so each slice's `left` meets
 *  the previous slice's right exactly: no seam gap, no overlap, and the widths
 *  sum back to `total` (partner billing rides on the mm partition). */
export function equalSlices(total: number, n: number): { left: number; width: number }[] {
  const out: { left: number; width: number }[] = [];
  for (let i = 0; i < n; i++) {
    const left = Math.round((total * i) / n);
    const right = Math.round((total * (i + 1)) / n);
    out.push({ left, width: right - left });
  }
  return out;
}
