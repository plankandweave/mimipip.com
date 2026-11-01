/**
 * Who issues what on a Zyvorah quotation (Roheena, 6 October 2026):
 *
 *   "Installation is always Magnitude Spaces, and only sales are in
 *    Magnitude Brands."
 *
 * Supply — the printed wallcovering, delivered to site — is sold by
 * Magnitude Brands Private Limited. Installation is a service of Magnitude
 * Spaces Private Limited. A quotation is therefore TWO documents under one
 * reference: a supply quotation issued by Brands and an installation
 * quotation issued by Spaces, each with its own subtotal and GST, because
 * each becomes its own tax invoice from its own company and each company is
 * registered as its own vendor — the customer deducts TDS against each PAN.
 * So every document carries its issuer's GSTIN AND PAN (Roheena, later the
 * same day: "both should have the PAN number, and both should have the GST
 * mentioned. Both have the same registered office.").
 *
 * Every figure below is copied from the companies' own registration
 * documents — the GST REG-06 certificates, the ROC certificates and the
 * board papers — never typed from memory. A change here is a change to a
 * legal identity: check the certificate first.
 */

export type Issuer = {
  key: "brands" | "spaces";
  legalName: string;
  gstin: string;
  pan: string;
  cin: string;
  /** The registered office, one line — the same for both companies. */
  address: string;
  /** GST state code of the principal place of business. */
  stateCode: string;
  stateName: string;
  /** What this company is on the quotation for. */
  role: "supply" | "installation";
};

/** The registered office both companies share (Roheena, 6 October 2026),
 *  as the Magnitude Brands GST REG-06 and board papers write it. */
export const REGISTERED_OFFICE =
  "Office No. 207, Supreme Head Quarter, Sr. No. 36/2, Supreme Universal, Nr Pashank, Baner, Pune 411045, Maharashtra";

/** Magnitude Brands Private Limited — GST REG-06, GSTIN 27AATCM2315A1ZP,
 *  issued 18 March 2026; CIN from the board resolution of 18 December 2025. */
export const MAGNITUDE_BRANDS: Issuer = {
  key: "brands",
  legalName: "Magnitude Brands Private Limited",
  gstin: "27AATCM2315A1ZP",
  pan: "AATCM2315A",
  cin: "U31001PN2025PTC240692",
  address: REGISTERED_OFFICE,
  stateCode: "27",
  stateName: "Maharashtra",
  role: "supply",
};

/** Magnitude Spaces Private Limited (formerly Plank And Weave Retail Private
 *  Limited; ROC certificate of change of name, 20 May 2025) — GST REG-06,
 *  GSTIN 27AAKCA7438B1ZQ. Its GST certificate on Drive still names Ishanya,
 *  Yerawada as the principal place of business; the registered office is the
 *  one it shares with Brands (Roheena, 6 October 2026). */
export const MAGNITUDE_SPACES: Issuer = {
  key: "spaces",
  legalName: "Magnitude Spaces Private Limited",
  gstin: "27AAKCA7438B1ZQ",
  pan: "AAKCA7438B",
  cin: "U52100PN2012PTC143666",
  address: REGISTERED_OFFICE,
  stateCode: "27",
  stateName: "Maharashtra",
  role: "installation",
};

export const ISSUERS = { brands: MAGNITUDE_BRANDS, spaces: MAGNITUDE_SPACES } as const;

/** Which company a pricing line — and the document it is on — belongs to. */
export function issuerFor(kind: "supply" | "install"): Issuer {
  return kind === "supply" ? MAGNITUDE_BRANDS : MAGNITUDE_SPACES;
}

/** "Magnitude Brands Private Limited · GSTIN 27AATCM2315A1ZP · PAN AATCM2315A" —
 *  the one line a vendor-registration form needs, on every page. */
export function issuerLine(i: Issuer): string {
  return `${i.legalName} · GSTIN ${i.gstin} · PAN ${i.pan}`;
}
