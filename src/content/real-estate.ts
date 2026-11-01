/**
 * The real estate section — one definition per common area, and the source of
 * truth for /real-estate and /real-estate/[space].
 *
 * WHO THIS PAGE IS FOR, AND WHY IT IS NOT /office OR /hospitality.
 * The buyer here is a developer, a project architect, or the facilities head
 * of a residents' association — someone specifying the walls a building HANDS
 * OVER rather than the walls a family chooses. That is a genuinely different
 * brief from both neighbours:
 *
 *   · An office wall is read by employees who did not choose it but are paid
 *     to be there. A lobby wall is read by owners, several times a day, for
 *     the twenty years they live above it. There is no equivalent tolerance.
 *   · A hotel wall is meant to be photographed and posted — it can afford to
 *     be a statement, because the guest leaves on Sunday. The same wall in a
 *     residential tower has to survive four hundred families having opinions
 *     about it, and a design that impresses on handover and grates by month
 *     three becomes a warranty call.
 *
 * So the whole section is deliberately SOBER. Every space's edit excludes
 * Bold, Dark and Mood: Dramatic (see scripts/stage-spaces.ts), not because
 * those designs are worse but because they are the wrong answer to "a wall
 * nobody chose and everybody sees". The one exception is the children's play
 * space, which is allowed to be cheerful — that is the point of the room.
 *
 * CURATION MODEL — HOSPITALITY'S, NOT THE OFFICE'S. Every card on a space page
 * is a design that actually carries that space's scene render. No flats
 * padding the grid, no fallback tag standing in for imagery that does not
 * exist. /office can fall back because 133 designs already carried "Office";
 * nothing here has ever been tagged for a lift lobby, so a fallback would just
 * be a guess wearing a section's name. See src/lib/real-estate.ts.
 *
 * WHY THESE SEVEN. They are the rooms a developer actually briefs: the
 * entrance lobby, the lift lobby repeated on every floor, and the clubhouse —
 * banquet hall, kids' room, gym, work lounge, games room. The banquet hall is
 * specified as an OPEN room rather than a laid one, because that is how it is
 * handed over and how it is seen on nine days out of ten.
 *
 * Copy rule, inherited from src/content/segments.ts: say what the wall DOES
 * for the space, in the buyer's vocabulary — handover, snagging, repeat
 * elevations, maintenance by a facilities team rather than an owner, and the
 * fact that one design is bought forty times over for forty identical floors.
 */

export type RealEstateSpace = {
  slug: string;
  /** Nav, tile and breadcrumb label. Must match the Studio picker's chip. */
  label: string;
  /** The <title> and the phrase a search actually carries. */
  seoTitle: string;
  /** Page h1 — a sentence about the space, never a category name. */
  title: string;
  /** Tile blurb on the hub. One line, says what the wall is FOR here. */
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
  /**
   * True where a development builds this space ONCE PER TOWER — the entrance
   * lobby, the staircase, the lift lobbies, the corridors, the roof. Those are
   * the only spaces where a two-tower scheme legitimately carries two
   * colourways.
   *
   * Everything else on this page is a SHARED amenity: a development has one
   * clubhouse, one pool, one gym, one library, sized for both towers rather
   * than duplicated. Claiming a Dawn gym and a Dusk gym describes a building
   * nobody builds, which is exactly the kind of detail a developer notices
   * first. See the Shorelight case study's interpretation.
   */
  perTower?: true;
};

export const REAL_ESTATE_SPACES: RealEstateSpace[] = [];

export function getRealEstateSpace(slug: string): RealEstateSpace | undefined {
  return REAL_ESTATE_SPACES.find((s) => s.slug === slug);
}
