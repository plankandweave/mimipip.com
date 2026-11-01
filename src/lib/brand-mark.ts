import { brand } from "../brand/current";
// The Zyvorah app mark: a rounded square whose colour rotates every week, a
// WHITE "Z", and a BLUE dot (the brand's accent). Blue is never used as the
// square's background. This is the single source of truth for the favicon,
// the PWA/home-screen icons and the apple-touch icon.

/** Weekly background palette — vivid, varied, all high-contrast with a white
 *  Z, and deliberately NO blues (blue is reserved for the dot). */
export const MARK_COLORS = [brand.theme.background] as const;

export const MARK_DOT = brand.theme.accent; // brand blue — the dot stays this, always
export const MARK_Z = brand.theme.foreground; // the Z stays white, always

/** The background colour for a given date's ISO-ish week (UTC weeks since epoch),
 *  so every visitor sees the same colour in the same week and it advances on a
 *  7-day cadence. */
export function weeklyMarkColor(now: Date = new Date()): string {
  const week = Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));
  return MARK_COLORS[((week % MARK_COLORS.length) + MARK_COLORS.length) % MARK_COLORS.length];
}

// A missing approved icon is represented by a neutral empty tile, never another brand's mark.
export function brandMarkSvg(bg: string = weeklyMarkColor()): string {
  if (brand.iconSvg) return brand.iconSvg;
  const safe = /^#[0-9a-fA-F]{6}$/.test(bg) ? bg : '#FFFFFF';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" rx="22" fill="${safe}"/></svg>`;
}
