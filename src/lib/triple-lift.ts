/**
 * TRIPLE LIFT — the hospitality and commercial collection.
 *
 * Eight sets of three panels, each set sized for a bank of three lift doors.
 * This is the first collection Zyvorah has drawn for an architectural opening
 * rather than a wall: a residential repeat is authored 1:1 and tiles anywhere,
 * whereas a lift panel is a mural cut to one specific two-leaf door front and
 * does not repeat at all.
 *
 * ONE SET IS ONE PURCHASABLE LINE. A cart line is a single product row (one
 * product, one material, one size), so each set is one `products` row and its
 * three panels live in `product_images`. The set explodes into three walls at
 * order time — three doors, three sets of measurements, three files — because
 * an order line carries exactly one `design_ref`.
 */

/** The collection tag. Membership is by tag: `collections.rule_tag` matches
 *  this, and the collection only appears in navigation once an ACTIVE product
 *  carries it (populated_collection_tags, migration 0040). */
export const LIFT_TAG = "Triple Lift";

export const LIFT_COLLECTION_HANDLE = "triple-lift";

/** Rs 400 per sq ft across the collection — Roheena, 4 September 2026. Flat, so
 *  unlike TAASH there is no per-group ladder. It is written to
 *  product_materials.price_per_sqft, which is where a line's rate is read from
 *  (corporate-project.ts). It is NOT a price tier: these sit on `standard`, and
 *  this script never writes price_tier at all. */
export const LIFT_RATE = 400;

/** Matt linen-textured non-woven, as the rest of the wallcovering catalogue.
 *  Worth revisiting for this collection specifically: matte dot gain is what
 *  crushes deep shadow to solid black, and a lift lobby is a high-touch surface. */
export const LIFT_MATERIAL = "linen-touch";

export type LiftPanel = {
  /** Exact filename inside the set's folder. Names are irregular across the
   *  eight sets because two were exported separately; carried literally rather
   *  than derived, so a rename fails loudly here instead of silently skipping. */
  file: string;
  /** The panel's own title where the artwork has one, else null — the six
   *  regenerating sets ship as "Lift 1/2/3" with no individual names yet. */
  title: string | null;
};

export type LiftSet = {
  handle: string;
  title: string;
  /** Folder name under the art directory. */
  dir: string;
  lobby: string;
  panels: [LiftPanel, LiftPanel, LiftPanel];
  blurb: string;
  /**
   * What the panel files actually ARE.
   *
   *   "clean"       the artwork itself, printable in kind.
   *   "render-crop" a crop of the lobby render, carrying the bronze door
   *                 surround — and on Blue lift 3, a door handle — baked into
   *                 its edges.
   *
   * Blue and Brown were delivered this way. They are the two sets that pass
   * every NUMERIC check — 2048x4096, 1:2.00, sRGB, low shadow crush — and they
   * pass precisely BECAUSE they were cut from a high-resolution render instead
   * of authored as masters. Printing one puts a photograph of a bronze frame
   * onto a real bronze-framed door. No measurement catches this; only looking
   * at the file does, which is why it survived a full numeric audit.
   */
  artwork: "clean" | "render-crop";
  /**
   * Whether this set can be printed today. NONE can, for two different reasons
   * that need two different fixes:
   *
   *   Blue, Brown    not artwork at all (see `artwork`). Needs real masters,
   *                  which may never have existed separately from the render.
   *   The other six  genuine artwork, but 1024 x 1536 at 1:1.50 — 95 DPI on a
   *                  1100 mm door, under the engine's 100 DPI floor, and the
   *                  wrong shape for a lift front. Needs regenerating at
   *                  2048 x 4096, 1:2.00.
   *
   * Everything seeds as draft regardless; this flag exists so the activation
   * step cannot quietly take an unprintable set live.
   */
  ready: boolean;
};

const LOBBY = "00 - Three-Lift Lobby Render.png";

/** Panels named "01 - Lift 1 Wallpaper.png" and so on, with no individual titles. */
const plain = (): [LiftPanel, LiftPanel, LiftPanel] => [
  { file: "01 - Lift 1 Wallpaper.png", title: null },
  { file: "02 - Lift 2 Wallpaper.png", title: null },
  { file: "03 - Lift 3 Wallpaper.png", title: null },
];

export const LIFT_SETS: LiftSet[] = [
  {
    handle: "triple-lift-blue",
    title: "Blue",
    dir: "Blue Triple Lift",
    lobby: LOBBY,
    panels: [
      { file: "01-Lift-1-Blue-Contour-Landscape.png", title: "Contour Landscape" },
      { file: "02-Lift-2-Blue-Mineral-Mist.png", title: "Mineral Mist" },
      { file: "03-Lift-3-Blue-Constellation-Map.png", title: "Constellation Map" },
    ],
    blurb:
      "Three blue panels that move from drawn contour to dissolved mineral cloud to " +
      "a mapped night — a landscape read three ways across a bank of lifts.",
    artwork: "render-crop",
    ready: false,
  },
  {
    handle: "triple-lift-brown",
    title: "Brown",
    dir: "Brown Triple Lift",
    lobby: LOBBY,
    panels: [
      { file: "01-Lift-1-Brown-River-Contours.png", title: "River Contours" },
      { file: "02-Lift-2-Brown-Architectural-Geometry.png", title: "Architectural Geometry" },
      { file: "03-Lift-3-Brown-Topographic-Map.png", title: "Topographic Map" },
    ],
    blurb:
      "Earth-toned cartography: a river read as contour, a building read as grid, and " +
      "the ground itself read as survey.",
    artwork: "render-crop",
    ready: false,
  },
  {
    handle: "triple-lift-sepia-sketch",
    title: "Sepia Sketch",
    dir: "Sepia Sketch Triple Lift",
    lobby: LOBBY,
    panels: [
      { file: "01 - Lift 1 - Canal City Sketch.png", title: "Canal City" },
      { file: "02 - Lift 2 - Aerial River City Sketch.png", title: "Aerial River City" },
      { file: "03 - Lift 3 - Architectural Elevations Sketch.png", title: "Architectural Elevations" },
    ],
    blurb:
      "A city drawn three times in sepia — at the waterline, from the air, and in " +
      "elevation.",
    artwork: "clean",
    ready: true,
  },
  {
    handle: "triple-lift-nocturne",
    title: "Nocturne",
    dir: "Nocturne Triple Lift",
    lobby: LOBBY,
    panels: plain(),
    blurb: "A moonlit night in gold linework on deep indigo, carried across three doors.",
    artwork: "clean",
    ready: true,
  },
  {
    handle: "triple-lift-botanical-etching",
    title: "Botanical Etching",
    dir: "Botanical Etching Triple Lift",
    lobby: LOBBY,
    panels: plain(),
    blurb:
      "Branch, leaf and stem drawn as etching — three studies that read as one " +
      "herbarium across a lift bank.",
    artwork: "clean",
    ready: true,
  },
  {
    handle: "triple-lift-geological",
    title: "Geological",
    dir: "Geological Triple Lift",
    lobby: LOBBY,
    panels: plain(),
    blurb: "Strata, sediment and fault drawn as a section through the ground.",
    artwork: "clean",
    ready: true,
  },
  {
    handle: "triple-lift-woven-geometry",
    title: "Woven Geometry",
    dir: "Woven Geometry Triple Lift",
    lobby: LOBBY,
    panels: plain(),
    blurb: "An interlace that tightens and loosens across the three panels.",
    artwork: "clean",
    ready: true,
  },
  {
    handle: "triple-lift-plaster-collage",
    title: "Plaster Collage",
    dir: "Plaster Collage Triple Lift",
    lobby: LOBBY,
    panels: plain(),
    blurb: "Torn and layered plaster, built up as a surface rather than a picture.",
    artwork: "clean",
    ready: true,
  },
];
