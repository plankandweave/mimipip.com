import type { ProductCardData } from "@/lib/types";
import type { VarietyTracker } from "@/lib/homepage-variety";
import { BAND_FRAME_ASPECT, fitsFrame } from "@/lib/image-orientation";
import { showsRoom } from "@/lib/rooms";
import { heldOutOfRoom } from "@/lib/room-suitability";

/**
 * TRENDING PINS — the two designs the shop is pinning to the top of the
 * homepage and the wallpaper listings, each with a one-tap "Configure now"
 * that lands the shopper inside the wall builder rather than on the product
 * page's gallery.
 *
 * WHY. In the week to 5 October 2026 the 14-day intelligence data showed
 * exactly two designs with REPEAT cart activity (three carts and three cart
 * adds each) and no order yet: Wildflower Reverie (97 views, 6 configuration
 * starts) and Flamingo Palm Lake (30 views, 3 configuration starts). That is
 * warm interest sitting one long click from checkout, and shortening that
 * click is the cheapest conversion lever the shop has. Both are standard-tier
 * mural wallpapers on Soft Matte at the catalogue floor rate — the
 * pin changes where they sit, never what they cost.
 *
 * HOW IT STAYS HONEST.
 *  - The row is a product row, so it draws through the homepage variety
 *    tracker like every other (AGENTS.md homepage rule 1): a pinned design
 *    claims its handle right after the Signature spotlight and before the
 *    hero, and a pin another row already holds is skipped, never shown twice.
 *  - A pin shows a RENDER or nothing (rule 9), and its 4:3 frame asks
 *    `fitsFrame` before it crops (rule 7), the same gate the made-to-measure
 *    band uses — so a vertical or unmeasured picture drops the pin rather
 *    than showing a slice of it.
 *  - On a collection page the pins appear only where the design genuinely
 *    belongs (`trendingInScope`), only on page one, and on a ROOM listing only
 *    with that room's render (room rule 1) — a pin is a shortcut, not an
 *    exception to what the page promises.
 *  - Each pin records the evidence it was made on. A pin is a merchandising
 *    decision with a date; review it when the weekly intelligence changes,
 *    and remove it when the design has had its turn.
 *
 * Changing the pins is a code edit on purpose: the row is the most valuable
 * pixels on the site, and the two entries below are read by a person before
 * they ship. Make it a table the day the pins change weekly.
 */

export type TrendingPin = {
  handle: string;
  /** The day the pin went up, so a stale pin is visible as such. */
  since: string;
  /** What justified it — the numbers, from the intelligence data. */
  evidence: string;
};

export const TRENDING_PINS: readonly TrendingPin[] = [
  {
    handle: "wildflower-reverie",
    since: "2026-10-05",
    evidence: "97 views, 6 configuration starts, 3 carts and 3 cart adds in the week to 5 Oct 2026",
  },
  {
    handle: "la-00026",
    since: "2026-10-05",
    evidence: "30 views, 3 configuration starts, 3 carts and 3 cart adds in the week to 5 Oct 2026",
  },
];

/** The finish the pins quote and pre-select — Soft Matte, at each design's own
 *  rate for it (read from the catalogue, never typed here). */
export const TRENDING_MATERIAL_SLUG = "smooth-matt";

/** How many pins the row carries at most. Two is a spotlight; four is a grid,
 *  and the homepage already has those. */
export const TRENDING_ROW_SIZE = 2;

/** The pin card's picture frame — landscape 4:3, the made-to-measure band's
 *  shape, so the same `fitsFrame` arithmetic protects it. */
export const TRENDING_FRAME_ASPECT = BAND_FRAME_ASPECT;

/** A card plus the pinned finish on this design, when the design offers it. */
export type TrendingCard = ProductCardData & {
  pinMaterial: { slug: string; name: string; rate: number } | null;
};

export const TRENDING_HANDLES: readonly string[] = TRENDING_PINS.map((p) => p.handle);

/**
 * The one-tap link: the product page, opened straight into the wall builder
 * (`?configure=1`, read by src/app/products/[handle]/page.tsx) with the pinned
 * finish pre-selected (`?material=`, the same parameter Shopping deep links
 * already use). A design that does not offer the finish still gets the one
 * tap — the builder then opens on its own cheapest live finish.
 */
export function configureHref(handle: string, materialSlug?: string | null): string {
  const qs = new URLSearchParams();
  if (materialSlug) qs.set("material", materialSlug);
  qs.set("configure", "1");
  return `/products/${encodeURIComponent(handle)}?${qs.toString()}`;
}

/** A pin shows a room render or nothing — homepage rule 9, and on a room
 *  listing the render must be of THAT room (room rule 1). */
function rendered(card: ProductCardData): boolean {
  return !!card.image && !card.imageIsFlat;
}

/**
 * Does this design belong to the listing a collection page shows? Mirrors
 * `collection_page_v2`: the category scope must match when set, and the base
 * tags match on ANY tag (a collection built on several tags is their union).
 * No scope at all selects nothing — the page itself 404s in that case.
 */
export function trendingInScope(
  card: Pick<ProductCardData, "category" | "tags">,
  scope: { tags: string[] | null; category: string | null },
): boolean {
  if (!scope.tags && !scope.category) return false;
  if (scope.category && card.category !== scope.category) return false;
  if (scope.tags && scope.tags.length) {
    const tags = new Set(card.tags ?? []);
    if (!scope.tags.some((t) => tags.has(t))) return false;
  }
  return true;
}

/**
 * The homepage row. Claims each pin through the variety tracker so no later
 * row can show it again, and skips a pin an earlier claimant (the Signature
 * spotlight) already holds. Rendered only; frame-gated; pin order kept.
 */
export function trendingForHomepage(cards: TrendingCard[], variety: VarietyTracker): TrendingCard[] {
  const out: TrendingCard[] = [];
  for (const card of cards) {
    if (out.length >= TRENDING_ROW_SIZE) break;
    if (!rendered(card)) continue;
    if (variety.designUsed(card.handle)) continue;
    if (!fitsFrame(card, TRENDING_FRAME_ASPECT)) continue;
    out.push(variety.claimDesign(card));
  }
  return out;
}

/**
 * The collection-page row: page one only, designs that belong to this
 * listing, shown in a render — and on a room page, in that room, never held
 * out of it (src/lib/room-suitability.ts).
 */
export function trendingForCollection(
  cards: TrendingCard[],
  scope: { tags: string[] | null; category: string | null },
  opts: { page: number; kind: string; roomKey?: string },
): TrendingCard[] {
  if (opts.page !== 1) return [];
  const out: TrendingCard[] = [];
  for (const card of cards) {
    if (out.length >= TRENDING_ROW_SIZE) break;
    if (!rendered(card)) continue;
    if (!trendingInScope(card, scope)) continue;
    if (!fitsFrame(card, TRENDING_FRAME_ASPECT)) continue;
    if (opts.kind === "room") {
      if (!opts.roomKey) continue;
      if (heldOutOfRoom(card.handle, opts.roomKey)) continue;
      if (!showsRoom(card, opts.roomKey)) continue;
    }
    out.push(card);
  }
  return out;
}
