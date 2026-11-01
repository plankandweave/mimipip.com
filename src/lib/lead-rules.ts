import { IST_OFFSET_MS } from "@/lib/ist";

/**
 * Pure rules behind lead intake and the cart follow-up, kept apart from the
 * database code so they can be tested (lead-rules.test.ts).
 */

/** Our own QA and smoke tests are not leads: example.com addresses and any
 *  message marked "INTERNAL QA" (the 30 September release checks wrote both). */
export function isTestLead(email: string | null | undefined, message?: string | null): boolean {
  const e = (email ?? "").trim().toLowerCase();
  if (/@(example\.(com|org|net)|test\.com)$/.test(e)) return true;
  if (/internal qa|do not contact/i.test(message ?? "")) return true;
  return false;
}

/** The CRM company name for a person who is not a company: their name, else
 *  the address they gave, so the record is findable from either. */
export function leadCompanyName(name: string | null | undefined, email: string | null, phone: string | null): string {
  const n = (name ?? "").trim();
  if (n) return email ? `${n} (${email})` : n;
  return email ?? phone ?? "Website lead";
}

/**
 * When a shopper may be emailed: Monday to Saturday, 09:00 to 19:00 IST. The
 * founder's rule for every work message (no Sundays, nothing in the evening);
 * a cart left at 23:00 gets its email at 09:00, not at midnight.
 */
export function inShopperMailWindow(now: Date = new Date()): boolean {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  if (ist.getUTCDay() === 0) return false;
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 9 * 60 && mins < 19 * 60;
}

/** A cart is followed up once it has sat untouched this long. Long enough
 *  that someone still choosing is not interrupted; short enough that the
 *  call lands while the wall is still on their mind. */
export const CART_IDLE_MINUTES = 60;
/** Older than this, a cart is history, not a lead. */
export const CART_MAX_AGE_DAYS = 7;

/** The design page that rebuilds a cart line: the same ?w=&h=&material= the
 *  cart's own "Edit size" link uses, so an emailed shopper lands on their
 *  exact wall in any browser. */
export function resumeUrl(site: string, line: { handle: string; widthCm: number; heightCm: number; materialSlug: string }): string {
  const wFt = line.widthCm / 30.48;
  const hFt = line.heightCm / 30.48;
  const q = new URLSearchParams({
    w: wFt.toFixed(4),
    h: hFt.toFixed(4),
    material: line.materialSlug,
    utm_source: "email",
    utm_medium: "email",
    utm_campaign: "cart_saved",
  });
  return `${site}/products/${line.handle}?${q.toString()}#create-your-wall`;
}
