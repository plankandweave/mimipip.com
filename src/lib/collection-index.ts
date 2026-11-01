import { getNamedFaithCards, isNamedFaithCollection } from "./named-faith-collections";
import { supabase } from "@/lib/supabase";
import { getProductsByTags, getCollectionTagSet, getTileHeroes } from "@/lib/queries";
import { frontAttrs, pickDistinctFronts } from "@/lib/index-tiles";
import { PRICE_TIER_TAGS } from "@/lib/pricing";

/**
 * The data behind an index of named collections — /collections (aesthetics) and
 * /series (series and sets). Both pages answer the same question: a curated
 * name does not describe itself, so each tile carries a design FROM it.
 *
 * Shared rather than duplicated because the awkward part is not the markup, it
 * is the de-duplication: a design can belong to two collections, and two tiles
 * showing the same picture is exactly the "I cannot tell these apart" the index
 * exists to fix.
 */
export type IndexTile = {
  handle: string;
  title: string;
  kind: string;
  description: string | null;
  image: string;
  count: number;
  /** See frontAttrs — read by scripts/verify-index-pages.mjs. */
  attrs: Record<string, string>;
};

const cleanTitle = (t: string) =>
  t.replace(/\s*wallpapers?$/i, "").replace(/['’]\s*$/, "").trim() || t;

// Keep these index cards concise and consistent with their collection pages.
// The collection records carry longer editorial copy (or none at all), while
// this grid needs a short introduction under each design count.
const cardCopy: Record<string, { title?: string; description?: string; image?: string }> = {
  "founders-signature-painted-crossing": {
    title: "The Painted Crossing",
    // The wide living-room view clips the horse's face in this portrait tile.
    // This view of the same design keeps the entire head in frame.
    image: "https://media.zyvorah.com/painted-crossing/painted-crossing-the-black-stallion/office.jpg",
  },
  taash: { title: "Taash" },
  "maharaja-s-court": {
    description:
      "Regal horses, elephants and ornate patterns bring the colour and grandeur of a royal court to the wall.",
  },
  calm: {
    description:
      "Beautiful linen texture meets soft watercolor washes, evoking the feel of pigment settling into watercolor paper.",
  },
};

// Preserve concept-backed cards within the catalogue order, never ahead of it.
const fallbackTiles: Record<string, IndexTile> = {
  "the-lives-within": {
    handle: "the-lives-within",
    title: "The Lives Within",
    kind: "curated",
    description: "Nine mural wallpaper designs for a family apartment in Gurgaon.",
    image: "https://media.zyvorah.com/the-lives-within/shared-horizons-living.jpg",
    count: 9,
    attrs: { "data-tile-design": "concept-the-lives-within-shared-horizons-living", "data-tile-collections": "the-lives-within" },
  },
};

export async function getIndexTiles(kinds: string[], namedFaithPreviews = false): Promise<IndexTile[]> {
  const newestFirst = kinds.includes("curated");
  const { data, error } = await supabase
    .from("collections")
    .select("handle, title, kind, description, rule_tag, hero_product_handle, position")
    .in("kind", kinds)
    .not("rule_tag", "is", null)
    .order(newestFirst ? "created_at" : "position", { ascending: !newestFirst, nullsFirst: false })
    .order("position", { ascending: true, nullsFirst: false })
    .order("handle", { ascending: true });
  if (error) throw error;

  // `kind` is what separates an aesthetic from a series (migration 0145) and is
  // the filter that matters. A tier is excluded on its tag as well, so that a
  // row whose kind gets reset to 'curated' cannot put a price band back on the
  // aesthetics shelf — /series names its tiers explicitly and is unaffected.
  const collections =
    ((data as { handle: string; title: string; kind: string; description: string | null; rule_tag: string; hero_product_handle: string | null }[]) ?? [])
      .filter((c) => c.kind !== "curated" || !PRICE_TIER_TAGS.has(c.rule_tag));


  // One query for every collection's designs rather than one per collection:
  // the same call gives both the representative image and how many designs are
  // in it, so a tile can say what it holds.
  const [byTag, collectionTags, heroes] = await Promise.all([
    getProductsByTags(collections.map((c) => c.rule_tag)),
    getCollectionTagSet(),
    getTileHeroes(collections.flatMap((c) => (c.hero_product_handle ? [{ handle: c.hero_product_handle }] : []))),
  ]);

  // Only the named Collections directory requests these collection previews.
  // General product discovery and every other index retain their normal reads.
  if (namedFaithPreviews) {
    await Promise.all(collections.filter(c => isNamedFaithCollection(c.handle)).map(async c => {
      byTag[c.rule_tag] = await getNamedFaithCards(c.handle);
    }));
  }

  // An editorial pin first, then no design and no collection twice — see
  // index-tiles.ts. A collection is claimed only once a tile has picked, so a
  // tile is never barred from its own designs; what it cannot do is front a
  // design that also belongs to a collection already shown above it.
  const tiles: IndexTile[] = pickDistinctFronts(
    collections,
    (c) => {
      const list = (byTag[c.rule_tag] ?? []).filter(p => p.image && !p.imageIsFlat);
      const hero = c.hero_product_handle ? heroes[`:${c.hero_product_handle}`] : undefined;
      return hero && list.some(p => p.handle === hero.handle) ? [hero, ...list.filter((p) => p.handle !== hero.handle)] : list;
    },
    {
      pinnedHandle: (c) => c.hero_product_handle,
      collectionsOf: (p) => (p.tags ?? []).filter((t) => collectionTags.has(t)),
    },
  ).map((f) => ({
    handle: f.row.handle,
    title: cardCopy[f.row.handle]?.title ?? cleanTitle(f.row.title),
    kind: f.row.kind,
    description: cardCopy[f.row.handle]?.description ?? f.row.description,
    image: cardCopy[f.row.handle]?.image ?? f.front.image!,
    count: f.count,
    // A hand-written card image is not a catalogue design: nothing to repeat.
    attrs: cardCopy[f.row.handle]?.image ? { ...frontAttrs(f), "data-tile-design": "", "data-tile-collections": "" } : frontAttrs(f),
  }));
  const byHandle = new Map(tiles.map((tile) => [tile.handle, tile]));
  return collections.flatMap((collection) => {
    const tile = byHandle.get(collection.handle) ?? fallbackTiles[collection.handle];
    return tile ? [tile] : [];
  });
}
