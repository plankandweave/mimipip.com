/**
 * The wall a made-to-measure design starts at, before the customer measures.
 *
 * WHY THIS IS ITS OWN FILE
 *   It used to be a `: 10` at the end of a ternary inside ProductConfigurator,
 *   and it decides the first price a shopper ever sees. On 27 Sep 2026 that
 *   first price was ₹10,124 — the artwork's own proportions at full height —
 *   against a headline of ₹200 per sq ft, and 97.7% of people who opened a
 *   design never touched the builder (3,483 product views, 81 configuration
 *   starts in 30 days). A number that decides that much belongs somewhere it
 *   can be seen, reasoned about and tested.
 *
 * WHY 4.5 × 4.5
 *   Wallpaper bills at a 20 sq ft minimum and a 4 ft minimum print width
 *   (MIN_WALLPAPER_SQFT / MIN_PRINT_WIDTH_FT — Roheena, 13 Aug 2026), so
 *   ₹4,000 is the floor price of ANY wallpaper order. 4.5 × 4.5 is 20.25 sq ft:
 *   the smallest honest opening number there is.
 *
 *   It has to clear 4 ft wide. A narrower default — 2 × 3, say — does NOT
 *   price lower: billedSqFt() adds the phantom strip a sub-4-ft width still
 *   consumes on the roll and then floors the result at 20 sq ft, so 2 × 3
 *   bills ₹4,000 too. All it changes is that the page then shows 6 sq ft of
 *   wall for ₹4,000 — ₹667 per sq ft under a ₹200 per sq ft headline, which
 *   reads as a mistake or a swindle. Any future change here must keep the
 *   default at or above 4 ft wide and 20 sq ft, or the arithmetic on screen
 *   stops agreeing with itself. The test pins exactly that.
 */

/** Feet. Clears the 4 ft print-width floor; 20.25 sq ft clears the 20 sq ft one. */
export const DEFAULT_WALL_FT = 4.5;

export type WallStart = { w: number; h: number };

/**
 * Decide the opening wall, in feet.
 *
 * Priority, highest first:
 *   1. a ready-size ladder selection (inches) — a fixed-size piece IS its size
 *   2. an explicitly advertised size from a Shopping/Meta deep link
 *      (?w=&h=, see the merchant feed) — the ad promised a configuration and
 *      the page must arrive on it
 *   3. the default above
 */
export function initialWallFt(
  startReady: [number, number] | null | undefined,
  initialWidthFt?: number,
  initialHeightFt?: number,
): WallStart {
  if (startReady) return { w: startReady[0] / 12, h: startReady[1] / 12 };
  const w = initialWidthFt && initialWidthFt > 0 ? initialWidthFt : DEFAULT_WALL_FT;
  const h = initialHeightFt && initialHeightFt > 0 ? initialHeightFt : DEFAULT_WALL_FT;
  return { w, h };
}
