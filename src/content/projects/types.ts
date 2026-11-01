// A case study is DATA, never JSX. One file per project in this folder, one
// renderer (`ProjectBook`) for all of them — so the second book is an
// afternoon's work and every book carries the same argument in the same order.
//
// The skeleton never moves. What changes between projects is the `theme`,
// which swaps palette, type pairing, page density and transition speed so a
// hospitality book can feel warm and a workplace book precise, without the
// two reading as two different companies.

export type ProjectTheme = "precise" | "warm" | "calm" | "bright" | "dusk";

/**
 * Concept studies are speculative work for an invented client; commissioned
 * projects were built for a real one. The distinction is rendered on the
 * cover, not buried — a reader who later works out that a "case study" was
 * imagined has been misled, and that costs more than the study is worth.
 */
export type ProjectKind = "concept" | "commissioned";

export type Segment = "workplaces" | "hospitality" | "healthcare" | "education" | "retail";

/** A wall, before and after. The plain frame is the reader's own wall. */
export type Chapter = {
  /** Where in the building: "Main reception", "Lift lobby". */
  space: string;
  /** The chapter name: "Many Minds, One System". */
  title: string;
  /** Why this design belongs on this wall. One or two sentences. */
  rationale: string;
  /**
   * R2 object key for the bare architectural frame. Optional: not every wall
   * has a usable "before" — a hero shot may exist alone — and a chapter
   * without one renders as a single full-bleed plate rather than a reveal.
   */
  plain?: string;
  /** R2 object key for the same frame, curated. Must be the SAME camera. */
  curated: string;
  /** Alt text for the curated frame. */
  alt: string;
  /**
   * CSS aspect-ratio override (e.g. "4/1"), for artwork whose real proportions
   * are far from the 16:9 default — a wall band meant to run the full width
   * of a room, shown at its own shape. The default exists because most
   * chapters are photographs close enough to 16:9 that forcing one number
   * keeps the book's rhythm consistent; this escapes that rhythm only when
   * cropping to 16:9 would genuinely lose part of the composition (checked
   * by simulating the actual object-cover crop, not guessed).
   */
  aspect?: string;
  /**
   * Optional studies shown beneath the plate, as the artworks themselves
   * rather than as a room. Used where a wall is genuinely a set — three lift
   * cars, a run of framed panels — and the render alone flattens three
   * separate drawings into one photograph of a corridor.
   */
  series?: {
    /** R2 object key for the study. */
    key: string;
    alt: string;
    /** Short label under the study: "The elevations". */
    caption?: string;
    /** CSS aspect-ratio for the standalone artwork. Defaults to 2/3. */
    aspect?: string;
  }[];
};

/**
 * A building, wing or zone with its own sub-narrative. Optional: a single
 * feature wall has no use for it, a four-building district cannot be
 * explained without it.
 */
export type BuildingChapter = {
  name: string;
  /** "Culture, place and identity" */
  subtitle: string;
  body: string;
  /** What the artwork draws on. */
  draws: string[];
};

/**
 * The share of walls at each volume. This is the section that separates a
 * curator from a supplier: a campus where every wall is illustrated looks
 * like a wallpaper showroom, so saying out loud that half the walls should
 * stay quiet is the strongest possible proof that restraint is deliberate.
 */
export type WallLevel = {
  level: string;
  purpose: string;
  /** 0-100. Rendered as a bar as well as a number. */
  share: number;
};

/** A route through the building, told as the walls meet it. */
export type Journey = {
  who: string;
  /** Ordered stops, rendered as a path. */
  route: string[];
  body: string;
};

export type PaletteEntry = {
  name: string;
  /**
   * CSS colour, for the swatch — used to PAINT the band and never printed as
   * text. A hex on the page is the recipe, and the book is published where a
   * competitor can read it (her call, 2026-09-06); the name she gave the
   * colour is the whole of what a reader gets.
   */
  hex: string;
  purpose: string;
  /**
   * How much of the scheme this colour is, written as she writes it: "60-65%",
   * "Approximately 2%", "12". Optional, and optional is a finished state — a
   * palette with no shares renders as equal bands, which is the honest
   * rendering of "we have not said". Where a share IS given it becomes the
   * band's WIDTH, never a number on the page: see `PaletteStrip`.
   */
  share?: string;
};

export type Motif = {
  name: string;
  description: string;
  /** Optional R2 key for a small study image. */
  image?: string;
  /**
   * Optional link — used where a motif is an original artwork that also exists
   * as a design in the store, so a reader who wants THIS piece can reach it.
   * Deliberately available on motifs (the artwork studies) rather than on
   * chapter plates: a room render is a record of one commission, and sending
   * that straight to a priced product page makes authored work read as
   * catalogue stock.
   */
  href?: string;
};

export type ProcessStep = {
  title: string;
  body: string;
  image?: string;
};

/** The sideways band beside a flip-book plate — set vertically on the page. */
export type FlipCaption = {
  /** Family number in the programme: "01". Optional on secondary plates. */
  number?: string;
  /** Family name: "Tide". */
  title: string;
  /** Where in the building: "The double-height foyer". */
  space?: string;
  /** One or two quiet sentences. The book is image-led; resist more. */
  note?: string;
};

/**
 * One page of a flip book — a case study read LEFT TO RIGHT, one spread per
 * gesture, instead of the classic book's vertical scroll. Still pure data,
 * per this file's opening rule: the renderer (FlipBook) owns all markup.
 *
 * `dark` flips that spread's paper from ivory to the night ground — the
 * pages themselves darken when the book reaches the night rooms and return
 * to ivory after, so the paper participates in the story. `aspect` is
 * explicit wherever layout width depends on it: snap geometry must never
 * wait on an image's intrinsic size arriving late.
 */
export type FlipSpread =
  /** Full-bleed opening image; title/client/kind come from the Project. */
  | { type: "cover"; image: string; alt: string }
  /** A quiet chapter-turn page of type only. */
  | { type: "passage"; eyebrow?: string; title: string; body: string[]; dark?: true }
  /** The signature page: square image, sideways caption band on its right. */
  | { type: "plate"; image: string; alt: string; caption: FlipCaption; aspect?: string; dark?: true }
  /** Two artworks sharing one footprint — the two-towers spread. Portrait
   *  pairs (the default, "2/3") sit side by side; landscape pairs ("3/2")
   *  stack, because two wide sheets in a row would dwarf the viewport. */
  | { type: "pair"; images: [{ key: string; alt: string }, { key: string; alt: string }]; caption: FlipCaption; aspect?: string; dark?: true }
  /** An image running the full span of the viewport. */
  | { type: "panorama"; image: string; alt: string; aspect: string; caption?: FlipCaption; dark?: true }
  /** The project's palette, painted as bands — reuses `Project.palette`. */
  | { type: "palette" }
  /** The coverage proof: every space the programme considered, by group. */
  | { type: "index"; heading?: string; intro?: string; groups: { name: string; spaces: string[] }[] }
  /**
   * A dense grid of every wall at once. The proof-of-scope page: a book that
   * gave one spread to each of ninety designs would stop being a case study
   * and become a catalogue, so the density itself carries the argument.
   * Image keys may be absolute URLs (mediaUrl passes those through), which is
   * how the catalogue's own renders appear here without a second copy in R2.
   */
  | { type: "gallery"; heading?: string; intro?: string; images: { key: string; alt: string }[] }
  /** The closing page — reuses `Project.ask` (or the default closing copy). */
  | { type: "ask" };

export type Project = {
  slug: string;
  kind: ProjectKind;
  theme: ProjectTheme;
  segments: Segment[];

  /** "PulseGrid India" */
  client: string;
  /** R2 object key for the client's own logo, shown beside their name on the
   *  cover. Optional — only real commissioned work has a logo to show. */
  clientLogo?: string;
  /** "Signals Become Systems" — the title on the cover. */
  title: string;
  /** One line under the title. */
  standfirst: string;
  /** Facts for the cover plate: scale, city, wall count. */
  facts: { label: string; value: string }[];

  /** The hero image key for the cover and the index card. */
  cover: string;

  brief: { intro: string; requirements: string[] };
  interpretation: string[];
  palette: { intro?: string; entries: PaletteEntry[]; note?: string };
  motifs: { intro?: string; entries: Motif[] };
  chapters: Chapter[];

  /** Optional: only projects big enough to have distinct zones need these. */
  buildings?: { intro?: string; entries: BuildingChapter[] };
  /** Optional label when the entries describe directions or zones, not buildings. */
  buildingLabel?: string;
  wallHierarchy?: { intro?: string; note?: string; levels: WallLevel[] };
  journeys?: { intro?: string; entries: Journey[] };

  process: { intro?: string; steps: ProcessStep[] };
  /**
   * Overrides the journey heading, which otherwise counts the chapters and
   * calls them walls. Needed by any study whose chapters are not all walls —
   * a room view, an artwork sheet — where the count would otherwise claim a
   * wall that does not exist.
   */
  journeyHeading?: string;
  /** Overrides the default closing ask when a project invites something else. */
  ask?: { heading: string; body: string };
  /** The catalogue entry point for turning this study into a real purchase. */
  shop?: {
    heading: string;
    body: string;
    href: string;
    label: string;
  };
  /** Volunteered constraints. Buyers trust people who name them first. */
  productionNote: { title: string; body: string; points: string[] };

  /**
   * Present = this project renders as a left-to-right FLIP BOOK instead of
   * the classic vertical book, and its landscape PDF is composed from these
   * spreads. One coupled field rather than a flag plus a list, so a flip
   * project can never exist without its pages. The classic fields above stay
   * required either way — the index card, OG metadata and kind mark read
   * them regardless of presentation.
   */
  flip?: { spreads: FlipSpread[] };
};
