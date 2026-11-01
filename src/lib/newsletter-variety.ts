import type { ProductCardData } from "./types";

export type NewsletterCollection = { handle: string; tags: string[] };
export type RecentNewsletterDesign = { handle: string; tags: string[] };

/** One design per curated collection, excluding the previous four weeks.
 * Room/colour/style facet tags do not count as editorial collections.
 * Never fill empty places with repeats: the caller tries another real room.
 */
export function selectNewsletterDesigns(
  pool: ProductCardData[],
  collections: NewsletterCollection[],
  recent: RecentNewsletterDesign[],
  weekStart: string,
  limit = 4,
): ProductCardData[] {
  const memberships = (tags: string[] = []) => collections
    .filter(c => c.tags.some(t => tags.includes(t)))
    .map(c => c.handle);
  const recentHandles = new Set(recent.map(p => p.handle));
  const recentCollections = new Set(recent.flatMap(p => memberships(p.tags)));
  const usedCollections = new Set<string>();
  const usedHandles = new Set<string>();
  // Stable per-week ordering removes the fixed aesthetic-rank bias, including
  // when history is empty. History provides the hard cross-edition exclusion.
  const rank = (handle: string) => {
    let h = 2166136261;
    for (const ch of `${weekStart}:${handle}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
  };
  const selected: ProductCardData[] = [];
  for (const p of [...pool].sort((a, b) => rank(a.handle) - rank(b.handle) || a.handle.localeCompare(b.handle))) {
    if (!p.image || p.imageIsFlat || recentHandles.has(p.handle) || usedHandles.has(p.handle)) continue;
    const groups = memberships(p.tags);
    if (groups.some(c => recentCollections.has(c) || usedCollections.has(c))) continue;
    selected.push(p);
    usedHandles.add(p.handle);
    groups.forEach(c => usedCollections.add(c));
    if (selected.length >= limit) break;
  }
  return selected;
}
