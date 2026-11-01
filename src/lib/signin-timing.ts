export const SIGN_IN_DWELL_MS = 30_000;

/** Discard corrupt storage; never let a page-count shortcut bypass the timer. */
export function readBrowseTime(value: string | null): number {
  const elapsed = Number(value);
  return Number.isFinite(elapsed) && elapsed > 0 ? Math.min(elapsed, SIGN_IN_DWELL_MS) : 0;
}
