import { financialYear } from "@/lib/gst";

// The ZYV/Q series: one reference per quotation, a revision when it changes.
//
//   ZYV/Q/2026-27/KRT-01 · Rev. 1
//
// ZYV/Q keeps it apart from the tax-invoice series (ZYV/<FY>/<NNNN>) and the
// OS's own site-visit quotes; the financial year is the Indian one, read off
// the IST calendar (src/lib/gst.ts); the customer code is three letters so a
// purchase desk can say "the KRT-01" on the phone; the serial counts that
// customer's quotations, not the year's, so a client never sees how many
// others were quoted before them.
//
// A revision supersedes rather than edits: ZYV/Q/2026-27/KRT-01 Rev. 2 replaces
// Rev. 1 and both rows stay. The number is an offer someone may hold us to.

export const QUOTATION_SERIES = "ZYV/Q";

const LEGAL_SUFFIX = /^(limited|ltd\.?|private|pvt\.?|llp|inc\.?|plc|co\.?|company|corporation|corp\.?|india|the|and|&|of)$/i;

/** A three-letter code from a company name: initials when there are three or
 *  more real words ("Knowledge Realty Trust" → KRT), else the first letter and
 *  the next consonants ("LTIMindtree Limited" → LTM); two words take both initials and the next consonant ("Vijay Sales" → VSL).
 *  Legal suffixes never count. Always A–Z; a name with too little to go on
 *  pads with X rather than returning fewer than three letters. */
export function customerCode(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !LEGAL_SUFFIX.test(w));
  const letters = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");
  let code = "";
  if (words.length >= 3) {
    code = words.slice(0, 3).map((w) => letters(w).charAt(0)).join("");
  } else if (words.length === 2) {
    // Both initials, then the next consonant of the second word: VS + L.
    const a = letters(words[0]).charAt(0);
    const b = letters(words[1]);
    code = (a + b.charAt(0) + b.slice(1).replace(/[AEIOU]/g, "") + b.slice(1)).slice(0, 3);
  } else if (words.length > 0) {
    const first = letters(words[0]);
    const rest = letters(words.slice(1).join("")) || "";
    const tail = (first.slice(1) + rest).replace(/[AEIOU]/g, "");
    code = (first.charAt(0) + tail).slice(0, 3);
    if (code.length < 3) code = (first.charAt(0) + first.slice(1) + rest).slice(0, 3);
  }
  return (code + "XXX").slice(0, 3);
}

/** ZYV/Q/2026-27/KRT-01 */
export function quotationNumber(code: string, serial: number, fy: string = financialYear()): string {
  return `${QUOTATION_SERIES}/${fy}/${code}-${String(serial).padStart(2, "0")}`;
}

/** "ZYV/Q/2026-27/KRT-01 · Rev. 1" — how the document and the subject line say it. */
export function quotationLabel(number: string, revision: number): string {
  return `${number} · Rev. ${revision}`;
}

/** The reference ONE of the two documents carries: the quotation's number
 *  with -S (supply, Magnitude Brands) or -I (installation, Magnitude Spaces),
 *  so two purchase orders to two vendors can each name their own —
 *  "ZYV/Q/2026-27/KRT-01-S". The row keeps the bare number. */
export function partReference(number: string, part: "supply" | "install"): string {
  return `${number}-${part === "supply" ? "S" : "I"}`;
}

/** "ZYV/Q/2026-27/KRT-01-S · Rev. 1" */
export function partLabel(number: string, revision: number, part: "supply" | "install"): string {
  return quotationLabel(partReference(number, part), revision);
}

/** "Supply quotation" / "Installation quotation" — the document's name. */
export function partName(part: "supply" | "install"): string {
  return part === "supply" ? "Supply quotation" : "Installation quotation";
}

/** The parts of a reference, or null when it is not one of ours. */
export function parseQuotationNumber(ref: string): { fy: string; code: string; serial: number } | null {
  const m = /^ZYV\/Q\/(\d{4}-\d{2})\/([A-Z]{3})-(\d{2,})$/.exec(ref.trim());
  return m ? { fy: m[1], code: m[2], serial: Number(m[3]) } : null;
}
