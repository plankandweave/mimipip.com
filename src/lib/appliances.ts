/**
 * The appliances a wrap can be made for, and everything that differs between
 * them that is not a number in the database.
 *
 * WHY THIS FILE EXISTS. The fridge build put its family knowledge in two
 * places: the format rows in Postgres, and a scatter of `isFridge` branches
 * through the product page, the buy box, the cart pin and the studio. One
 * appliance made that fine. Five turns every one of those branches into a chain
 * — and a chain is where the sixth appliance gets forgotten in exactly one of
 * them and nobody notices until a customer sees "See it on your fridge" above a
 * dishwasher.
 *
 * So: one record, keyed by appliance, holding the copy and the behaviour flags.
 * Sizes, prices and drawing geometry are NOT here — those live in wrap_formats,
 * because they change without a deploy and this file does not.
 *
 * The division of labour, stated once:
 *   wrap_appliances (DB)  labels and picker grouping, so a landing page can be
 *                         built from a query alone
 *   wrap_formats (DB)     panel sizes, prices, fit bands, drawing spec
 *   this file             copy, aspect targets, and what the product is allowed
 *                         to do (made-to-measure? a model finder?)
 */

/** Every appliance in the range. Matches wrap_appliances.appliance exactly. */
export type ApplianceKey =
  | "fridge"
  | "ac"
  | "washer-front"
  | "washer-top"
  | "dishwasher"
  | "dryer";

/**
 * How several appliance rows collapse into one choice in the buy box.
 *
 * Front-load and top-load washers are two different products to us — different
 * panel sets, different ladders, different artwork — and one product to the
 * customer, who owns "a washing machine". So they share a picker group, and the
 * picker asks which kind only after the group is chosen.
 */
export type PickerGroup = "fridge" | "ac" | "washer" | "dishwasher" | "dryer";

export type ApplianceConfig = {
  key: ApplianceKey;
  /** Full name, for copy and alt text. */
  label: string;
  /** The product_tag every design sold on this appliance carries. */
  familyTag: string;
  /** The collection that lists the appliance's designs. */
  collectionHandle: string;
  /** Where the appliance's own landing page lives. */
  landingPath: string;
  /**
   * The photo visualiser's route.
   *
   * Stored rather than derived from landingPath, because the fridge's is
   * /fridge-wraps/see-it-on-my-fridge — it shipped before the range grew, it is
   * a live URL, and deriving "<landing>/see-it-on-mine" for everything would
   * have pointed the fridge studio at a 404.
   */
  visualizerPath: string;
  /** What the wrapped face is called: "door", "front panel", "body". */
  surfaceNoun: string;
  /**
   * The appliance mid-sentence, for alt text: "shown on a split AC".
   *
   * Not `label.toLowerCase()`, which is what this was at first and which turned
   * "Split AC" into "split ac" — lowercasing an acronym reads as a typo, and alt
   * text is the one string a sighted reviewer never checks.
   */
  altNoun: string;
  /** The appliance as a customer would say it in a sentence: "your fridge". */
  possessiveNoun: string;
  /** The on-image pill and visualiser heading. */
  visualizerLabel: string;
  /** Replaces MEDIUM_SUPPLY on this family's product page. */
  supplyCopy: string;
  /** The "Sizing & ordering" accordion. */
  sizing: { heading: string; body: string };
  /**
   * The aspect ratio (width ÷ height) artwork for this appliance is authored at,
   * and how far off that the upload may be before it is refused.
   *
   * These are not decoration. Roheena's call is that a shared design carries a
   * flat per appliance, drawn at that appliance's proportions — because a fridge
   * door is roughly 1:2 portrait and an AC front cover is nearly 3:1 landscape,
   * and cover-cropping one into the other keeps about a sixth of the
   * composition. The tolerance is wide enough for real files that are a little
   * off and narrow enough to catch a flat dropped into the wrong slot.
   */
  flatAspect: number;
  flatAspectTolerance: number;
  /** A fridge stands on the floor; a split AC hangs on the wall. */
  frameAnchor: "floor" | "wall";
  /**
   * Made-to-measure. Fridge only, deliberately: it needs a measuring guide the
   * customer can follow for that appliance and a desk that can quote it, and
   * neither exists for an AC front cover yet.
   */
  supportsMadeToMeasure: boolean;
  /** Whether wrap_models has rows for it, i.e. whether a fit finder can work. */
  supportsModelFinder: boolean;
  pickerGroup: PickerGroup;
  /** The group's name in the picker: both washers show "Washing machine". */
  pickerGroupLabel: string;
  /** Distinguishes rows inside a group. Null when the group has one member. */
  loadTypeLabel: string | null;
  /**
   * The format the studio opens on — the one most people actually own, which is
   * not the same as the one that heads the ladder.
   *
   * The fridge ladder reads largest first (0099), so without this the studio
   * would open on the ₹3,300 side-by-side and make the highest price in the
   * range the first one a visitor sees. Opening on the double door shows the
   * common case and leaves the ladder's order alone. Null = open on the first
   * format that is not reserved for an exclusive row.
   */
  openingFormatCode: string | null;
};

/** The family's category slug. One category for every appliance — see 0096. */
export const APPLIANCE_CATEGORY = "appliance-wrap";

/** The family browse tag, from product_categories.browse_tag. */
export const APPLIANCE_TAG = "Appliance Wraps";

/**
 * The range's own front page — the hub that introduces every appliance.
 *
 * Distinct from /collections/wraps, which is the product grid. Anything
 * pointing a customer AT the range (the shop menu, a cross-sell, the footer)
 * should send them here; the grid is what they reach once they want to browse.
 */
export const WRAPS_HUB_PATH = "/wraps";

/** Wraps print on one film, and the customer never picks it. */
export const WRAP_MATERIAL_SLUG = "self-adhesive-vinyl";

/** The hub that lists all appliances. */
export const WRAP_HUB_HANDLE = "wraps";
export const WRAP_HUB_PATH = "/wraps";

const TRIM_NOTE =
  "Shipped rolled — peels straight on and trims to your own edge. No paste, no fitter.";

export const APPLIANCES: Record<ApplianceKey, ApplianceConfig> = {
  fridge: {
    key: "fridge",
    label: "Fridge",
    familyTag: "Fridge Wraps",
    collectionHandle: "fridge-wraps",
    landingPath: "/fridge-wraps",
    visualizerPath: "/fridge-wraps/see-it-on-my-fridge",
    surfaceNoun: "door",
    altNoun: "fridge",
    possessiveNoun: "your fridge",
    visualizerLabel: "See it on your fridge",
    supplyCopy:
      "Shipped rolled — peels straight onto the door and trims to your own door edge. No paste, no fitter.",
    sizing: {
      heading: "Sizing & ordering",
      body: "Pick the format that matches your fridge. Panels ship deliberately oversize and you trim against the door edge, so the door itself is the ruler — far more forgiving than cutting to a measurement. If nothing fits, sized to your wall covers the rest.",
    },
    openingFormatCode: "B", // Double door — the common Indian fridge.
    flatAspect: 0.5,
    flatAspectTolerance: 0.12,
    frameAnchor: "floor",
    supportsMadeToMeasure: true,
    supportsModelFinder: true,
    pickerGroup: "fridge",
    pickerGroupLabel: "Fridge",
    loadTypeLabel: null,
  },

  ac: {
    key: "ac",
    label: "Split AC",
    familyTag: "AC Wraps",
    collectionHandle: "ac-wraps",
    landingPath: "/ac-wraps",
    visualizerPath: "/ac-wraps/see-it-on-mine",
    surfaceNoun: "front panel",
    altNoun: "split AC",
    possessiveNoun: "your air conditioner",
    visualizerLabel: "See it on your AC",
    supplyCopy:
      "Shipped rolled — peels onto the front cover and trims to its edge. The air outlet and its louvres stay clear; nothing is covered that the unit breathes through.",
    sizing: {
      heading: "Sizing & ordering",
      body: "Indoor units go by tonnage, so pick yours and the panel is cut for it. The wrap covers the front cover only — the louvres along the bottom are left open, and the panel ships oversize so you trim to the vent line and the side edges.",
    },
    // Measured from the drawn AC flats: 1808 x 672. Not a guess — the panel
    // geometry in wrap_formats was moved to match THIS (0099), rather than the
    // artwork being cropped to fit numbers I had derived from a spec sheet.
    // One ladder rung today, so the first is the only sensible opener.
    openingFormatCode: null,
    flatAspect: 2.69,
    flatAspectTolerance: 0.25,
    frameAnchor: "wall",
    supportsMadeToMeasure: false,
    supportsModelFinder: false,
    pickerGroup: "ac",
    pickerGroupLabel: "Split AC",
    loadTypeLabel: null,
  },

  "washer-front": {
    key: "washer-front",
    label: "Front-load washing machine",
    familyTag: "Washing Machine Wraps",
    collectionHandle: "washing-machine-wraps",
    landingPath: "/washing-machine-wraps",
    visualizerPath: "/washing-machine-wraps/see-it-on-mine",
    surfaceNoun: "front panel",
    altNoun: "front-load washing machine",
    possessiveNoun: "your washing machine",
    visualizerLabel: "See it on your washing machine",
    supplyCopy:
      "Shipped rolled — peels onto the front panel and trims to its edge. The door is cut around, and the control fascia stays bare.",
    sizing: {
      heading: "Sizing & ordering",
      body: "Front-loaders are a 600 mm cabinet almost without exception, so there is one panel for them. It covers the front face, cut around the door, with the control fascia left clear. Trim to the cabinet edge once it is on.",
    },
    // Measured from the drawn front-load flat: 912 x 1296. Also the truer
    // object than the 0.79 I had derived — a 600mm cabinet front is ~850mm tall.
    // One ladder rung today, so the first is the only sensible opener.
    openingFormatCode: null,
    flatAspect: 0.70,
    flatAspectTolerance: 0.12,
    frameAnchor: "floor",
    supportsMadeToMeasure: false,
    supportsModelFinder: false,
    pickerGroup: "washer",
    pickerGroupLabel: "Washing machine",
    loadTypeLabel: "Front load",
  },

  "washer-top": {
    key: "washer-top",
    label: "Top-load washing machine",
    familyTag: "Washing Machine Wraps",
    collectionHandle: "washing-machine-wraps",
    landingPath: "/washing-machine-wraps",
    visualizerPath: "/washing-machine-wraps/see-it-on-mine",
    surfaceNoun: "body",
    altNoun: "top-load washing machine",
    possessiveNoun: "your washing machine",
    visualizerLabel: "See it on your washing machine",
    supplyCopy:
      "Shipped rolled as three panels — front and both sides, each printed with your design. The lid is left as it is.",
    sizing: {
      heading: "Sizing & ordering",
      body: "A top-loader is wrapped on three sides — the front and both flanks — so it looks finished from every direction it is walked past. Your design is printed on each of the three panels. The lid is not wrapped: it is the surface you put things down on. The panels arrive in order and each trims to its own edge.",
    },
    // ONE PANEL's shape, not the whole wrap's. The three panels together are
    // 2.15:1, but the artwork is the fridge library at ~0.68 and is printed once
    // per panel (wrap_formats.mockup_spec.artworkSpan = 'panel') — stretching a
    // single door composition across 1.7m would keep about a quarter of it.
    // Artwork drawn across all three panels would want 2.15 here and 'wrap' there.
    // One ladder rung today, so the first is the only sensible opener.
    openingFormatCode: null,
    flatAspect: 0.70,
    flatAspectTolerance: 0.24,
    frameAnchor: "floor",
    supportsMadeToMeasure: false,
    supportsModelFinder: false,
    pickerGroup: "washer",
    pickerGroupLabel: "Washing machine",
    loadTypeLabel: "Top load",
  },

  dishwasher: {
    key: "dishwasher",
    label: "Dishwasher",
    familyTag: "Dishwasher Wraps",
    collectionHandle: "dishwasher-wraps",
    landingPath: "/dishwasher-wraps",
    visualizerPath: "/dishwasher-wraps/see-it-on-mine",
    surfaceNoun: "door",
    altNoun: "dishwasher",
    possessiveNoun: "your dishwasher",
    visualizerLabel: "See it on your dishwasher",
    supplyCopy:
      "Shipped rolled — peels onto the door face and trims to its edge. The control strip and the kick plate stay bare.",
    sizing: {
      heading: "Sizing & ordering",
      body: "Dishwashers here are one size: the standard 60 cm door. The panel covers the door face between the control strip at the top and the kick plate at the bottom, and ships oversize so you trim to both.",
    },
    // One ladder rung today, so the first is the only sensible opener.
    openingFormatCode: null,
    flatAspect: 0.95,
    flatAspectTolerance: 0.18,
    frameAnchor: "floor",
    supportsMadeToMeasure: false,
    supportsModelFinder: false,
    pickerGroup: "dishwasher",
    pickerGroupLabel: "Dishwasher",
    loadTypeLabel: null,
  },

  dryer: {
    key: "dryer",
    label: "Dryer",
    familyTag: "Dryer Wraps",
    collectionHandle: "dryer-wraps",
    landingPath: "/dryer-wraps",
    visualizerPath: "/dryer-wraps/see-it-on-mine",
    surfaceNoun: "front panel",
    altNoun: "dryer",
    possessiveNoun: "your dryer",
    visualizerLabel: "See it on your dryer",
    supplyCopy:
      "Shipped rolled — peels onto the front panel and trims to its edge. The door is cut around, and the control fascia stays bare.",
    sizing: {
      heading: "Sizing & ordering",
      body: "A dryer shares the front-loader's cabinet, so it shares the panel: the front face, cut around the door, control fascia left clear. If it is stacked above a washer, the pair can be wrapped to match.",
    },
    // One ladder rung today, so the first is the only sensible opener.
    openingFormatCode: null,
    // Shares the front-loader's cabinet, so it shares its artwork shape.
    flatAspect: 0.70,
    flatAspectTolerance: 0.12,
    frameAnchor: "floor",
    supportsMadeToMeasure: false,
    supportsModelFinder: false,
    pickerGroup: "dryer",
    pickerGroupLabel: "Dryer",
    loadTypeLabel: null,
  },
};

/** Display order — the same order as wrap_appliances.position. */
export const APPLIANCE_KEYS: ApplianceKey[] = [
  "fridge",
  "ac",
  "washer-front",
  "washer-top",
  "dishwasher",
  "dryer",
];

export function isApplianceKey(v: unknown): v is ApplianceKey {
  return typeof v === "string" && v in APPLIANCES;
}

/** The config, or null for anything that is not an appliance. Never throws. */
export function applianceConfig(v: unknown): ApplianceConfig | null {
  return isApplianceKey(v) ? APPLIANCES[v] : null;
}

/** Every family tag in the range, for the queries that ask "is this a wrap?". */
export const APPLIANCE_FAMILY_TAGS: string[] = [
  ...new Set(APPLIANCE_KEYS.map((k) => APPLIANCES[k].familyTag)),
];

/** The distinct landing pages — both washers share one. */
export const APPLIANCE_LANDING_PATHS: string[] = [
  ...new Set(APPLIANCE_KEYS.map((k) => APPLIANCES[k].landingPath)),
];

/**
 * The appliances grouped as the picker shows them, in display order.
 *
 * A group with one member is a plain choice; a group with several (washers) is a
 * choice followed by a load-type toggle.
 */
export function applianceGroups(keys: ApplianceKey[]): {
  group: PickerGroup;
  label: string;
  members: ApplianceConfig[];
}[] {
  const ordered = APPLIANCE_KEYS.filter((k) => keys.includes(k));
  const out: { group: PickerGroup; label: string; members: ApplianceConfig[] }[] = [];
  for (const key of ordered) {
    const cfg = APPLIANCES[key];
    const existing = out.find((g) => g.group === cfg.pickerGroup);
    if (existing) existing.members.push(cfg);
    else out.push({ group: cfg.pickerGroup, label: cfg.pickerGroupLabel, members: [cfg] });
  }
  return out;
}

/** Whether an aspect ratio is right for an appliance's authored flat. */
export function aspectOk(appliance: ApplianceKey, aspect: number): boolean {
  if (!(aspect > 0)) return false;
  const cfg = APPLIANCES[appliance];
  return Math.abs(aspect - cfg.flatAspect) <= cfg.flatAspectTolerance;
}

/** The same check from pixel dimensions. */
export function flatAspectOk(
  appliance: ApplianceKey,
  widthPx: number,
  heightPx: number,
): boolean {
  if (!(widthPx > 0) || !(heightPx > 0)) return false;
  return aspectOk(appliance, widthPx / heightPx);
}

/** "roughly 3:1 landscape — about 2400 × 830" for the upload guidance. */
export function flatAspectHint(appliance: ApplianceKey): string {
  const cfg = APPLIANCES[appliance];
  const portrait = cfg.flatAspect < 1;
  const long = portrait ? Math.round(1 / cfg.flatAspect) : Math.round(cfg.flatAspect);
  const ratio = portrait ? `1:${long}` : `${long}:1`;
  const shape = Math.abs(cfg.flatAspect - 1) < 0.15 ? "square-ish" : portrait ? "portrait" : "landscape";
  return `roughly ${ratio} ${shape}`;
}

export { TRIM_NOTE };

// ---- Where a wrap listing and a wrap design live ----------------------------
//
// NOT /collections/<handle> and /products/<handle>. Those are the store's
// listing and product pages, and they read the store's catalogue; the wrap
// range is its own catalogue in the `wraps` schema (src/lib/supabase-wraps.ts),
// so a wrap handle there is a 404 on every hostname. The retired fridge-wraps
// branch could use the store's URLs only because that whole app was pointed at
// the wraps schema. Every link to a wrap listing or design is built here.

/** A wrap listing, optionally narrowed to one look (an aesthetic row's tag). */
export function wrapCollectionPath(handle: string, look?: string | null): string {
  const base = `${WRAP_HUB_PATH}/collections/${handle}`;
  return look ? `${base}?tag=${encodeURIComponent(look)}` : base;
}

/** A wrap design's page, optionally opened on one appliance. */
export function wrapDesignPath(handle: string, appliance?: ApplianceKey | null): string {
  const base = `${WRAP_HUB_PATH}/designs/${handle}`;
  return appliance ? `${base}?appliance=${appliance}` : base;
}
