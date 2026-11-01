import type { ProductCardData } from "@/lib/types";
import { fitsFrame } from "@/lib/image-orientation";

/**
 * HOMEPAGE VARIETY — the single enforcement point for the homepage rules in
 * AGENTS.md. The first page is the shop window: a customer should leave it
 * having seen as many DIFFERENT designs and collections as one page can carry.
 *
 *   1. No DESIGN appears twice anywhere on the homepage. Every product row
 *      claims its designs here; a claimed handle never renders again.
 *   2. No perceived COLLECTION is featured twice. The Signature spotlight,
 *      the hero and each Find-your-look tile all come from different
 *      collection handles — and Best sellers refuses designs from CURATED
 *      collections already on the page (that row exists to show what the
 *      rest of the page hasn't). Facet collections (colour/room/style) are
 *      deliberately NOT counted: an average design carries ~6 collection
 *      tags, so facet-level exclusion would exhaust the catalogue by the
 *      second row and every pick would land on the fallback.
 *   3. A row is filled rather than left short: freshness is a preference
 *      pass, not a reason to render a gappy homepage. The one exception is
 *      Best sellers' curated exclusion, which is hard — a shorter grid beats
 *      re-showing the Signature collection there, which is the exact
 *      duplication this module exists to prevent.
 */

export type CuratedCollection = { handle: string; tags: string[] };

export type VarietyTracker = ReturnType<typeof createVarietyTracker>;

export function createVarietyTracker(curated: CuratedCollection[]) {
  const usedHandles = new Set<string>();
  /** Collection HANDLES already fronting a row (hero, tiles, Signature). */
  const usedCollections = new Set<string>();
  /** Tags of curated collections already featured anywhere on the page. */
  const featuredCuratedTags = new Set<string>();
  const curatedTags = new Map<string, string>();
  for (const c of curated) for (const t of c.tags) curatedTags.set(t, c.handle);

  const claimDesign = <P extends ProductCardData>(p: P): P => {
    usedHandles.add(p.handle);
    return p;
  };

  /** A row is fronted by this collection — no later row may lead with it, and
   *  if it's a curated collection its designs are barred from Best sellers. */
  const claimCollection = (handle: string, tags: string[] = []) => {
    usedCollections.add(handle);
    for (const t of tags) if (curatedTags.has(t)) featuredCuratedTags.add(t);
  };

  const collectionUsed = (handle: string) => usedCollections.has(handle);

  /** Has this design already been claimed by an earlier row? (The hero picks
   *  its own design by rotation rather than "first unseen", so it needs to ask
   *  rather than let pickDesign decide.) */
  const designUsed = (handle: string) => usedHandles.has(handle);

  const fromFeaturedCurated = (p: ProductCardData) =>
    !!p.isSignature || (p.tags ?? []).some((t) => featuredCuratedTags.has(t));

  /** First unseen design across the lists (list order = priority). Claims it. */
  const pickDesign = (...lists: ProductCardData[][]): ProductCardData | null => {
    for (const list of lists) {
      for (const p of list) {
        if (p.image && !usedHandles.has(p.handle)) return claimDesign(p);
      }
    }
    return null;
  };

  /**
   * `pickDesign`, restricted to artwork a frame of this shape may crop without
   * throwing the composition away (`fitsFrame`). Used by the made-to-measure
   * band, whose 4:3 window is landscape and would halve a vertical mural.
   *
   * No relaxed second pass on purpose: unlike a row, this is ONE picture, and
   * a band showing a different design is free while a band showing a third of
   * a design is the defect this exists to prevent. Null (band hidden) is the
   * last resort, and with 450-odd landscape designs it is unreachable.
   */
  const pickDesignForFrame = (frameAspect: number, ...lists: ProductCardData[][]): ProductCardData | null => {
    for (const list of lists) {
      for (const p of list) {
        if (p.image && !usedHandles.has(p.handle) && fitsFrame(p, frameAspect)) return claimDesign(p);
      }
    }
    return null;
  };

  /**
   * Fill a row of up to `n`: pass 1 takes unseen designs from collections not
   * yet featured; pass 2 relaxes to merely-unseen so the row never renders
   * short. `hardCurated` (Best sellers) skips pass 2's relaxation of the
   * curated exclusion — there, a short row is the lesser evil.
   */
  const fillRow = (list: ProductCardData[], n: number, opts?: { hardCurated?: boolean }): ProductCardData[] => {
    const out: ProductCardData[] = [];
    const fresh = (p: ProductCardData) =>
      !!p.image && !usedHandles.has(p.handle) && !out.some((q) => q.handle === p.handle);
    for (const p of list) {
      if (out.length >= n) break;
      if (fresh(p) && !fromFeaturedCurated(p)) out.push(p);
    }
    for (const p of list) {
      if (out.length >= n) break;
      if (fresh(p) && (!opts?.hardCurated || !fromFeaturedCurated(p))) out.push(p);
    }
    out.forEach(claimDesign);
    return out;
  };

  return { claimDesign, claimCollection, collectionUsed, designUsed, fromFeaturedCurated, pickDesign, pickDesignForFrame, fillRow };
}
