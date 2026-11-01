/**
 * Adda · Nakshi · Rekha · Nabh — four collections of five, sold into offices.
 *
 * These twenty murals began as concept directions for a corporate proposal and
 * were archived out of it unused. They are not one collection of twenty: only
 * ADDA is actually Kolkata. NAKSHI is Bengal as a craft rather than a place,
 * and REKHA and NABH carry no place at all and stand on their own stories.
 * That split is the reason for four rows and not one.
 *
 * Every panel is a MURAL — one composition scaled to the wall, so `is_seamless`
 * stays false and `repeat_width_cm` stays null. There is no `is_mural` column
 * and the `Mural` tag was deliberately dropped (migration 0137); non-seamless
 * IS the distinction.
 *
 * Palette names are Roheena's own words, carried over verbatim from the
 * original direction documents. Hexes and percentages exist in those documents
 * and are deliberately NOT here: the storefront shows a proportional strip and
 * her colour names, never the numbers.
 *
 * PRINT RESOLUTION — read before wondering why these are draft.
 * The source boards are 1790x879. The print engine builds a master by targeting
 * the short edge at 14400px, capped at 8x, and refuses anything under 100 DPI.
 * 879 x 8 = 7032px, which is 5.9ft of honest wall height — short of an office
 * wall. So a high-resolution re-render happens lazily, on the FIRST order for a
 * design, orchestrated by the OS, and is then cached per design for ever. These
 * products must not go active until that path exists.
 */

/** Rs/sq ft. The existing standard linen rate — not a collection-specific
 *  price. One substrate per design, per the catalogue's standing rule. */
export const OFFICE_RATE = 300;
export const OFFICE_MATERIAL = "linen-touch";

/** Every panel carries these in addition to its collection tag. The
 *  `Office: <zone>` sub-facets are the ones studio-scenes.ts already knows. */
export const OFFICE_BASE_TAGS = ["Office"] as const;

export type Panel = {
  /** Slug suffix; the product handle is `<collection handle>-<slug>`. */
  slug: string;
  name: string;
  /** Source file under the collection's art directory. */
  file: string;
  /** One line, shown under the panel name. */
  line: string;
  /** Office zones this panel in particular suits, as `Office: <zone>` facets. */
  zones: string[];
};

export type OfficeCollection = {
  handle: string;
  title: string;
  /** collections.rule_tag, and the product tag. House convention: == title. */
  tag: string;
  /** Devanagari or Bengali, for display only. */
  script: string;
  subtitle: string;
  /** collections.description and the collection-page intro. */
  description: string;
  /** Roheena's colour names, in her order of dominance. */
  palette: string[];
  /** Where it belongs in a building — merchandising copy, not a rule. */
  placement: string;
  /** Art directory name under the source root. */
  srcDir: string;
  /** The five-panel set sold alongside the singles (collections.kind='set'). */
  setHandle: string;
  setTag: string;
  setBlurb: string;
  panels: Panel[];
};

export const OFFICE_COLLECTIONS: OfficeCollection[] = [
  {
    handle: "adda",
    title: "Adda",
    tag: "Adda",
    script: "আড্ডা",
    subtitle: "Kolkata, thinking out loud",
    description:
      "Kolkata has never been a city of monuments so much as a city of argument — books, questions, printing presses, river traffic and people who would rather discuss a thing than settle it. Adda takes that inheritance apart and reassembles it: archival paper, ink drawing, botanical study and architectural fragment, opening gradually into something that looks like thought organising itself.",
    palette: [
      "warm parchment and paper tones",
      "Bengal ink, indigo and charcoal",
      "Hooghly grey-blue",
      "oxide and terracotta red",
      "controlled magenta accents",
    ],
    placement:
      "Reception, visitor-facing corridors, and anywhere the Kolkata identity should be understood before anyone says it out loud.",
    srcDir: "1",
    setHandle: "adda-set",
    setTag: "Adda Set",
    setBlurb:
      "All five panels of Adda, in order — a corridor or a floor that reads as one argument rather than five pictures.",
    panels: [
      {
        slug: "the-reading-city",
        name: "The Reading City",
        file: "1.png",
        line: "Books, diagrams, natural studies and architectural fragments — knowledge piled up rather than arranged.",
        zones: ["Reception", "Boardroom"],
      },
      {
        slug: "what-the-delta-sends",
        name: "What the Delta Sends",
        file: "2.png",
        line: "The story widens past the city: landscapes and pathways arriving from Bengal and beyond.",
        zones: ["Corridor", "Meeting Room"],
      },
      {
        slug: "the-river-trades",
        name: "The River Trades",
        file: "3.png",
        line: "The Hooghly, the bridges, the routes of exchange. Movement as the city's real architecture.",
        zones: ["Corridor", "Reception"],
      },
      {
        slug: "from-hand-to-pattern",
        name: "From Hand to Pattern",
        file: "4.png",
        line: "The tactile, imperfect marks of human thought resolving into organised networks.",
        zones: ["Meeting Room", "Workstations"],
      },
      {
        slug: "outward",
        name: "Outward",
        file: "5.png",
        line: "Those ideas leaving, into a system much larger than the city that made them.",
        zones: ["Reception", "Boardroom"],
      },
    ],
  },

  {
    handle: "nakshi",
    title: "Nakshi",
    tag: "Nakshi",
    script: "নকশি",
    subtitle: "Made by many hands",
    // Named for nakshi kantha, Bengal's embroidered quilt. NOT "Kantha" — that
    // is one letter from the existing `katha` collection and would collide on
    // the same shelf.
    description:
      "A single thread is nothing. Threads that cross and hold one another are a structure — which is the whole logic of Bengal's textile tradition, and not a bad description of how anything gets built. Nakshi uses that logic rather than its decoration: running stitch, indigo, madder and turmeric over open weave, tightening from something clearly made by hand into something clearly organised.",
    palette: [
      "unbleached ecru",
      "deep indigo",
      "madder red",
      "faded turmeric ochre",
      "charcoal",
    ],
    placement:
      "The warmest and most tactile of the four. Meeting rooms, cafeterias, the wall people sit near rather than walk past.",
    srcDir: "4",
    setHandle: "nakshi-set",
    setTag: "Nakshi Set",
    setBlurb:
      "All five panels of Nakshi, in order — hand work tightening into structure across a floor.",
    panels: [
      {
        slug: "the-long-stitch",
        name: "The Long Stitch",
        file: "1.png",
        line: "Repeated running stitch over layered woven fields — patience as a kind of knowledge.",
        zones: ["Meeting Room", "Cafeteria"],
      },
      {
        slug: "threads-come-together",
        name: "Threads Come Together",
        file: "2.png",
        line: "Separate bands arriving from different directions into one central woven structure.",
        zones: ["Reception", "Meeting Room"],
      },
      {
        slug: "on-the-loom",
        name: "On the Loom",
        file: "3.png",
        line: "Long stitched currents across open, loom-like grids. Motion held in cloth.",
        zones: ["Corridor", "Cafeteria"],
      },
      {
        slug: "hand-into-grid",
        name: "Hand into Grid",
        file: "4.png",
        line: "Irregular hand stitching resolving, panel by panel, into a precise matrix.",
        zones: ["Workstations", "Meeting Room"],
      },
      {
        slug: "threads-travel",
        name: "Threads Travel",
        file: "5.png",
        line: "Individual threads released from a dense field, reaching distant clusters.",
        zones: ["Corridor", "Boardroom"],
      },
    ],
  },

  {
    handle: "rekha",
    title: "Rekha",
    tag: "Rekha",
    script: "रेखा",
    subtitle: "The line as the whole argument",
    description:
      "Rekha maps energy rather than places. Contours, routes, a river and a single point of origin on a warm ivory ground, with the space between the lines doing as much work as the lines. It is not trying to fill the wall. It is the quietest thing we make, and it holds a room without ever competing for it.",
    palette: ["warm ivory", "soft graphite", "pale river blue", "a signal red"],
    placement:
      "Boardrooms, long corridors, and any room that already has enough going on. The one an architect will choose.",
    srcDir: "3",
    setHandle: "rekha-set",
    setTag: "Rekha Set",
    setBlurb:
      "All five panels of Rekha, in order — one map unfolding from a single point to a wider field.",
    panels: [
      {
        slug: "origin",
        name: "Origin",
        file: "1.png",
        line: "Faint layers radiating from a single marked point.",
        zones: ["Boardroom", "Reception"],
      },
      {
        slug: "where-routes-meet",
        name: "Where Routes Meet",
        file: "2.png",
        line: "Many routes, from many directions, gathering into shared centres.",
        zones: ["Meeting Room", "Corridor"],
      },
      {
        slug: "the-long-current",
        name: "The Long Current",
        file: "3.png",
        line: "A calm river-like current; routes cross, separate and find each other again.",
        zones: ["Corridor", "Workstations"],
      },
      {
        slug: "branching",
        name: "Branching",
        file: "4.png",
        line: "Pathways dividing, deciding, dividing again.",
        zones: ["Meeting Room", "Boardroom"],
      },
      {
        slug: "the-wider-field",
        name: "The Wider Field",
        file: "5.png",
        line: "A concentrated source opening into something much larger.",
        zones: ["Boardroom", "Reception"],
      },
    ],
  },

  {
    handle: "nabh",
    title: "Nabh",
    tag: "Nabh",
    script: "नभ",
    subtitle: "The living network",
    description:
      "Intelligence drawn as something fluid rather than mechanical: no circuits, no chips, no robots. Light, particles and currents gather, reorganise and expand across five panels, from faint beginnings to structure to reach. The darkest and most immersive of the four, and the one that tells a visitor where they are before they read a single sign.",
    palette: [
      "midnight blue-black",
      "spectral river blue and silver-white",
      "coral light",
      "magenta",
    ],
    // Deep colour over a wide wall: this is the set whose panel joins and
    // banding will show first, which is why its proof strip is printed before
    // the other three.
    placement:
      "Reception and the all-hands wall, where drama is the point. Deep colour, so it wants controlled light rather than a window behind it.",
    srcDir: "5",
    setHandle: "nabh-set",
    setTag: "Nabh Set",
    setBlurb:
      "All five panels of Nabh, in order — from first light to a network reaching outward.",
    panels: [
      {
        slug: "first-light",
        name: "First Light",
        file: "1.png",
        line: "Faint layers surfacing out of the dark.",
        zones: ["Reception", "Corridor"],
      },
      {
        slug: "confluence",
        name: "Confluence",
        file: "2.png",
        line: "Separate streams of energy meeting in shared fields.",
        zones: ["Meeting Room", "Reception"],
      },
      {
        slug: "the-fast-current",
        name: "The Fast Current",
        file: "3.png",
        line: "Movement, acceleration, exchange at speed.",
        zones: ["Corridor", "Workstations"],
      },
      {
        slug: "the-network-forms",
        name: "The Network Forms",
        file: "4.png",
        line: "Loose particles resolving into branching, deliberate structure.",
        zones: ["Boardroom", "Meeting Room"],
      },
      {
        slug: "outward-everywhere",
        name: "Outward, Everywhere",
        file: "5.png",
        line: "Concentrated capability released into many fields at once.",
        zones: ["Reception", "Boardroom"],
      },
    ],
  },
];

/** `<collection>-<panel>`, e.g. `adda-the-reading-city`. */
export function panelHandle(c: OfficeCollection, p: Panel): string {
  return `${c.handle}-${p.slug}`;
}

/** Product title as shown in the catalogue. The collection name is carried by
 *  the collection page, so the product is titled by its own idea. */
export function panelTitle(c: OfficeCollection, p: Panel): string {
  return `${p.name} — ${c.title}`;
}
