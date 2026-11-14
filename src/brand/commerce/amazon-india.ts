/**
 * Where MimiPip can also be bought on Amazon India. The one place this lives.
 *
 * Empty until Amazon shows a live MimiPip listing (14 Nov 2026: Brand Registry
 * approved on 12 Nov, 14 products in draft in Seller Central batch 52535020768,
 * brand approval and the GTIN exemption pending with the account manager).
 * While it is empty nothing on the site mentions Amazon: a link to a listing that
 * does not exist sends a parent to an error page.
 *
 * The owner's rule of 7 October 2026 for Zyvorah stands here too: Amazon is never
 * offered on a product page beside Add to cart (a shopper ready to pay is not sent
 * to a checkout we cannot see). It is named in the footer and the FAQ only.
 *
 * To switch it on: set `storeUrl` to the MimiPip brand store (or the search page
 * Amazon gives for the brand) on amazon.in, once it opens for a shopper.
 */
export const AMAZON_INDIA: { storeUrl: string | null } = {
  storeUrl: null,
};

/** The link to show, or null. Only an https amazon.in address is ever shown. */
export function amazonIndiaLink(config: { storeUrl: string | null } = AMAZON_INDIA): string | null {
  const raw = config.storeUrl?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    if (u.hostname !== 'www.amazon.in' && u.hostname !== 'amazon.in') return null;
    return u.href;
  } catch {
    return null;
  }
}
