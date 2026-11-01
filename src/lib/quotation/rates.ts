import { GST_RATE, INSTALL_RATE_EX_GST } from "@/lib/pricing";

/**
 * The rate card a quotation is priced from.
 *
 * Every figure here is the one actually on a quotation or an account today;
 * nothing is a guess. Where the rule lives elsewhere (installation in
 * src/lib/pricing.ts, account rates in corporate_accounts) it is imported or
 * read, never retyped.
 *
 * ROHEENA'S ANSWERS OF 6 OCTOBER 2026, which this file encodes:
 *   · Outdoor wall film at ₹350/sq ft ex GST is the STANDARD for plastered
 *     outdoor walls (KRT Parel and most projects). IILM's exterior needs a
 *     different film, which gets its own library entry and its own rate.
 *   · Catalogue designs use their live website rate per design (13 October).
 *     Surface names never determine retail prices.
 *   · Nothing leaves without her press for sixty days (to 5 December 2026);
 *     automation is considered only after six consecutive quotations went
 *     out without a change — see AUTOMATION_REVIEW below.
 *
 * All rates are EX GST: the quotation adds GST as its own line, which is what
 * a B2B purchase desk expects to see. Catalogue prices are GST-inclusive, so
 * they are backed out here (₹200 incl → ₹169.49 ex), the same arithmetic
 * priceWallFromCatalogue() does for website-priced partners.
 */

export const RATE_CARD = {
  /** Interior installation, ₹/sq ft ex GST — the storefront's own rate. */
  installInteriorExGst: INSTALL_RATE_EX_GST,
  /** Outdoor wall film supply, ₹/sq ft ex GST. KRT, 6 Oct 2026. Not a catalogue material. */
  outdoorFilmSupplyExGst: 350,
  /** Bespoke paper artwork, ₹/sq ft BEFORE GST (founder, 13 October 2026). */
  commissionedExGst: 250,
} as const;

/** The desk may not send on its own before this date, and then only once
 *  six consecutive quotations have gone out exactly as prepared (Roheena,
 *  6 October 2026). Read by nothing that sends — there is no such code —
 *  and shown on the Quotations panel as the tally. */
export const AUTOMATION_REVIEW = { notBefore: "2026-12-05", unchangedInARow: 6 } as const;

/** ₹200 incl. GST → ₹169.49 ex GST, to the paisa. */
export function exGst(inclGst: number, gstRate = GST_RATE): number {
  return Math.round((inclGst / (1 + gstRate)) * 100) / 100;
}

/** ₹169.49 ex → ₹200 incl, for the note under a rate. */
export function inclGst(exGstRate: number, gstRate = GST_RATE): number {
  return Math.round(exGstRate * (1 + gstRate) * 100) / 100;
}

/** Installation per sq ft ex GST for a material, or null when we do not fit it. */
export function installRateExGst(material: { outdoor: boolean; installable: boolean }): number | null {
  if (!material.installable) return null;
  return material.outdoor ? null : RATE_CARD.installInteriorExGst;
}
