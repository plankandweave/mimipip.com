import { GST_RATE } from "@/lib/pricing";
import { rupeesInWords } from "./words";
import { MAGNITUDE_BRANDS, MAGNITUDE_SPACES, type Issuer } from "./issuers";

/**
 * A quotation as data. Pure: no database, no fonts, no network, so the
 * arithmetic a customer will check is testable on its own and the PDF, the
 * email and the CRM all read ONE set of numbers.
 *
 * The shape follows the KRT quotation of 6 October 2026, which is the format
 * Roheena signed off: a scope table of measured areas per location, then the
 * pricing per material, GST on top, the total in words, the materials in two
 * sentences each, what the customer prepares on site, and the terms.
 *
 * ONE quotation, TWO documents. The row is one offer under one reference,
 * but it leaves as two PDFs: the SUPPLY quotation, issued by Magnitude
 * Brands Private Limited, and the INSTALLATION quotation, issued by
 * Magnitude Spaces Private Limited (Roheena, 6 October 2026: "two different
 * documents, all about supply and all about installation, two separate
 * PDFs"). Each is the shape of the tax invoice its company will raise, with
 * that company's GSTIN and PAN, so the customer can register each as a
 * vendor and deduct TDS against each. `partsOf` says which documents a
 * quotation has (a supply-only quotation has one), `termsFor` gives each its
 * terms.
 *
 * Money is computed here from square feet and ex-GST rates, never stored as a
 * total someone could edit: a quotation whose total disagrees with its lines
 * is the kind of document that ends a relationship.
 */

/** The picture a wall is quoted WITH (Roheena, 6 October 2026: "just like
 *  we've done quotations for Vijay Sales — we add an image, then the
 *  measurement, then the quotation"). `proposed` is the artwork shown on
 *  that wall — a wall study, a site-batch mockup, a concept render; `site`
 *  is the wall as it stands today, used when no proposal picture exists.
 *  `path` is a key in the private corporate-art store, never a URL. */
export type LinePicture = {
  path: string;
  kind: "proposed" | "site";
  caption: string | null;
};

export type QuotationLine = {
  seq: number;
  productHandle?: string | null;
  commissioned?: boolean;
  bespokeName?: string | null;
  catalogue?: { handle: string; title: string; surface: string; rateInclGst: number; billableSqft: number } | null;
  /** "Boundary wall, forecourt" */
  location: string;
  /** How the area was arrived at: "Inclined wall 72′6″ and six straight bays, all 10′ high" */
  basis: string;
  /** Key into the material library (src/lib/quotation/material-specs.ts). */
  material: string;
  sqft: number;
  /** The wall's size, when it is one rectangle; null for a run of bays or
   *  an inclined wall, where `basis` says how the area was arrived at. */
  widthMm?: number | null;
  heightMm?: number | null;
  picture?: LinePicture | null;
};

export type QuotationRate = {
  material: string;
  /** Supply, ₹ per sq ft before GST. */
  supplyExGst: number;
  /** Installation, ₹ per sq ft before GST; null when installation is not quoted. */
  installExGst: number | null;
};

export type QuotationParty = {
  organisation: string;
  /** "OIC, Parel, Mumbai" */
  site: string | null;
  /** "Ms Priyanka Singh" */
  attention: string | null;
};

export type Quotation = {
  pricingPolicy?: "website-bespoke-20261013";
  installationLocal?: boolean;
  number: string;
  revision: number;
  /** YYYY-MM-DD, IST. */
  dateKey: string;
  /** YYYY-MM-DD, IST. */
  validUntil: string;
  /** "Made-to-measure printed wallcovering for the common areas" */
  title: string;
  preparedFor: QuotationParty;
  /** Who took the measurements — "Zyvorah" when our team measured, including
   *  on a designer's behalf. Never a third party's name or drawing number
   *  (Roheena, 6 October 2026). Null when the customer stated sizes. */
  measurementSource: string | null;
  lines: QuotationLine[];
  rates: QuotationRate[];
  /** One short paragraph per quoted material, in the order quoted. */
  materialNotes: { material: string; text: string }[];
  /** "Site preparation by <customer>" bullets. */
  sitePrep: string[];
  /** Terms shared by both documents: the measurement sentence and anything
   *  specific to this job. The scope, payment and production terms are per
   *  document (PART_TERMS) and are added by `termsFor`. */
  terms: string[];
  /** 0.18 */
  gstRate: number;
};

export type MaterialTotal = { material: string; sqft: number };

/** Which of the two documents: supply (Magnitude Brands) or installation
 *  (Magnitude Spaces). */
export type QuotationPart = "supply" | "install";

export type PricingLine = {
  kind: QuotationPart;
  title?: string;
  inclusiveAmount?: number;
  material: string;
  sqft: number;
  rateExGst: number;
  amount: number;
};

/** One company's part of the quotation: its lines, its GST, its total — the
 *  shape of the tax invoice it will raise. */
export type PartTotals = {
  issuer: Issuer;
  kind: "supply" | "install";
  lines: PricingLine[];
  subtotal: number;
  gst: number;
  total: number;
  totalInWords: string;
};

export type QuotationTotals = {
  byMaterial: MaterialTotal[];
  totalSqft: number;
  pricing: PricingLine[];
  /** Supply, invoiced by Magnitude Brands. */
  supply: PartTotals;
  /** Installation, invoiced by Magnitude Spaces; null when nothing is installed by us. */
  install: PartTotals | null;
  /** The two parts added: what the customer pays in all. */
  subtotal: number;
  gst: number;
  total: number;
  totalInWords: string;
};

/** "9.45 m × 3.30 m" when a wall is one rectangle, else null. */
export function lineSize(l: Pick<QuotationLine, "widthMm" | "heightMm">): string | null {
  if (!l.widthMm || !l.heightMm) return null;
  const m = (mm: number) => (mm / 1000).toFixed(2).replace(/\.?0+$/, "");
  return `${m(l.widthMm)} m × ${m(l.heightMm)} m`;
}

/** What ONE wall comes to on one document: its area at that document's
 *  rate for its material, ex GST, rounded to the rupee like every line.
 *  Null on the installation document for a material we do not fit. */
export function lineAmount(q: Pick<Quotation, "rates">, l: Pick<QuotationLine, "material" | "sqft" | "catalogue">, part: QuotationPart): number | null {
  const r = q.rates.find((x) => x.material === l.material);
  if (!r) throw new Error(`quotation: no rate for material "${l.material}"`);
  if (part === "supply" && l.catalogue) return Math.round(Math.round(l.catalogue.billableSqft * l.catalogue.rateInclGst) / (1 + GST_RATE));
  const rate = part === "supply" ? r.supplyExGst : r.installExGst;
  return rate == null ? null : Math.round(l.sqft * rate);
}

/** Square feet per material, in first-quoted order, then the grand total. */
export function areaByMaterial(lines: QuotationLine[]): MaterialTotal[] {
  const out: MaterialTotal[] = [];
  for (const l of lines) {
    const hit = out.find((m) => m.material === l.material);
    if (hit) hit.sqft += l.sqft;
    else out.push({ material: l.material, sqft: l.sqft });
  }
  return out.map((m) => ({ ...m, sqft: Math.round(m.sqft) }));
}

/** Every amount is rounded to the rupee at the line, as the customer will
 *  check it on a calculator: 1,102 × 169.49 = 1,86,777.98 → ₹1,86,778. */
export function quotationTotals(q: Pick<Quotation, "lines" | "rates" | "gstRate">): QuotationTotals {
  const byMaterial = areaByMaterial(q.lines);
  const rateOf = (material: string) => {
    const r = q.rates.find((x) => x.material === material);
    if (!r) throw new Error(`quotation: no rate for material "${material}"`);
    return r;
  };
  const pricing: PricingLine[] = [];
  // Website designs remain separate even when they share the same surface.
  for (const l of q.lines.filter((l) => l.catalogue)) {
    const c = l.catalogue!;
    const inclusiveAmount = Math.round(c.billableSqft * c.rateInclGst);
    pricing.push({ kind: "supply", material: l.material, title: c.title, sqft: c.billableSqft,
      rateExGst: c.rateInclGst / (1 + q.gstRate), amount: Math.round(inclusiveAmount / (1 + q.gstRate)), inclusiveAmount });
  }
  for (const l of q.lines.filter((l) => !l.catalogue && l.bespokeName)) {
    const r = rateOf(l.material);
    pricing.push({ kind: "supply", material: l.material, title: `Bespoke – ${l.bespokeName}`, sqft: l.sqft, rateExGst: r.supplyExGst, amount: Math.round(l.sqft * r.supplyExGst) });
  }
  for (const m of areaByMaterial(q.lines.filter((l) => !l.catalogue && !l.bespokeName))) {
    const r = rateOf(m.material);
    pricing.push({ kind: "supply", material: m.material, sqft: m.sqft, rateExGst: r.supplyExGst, amount: Math.round(m.sqft * r.supplyExGst) });
  }
  for (const m of byMaterial) {
    const r = rateOf(m.material);
    if (r.installExGst != null) {
      pricing.push({ kind: "install", material: m.material, sqft: m.sqft, rateExGst: r.installExGst, amount: Math.round(m.sqft * r.installExGst) });
    }
  }
  // GST is computed PER COMPANY and then added, never on the grand subtotal:
  // each part becomes its own tax invoice, and the quotation must reconcile
  // to the rupee with the two invoices the customer will receive.
  const part = (kind: "supply" | "install", issuer: Issuer): PartTotals => {
    const lines = pricing.filter((p) => p.kind === kind);
    const subtotal = lines.reduce((s, p) => s + p.amount, 0);
    const catalogueLines = lines.filter((l) => l.inclusiveAmount != null);
    const otherSubtotal = lines.filter((l) => l.inclusiveAmount == null).reduce((s, l) => s + l.amount, 0);
    const gst = catalogueLines.reduce((s, l) => s + l.inclusiveAmount! - l.amount, 0) + Math.round(otherSubtotal * q.gstRate);
    const total = subtotal + gst;
    return { issuer, kind, lines, subtotal, gst, total, totalInWords: rupeesInWords(total) };
  };
  const supply = part("supply", MAGNITUDE_BRANDS);
  const installPart = part("install", MAGNITUDE_SPACES);
  const install = installPart.lines.length ? installPart : null;
  const subtotal = supply.subtotal + (install?.subtotal ?? 0);
  const gst = supply.gst + (install?.gst ?? 0);
  const total = subtotal + gst;
  return {
    byMaterial,
    totalSqft: byMaterial.reduce((s, m) => s + m.sqft, 0),
    pricing,
    supply,
    install,
    subtotal,
    gst,
    total,
    totalInWords: rupeesInWords(total),
  };
}

/** The documents a quotation leaves as: supply always, installation when
 *  any material is installed by us. */
export function partsOf(q: Pick<Quotation, "rates">): QuotationPart[] {
  return q.rates.some((r) => r.installExGst != null) ? ["supply", "install"] : ["supply"];
}

/** Delivery time (Roheena, 6 October 2026): the floor prints 800 sq ft a day
 *  at full load, and the quotation promises that capacity plus a fifth,
 *  rounded up to whole working days, counted from the date of the order.
 *  10 days of work reads as "12 working days". Never printed as a
 *  calculation: the customer sees one line. */
export const DELIVERY = { sqftPerDay: 800, buffer: 1.2 } as const;

export function deliveryWorkingDays(sqft: number): number {
  const days = Math.max(1, Math.ceil(sqft / DELIVERY.sqftPerDay));
  return Math.ceil(days * DELIVERY.buffer);
}

/** Each document's own terms, kept to what the customer must know: what the
 *  offer covers, how it is paid (Roheena, 6 October 2026: standard for all
 *  B2B — supply half with the order and half before dispatch; installation
 *  half before it begins and half on completion), and for supply how long
 *  delivery takes. The measurements are already done (the drawing is named
 *  on the document), so there is no re-measurement clause. */
export const PART_TERMS: Record<QuotationPart, { scope: string; rest: string[] }> = {
  supply: {
    scope: "Supply covers printing on the specified material and delivery to site. Installation is quoted separately.",
    rest: [
      "Payment: 50% advance with the purchase order, and the balance 50% before dispatch.",
    ],
  },
  install: {
    scope: "Installation covers application of the supplied material on walls prepared as set out above.",
    rest: [
      "Payment: 50% before installation begins, and the balance 50% on completion.",
    ],
  },
};

/** The terms one document prints: its scope, the shared terms, its payment
 *  and start. */
export function termsFor(q: Pick<Quotation, "terms" | "lines" | "pricingPolicy">, part: QuotationPart): string[] {
  const own = PART_TERMS[part];
  const delivery = part === "supply"
    ? [`Delivery: ${deliveryWorkingDays(q.lines.reduce((n, l) => n + l.sqft, 0))} working days from the date of the order.`]
    : [];
  const installationTerms = q.pricingPolicy === "website-bespoke-20261013" ? [
    "Local paper installation: ₹35 per sq ft, plus GST.",
    "Outdoor installation will be quoted once the scope of work is finalised.",
    "For an outstation team, boarding and lodging are charged at actuals and borne by the customer.",
    "Scaffolding and other installation expenses, apart from manpower, are borne by the customer.",
  ] : [];
  return [own.scope, ...q.terms, ...own.rest, ...delivery, ...installationTerms];
}

export const STANDARD_SITE_PREP: readonly string[] = [
  "Wall levelling, repairs and surface preparation, as each wall requires, before our team arrives.",
  "Interior walls: cleaned, dry, smooth and primed with an oil-based primer, free of dust and loose paint.",
  "Any freshly painted surface needs at least three weeks to cure.",
];

/** Default validity: thirty days, the same window the partner portal's
 *  proposals carry (corporate_accounts.proposal_validity_days). */
export const VALIDITY_DAYS = 30;

export { GST_RATE };

/** A quotation that is sound enough to leave: every line priced, every area
 *  positive, a recipient named. The reasons are in plain words so the CRM can
 *  show them under the task. */
export function quotationProblems(q: Quotation): string[] {
  const problems: string[] = [];
  if (!q.preparedFor.organisation.trim()) problems.push("No organisation named.");
  if (!q.lines.length) problems.push("No measured areas.");
  for (const l of q.lines) {
    if (!(l.sqft > 0)) problems.push(`Line ${l.seq} (${l.location || "unnamed"}) has no area.`);
    if (!q.rates.some((r) => r.material === l.material)) problems.push(`Line ${l.seq} is on "${l.material}", which has no rate.`);
  }
  for (const r of q.rates) {
    if (!(r.supplyExGst > 0)) problems.push(`"${r.material}" has no supply rate.`);
  }
  if (q.validUntil <= q.dateKey) problems.push("Valid-until date is not after the quotation date.");
  return problems;
}
