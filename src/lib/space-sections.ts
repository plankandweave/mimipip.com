import { getCollectionCards, getCollectionPageHandles, getMaterialOffers, type CollectionScope } from "./queries";
import { supabase } from "./supabase";
import { cachedCatalogue } from "./catalogue-cache";
import type { ProductCardData } from "./types";

/**
 * The machinery behind every "shop by space" section that is a UNION of
 * sibling collections: /hospitality, /real-estate, /retail and /hospitals.
 *
 * WHY THIS EXISTS NOW AND NOT EARLIER. hospitality.ts said it deliberately did
 * not share with office.ts, and real-estate.ts copied hospitality with a note:
 * "If a third section ever needs this, that is the moment to lift it." Retail
 * and healthcare are the third and fourth, so this is that moment. Four copies
 * of a hard-filter query is how one section quietly stops matching the others.
 *
 * /office is STILL NOT ON THIS. It is a different model — one base tag
 * ("Office") that each workspace narrows, with a curated-tag-or-fallback edit
 * so a thin tag never renders a bare grid. The sections here have no base tag
 * and no fallback: a design either has this space's render or it does not
 * appear. Folding office in would mean teaching this file two merchandising
 * rules, which is the thing it exists to avoid.
 */

/** One shoppable space. Identical across all four sections by construction. */
export type SectionSpace = {
  slug: string;
  /** Nav, tile and breadcrumb label. Must equal the Studio picker's chip. */
  label: string;
  /** The <title> and the phrase a search actually carries. */
  seoTitle: string;
  /** Page h1 — a sentence about the space, never a category name. */
  title: string;
  /** Tile blurb. One line, says what the wall is FOR here. */
  tease: string;
  standfirst: string;
  /** The product tag this space's collection is built on. */
  tag: string;
  /** The collection handle products with this tag live under. */
  collectionHandle: string;
  /** The Studio scenario whose renders this page's cards must show. */
  sceneKey: string;
  /** Editorial pin for the hub tile's image — a handle, never a URL. */
  tileHandle?: string;
  /** What the buyer is actually worried about in this space. */
  considerations: { t: string; d: string }[];
  /** A real wall this space typically has, for the cost worked example. */
  typicalWall: { label: string; widthFt: number; heightFt: number };
};

export type SpaceEdit = {
  cards: ProductCardData[];
  /** Designs carrying the tag — always >= cards.length, since the grid is a
   *  hard subset (has the render) of the tagged edit. */
  taggedTotal: number;
  allHref: string;
};

/**
 * Handles whose products carry this space's scene render.
 *
 * Mirrors getProductsByTags' `member:product_tags!inner` pattern to inner-join
 * the tag, and adds a second aliased inner join on product_images so only
 * products with THIS scene_key come back — a filter collection_page_v2 has no
 * notion of, because scene coverage is not a tag.
 *
 * Through the catalogue cache: a hub asks this once per tile, so uncached it
 * was 3,600 reads a day (1 Oct 2026). A new render shows when the studio
 * publish bumps the catalogue version, like every other card grid.
 */
const handlesWithScene = cachedCatalogue("handles-with-scene", async (tag: string, sceneKey: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from("products")
    .select("handle, tagged:product_tags!inner ( tag ), scene:product_images!inner ( scene_key )")
    .eq("status", "active")
    .eq("is_service", false)
    .eq("tagged.tag", tag)
    .eq("scene.scene_key", sceneKey);
  if (error) throw error;
  const rows = (data as { handle: string }[]) ?? [];
  // A product can carry more than one image with the same scene_key, so
  // de-duplicate handles from the join fan-out.
  return [...new Set(rows.map((r) => r.handle))];
});

/** One space's grid — renders only, hard filter. */
export async function getSpaceEdit(s: SectionSpace): Promise<SpaceEdit> {
  const scope: CollectionScope = { tags: [s.tag], category: null };
  const [rendered, { total: taggedTotal }] = await Promise.all([
    handlesWithScene(s.tag, s.sceneKey),
    getCollectionPageHandles(scope, { pageSize: 1, sort: "featured" }),
  ]);
  const allHref = `/collections/${s.collectionHandle}`;
  if (!rendered.length) return { cards: [], taggedTotal, allHref };
  // Uniform by construction — every handle here has the scene, so force it.
  const cards = await getCollectionCards(rendered, s.sceneKey, "scene");
  return { cards, taggedTotal, allHref };
}

export type SectionTile = {
  slug: string;
  label: string;
  tease: string;
  image: string | null;
  portrait: boolean;
  renderCount: number;
  taggedTotal: number;
};

/** One representative image per space, for a hub's tiles. */
export async function getSectionTiles(spaces: SectionSpace[]): Promise<SectionTile[]> {
  return Promise.all(
    spaces.map(async (s) => {
      const edit = await getSpaceEdit(s);
      // An editorial pin beats whatever the catalogue sorts first. A missing
      // or unrendered pin falls back to cards[0] rather than blanking a tile.
      const pinned = s.tileHandle ? edit.cards.find((c) => c.handle === s.tileHandle) : undefined;
      const front = pinned ?? edit.cards[0];
      const ratio = front?.aspectRatio ?? null;
      return {
        slug: s.slug,
        label: s.label,
        tease: s.tease,
        image: front?.image ?? null,
        portrait: ratio != null && ratio < 0.9,
        renderCount: edit.cards.length,
        taggedTotal: edit.taggedTotal,
      };
    }),
  );
}

/**
 * The footer line under a tile. One rule, so four hubs cannot drift apart.
 *
 * Pluralised because a new section starts at one: /retail's shop floor read
 * "1 designs · sized to your wall" on its first day, which is the sort of thing a
 * procurement lead notices before they notice the wallpaper. The bug was in
 * all three hubs before this was one function.
 */
export function tileMeta(t: SectionTile): string | null {
  if (!t.taggedTotal) return null;
  const designs = designCount(t.taggedTotal);
  if (!t.renderCount) return `${designs} · sized to your wall`;
  return `${t.renderCount} shot for this space · ${designs} in total`;
}

/** "1 design" / "4 designs".
 *
 *  Exported because /office is a fifth hub that never joined tileMeta — it
 *  builds its tiles from getWorkspaceTiles(), a different query with a `total`
 *  and no render count, so it cannot take a SectionTile. It was still writing
 *  its own footer line, and still saying "1 designs". The plural rule has one
 *  home even where the tile shape does not. */
export function designCount(n: number): string {
  return `${n} design${n === 1 ? "" : "s"}`;
}

/**
 * Wallpaper finishes for a section's estimator and spec table. getMaterialOffers
 * is the single place that knows what each finish actually sells for;
 * everything here is presentation.
 */
export type SectionFinish = {
  slug: string;
  name: string;
  rate: number;
  rollWidthMm: number | null;
  restricted: boolean;
  description: string | null;
};

type FinishMeta = { slug: string; roll_width_mm: number | null; description: string | null };

/** Roll width and description per finish. Throws on a failed read so an error
 *  is never cached; getSectionFinishes catches it. */
const getSectionFinishMeta = cachedCatalogue("section-finish-meta", async (slugs: string[]): Promise<FinishMeta[]> => {
  const { data, error } = await supabase
    .from("materials")
    .select("slug, roll_width_mm, description")
    .in("slug", slugs);
  if (error) throw error;
  return (data as FinishMeta[]) ?? [];
});

export async function getSectionFinishes(): Promise<SectionFinish[]> {
  try {
    const offers = await getMaterialOffers();
    const wallpaper = offers
      .filter((m) => m.family === "wallpaper" && (m.pricePerSqft ?? 0) > 0)
      .sort((a, b) => (a.pricePerSqft ?? 0) - (b.pricePerSqft ?? 0));
    // A failed meta read used to be ignored (widths and descriptions fell back
    // to null); keep that, rather than losing the whole spec table to it.
    const rows = await getSectionFinishMeta(wallpaper.map((m) => m.slug)).catch((e) => {
      console.error("section finish meta failed:", (e as Error).message);
      return [] as FinishMeta[];
    });
    const meta = new Map(rows.map((r) => [r.slug, r]));
    return wallpaper.map((m) => ({
      slug: m.slug,
      name: m.name,
      rate: m.pricePerSqft as number,
      rollWidthMm: meta.get(m.slug)?.roll_width_mm ?? null,
      description: meta.get(m.slug)?.description ?? null,
      restricted: m.restricted,
    }));
  } catch (e) {
    console.error("section finishes failed:", (e as Error).message);
    return [];
  }
}

export function estimatorRates(finishes: SectionFinish[]) {
  return finishes.map((f) => ({
    slug: f.slug,
    label: f.name,
    rate: f.rate,
    note:
      f.description ??
      (f.restricted ? "Comes with the Autograph range." : "Paste-the-wall, sheen-free."),
  }));
}
