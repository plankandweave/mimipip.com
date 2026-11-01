// The catalogue adapter contract.
//
// One engine, brand-wise brains: the founder's framing, and also the plan's.
// Voice, guardrails, pillars and the approval doctrine are already per brand in
// `pos`. The catalogue is the part that is not — `loadCandidates()` takes no
// arguments and reads one hardcoded table, so the engine has no concept of a
// brand at all.
//
// This file is the shape a second brand would have to satisfy. It is written
// while there is exactly ONE implementation, because that is the cheapest
// moment to get an interface right — and it describes what `select.ts` already
// produces rather than inventing something new.
//
// Contract and reasoning: MKTG OS docs/sequence-2/CATALOGUE_ADAPTER_CONTRACT.md
// NOT YET WIRED. The engine still calls loadCandidates() directly; threading the
// brand parameter waits until Zyvorah has completed one clean production run.

/** One postable thing, whatever the brand actually sells. */
export type CatalogueItem = {
  /** Stable within the brand and written to the ledger — this is what
   *  "have we posted this recently" is keyed on, so it must survive a rename. */
  handle: string;
  title: string;
  /** Plain text; the caption generator does not want markup. */
  descriptionPlain: string;

  /** The flat artwork. The ONLY hard requirement — without it there is nothing
   *  to compose and the slot is not postable (see `eligible()` in select.ts). */
  flatUrl: string | null;
  /** Styled scenes. Reels need at least one; stills fall back to the flat. */
  sceneUrls: string[];

  /** Honest from-price, inclusive of whatever the brand must include.
   *  NULL when the brand does not publish prices — deliberately not 0, so
   *  "no price" cannot be rendered as "free". */
  fromPrice: number | null;

  /** Uninterpreted. The engine matches these against the brand's own pillar
   *  definitions in pos.brand_pillar; the vocabulary is brand data, not engine
   *  code. Zyvorah's are rooms; another brand's will be something else. */
  tags: string[];

  /** Editorial signals. Optional — a brand without them simply has none. */
  isSignature?: boolean;
  isFoundersFavourite?: boolean;
  foundersNote?: string | null;
};

/** One brand's catalogue. Registered per brand_slug. */
export interface CatalogueAdapter {
  readonly brandSlug: string;
  /** Everything postable right now.
   *
   *  Returns the whole catalogue rather than paging: a planning run ranks across
   *  all of it to avoid repeating a design within a fortnight. Called once per
   *  run, not once per slot. If a brand ever has a catalogue too large to hold
   *  in memory, that is the moment to revisit this — not before. */
  load(): Promise<CatalogueItem[]>;
}

/** Adapters register here by brand slug. Empty until the brand parameter is
 *  threaded through; Zyvorah's implementation currently lives in select.ts as
 *  loadCandidates() and already satisfies this shape. */
export const CATALOGUE_ADAPTERS: Record<string, CatalogueAdapter> = {};
