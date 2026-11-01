/**
 * A short, honest descriptor built from a product's real tags: first colour +
 * first style/subject, e.g. "Blue landscape". Returns undefined when neither is
 * present (never fabricated). Shared by the collection page (first page, server-
 * rendered) and /api/browse (infinite-scroll pages) so appended cards read the
 * same as the initial grid.
 */
export function descriptorFor(tags: string[], colourSet: Set<string>, styleSet: Set<string>): string | undefined {
  const colour = tags.find((t) => colourSet.has(t));
  const style = tags.find((t) => styleSet.has(t));
  const parts = [colour, style].filter(Boolean) as string[];
  if (!parts.length) return undefined;
  const s = parts.join(" ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
