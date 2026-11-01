/** Explicit empty-domain state, never preview fixtures or inherited seed rows. */
export function emptyBrandState() {
  return { products: [], collections: [], customers: [], orders: [], conversations: [], partners: [], campusProjects: [], merchandisingSelections: [], cart: { lines: [], subtotal: 0 }, checkout: { status: 'unavailable' as const, reason: 'No products or payment connection configured' } };
}
