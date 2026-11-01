/**
 * The hospitality section — one definition per space type, and the source of
 * truth for /hospitality and /hospitality/[space].
 *
 * MODELLED ON src/content/workspaces.ts (the /office section), but the shape
 * underneath is different and this file does NOT reuse that machinery
 * unchanged. /office hangs off one base tag ("Office") and each workspace
 * narrows it with a curated-tag-or-fallback edit. Hospitality has no base
 * tag — "Hotel Lobby & Reception", "Cafés", "Restaurants", "Fine Dining" and
 * "Wellness & Spa Interiors" are five independent collections that share a hub.
 * The hub is a UNION of their tags, not a filter over a common one, so there
 * is no OFFICE_TAG / OFFICE_SCOPE equivalent here — see src/lib/hospitality.ts.
 *
 * WHY THIS EXISTS SEPARATELY FROM /commercial. Same reasoning as /office: a
 * hotel or restaurant owner (or the architect specifying for them) wants a
 * price and a browsable edit, not a campus-scale conversation. /commercial
 * stays the right page for a whole property; this is the shoppable rung
 * underneath it, and hands the large brief back up — see the handoff at the
 * foot of every space page.
 *
 * CURATION MODEL — DELIBERATELY NOT THE OFFICE ONE. /office shows a MIN_CURATED
 * fallback edit so a thin curated tag never renders a bare grid. Roheena ruled
 * that out here: every card on a hospitality space page must be a design that
 * actually has that space's scene render (hotellobby / cafe / spa), full stop —
 * no flats padding the grid, no tag fallback standing in for a missing photo
 * shoot. That is honest about what exists (hotel lobby: 6, cafés: 24, spa: 4)
 * rather than padding the count, and each page links out to the full tagged
 * collection ("See all N designs") for everything that doesn't have the shot
 * yet. Render counts are short because the renders are short — the fix is
 * shooting more scenes, not loosening the filter. See getSpaceEdit in
 * src/lib/hospitality.ts.
 *
 * WHY CAFÉS, RESTAURANTS AND FINE DINING ARE THREE SPACES, NOT ONE. They were
 * one ("Cafés & restaurants") until a single scene prompt was asked to serve
 * all three and produced a café every time — so a restaurateur browsing the hub
 * saw bentwood chairs and daylight and correctly concluded the page was not for
 * them. The rooms differ in the two things that decide a design: the light
 * (daylight / low pendant / lit wall in a dark room) and the reading distance
 * (a forearm / across a laid table / three hours from a set-back chair). The
 * café space KEEPS the `cafes-restaurants` handle even though it is now cafés
 * only — that URL is indexed and its 24 renders are all cafés. Only the tag and
 * title were renamed.
 *
 * WHY NOT MORE SPACES. Retail & Showroom Spaces carries one tagged design, so
 * there is no space worth a page there yet. Reception's
 * `reception` scene key belongs to /office/reception (an office lobby, shot
 * for that page) — a hotel lobby gets its own `hotellobby` render and must
 * never borrow the office one, so hospitality's hotel-lobby space filters on
 * `hotellobby` only.
 *
 * Copy rule, inherited from src/content/segments.ts (same as /office): say
 * what the wall DOES for the space, in the buyer's vocabulary. The buyer here
 * is a hotel/F&B/spa owner or the architect specifying for them — footfall,
 * cleanability, fire/safety expectations of a commercial premises, the scale
 * of a real lobby wall, lighting, and how the wall photographs (guests post
 * it). Every space answers both audiences without reading as two pages
 * stapled together.
 */

/** The collection page a space's "see all" link falls back to. */
export type HospitalitySpace = {
  slug: string;
  /** Nav, tile and breadcrumb label. */
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
  /** The Studio scenario whose renders this page's cards must show — see the
   *  hard-filter note above. Never a scene borrowed from another section. */
  sceneKey: string;
  /**
   * OPTIONAL editorial pin for the hub tile's image — the handle whose scene
   * render represents this space on /hospitality.
   *
   * Without it the tile takes cards[0], i.e. whatever the catalogue happens to
   * sort first, which is not an editorial decision. Hotel lobby landed on a
   * framed canvas hung in a gallery-lit room: a true render of that product,
   * but it sells art on a bare wall, not the wallpaper this page exists to
   * sell. The pin is a handle, not a URL, so the image still comes from the
   * live render — re-shoot the scene and the tile follows.
   *
   * If the handle is missing, unpublished, or has lost its render, the tile
   * falls back to cards[0] rather than going blank.
   */
  tileHandle?: string;
  /** What the buyer is actually worried about in this space. */
  considerations: { t: string; d: string }[];
  /** A real wall this space typically has, for the cost worked example. */
  typicalWall: { label: string; widthFt: number; heightFt: number };
};

export const HOSPITALITY_SPACES: HospitalitySpace[] = [];

export function getHospitalitySpace(slug: string): HospitalitySpace | undefined {
  return HOSPITALITY_SPACES.find((s) => s.slug === slug);
}
