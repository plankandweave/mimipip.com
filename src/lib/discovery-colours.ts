/** Named colour routes, distinct from palette modifiers such as Pastel or Dark. */
export const NAMED_COLOURS = [
  "Neutral", "Black", "Blue", "Brown", "Green", "Grey", "Orange",
  "Pink", "Purple", "Red", "Turquoise", "White", "Yellow",
] as const;

/** Keep actual colour routes ahead of modifiers when limiting classifier output. */
export function discoveryColours(tags: readonly string[]): string[] {
  const unique = [...new Set(tags)];
  const named = unique.filter((tag) => (NAMED_COLOURS as readonly string[]).includes(tag));
  if (!named.length) throw new Error("Classification needs a named artwork colour; palette modifiers alone are insufficient");
  return [...named, ...unique.filter((tag) => !named.includes(tag))].slice(0, 4);
}
