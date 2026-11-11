import { istParts } from "@/lib/ist";
// GST helpers shared by billing (buyer GSTIN capture) and the dispatch-time
// tax-invoice generator. The SELLER's GST identity is read from env and is
// NEVER hard-coded — an invoice is only generated once real seller details are
// configured, so we can never emit a tax document with placeholder data.

// 15-char GSTIN: 2 state code + 10 PAN + 1 entity + 'Z' + 1 checksum.
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function isValidGstin(v: string): boolean {
  return GSTIN_RE.test((v || "").trim().toUpperCase());
}

/** The 15th character of a GSTIN is a check digit over the first 14 (the
 *  GSTN's mod-36 scheme), so a single mistyped character is caught at once,
 *  before anyone is asked to look the number up. */
export function gstinChecksumOk(v: string): boolean {
  const g = (v || "").trim().toUpperCase();
  if (!GSTIN_RE.test(g)) return false;
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = chars.indexOf(g[i]!) * (i % 2 ? 2 : 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return chars[(36 - (sum % 36)) % 36] === g[14];
}

/**
 * Indian financial year (Apr–Mar) as "YYYY-YY", e.g. 2025-26.
 *
 * Read off the IST calendar, never the server's: this number goes into invoice
 * serials, and on 1 April a UTC clock is still in the old year until 05:30 IST.
 */
export function financialYear(d: Date = new Date()): string {
  const { year, month } = istParts(d);
  const startYear = month >= 3 ? year : year - 1; // month 3 = April
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

// GST state codes (place of supply). Lowercased name → 2-digit code.
export const STATE_CODES: Record<string, string> = {
  "jammu and kashmir": "01", "himachal pradesh": "02", "punjab": "03", "chandigarh": "04",
  "uttarakhand": "05", "haryana": "06", "delhi": "07", "rajasthan": "08", "uttar pradesh": "09",
  "bihar": "10", "sikkim": "11", "arunachal pradesh": "12", "nagaland": "13", "manipur": "14",
  "mizoram": "15", "tripura": "16", "meghalaya": "17", "assam": "18", "west bengal": "19",
  "jharkhand": "20", "odisha": "21", "orissa": "21", "chhattisgarh": "22", "madhya pradesh": "23",
  "gujarat": "24", "daman and diu": "25", "dadra and nagar haveli": "26",
  "dadra and nagar haveli and daman and diu": "26", "maharashtra": "27", "karnataka": "29",
  "goa": "30", "lakshadweep": "31", "kerala": "32", "tamil nadu": "33", "puducherry": "34",
  "pondicherry": "34", "andaman and nicobar islands": "35", "telangana": "36",
  "andhra pradesh": "37", "ladakh": "38", "other territory": "97",
};

export function stateNameToCode(name?: string | null): string | null {
  if (!name) return null;
  return STATE_CODES[name.trim().toLowerCase()] ?? null;
}

/**
 * Place-of-supply state code for the buyer. A B2B buyer's GSTIN carries their
 * state in its first two digits (authoritative); otherwise fall back to the
 * shipping-address state.
 */
export function buyerStateCode(gstin?: string | null, stateName?: string | null): string | null {
  if (gstin && isValidGstin(gstin)) return gstin.trim().slice(0, 2);
  return stateNameToCode(stateName);
}

export type SellerGst = {
  legalName: string;
  gstin: string;
  address: string;
  stateCode: string;
  stateName: string;
  hsnGoods: string;
  sacService: string;
  invoicePrefix: string;
  email: string;
};

/**
 * Seller GST identity from env. Returns null unless the legally-required fields
 * (legal name, GSTIN, address, state code) are all present — so the invoice
 * generator stays OFF until real details are configured.
 */
export function sellerGstConfig(): SellerGst | null {
  const legalName = process.env.SELLER_LEGAL_NAME?.trim();
  const gstin = process.env.SELLER_GSTIN?.trim().toUpperCase();
  const address = process.env.SELLER_ADDRESS?.trim();
  const stateCode = process.env.SELLER_STATE_CODE?.trim();
  if (!legalName || !gstin || !isValidGstin(gstin) || !address || !stateCode) return null;
  return {
    legalName,
    gstin,
    address,
    stateCode,
    stateName: process.env.SELLER_STATE_NAME?.trim() || "",
    hsnGoods: process.env.GST_HSN_GOODS?.trim() || "4814",
    sacService: process.env.GST_SAC_SERVICE?.trim() || "995473",
    invoicePrefix: process.env.GST_INVOICE_PREFIX?.trim() || "ZYV",
    email: process.env.SELLER_EMAIL?.trim() || "hello@zyvorah.com",
  };
}

/**
 * Split an exact GST amount so the invoice reconciles to the rupee: intra-state
 * → CGST + SGST (each half, CGST carries any odd rupee); inter-state → IGST.
 */
export function gstSplit(gstTotal: number, sellerStateCode: string, buyerState: string | null) {
  const intra = buyerState != null && buyerState === sellerStateCode;
  const minor = Math.round(gstTotal * 100);
  gstTotal = minor / 100;
  if (intra) {
    const cgstMinor = Math.round(minor / 2);
    return { intra: true, cgst: cgstMinor / 100, sgst: (minor - cgstMinor) / 100, igst: 0, total: gstTotal };
  }
  return { intra: false, cgst: 0, sgst: 0, igst: gstTotal, total: gstTotal };
}

/** The state Zyvorah invoices partner orders FROM (seller GSTIN 27…). The
 *  portal's price preview must name the tax heads the OS invoice will charge. */
export const SELLER_HOME_STATE = "Maharashtra";

/** Tax heads for a supply into `buyerState` (a state NAME), by the OS invoice's
 *  rule and paise rounding: home state → CGST + SGST (CGST takes the rounded
 *  half), any other state → IGST. No state chosen yet → plain GST. */
export function taxHeads(gst: number, gstPct: number, buyerState: string | null): { label: string; amount: number }[] {
  const st = buyerState?.trim().toLowerCase();
  if (!st) return [{ label: `GST ${gstPct}%`, amount: gst }];
  if (st !== SELLER_HOME_STATE.toLowerCase()) return [{ label: `IGST ${gstPct}%`, amount: gst }];
  const cgst = Math.round((gst / 2) * 100) / 100;
  return [
    { label: `CGST ${gstPct / 2}%`, amount: cgst },
    { label: `SGST ${gstPct / 2}%`, amount: Math.round((gst - cgst) * 100) / 100 },
  ];
}
