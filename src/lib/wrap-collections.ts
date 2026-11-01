/**
 * The appliance-wrap aesthetic rows (supabase/migrations/0092_fridge_aesthetic_rows.sql).
 *
 * Shared between the studio upload form (which offers them as a pick) and the
 * studio API (which validates the pick and writes it as a product_tags row) so
 * the two lists cannot drift — a tag the client can select but the server
 * doesn't recognise would create a design that never appears in its row, which
 * is a silent failure with no error to notice.
 *
 * `key` === the row's rule_tag in 0092. If either list changes, the other must
 * change with it.
 *
 * The rows are SHARED ACROSS APPLIANCES: a Florals batch is a Florals batch
 * whether it is going on a fridge or an air conditioner, so there is one row per
 * aesthetic and not one per aesthetic per appliance. Which appliances a design in
 * a row is actually sold on is a separate fact, in product_appliances. The
 * handles still read `fridge-*` because they are live URLs and renaming them
 * would cost more than the tidiness is worth.
 *
 * The range is curated in BATCHES OF FOUR: one row is one aesthetic and arrives
 * as four designs together. That rule is enforced where designs are created
 * (WRAP_BATCH_SIZE below, checked in the studio route), not in the database —
 * a constraint on "a multiple of four" would block the first of any batch.
 */
export type WrapRow = {
  key: string;
  label: string;
  handle: string;
  /**
   * Formats a design in this row may be sold at. Omitted = every standard
   * format, which is the case for every row but one.
   *
   * Mini Fridge Exclusives are composed for a 520 x 760 door and fall apart
   * stretched up a 1.8 m side-by-side, so the row itself carries the
   * restriction and every design created in it inherits it — nobody has to
   * remember to set it per design.
   */
  formatCodes?: string[];
  /** Short code used in the design's SKU: ZW-<code>-<nn>. */
  codePrefix: string;
};

export const WRAP_COLLECTIONS: WrapRow[] = [
  { key: "Florals", label: "Florals", handle: "fridge-florals", codePrefix: "FLR" },
  { key: "White & Blue", label: "White & Blue", handle: "fridge-white-and-blue", codePrefix: "WBL" },
  { key: "Abstract", label: "Abstract", handle: "fridge-abstract", codePrefix: "ABS" },
  { key: "Dolce Gabbana", label: "Dolce Gabbana Inspired", handle: "fridge-dolce", codePrefix: "DGI" },
  { key: "Mini Exclusive", label: "Mini Fridge Exclusives", handle: "fridge-mini", codePrefix: "MIN", formatCodes: ["E"] },
];

/** The row a design belongs to, from its tags. */
export function wrapRowForTags(tags: string[] | null | undefined): WrapRow | null {
  for (const t of tags ?? []) {
    const hit = WRAP_COLLECTIONS.find((c) => c.key === t);
    if (hit) return hit;
  }
  return null;
}

/** Designs are published four at a time. One aesthetic row, one batch. */
export const WRAP_BATCH_SIZE = 4;

export const WRAP_COLLECTION_KEYS: readonly string[] = WRAP_COLLECTIONS.map((c) => c.key);

export function isWrapCollectionKey(v: unknown): v is string {
  return typeof v === "string" && WRAP_COLLECTION_KEYS.includes(v);
}

export function wrapCollectionLabel(key: string): string {
  return WRAP_COLLECTIONS.find((c) => c.key === key)?.label ?? key;
}
