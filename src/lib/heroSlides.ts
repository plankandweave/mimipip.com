import type { HeroCandidate } from "@/lib/heroRotation";
import type { ProductCardData } from "@/lib/types";

/**
 * THREE WALLS INSTEAD OF ONE.
 *
 * The hero used to be a single still. It is now a slider, so the rotation has
 * to hand back three designs a day rather than one — and the homepage rules
 * (AGENTS.md) have to survive that.
 *
 * What changes, honestly stated: the no-repeat cycle in rule 5 is a cycle over
 * every eligible design, and taking three a day empties it three times faster.
 * At today's catalogue that is roughly three and a half months between two
 * showings of the same wall instead of roughly ten. Still no repeat WITHIN a
 * cycle, which is the promise rule 5 actually makes — but the promise is now
 * worth a third of what it was, and that was a deliberate trade for a shop
 * window that shows three walls instead of one.
 *
 * What does NOT change:
 *  - Rule 1: every slide is claimed through the variety tracker, so a design in
 *    the slider cannot also appear in Just In or Best sellers below.
 *  - Rule 2: only the LEAD slide's collection is claimed and fronted. Claiming
 *    three would front three collections from one component and starve the
 *    four Find-your-look tiles of anything left to show.
 *  - Rule 6: the no-consecutive-rooms check applies to the LEAD slide, which is
 *    the one a returning customer actually compares against yesterday. Slides
 *    two and three are behind a six-second fade and are not what "yesterday's
 *    hero" means.
 */

export type HeroSlidePick = {
  candidate: HeroCandidate;
  design: ProductCardData;
};

/**
 * The day's slides, in order, already claimed against the variety tracker.
 *
 * `claim` is the tracker's claimDesign — it returns the design and marks it
 * used, so passing it in keeps this function honest about the page's one
 * shared rule rather than duplicating the bookkeeping.
 */
export function pickHeroSlides(
  todays: HeroCandidate[],
  opts: {
    count: number;
    yesterdayRoom: string | null;
    collectionUsed: (handle: string) => boolean;
    designUsed: (handle: string) => boolean;
    claim: (d: ProductCardData) => ProductCardData;
  },
): HeroSlidePick[] {
  const { count, yesterdayRoom, collectionUsed, designUsed, claim } = opts;

  const free = todays.filter((c) => !collectionUsed(c.entry.handle) && !designUsed(c.design.handle));

  // The lead is chosen exactly as the single hero always was: first candidate
  // in cycle order that does not repeat yesterday's room. A repeated room
  // beats an empty shop window, so it falls back rather than gives up.
  const lead =
    free.find((c) => !(c.room !== null && c.room === yesterdayRoom)) ??
    free[0] ??
    todays[0] ??
    null;
  if (!lead) return [];

  const picked: HeroCandidate[] = [lead];

  // The rest, in cycle order, skipping anything already picked. Prefer a
  // different room from the slide before it — three bedrooms fading into each
  // other reads as one image failing to load, not as three walls.
  for (const c of free) {
    if (picked.length >= count) break;
    if (picked.some((p) => p.design.handle === c.design.handle)) continue;
    if (c.room !== null && c.room === picked[picked.length - 1].room) continue;
    picked.push(c);
  }
  // Second pass without the room preference: a full slider beats a varied one.
  for (const c of free) {
    if (picked.length >= count) break;
    if (picked.some((p) => p.design.handle === c.design.handle)) continue;
    picked.push(c);
  }

  return picked.map((c) => ({ candidate: c, design: claim(c.design) }));
}
