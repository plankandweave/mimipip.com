/** Promote Nafas within the opening kids' selection without changing membership,
 * filters, totals, or pagination. Pink Pop connects the film to the shop. */
export function kidsCollectionOrder(handles: string[], collection: string, page: number): string[] {
  if (collection !== "kids-wallpapers" || page !== 1) return handles;
  const rank = (handle: string) => handle === "nafas-pink-pop" ? 0 : handle.startsWith("nafas-") ? 1 : 2;
  return [...handles].sort((a, b) => rank(a) - rank(b));
}
