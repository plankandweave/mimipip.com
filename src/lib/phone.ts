// Indian mobile numbers, parsed one way.
//
// A pure module with no server machinery, so it can be imported from a client
// component and covered by a plain node:test — the same reason ./print-limits
// was split out of ./corporate-auth.
//
// This exists because a number here RESOLVES AN ACCOUNT (corporate_members.phone,
// migration 0156), so the parse has to be correct rather than merely consistent
// with what the storefront does.

/** Bare 10-digit Indian mobile from whatever was typed, or "" if it is not one.
 *
 *  Length-aware. The storefront used to strip a leading "91" unconditionally,
 *  which is right for a country code and wrong for a number:
 *
 *    "919876543210" → "9876543210"   ✓ a +91 prefix
 *    "9198765432"   → "98765432"     ✗ a real number in the 91 series,
 *                                     truncated to 8 digits and then rejected
 *                                     as invalid — nobody on 91… could sign in
 *
 *  Indian mobiles begin 6–9, so "91…" is a perfectly ordinary number and the
 *  prefix can only be stripped when the length says it is one. This is now the
 *  only parser in the app; /api/auth, /api/cart/contact and AuthModal all read
 *  a number through it, so the client gate and the server gate cannot disagree. */
export function toIndianMobile(raw: unknown): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  // Trunk and IDD prefixes first ("0", "00"), which is safe in either order
  // only because no Indian mobile begins with a zero. Doing this before the 91
  // check collapses "0 98765…", "0091 98765…" and "+91 98765…" into one path.
  d = d.replace(/^0+/, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  return /^[6-9]\d{9}$/.test(d) ? d : "";
}

/** E.164, the only form Supabase Auth accepts. */
export const toE164 = (mobile: string) => `+91${mobile}`;

/** '98765 43210' — how a number is shown back to the person who typed it. */
export function formatMobile(mobile: string): string {
  const d = toIndianMobile(mobile);
  return d ? `${d.slice(0, 5)} ${d.slice(5)}` : String(mobile ?? "");
}
