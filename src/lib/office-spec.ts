import {
  MIN_PRINT_WIDTH_FT,
  MIN_WALLPAPER_SQFT,
} from "./pricing";
import { INSTALL_CITY_NAMES } from "./install-cities";

/**
 * The specification block — the boringest and highest-converting thing on the
 * office section.
 *
 * A facilities manager or a specifying architect is looking for exactly this
 * table and cannot find it on any Indian wallpaper site, so they email instead,
 * and half of them never do. Putting it on the page (and behind a downloadable
 * sheet, because they forward rather than bookmark) removes a whole round trip.
 *
 * EVERY LINE HERE MUST BE TRUE AND SOURCED. Values that live in code or the
 * database are imported, never retyped. Values that are editorial are the same
 * words the /materials and /commercial pages already use.
 *
 * ── NOT YET STATED ─────────────────────────────────────────────────────────
 * Three things a specifier will eventually ask for are deliberately ABSENT
 * rather than guessed, because a wrong number here is a specification someone
 * builds on:
 *
 *   • Reaction-to-fire classification (EN 13501-1 / ASTM E84 or the IS
 *     equivalent), from the substrate supplier's test certificate.
 *   • Abrasion / scrub resistance class.
 *   • Emissions or low-VOC certification for the ink set.
 *
 * When the certificates exist, add them to CERTIFICATIONS below and they will
 * appear on the page and in the PDF with no other change.
 */

/** Roll widths, in mm, as held on the materials table. */
export type SpecRow = {
  k: string;
  /** The plain-text value. The PDF spec sheet prints exactly this, in rupees:
   *  it is India's specification document, alongside the GST line, the Indian
   *  test certificates and the Indian install cities. */
  v: string;
  /** Set when the row leads with a rate. The on-page table prices this in the
   *  reader's market instead of printing the rupee text — a facilities manager
   *  abroad cannot specify against a rupee figure. */
  rateInr?: number;
  /** The rest of the row after the rate, for the market-priced rendering. */
  rateSuffix?: string;
};

export type SpecGroup = { heading: string; rows: SpecRow[] };

/**
 * Test certificates we can actually show. Empty until the documents are in
 * hand — an empty list renders no section rather than an empty promise.
 */
export const CERTIFICATIONS: SpecRow[] = [];

/** mm → a specification-desk friendly "1360 mm (4 ft 5 in)". */
export function mmToFtIn(mm: number): string {
  const totalIn = mm / 25.4;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn - ft * 12);
  return `${mm} mm (${ft} ft ${inch} in)`;
}

export type SpecInput = {
  /** Wallpaper finishes, cheapest first — from getMaterialOffers(). */
  finishes: { name: string; rate: number; rollWidthMm: number | null; restricted: boolean }[];
};

export function officeSpec({ finishes }: SpecInput): SpecGroup[] {
  const groups: SpecGroup[] = [
    {
      heading: "Product",
      rows: [
        { k: "Product", v: "Digitally printed mural wallpaper design" },
        { k: "Supplied as", v: "Panelled drops, clearly labelled in hanging order, with a fitting guide" },
        { k: "Sizing", v: "Cut to the customer's measured wall — no standard roll size to work around" },
        { k: "Colour consistency", v: "Colour-matched across every drop in a run, so a long wall reads as one piece" },
        { k: "Proofing", v: "A proof is approved before anything prints" },
      ],
    },
    {
      heading: "Finishes",
      rows: finishes.map((f) => {
        const suffix = [
          f.rollWidthMm ? `printed width ${mmToFtIn(f.rollWidthMm)}` : null,
          "paste-the-wall",
          f.restricted ? "available on the Autograph range" : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return {
          k: f.name,
          v: [`₹${f.rate} / sq ft, inclusive of GST`, suffix].filter(Boolean).join(" · "),
          rateInr: f.rate,
          rateSuffix: suffix,
        };
      }),
    },
    {
      heading: "Ordering & pricing",
      rows: [
        { k: "Priced by", v: "The square foot of the actual wall, GST inclusive" },
        {
          k: "Minimum chargeable width",
          v: `${MIN_PRINT_WIDTH_FT} ft of print width — a narrower wall still consumes it on the roll. The print is made to the real measurement.`,
        },
        { k: "Minimum billed area", v: `${MIN_WALLPAPER_SQFT} sq ft per order` },
        { k: "Openings", v: "Doors, windows and other openings are deducted when we quote from an elevation" },
        { k: "Samples", v: "Printed design samples on the ordered finish, delivered across India" },
      ],
    },
    {
      heading: "Lead time & delivery",
      rows: [
        { k: "Production", v: "Dispatched 7–10 working days after proof approval" },
        { k: "Shipping", v: "Free across India" },
        {
          k: "On-site installation",
          v: `Available in ${INSTALL_CITY_NAMES.join(", ")}. Elsewhere, drops ship with a fitting guide for a local fitter.`,
        },
        {
          k: "Occupied buildings",
          v: "Paste-the-wall installation — no soaking table, no wet trimming on site. Typically fitted out of hours or over a weekend.",
        },
      ],
    },
    {
      heading: "In use",
      rows: [
        { k: "Cleaning", v: "Wipe gently with a barely-damp cloth. Avoid harsh cleaners and scrubbing." },
        { k: "Moisture", v: "Not intended for areas with direct water exposure, such as inside a shower or behind a sink." },
        {
          k: "Repair",
          v: "Walls are printed as panelled drops, so a damaged section is generally a reprint of that drop rather than the wall.",
        },
        {
          k: "Removal",
          v: "Intended for long-term installation. Removal generally requires dampening and peeling; removed panels should not be expected to be reusable.",
        },
      ],
    },
  ];

  if (CERTIFICATIONS.length) {
    groups.push({ heading: "Certification", rows: CERTIFICATIONS });
  }
  return groups;
}
