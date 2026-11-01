import {
  getCollectionCards,
  getCollectionFacetCounts,
  getCollectionPageHandles,
  getMaterialOffers,
  type CollectionScope,
} from "./queries";
import type { EstimatorRate } from "@/components/OfficeCostEstimator";
import { supabase } from "./supabase";
import type { ProductCardData } from "./types";
import { MIN_CURATED, OFFICE_COLLECTION, OFFICE_TAG, WORKSPACES, type Workspace } from "@/content/workspaces";

/**
 * The catalogue side of the office section.
 *
 * Everything here is an edit OVER the existing "Office" room collection rather
 * than a new collection: 220 active designs already carry the tag, and adding
 * seven more collections would mean seven more things to keep tagged for a
 * merchandising split that is really a filter. The RPCs behind
 * getCollectionPageHandles already AND filter tags against a base tag
 * (migration 0050), which is exactly this shape.
 */

/** Office wallpaper — the base every workspace edit narrows. */
export const OFFICE_SCOPE: CollectionScope = { tags: [OFFICE_TAG], category: null };

export type WorkspaceEdit = {
  cards: ProductCardData[];
  /** Total designs in the edit, not just the page fetched. */
  total: number;
  /**
   * Whether the grid came from the curated tag or the fallback. Surfaced so a
   * page can be honest about being an automatic edit rather than a hand-picked
   * one — and so it is obvious in dev which spaces still need curating.
   */
  curated: boolean;
  /**
   * A link to the full edit on the collection listing — the same base tag and
   * the same filter tags, so "all N" really is the N this page counted.
   * Without it the page had to send people to the whole 220-design office
   * collection under a count that described a 110-design edit.
   */
  allHref: string;
};

/** Curated-tag counts for every workspace, in one round trip. */
async function curatedCounts(): Promise<Map<string, number>> {
  try {
    return await getCollectionFacetCounts(OFFICE_SCOPE);
  } catch (e) {
    // A facet lookup failing must cost the curated upgrade, never the page:
    // every space still renders from its fallback.
    console.error("office facet counts failed:", (e as Error).message);
    return new Map();
  }
}

/** The filter tags a workspace should actually query with, given what is tagged. */
function filterTagsFor(w: Workspace, counts: Map<string, number>): { tags: string[]; curated: boolean } {
  const n = counts.get(w.curatedTag) ?? 0;
  return n >= MIN_CURATED ? { tags: [w.curatedTag], curated: true } : { tags: w.fallback, curated: false };
}

/**
 * One workspace's grid. `sceneKey` is passed through so the cards show that
 * space's render where designs have one — a meeting-room page full of bedroom
 * photographs is the exact failure this whole section exists to fix. Designs
 * Designs without that scene do not substitute flat artwork.
 */
export async function getWorkspaceEdit(w: Workspace, limit = 12): Promise<WorkspaceEdit> {
  const counts = await curatedCounts();
  return getWorkspaceEditWith(w, counts, limit);
}

/** As {@link getWorkspaceEdit}, reusing counts already fetched for the hub. */
export async function getWorkspaceEditWith(
  w: Workspace,
  counts: Map<string, number>,
  limit = 12,
): Promise<WorkspaceEdit> {
  const { tags, curated } = filterTagsFor(w, counts);
  const allHref =
    `/collections/${OFFICE_COLLECTION}?` + tags.map((t) => `tag=${encodeURIComponent(t)}`).join("&");
  const { handles, total } = await getCollectionPageHandles(OFFICE_SCOPE, {
    pageSize: limit,
    sort: "featured",
    filterTags: tags,
  });
  if (!handles.length) return { cards: [], total: 0, curated, allHref };
  // Omit `forced`: the small editorial grid resolves its own scene coverage,
  // while toCard still refuses to turn an incomplete design into a swatch.
  const cards = await getCollectionCards(handles, w.sceneKey);
  return { cards, total, curated, allHref };
}

/** A wallpaper finish, as the office section needs to describe and price it. */
export type OfficeFinish = {
  slug: string;
  name: string;
  rate: number;
  rollWidthMm: number | null;
  restricted: boolean;
  /** The material's own authored blurb, from `materials.description`. */
  description: string | null;
};

/**
 * The finishes the office section may quote, cheapest first.
 *
 * Read from getMaterialOffers() rather than written down here, because that is
 * the only place that knows what each finish actually sells for across the
 * catalogue (and prices a `coming_soon` finish at the range that sells it,
 * never at a standard-tier row nobody can pay). A hardcoded table here would eventually quote a rate
 * nobody can actually pay — the exact bug that function's comment describes.
 *
 * Wall-art media are excluded: they sell at fixed finished sizes and must never
 * show a per-sq-ft multiple.
 */
export async function getOfficeFinishes(): Promise<OfficeFinish[]> {
  try {
    const offers = await getMaterialOffers();
    const wallpaper = offers
      .filter((m) => m.family === "wallpaper" && (m.pricePerSqft ?? 0) > 0)
      .sort((a, b) => (a.pricePerSqft ?? 0) - (b.pricePerSqft ?? 0));
    // Roll width is a specification fact rather than a pricing one, so it is
    // not on MaterialOffer; read it alongside instead of widening that type
    // for every caller on the site.
    const { data } = await supabase
      .from("materials")
      .select("slug, roll_width_mm, description")
      .in("slug", wallpaper.map((m) => m.slug));
    type Row = { slug: string; roll_width_mm: number | null; description: string | null };
    const meta = new Map(((data as Row[]) ?? []).map((r) => [r.slug, r]));
    return wallpaper.map((m) => ({
      slug: m.slug,
      name: m.name,
      rate: m.pricePerSqft as number,
      rollWidthMm: meta.get(m.slug)?.roll_width_mm ?? null,
      description: meta.get(m.slug)?.description ?? null,
      restricted: m.restricted,
    }));
  } catch (e) {
    console.error("office finishes failed:", (e as Error).message);
    return [];
  }
}

/**
 * The finishes as the cost estimator wants them.
 *
 * The note is the MATERIAL'S OWN description, not a sentence chosen by whether
 * the finish is restricted. That distinction stopped being safe the moment
 * Linen Textured came off `coming_soon` and went on general sale: both finishes
 * were then "unrestricted" and both got the line "the commercial default",
 * which is only ever true of one of them. A finish describes itself.
 */
export function estimatorRates(finishes: OfficeFinish[]): EstimatorRate[] {
  return finishes.map((f) => ({
    slug: f.slug,
    label: f.name,
    rate: f.rate,
    note:
      f.description ??
      (f.restricted ? "Comes with the Autograph range." : "Paste-the-wall, sheen-free."),
  }));
}

/**
 * One representative image per workspace tile — a photograph OF that space.
 *
 * This used to take the first card of the workspace's edit, which meant the
 * tile showed whatever design happened to top that edit, as its flat artwork.
 * Three tiles ran the same Stallion Spirit horses, because that design carries
 * several moods and so tops several edits at once, and none of them had the
 * room scene the tile was supposed to be advertising. A "Reception & lobby"
 * card showing a painting of horses tells a workplace buyer nothing about
 * whether we understand a lobby.
 *
 * So the picture is chosen for the ROOM, not for the design:
 *   1. a render of this exact space, from any design that has one;
 *   2. failing that, a generic office interior (`corpoffice`), or another
 *      office space — still a room, still furniture, still legible as a
 *      workplace;
 *   3. only if the catalogue has no office render at all, the edit's flat.
 * And no image is used twice across the seven tiles, for the reason the
 * homepage variety tracker exists: a grid repeating itself reads as broken.
 */
const OFFICE_SCENE_KEYS = [
  "reception", "boardroom", "meetingroom", "openplan",
  "phonebooth", "corridor", "cafeteria", "corpoffice",
] as const;

/**
 * Spaces `corpoffice` (a desk-and-chair private cabin) is a plausible stand-in
 * for — every one of these genuinely could contain that furniture. Corridor
 * and cafeteria cannot: a corridor has no desk in it, and a cafeteria's desk
 * would BE the wrong room. Using corpoffice there did not just show a
 * mismatched design, it showed a room that is not the room, and read as "this
 * space is actually a private cabin" rather than "we have not photographed
 * this space yet". Phone booths are excluded for the same reason at a
 * different scale — a booth is a pod, not an office with a desk in it.
 */
const DESK_LIKE_SCENES = new Set(["reception", "boardroom", "meetingroom", "openplan", "corpoffice"]);

type SceneShot = { handle: string; sceneKey: string; url: string };

async function officeSceneShots(): Promise<SceneShot[]> {
  // Scoped to the CURRENT Office range (product_tags.tag = 'Office'), not just
  // "any active design with one of these scene keys". A design can carry a
  // reception or boardroom render from before it was tagged into Office, or
  // from after migration 0137 removed Office from it (a devotional or
  // kid-tagged design, say) — the render sits in product_images either way,
  // scene_key intact, because a scene attaches to the IMAGE, not the tag. Left
  // unscoped, that design's photograph was the "Reception & lobby" tile on
  // production: a Pooja Room design that is not in the Office range at all.
  //
  // Filtered in two steps rather than one nested PostgREST filter two joins
  // deep (product_images -> products -> product_tags) — that shape is not
  // reliably supported by embedded-resource filtering and the rest of this
  // codebase avoids it (getProductsByTag et al. go through an RPC instead).
  const { data: officeRows, error: officeErr } = await supabase
    .from("product_tags")
    .select("product_id")
    .eq("tag", OFFICE_TAG);
  if (officeErr) {
    console.error("office scene shots (tag lookup) failed:", officeErr.message);
    return [];
  }
  const officeIds = (officeRows ?? []).map((r) => r.product_id);
  if (!officeIds.length) return [];

  const { data, error } = await supabase
    .from("product_images")
    .select("url, scene_key, product_id, products!inner ( handle, status, is_service )")
    .in("scene_key", OFFICE_SCENE_KEYS as unknown as string[])
    .in("product_id", officeIds)
    .eq("products.status", "active")
    .eq("products.is_service", false);
  if (error) {
    console.error("office scene shots failed:", error.message);
    return [];
  }
  return ((data as unknown as { url: string; scene_key: string; products: { handle: string } }[]) ?? [])
    .map((r) => ({ handle: r.products.handle, sceneKey: r.scene_key, url: r.url }));
}

export async function getWorkspaceTiles(): Promise<
  {
    slug: string;
    label: string;
    tease: string;
    image: string | null;
    /** True when the representative artwork is taller than it is wide — the
     *  tile then shows it whole instead of cropping it to the tile's shape.
     *  A booth panel is 1:2.5, and cover-cropping that into a 4:3 tile leaves
     *  a horizontal sliver of the middle. */
    portrait: boolean;
    total: number;
  }[]
> {
  const [counts, shots] = await Promise.all([curatedCounts(), officeSceneShots()]);
  const used = new Set<string>();

  /**
   * Best unused shot for a space, in the preference order described above.
   *
   * The corpoffice stand-in (tier 2) and the "any other office space" catch-all
   * (tier 3) are BOTH skipped for a space that is not desk-like — corridor,
   * cafeteria, a future space with the same shape. Showing no photograph yet
   * (falling through to the edit's flat, in getWorkspaceTiles below) is a
   * franker admission than showing a private cabin desk and calling it a
   * corridor.
   */
  const pickShot = (sceneKey: string): SceneShot | null => {
    const deskLike = DESK_LIKE_SCENES.has(sceneKey);
    const tiers = [
      shots.filter((s) => s.sceneKey === sceneKey),
      ...(deskLike
        ? [
            shots.filter((s) => s.sceneKey === "corpoffice"),
            shots.filter((s) => s.sceneKey !== sceneKey && DESK_LIKE_SCENES.has(s.sceneKey)),
          ]
        : []),
    ];
    for (const tier of tiers) {
      const fresh = tier.find((s) => !used.has(s.url));
      if (fresh) return fresh;
    }
    return null;
  };

  // Assigned in WORKSPACES order, synchronously, BEFORE any awaiting: sharing
  // `used` across concurrent callbacks would race and let two tiles claim the
  // same photograph, which is the duplication this exists to prevent.
  const shotFor = new Map<string, SceneShot | null>();
  for (const w of WORKSPACES) {
    const shot = pickShot(w.sceneKey);
    if (shot) used.add(shot.url);
    shotFor.set(w.slug, shot);
  }

  return Promise.all(
    WORKSPACES.map(async (w) => {
      const edit = await getWorkspaceEditWith(w, counts, 1);
      const shot = shotFor.get(w.slug) ?? null;
      // A room render is always landscape; only the flat fallback can be tall.
      const ratio = shot ? null : edit.cards[0]?.aspectRatio ?? null;
      return {
        slug: w.slug,
        label: w.label,
        tease: w.tease,
        image: shot?.url ?? edit.cards[0]?.image ?? null,
        portrait: ratio != null && ratio < 0.9,
        total: edit.total,
      };
    }),
  );
}
