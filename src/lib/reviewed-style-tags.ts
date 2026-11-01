import exclusions from "@/data/reviewed-style-exclusions.json";

/** Preserve visual curation when the automated catalogue repair adds tags.
 * Manual Studio edits remain available; this only constrains AI suggestions.
 */
export function filterReviewedStyleTags(handle: string, tags: string[]): string[] {
  const rejected = Object.hasOwn(exclusions, handle) ? (exclusions as Record<string, string[]>)[handle] : undefined;
  if (!rejected) return tags;
  const blocked = new Set(rejected.map((tag) => tag.toLowerCase()));
  return tags.filter((tag) => !blocked.has(tag.trim().toLowerCase()));
}
