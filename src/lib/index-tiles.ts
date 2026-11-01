import type { ProductCardData } from "@/lib/types";

/**
 * WHAT FRONTS A TILE.
 *
 * Every index page — /rooms, /colours, /collections, /series — is a grid of
 * tiles that each stand for a collection, fronted by one design from it. The
 * picture is the tile's whole argument: it has to say what is behind THAT
 * tile, and it has to be a design a shopper could believe in that room.
 *
 * Left to ranking alone it says neither. `aesthetic_rank` is global, so the
 * few designs at the top of it win every tile they are tagged into: on 5
 * September 2026 one bull watercolour fronted five of the eight rooms, and
 * after that was fixed four horses from one collection fronted four more. A
 * grid like that tells the shopper the catalogue is one artwork, or one idea.
 *
 * Three rules, in order of authority:
 *
 *  1. AN EDITORIAL PIN WINS. `collections.hero_product_handle` names the design
 *     that fronts a tile. Ranking cannot know that horses belong in a home
 *     office and not a nursery, or that a chevron is a poor answer to "pooja
 *     room" when there are painted deities behind it. Only a person knows
 *     that, so a person may say it — and, being a row rather than a deploy,
 *     may change it without one.
 *
 *  2. ONE DESIGN FRONTS ONE TILE. Keyed on the DESIGN, never the image URL: a
 *     room tile shows that room's render, so five tiles of one design are five
 *     different URLs, and an image-keyed check passes the broken grid
 *     unchanged. That is not hypothetical — it is what the first fix did.
 *
 *  3. ONE COLLECTION FRONTS ONE TILE. Four different horses is four different
 *     designs and still one idea. A collection that fronts a tile is spent,
 *     and the next tile reaches past it. Only collections count here, not
 *     every tag: an average design carries ~6 tags, and excluding at tag level
 *     would starve the grid by the third tile — the same trap homepage-variety
 *     documents for facet collections.
 *
 * Rules 2 and 3 relax rather than blank a tile: a collection whose every
 * design is already spoken for repeats one, because a picture the shopper has
 * seen beats a hole in the grid. A collection with no imaged design at all
 * drops out entirely.
 *
 * See AGENTS.md, "Index page rules", and index-tiles.test.ts, which fails if
 * any of the three is removed.
 */
export type FrontOptions<R> = {
  /** The editorially chosen design for this tile, if it has one (rule 1). */
  pinnedHandle?: (row: R) => string | null | undefined;
  /** The COLLECTIONS a design belongs to — not its tags (rule 3). */
  collectionsOf?: (design: ProductCardData) => string[];
};

/** Which rule, if any, had to give way for this tile (see "Rules 2 and 3
 *  relax" above): "collection" — its design is fresh but a collection it
 *  belongs to already fronts another tile; "design" — every design it had was
 *  already fronting another tile. Recorded so the live check
 *  (scripts/verify-index-pages.mjs) can tell a forced relaxation from a bug. */
export type Relaxed = "none" | "collection" | "design";

export type Front<R> = {
  row: R;
  front: ProductCardData;
  count: number;
  pinned: boolean;
  relaxed: Relaxed;
  /** The collections (rule 3) the front design belongs to. */
  collections: string[];
};

/** A tile's front, stamped on the tile for scripts/verify-index-pages.mjs,
 *  which reads the LIVE index pages and fails on a repeat the rules did not
 *  force. Spread onto the tile's outer element. */
export function frontAttrs(f: Front<unknown>): Record<string, string> {
  return {
    "data-tile-design": f.front.handle,
    "data-tile-collections": f.collections.join("|"),
    "data-tile-pinned": f.pinned ? "1" : "",
    "data-tile-relaxed": f.relaxed,
  };
}

export function pickDistinctFronts<R>(
  rows: R[],
  candidatesFor: (row: R, index: number) => ProductCardData[],
  opts: FrontOptions<R> = {},
): Front<R>[] {
  const { pinnedHandle = () => null, collectionsOf = () => [] } = opts;

  const claimedDesigns = new Set<string>();
  const claimedCollections = new Set<string>();
  const imagedFor = rows.map((row, i) => candidatesFor(row, i).filter((p) => p.image));

  const claim = (p: ProductCardData) => {
    claimedDesigns.add(p.handle);
    for (const c of collectionsOf(p)) claimedCollections.add(c);
  };

  // Pass 1 — the pins. They are decided by a person and answer to nothing, so
  // they are placed first and the algorithm works around what they took.
  const chosen = new Array<ProductCardData | null>(rows.length).fill(null);
  const relaxed = new Array<Relaxed>(rows.length).fill("none");
  rows.forEach((row, i) => {
    const wanted = pinnedHandle(row);
    if (!wanted) return;
    const pin = imagedFor[i].find((p) => p.handle === wanted);
    // A pin naming a design that is gone, unimaged, or no longer in the
    // collection is ignored rather than blanking the tile: the grid keeps
    // working while somebody fixes the row.
    if (!pin) return;
    chosen[i] = pin;
    claim(pin);
  });

  // Pass 2 — everything else, in order, taking the best design that costs no
  // duplication. Two relaxations, each one step weaker than the last.
  rows.forEach((_row, i) => {
    if (chosen[i]) return;
    const imaged = imagedFor[i];
    if (!imaged.length) return;
    const fresh = imaged.find((p) => !claimedDesigns.has(p.handle) && !collectionsOf(p).some((c) => claimedCollections.has(c)));
    const unseen = fresh ?? imaged.find((p) => !claimedDesigns.has(p.handle));
    const front = unseen ?? imaged[0];
    relaxed[i] = fresh ? "none" : unseen ? "collection" : "design";
    chosen[i] = front;
    claim(front);
  });

  return rows.flatMap((row, i) => {
    const front = chosen[i];
    return front
      ? [{ row, front, count: imagedFor[i].length, pinned: pinnedHandle(row) === front.handle, relaxed: relaxed[i], collections: collectionsOf(front) }]
      : [];
  });
}
