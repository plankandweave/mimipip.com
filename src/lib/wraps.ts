/**
 * Appliance Wraps — the fourth product family.
 *
 * A wrap is a printed self-adhesive vinyl panel set, cut oversize and trimmed by
 * the customer against their own appliance's edge. Fridges, split-AC indoor
 * units, washing machines (front and top load), dishwashers and dryers. It is a
 * FIXED-size product, but it does not work like Canvas Art, and the difference
 * decides where every number in this file comes from:
 *
 *   Canvas Art     — the artwork has proportions and the ladder scales them, so
 *                    a price is honestly derived (area × rate → roundRetail).
 *   Appliance Wrap — the FLEET has proportions. One format per shape of
 *                    appliance sold in India, and any design is composed into
 *                    whichever one the customer owns.
 *
 * So the prices are SET, not computed. roundRetail() only emits multiples of
 * ₹500 and cannot produce these ladders; that is not a bug in either place. The
 * fridge ladder is anchored on the ₹1,000 single-door hero, which sits exactly
 * on the ceiling of Amazon.in's zero-referral band for home décor (16 March
 * 2026) and Flipkart's zero-commission band (November 2025) — at ₹1,000 the
 * hero SKU pays no marketplace commission on either platform, and at ₹1,001 it
 * pays on both. That is why the number is what it is, and why the smaller
 * appliances are priced under it rather than over.
 *
 * The authority is the `wrap_formats` table. Everything here is the shape of
 * that data plus the one calculation the table cannot hold (made-to-measure).
 * Never hardcode a format price in a component — read it from the row.
 *
 * MADE TO MEASURE IS FRIDGE-ONLY, and the functions below say so in their
 * names. It needs a measuring guide the customer can follow and a desk that can
 * quote from it; both exist for a fridge door and neither exists yet for an AC
 * front cover. See ApplianceConfig.supportsMadeToMeasure — that flag is the
 * gate, not a convention.
 */

import { CM_PER_FOOT, areaSqFt, priceFor } from "./pricing";
import { APPLIANCES, APPLIANCE_CATEGORY, WRAP_MATERIAL_SLUG } from "./appliances";
import type { ApplianceKey } from "./appliances";

export { APPLIANCE_CATEGORY, WRAP_MATERIAL_SLUG };
export type { ApplianceKey };

/** The made-to-measure format's code. Priced from the customer's own numbers. */
export const MADE_TO_MEASURE_CODE = "Z";

/**
 * Made-to-measure rate, ₹ per sq ft, GST-inclusive — the same rate as a
 * made-to-measure wall, because it is the same operation: one layout, one
 * print, one set of offcuts, for one customer's fridge. Charging less for it
 * than for a wall would be the inconsistency a customer standing on the site
 * could actually catch, since both prices are on the same domain.
 *
 * It lives in the database too (materials.price_per_sqft on self-adhesive
 * vinyl) because the cart prices off the material rate like every other line.
 * This constant is for COPY — never price a line from it.
 */
export const WRAP_MTM_RATE = 200;

/**
 * The floor under a made-to-measure order. A very small custom panel still
 * costs a layout, a print run and a tube, so it cannot undercut the ₹700 mini
 * format — that would make the standard range look like the expensive option.
 */
export const WRAP_MTM_FLOOR = 700;

/** Working days from order to dispatch on a made-to-measure set. */
export const WRAP_MTM_LEAD_DAYS = 7;

/** One panel in a format's cut list. Multi-panel sets are the norm, not the
 *  exception: fridge B/C/D are two, a top-load washer wrap is three. */
export type WrapPanel = {
  widthMm: number;
  heightMm: number;
  label?: string;
};

/**
 * How a format is drawn in the SVG mockup — wrap_formats.mockup_spec.
 *
 * Sizes are deliberately absent: they come from panel_spec, which is the one
 * place a millimetre is allowed to live. This says how to arrange those panels
 * and what to draw over them.
 *
 * Features are drawn OVER the artwork because that is physically where the wrap
 * stops. An AC's louvres are not covered, a washer's porthole is cut around, a
 * dishwasher's control strip is left bare. Showing artwork across them would be
 * a picture of a product we do not sell.
 */
export type MockupFeature =
  /** Slatted air outlet along an edge — never wrapped. */
  | { kind: "louvreStrip"; edge: "top" | "bottom"; sizeMm: number }
  /** Unwrapped fascia: controls, a lid, a plinth. */
  | { kind: "controlStrip" | "lidStrip" | "kickPlate"; edge: "top" | "bottom"; sizeMm: number }
  /** The washer/dryer door, cut around. Fractions of the wrapped face. */
  | { kind: "porthole"; cxFrac: number; cyFrac: number; rFrac: number };

export type MockupSpec = {
  /** Panels stacked vertically, or laid out side by side. */
  layout: "stack" | "side";
  /** Space drawn between panels. A door gap is wide; a fold is narrow. */
  gapMm: number;
  /** Carcass showing around the wrapped face. */
  revealMm: number;
  /** A fridge stands on the floor; a split AC hangs on the wall. */
  anchor: "floor" | "wall";
  /**
   * How the appliance is drawn. Defaults to "flat" — straight on, which is how
   * you look at a fridge door, an AC cover or a washer front.
   *
   * "angular" is a three-quarter view, for a wrap that goes round a corner. A
   * top-load washer's three-side wrap drawn flat is its cut list rather than the
   * machine: three rectangles 1.7m wide, which looks like nothing anybody owns.
   */
  view?: "flat" | "angular";
  /**
   * Whether one composition spans the whole wrap or each panel carries its own.
   *
   * Follows the ARTWORK. Designs drawn across all three panels of a top-load
   * wrap (≈2.15:1) span, and the pattern carries round the corner. Designs drawn
   * at one panel's proportions — which the fridge library is, at ≈0.7 — print
   * once per panel: stretching one door composition across 1.7m keeps about a
   * quarter of it. Defaults to "wrap".
   */
  artworkSpan?: "wrap" | "panel";
  features: MockupFeature[];
};

/** A row of `wrap_formats`. */
export type WrapFormat = {
  code: string;
  /** Which appliance this format belongs to. */
  appliance: ApplianceKey;
  label: string;
  doorType: string;
  capacityLabel: string | null;
  doorWidthMinMm: number | null;
  doorWidthMaxMm: number | null;
  doorHeightMinMm: number | null;
  doorHeightMaxMm: number | null;
  /** The cut list, in packing order. */
  panels: WrapPanel[];
  /** Bounding size of the whole set. Null on made-to-measure. */
  overallWidthMm: number | null;
  overallHeightMm: number | null;
  cutAreaSqFt: number | null;
  /** GST-inclusive set price. Null on made-to-measure — compute it instead. */
  priceInr: number | null;
  isMadeToMeasure: boolean;
  /** Made-to-measure cannot hold a marketplace SLA, so it never leaves the site. */
  ownSiteOnly: boolean;
  leadTimeDays: number | null;
  active: boolean;
  position: number;
  /** How to draw it. Null falls back to a plain stacked panel. */
  mockupSpec: MockupSpec | null;
  /**
   * Provenance of the dimensions and price. A note beginning "PLACEHOLDER"
   * means the ladder is seeded but not signed off — the same per-row honesty
   * wrap_models.verified carries about door measurements.
   */
  sourceNote: string | null;
};

/** True when this format's numbers have not been signed off yet. */
export function isPlaceholderFormat(f: WrapFormat): boolean {
  return !!f.sourceNote?.toUpperCase().startsWith("PLACEHOLDER");
}

/**
 * What a made-to-measure customer supplies: one entry per door panel.
 *
 * A list rather than a size × count, because on the commonest Indian double
 * door the two panels are NOT the same size — Format B's own cut list is a
 * 520 mm freezer door above a 1150 mm fridge door. A single "panel size, ×2"
 * would silently print two identical panels and one of them would be wrong,
 * which is the exact failure made-to-measure exists to avoid.
 */
export type FridgeMeasurements = {
  panels: { widthCm: number; heightCm: number }[];
};

/**
 * What a wrap line records on `crop_data.wrap`. The ops desk fulfils from this
 * in Phase 1, so it has to be sufficient on its own: which appliance, which
 * format, what it was called when the customer bought it, and — for
 * made-to-measure — the exact numbers they gave, because a re-derivation from
 * today's rules is not what they paid against.
 *
 * Lines created before the range grew past the fridge carry the same shape under
 * `crop_data.fridge` with no appliance; cart_get() (0097) coalesces the two, and
 * pinWrapLine reads either.
 */
export type WrapCrop = {
  appliance: ApplianceKey;
  format: string;
  formatLabel: string;
  /** The model the fit finder matched, when the customer used it. */
  model?: string | null;
  /** Whether that match was manufacturer-verified or assigned by class. */
  modelVerified?: boolean | null;
  /** Present only on made-to-measure lines. */
  measurements?: FridgeMeasurements | null;
  /** The cut list as quoted, so the desk cuts what was sold. */
  panels?: WrapPanel[] | null;
};

const MM_PER_CM = 10;

/** Total printed area of a panel set, in sq ft. */
export function panelsAreaSqFt(panels: WrapPanel[]): number {
  const total = panels.reduce((sum, p) => {
    const wCm = p.widthMm / MM_PER_CM;
    const hCm = p.heightMm / MM_PER_CM;
    return sum + areaSqFt(wCm, hCm);
  }, 0);
  return Math.round(total * 100) / 100;
}

/**
 * The price of a made-to-measure set: the customer's own measured area at the
 * made-to-measure rate, in whole rupees, floored so it can never undercut the
 * smallest standard format.
 *
 * Deliberately NOT rounded to a clean retail figure. A measured area is a
 * number the customer can multiply themselves — the same reasoning that keeps
 * mural wallpaper off roundRetail(). They gave the dimensions; the
 * arithmetic should be theirs to check.
 */
export function madeToMeasurePrice(m: FridgeMeasurements, ratePerSqFt = WRAP_MTM_RATE): number {
  const panels = m.panels?.filter((p) => p.widthCm > 0 && p.heightCm > 0) ?? [];
  if (!panels.length) return 0;
  // Each panel priced on its own area, then summed — a 520 mm freezer door and
  // a 1150 mm fridge door are not two of the same thing.
  const raw = panels.reduce((sum, p) => sum + priceFor(p.widthCm, p.heightCm, ratePerSqFt), 0);
  return Math.max(WRAP_MTM_FLOOR, Math.round(raw));
}

/** The cut list a made-to-measure order produces, with trim allowance added. */
export function madeToMeasurePanels(m: FridgeMeasurements): WrapPanel[] {
  const panels = m.panels?.filter((p) => p.widthCm > 0 && p.heightCm > 0) ?? [];
  return panels.map((p, i) => ({
    widthMm: Math.round(p.widthCm * MM_PER_CM) + TRIM_ALLOWANCE_MM * 2,
    heightMm: Math.round(p.heightCm * MM_PER_CM) + TRIM_ALLOWANCE_MM * 2,
    label: panels.length > 1 ? `Door ${i + 1}` : "Door",
  }));
}

/** Total measured area of a made-to-measure set, in sq ft — for the quote line. */
export function madeToMeasureAreaSqFt(m: FridgeMeasurements): number {
  const panels = m.panels?.filter((p) => p.widthCm > 0 && p.heightCm > 0) ?? [];
  const total = panels.reduce((sum, p) => sum + areaSqFt(p.widthCm, p.heightCm), 0);
  return Math.round(total * 100) / 100;
}

/** Every panel plausible, and at least one? The gate before a Z line is priced. */
export function areMeasurementsValid(m: FridgeMeasurements | null | undefined): boolean {
  const panels = m?.panels ?? [];
  if (!panels.length || panels.length > MAX_MTM_PANELS) return false;
  return panels.every((p) => isPlausibleDoor(p.widthCm, p.heightCm));
}

/** Nobody has a fridge with more doors than this; more is a script, not a sale. */
export const MAX_MTM_PANELS = 4;

/**
 * How much oversize every panel ships, per edge, in mm.
 *
 * This is the product's central design decision, not a manufacturing tolerance.
 * Cutting to a measurement means the customer's measurement has to be right;
 * trimming to an edge means the appliance itself is the ruler. The second is far
 * more forgiving, and it is why five formats can cover a fridge fleet whose door
 * widths span 65 mm — and why one panel covers every 60 cm dishwasher sold.
 */
export const TRIM_ALLOWANCE_MM = 20;

/** The price to show for a format — set price, or computed for made-to-measure. */
export function formatPrice(f: WrapFormat, m?: FridgeMeasurements | null): number {
  if (f.isMadeToMeasure) return m ? madeToMeasurePrice(m) : 0;
  return f.priceInr ?? 0;
}

/** "620 × 1250 mm" / "3 panels · 1720 × 800 mm overall". */
export function formatSizeLabel(f: WrapFormat): string {
  if (f.isMadeToMeasure) return "Your measurements";
  const panels = f.panels.length;
  if (panels === 1 && f.panels[0]) {
    return `${f.panels[0].widthMm} × ${f.panels[0].heightMm} mm`;
  }
  if (f.overallWidthMm && f.overallHeightMm) {
    return `${panels} panels · ${f.overallWidthMm} × ${f.overallHeightMm} mm overall`;
  }
  return `${panels} panels`;
}

/**
 * "Single door · 150–220 L" — the one line that answers "is this mine?".
 *
 * The capacity is dropped when the label already contains it. The fridge labels
 * are shapes ("Single door") and their capacities add real information, but the
 * new appliances are named BY capacity ("Split AC, 1.5 ton"), so appending it
 * produced "Split AC, 1.5 ton · 1.5 ton" on every chip in the picker.
 */
export function formatFitLabel(f: WrapFormat): string {
  const label = stripAppliancePrefix(f);
  if (!f.capacityLabel) return label;
  if (norm(label).includes(norm(f.capacityLabel))) return label;
  return `${label} · ${f.capacityLabel}`;
}

const norm = (v: string) => v.toLowerCase().replace(/[\s\u2013\u2014-]+/g, "");

/**
 * How each appliance names itself at the head of its format labels, so a picker
 * can drop it.
 *
 * The stored label is a full sentence on purpose — a cart line reading "1.5 ton"
 * would be useless — but inside a picker every option carries the same prefix,
 * so the AC ladder read "Split AC, 0.8-1 ton / Split AC, 1.5 ton / Split AC, 2
 * ton": three lines whose only new information was the last two words. The
 * appliance is named in the heading directly above every one of these lists, so
 * repeating it per option is noise, not context.
 */
const APPLIANCE_LABEL_PREFIXES: Partial<Record<ApplianceKey, string[]>> = {
  ac: ["split ac", "ac"],
  "washer-front": ["front-load washer", "front-load washing machine", "washer"],
  "washer-top": ["top-load washer", "top-load washing machine", "washer"],
  dishwasher: ["dishwasher"],
  dryer: ["dryer"],
  // Fridge labels are shapes ("Single door", "Mini / bar fridge") and carry no
  // redundant prefix to strip.
};

/**
 * "Split AC, 1.5 ton" → "1.5 ton". Left untouched when stripping would leave
 * nothing behind: "Dishwasher" alone IS the label, and an empty chip is worse
 * than a repeated word.
 */
function stripAppliancePrefix(f: WrapFormat): string {
  const prefixes = APPLIANCE_LABEL_PREFIXES[f.appliance];
  if (!prefixes) return f.label;
  // Longest first, so "top-load washer" wins over the bare "washer".
  for (const prefix of [...prefixes].sort((a, b) => b.length - a.length)) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const stripped = f.label.replace(new RegExp(`^${escaped}\\s*[,\u00b7-]\\s*`, "i"), "").trim();
    if (stripped && stripped !== f.label) {
      // Only re-capitalise a word: "1.5 ton" must stay as it is, while
      // "large, 3-side wrap" should read as the start of a line.
      return /^[a-z]/.test(stripped) ? stripped[0].toUpperCase() + stripped.slice(1) : stripped;
    }
  }
  return f.label;
}

/**
 * Bounding size of a format in cm, for the cart line's width/height. A fixed
 * piece still needs dimensions on the line — this is what they mean for a
 * multi-panel set.
 */
export function formatSizeCm(f: WrapFormat): { widthCm: number; heightCm: number } {
  const wMm = f.overallWidthMm ?? f.panels[0]?.widthMm ?? 0;
  const hMm = f.overallHeightMm ?? f.panels[0]?.heightMm ?? 0;
  return { widthCm: wMm / MM_PER_CM, heightCm: hMm / MM_PER_CM };
}

/**
 * The largest door an axis of this format can actually cover, in mm.
 *
 * The seeded bands describe the door sizes each format was DESIGNED around, and
 * between them they leave holes the panels themselves do not: Format A's height
 * band stops at 1140 mm, while its 1250 mm panel covers a 1210 mm door with the
 * full trim allowance on both edges. A 60 × 120 cm single door — an ordinary
 * Indian fridge — therefore matched nothing and was quoted made-to-measure at
 * ₹200/sq ft when a ₹1,000 standard panel fits it.
 *
 * So the ceiling is the more generous of the seeded band and what the panel
 * physically covers. The floor is left alone: the minima stop a small door being
 * sent a needlessly large format, and nothing about the panel argues with them.
 */
function coverableMax(f: WrapFormat, axis: "width" | "height", bandMax: number): number {
  const cover =
    axis === "width"
      ? (f.overallWidthMm ?? f.panels[0]?.widthMm ?? 0)
      : (f.overallHeightMm ?? f.panels[0]?.heightMm ?? 0);
  // Both edges keep their trim: a panel is door + 2 × allowance by design, so
  // the largest door it covers is the panel less both.
  return Math.max(bandMax, cover - 2 * TRIM_ALLOWANCE_MM);
}

/**
 * Which format a raw door measurement falls into, or null when nothing fits and
 * the answer is made-to-measure. Used by the fit finder's fallback, for the
 * customer who cannot find the sticker inside their door.
 *
 * A door must fit within the format's band on BOTH axes. Being generous here
 * would be the wrong kind of helpful: a panel that arrives 30 mm short cannot
 * be fixed by the customer, and the honest answer — Format Z — is available.
 *
 * Scoped to one appliance, because the bands overlap across the range: a 60 cm
 * dishwasher door and a front-load washer panel are within millimetres of each
 * other, and "which format fits this rectangle" is only answerable once you know
 * what the rectangle is part of.
 */
export function formatForDoor(
  formats: WrapFormat[],
  widthMm: number,
  heightMm: number,
  appliance: ApplianceKey = "fridge",
): WrapFormat | null {
  const candidates = formats.filter(
    (f) =>
      f.appliance === appliance &&
      !f.isMadeToMeasure &&
      f.active &&
      f.doorWidthMinMm != null &&
      f.doorWidthMaxMm != null &&
      f.doorHeightMinMm != null &&
      f.doorHeightMaxMm != null &&
      widthMm >= f.doorWidthMinMm &&
      widthMm <= coverableMax(f, "width", f.doorWidthMaxMm) &&
      heightMm >= f.doorHeightMinMm &&
      heightMm <= coverableMax(f, "height", f.doorHeightMaxMm),
  );
  if (!candidates.length) return null;
  // Smallest qualifying format: the least media for a door that fits both.
  return candidates.sort((a, b) => (a.cutAreaSqFt ?? 0) - (b.cutAreaSqFt ?? 0))[0];
}

/**
 * The "from ₹X" figure for a design — the cheapest standard format across every
 * appliance the design is sold on. Pass a filtered list to scope it to one.
 */
export function fromWrapPrice(formats: WrapFormat[]): number | null {
  const prices = formats
    .filter((f) => f.active && !f.isMadeToMeasure && f.priceInr)
    .map((f) => f.priceInr as number);
  return prices.length ? Math.min(...prices) : null;
}

/** Formats for one appliance, in display order. */
export function formatsFor(formats: WrapFormat[], appliance: ApplianceKey): WrapFormat[] {
  return formats
    .filter((f) => f.appliance === appliance && f.active)
    .sort((a, b) => a.position - b.position);
}

/**
 * The formats a given design may actually be bought at.
 *
 * Two independent restrictions, and both have to hold:
 *   the appliance must be one the design is offered on (product_appliances), and
 *   the code must be allowed by products.wrap_format_codes when that is set.
 *
 * wrap_format_codes exists because some designs are composed for exactly one
 * format — the Mini Fridge Exclusives are drawn for a 520 × 760 door and fall
 * apart stretched up a 1.8 m side-by-side. NULL means "every standard format",
 * which is the honest default.
 */
export function offeredFormats(
  formats: WrapFormat[],
  offered: ApplianceKey[],
  restrictedCodes: string[] | null,
): WrapFormat[] {
  return formats
    .filter((f) => f.active && offered.includes(f.appliance))
    .filter((f) => !restrictedCodes?.length || restrictedCodes.includes(f.code))
    .sort((a, b) =>
      a.appliance === b.appliance
        ? a.position - b.position
        : offered.indexOf(a.appliance) - offered.indexOf(b.appliance),
    );
}

/** cm → mm, for measurement inputs the customer gives in cm. */
export function cmToMm(cm: number): number {
  return cm * MM_PER_CM;
}

/** Sanity bounds on a hand-measured door, in cm. Anything outside is a typo. */
export const DOOR_MIN_CM = 25;
export const DOOR_MAX_CM = 220;

export function isPlausibleDoor(widthCm: number, heightCm: number): boolean {
  // Bounds only, deliberately — no aspect-ratio rule.
  //
  // An earlier version of this also required a panel to be taller than half its
  // width, on the theory that a door is a tall rectangle. That is true of a
  // door and false of a DRAWER: the bottom freezer on a French-door fridge is
  // roughly 90 × 40 cm, and made-to-measure exists precisely to cover the
  // panels the five standard formats do not. A validation rule that rejects a
  // real fridge is worse than no rule, and the bounds below already catch the
  // transposed or mistyped entry the ratio check was reaching for.
  const ok = (v: number) => v >= DOOR_MIN_CM && v <= DOOR_MAX_CM;
  return ok(widthCm) && ok(heightCm);
}

/** The label for an appliance, for copy that has only the key. */
export function applianceLabel(appliance: ApplianceKey): string {
  return APPLIANCES[appliance].label;
}

/** Feet-to-cm passthrough so callers need not import two modules. */
export { CM_PER_FOOT };
