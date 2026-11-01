/**
 * GSTIN handling — one normaliser and one shape check, shared by the portal
 * form and every route that stores one.
 *
 * WHY THIS EXISTS (12 Aug 2026). The corporate portal took the GSTIN as free
 * text: the form uppercased it, the API stripped a pasted "GSTIN:" label, and
 * nothing anywhere looked at whether the result was a GST number at all. That
 * field is not decoration — it is saved against the STATE PROFILE, so it rides
 * onto every future order into that state, and downstream it is the IDENTITY
 * the accounting system matches the customer on. A national account holds one
 * registration per state, and the GSTIN is the only thing that tells five of
 * them apart.
 *
 * A malformed one therefore does not fail loudly. It matches no existing
 * customer, so the books quietly mint a NEW one and the invoices pile up
 * against a stranger. That happened: `27HCV3778L1ZK` (13 characters, two
 * letters short of Vijay Sales' Maharashtra registration `27AAHCV3778L1ZK`)
 * created a junk customer record before anyone noticed.
 *
 * So: rejected at the door, in the form and on the server, with the reason.
 */

/**
 * The shape of a GSTIN: a 2-digit state code, the holder's 10-character PAN
 * (5 letters, 4 digits, 1 letter), a 1-character entity number, a literal Z,
 * and a checksum character.
 *
 * The checksum itself is deliberately NOT verified. This is a gate against
 * typos and truncation becoming a customer identity, not a validation service —
 * and a check that rejected a real number because of a checksum quirk would
 * block a partner from ordering, which is worse than what it prevents.
 */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;

/**
 * Tidy a typed or pasted GSTIN into its canonical form.
 *
 * Partners paste it with the label ("GSTIN: 24AAHCV…"), with spaces, in lower
 * case, or with the non-breaking spaces a copy out of a PDF leaves behind.
 * None of that is an error worth showing somebody — it is just tidying.
 */
export function normaliseGstin(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/^\s*GSTIN\s*[:\-]?\s*/i, "")
    .replace(/[\s ​]+/g, "")
    .toUpperCase();
}

/** True when `raw` normalises to a well-formed GSTIN. Empty is NOT valid. */
export function isGstin(raw: string | null | undefined): boolean {
  return GSTIN_RE.test(normaliseGstin(raw));
}

/** The state code a GSTIN is registered under — its first two digits. */
export function gstinStateCode(raw: string | null | undefined): string | null {
  const g = normaliseGstin(raw);
  return GSTIN_RE.test(g) ? g.slice(0, 2) : null;
}

/**
 * Validate for storage: `{ value }` on success, `{ error }` on a bad one.
 *
 * BLANK IS ALLOWED and normalises to null — not every buyer is registered, and
 * the portal has never demanded one. What is refused is a value that is present
 * but is not a GSTIN, because that is the case which travels silently.
 */
export function checkGstin(raw: string | null | undefined): { value: string | null } | { error: string } {
  const g = normaliseGstin(raw);
  if (!g) return { value: null };
  if (GSTIN_RE.test(g)) return { value: g };
  return {
    error: g.length !== 15
      ? `That GSTIN is ${g.length} characters — a GSTIN is exactly 15 (e.g. 27AAHCV3778L1ZK). Please check it.`
      : "That doesn't look like a valid GSTIN — the format is 2 digits, then a 10-character PAN, then 3 more characters (e.g. 27AAHCV3778L1ZK).",
  };
}

/** The GST state codes, so a typed state and its GSTIN can be cross-checked. */
const GSTIN_STATE_NAMES: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
  "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
  "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka",
  "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};

/**
 * Does this GSTIN belong to the state the order is being placed into?
 *
 * A mismatch is the mistake this account is most exposed to: the portal offers
 * every state, the profile auto-fills the last one used, and pasting the wrong
 * state's registration produces an invoice that is internally contradictory —
 * a Gujarat GSTIN on a Maharashtra supply. Null when there is nothing to check.
 */
/**
 * Compare two state names by what they MEAN, not by their punctuation. The
 * portal's own list writes "Jammu & Kashmir" where the GST table writes
 * "Jammu and Kashmir" — comparing those raw declared a correct 01 registration
 * to be the wrong state's, and since a GSTIN problem blocks submission that
 * left the order permanently unsendable with an error nobody could act on.
 */
const sameState = (a: string, b: string) => {
  const key = (s: string) =>
    s.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");
  return key(a) === key(b);
};

export function gstinStateMismatch(raw: string | null | undefined, state: string | null | undefined): string | null {
  const code = gstinStateCode(raw);
  const want = String(state ?? "").trim();
  if (!code || !want) return null;
  const named = GSTIN_STATE_NAMES[code];
  if (!named) return null;
  if (sameState(named, want)) return null;
  return `That GSTIN is registered in ${named} (it starts ${code}), but this order is for ${want}. Use the ${want} registration, or change the state.`;
}
