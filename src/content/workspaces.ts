/**
 * The office section — one definition per workspace type, and the source of
 * truth for /office and /office/[space].
 *
 * WHY THIS EXISTS SEPARATELY FROM /commercial.
 * /commercial sells a commission: read the building, design a visual language,
 * proof, produce, install. It answers with a quotation and a conversation.
 * That is the right page for a campus and the wrong page for an office manager
 * with one meeting room and a reception wall, who bounces off "request a quote"
 * and is not going to wait a day to learn a price.
 *
 * So /office is the SHOPPABLE rung: priced, browsable, add-to-cart, no form in
 * the way. It hands the large brief up to /commercial rather than competing
 * with it — see the handoff at the foot of every space page.
 *
 * CURATION MODEL. Each space names a `curatedTag` it would LIKE to show (a tag
 * a human applies deliberately, e.g. "Office: Meeting Room") and a `fallback`
 * of catalogue tags that stands in until enough designs carry it. The page
 * renders whichever is real, so this section works on today's catalogue and
 * gets sharper the moment someone starts tagging — without a code change.
 * `MIN_CURATED` is the switchover: below it a curated tag reads as an accident
 * rather than an edit.
 *
 * Copy rule, inherited from src/content/segments.ts: say what the wall DOES for
 * the space, in the buyer's vocabulary. The buyer here is either an office
 * manager (small fit-out, wants price and downtime) or an architect specifying
 * for a client (wants the spec sheet and samples) — every space has to answer
 * both without reading as two pages stapled together.
 */

/** Base tag every office edit is drawn from — the "Office Wallpaper" room collection. */
export const OFFICE_TAG = "Office";

/** The collection an office shopper falls back to when they want everything. */
export const OFFICE_COLLECTION = "office-wallpaper";

/**
 * Below this, a curated tag is treated as not-yet-real and the fallback edit
 * renders instead. Eight is the same threshold the homepage uses to decide a
 * collection is thick enough to headline (getShowcasePool) — a grid shorter
 * than that reads as a bug.
 */
export const MIN_CURATED = 8;

export type Workspace = {
  slug: string;
  /** Nav, tile and breadcrumb label. */
  label: string;
  /**
   * The <title> and the phrase a search actually carries. Separate from
   * `label` because the label is a floor-plan word ("Meeting & conference
   * rooms") and reads badly with "Wallpaper" bolted on, while the search term
   * is singular and specific.
   */
  seoTitle: string;
  /** Page h1 — a sentence about the space, never a category name. */
  title: string;
  /** Tile blurb on the hub. One line, says what the wall is FOR here. */
  tease: string;
  standfirst: string;
  /**
   * The tag a curator applies to put a design in this edit deliberately.
   * Used the moment MIN_CURATED designs carry it.
   */
  curatedTag: string;
  /**
   * Catalogue tags ANDed with the Office base until the curated tag fills.
   *
   * Counts against the cleaned Office range (110 designs after migration 0137
   * removed the kid-tagged, floral and devotional ones): reception 57, meeting
   * rooms 54, corridors 32, workstations 25, boardroom 15, phone booths 15,
   * cafeteria 16. The page shows 12, so every edit fills. Re-check with
   * collection_facets_v2 before changing one — a fallback that drops under 12
   * renders a visibly short grid.
   */
  fallback: string[];
  /** The Studio scenario whose renders this page's cards should show. */
  sceneKey: string;
  /** What the buyer is actually worried about in this space. */
  considerations: { t: string; d: string }[];
  /** A real wall this space typically has, for the cost worked example. */
  typicalWall: { label: string; widthFt: number; heightFt: number };
};

export const WORKSPACES: Workspace[] = [];

export function getWorkspace(slug: string): Workspace | undefined {
  return WORKSPACES.find((w) => w.slug === slug);
}
