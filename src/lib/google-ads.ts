// Google Ads conversion tag — the direct "AW-" tag that sits beside GA4.
//
// Google Ads can import GA4 events, but its bidder only trusts (and enhanced
// conversions only work through) its own tag. So every conversion the store
// cares about fires twice: once as a GA4 event (src/lib/ga.ts, for reports)
// and once here as an Ads `conversion` event with the action's label. The
// GA4 imports in Ads are demoted to Secondary so nothing is double-counted.
//
// These IDs are not secrets — they ship in every page's source anyway — so
// they live here rather than in a build-time env var that has to be threaded
// through two GitHub Actions workflows. Ads account 905-946-7956.

export const GOOGLE_ADS_ID = "AW-18449342468";

/** Conversion labels as issued by Google Ads → Goals → Conversions. */
export const ADS_CONVERSION = {
  /** Primary. Value + currency + transaction_id, counted every time. */
  purchase: "_PV5CO3y94AdEITAqt1E",
  /** Secondary. Contact / enquiry / sample-request forms, one per click. */
  enquiry: "tMRSCPDy94AdEITAqt1E",
  /** Secondary. Newsletter sign-up or a new customer account, one per click. */
  signUp: "xK3gCPPy94AdEITAqt1E",
} as const;

export type AdsConversionName = keyof typeof ADS_CONVERSION;

/** Staff desks, tagged traffic_type=internal so GA's filter drops them. */
const INTERNAL_PREFIXES = ["/admin", "/studio"];

/**
 * The inline gtag bootstrap rendered in app/layout.tsx.
 *
 * It is built here, as a plain string, for one reason: the layout renders it
 * inside a JSX template literal, where a regex literal is silently mangled —
 * `/^\/(admin|studio)/` reaches the browser as `/^/(admin|studio)/` and the
 * whole script dies with "Invalid regular expression", taking GA4, Google Ads
 * and remarketing down with it. That shipped once (#418). So: no regex, no
 * backslashes, and a test that executes this string.
 */
export function googleTagBootstrap(gaId?: string): string {
  const internal = JSON.stringify(INTERNAL_PREFIXES);
  return [
    "window.dataLayer = window.dataLayer || [];",
    "function gtag(){dataLayer.push(arguments);}",
    "gtag('js', new Date());",
    `if (${internal}.some(function(p){var q=location.pathname;return q===p||q.indexOf(p+'/')===0;})) gtag('set', { traffic_type: 'internal' });`,
    `gtag('config', '${GOOGLE_ADS_ID}', { allow_enhanced_conversions: true });`,
    gaId ? `gtag('config', '${gaId}');` : "",
  ].filter(Boolean).join("\n");
}

/**
 * The one gtag.js URL the page loads. Each Google tag ID is its own container:
 * loading the Ads container first meant GA4 had to fetch a SECOND script before
 * it could send its page_view, and an ad visitor who left inside that gap was a
 * session to our own beacon and nobody to GA (9 Oct 2026: 107 Google Ads
 * landings first-party, about half that in GA). So GA4's container leads and
 * the Ads destination loads behind it — remarketing and conversions do not
 * depend on the first second of a visit, page_view does.
 */
export function googleTagSrc(gaId?: string): string {
  return `https://www.googletagmanager.com/gtag/js?id=${gaId || GOOGLE_ADS_ID}`;
}

export type AdsUserData = {
  email?: string | null;
  /** Any human formatting; normalised to E.164 (+91 default) before sending. */
  phone?: string | null;
};

function gtag(...args: unknown[]): void {
  try {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    window.gtag(...args);
  } catch {
    /* telemetry must never break the shop */
  }
}

/** Google needs E.164; Indian customers type 10 digits, or 0 / +91 prefixed. */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (raw.trim().startsWith("+") && digits.length >= 8) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return digits.length >= 8 ? `+${digits}` : null;
}

/**
 * Enhanced conversions: hand the tag the customer's own email/phone so Google
 * can hash and match the conversion to the ad click. Must run before the
 * conversion event in the same page.
 */
export function adsSetUserData(user: AdsUserData): void {
  const email = user.email?.trim().toLowerCase() || null;
  const phone = normalisePhone(user.phone);
  if (!email && !phone) return;
  const data: Record<string, string> = {};
  if (email) data.email = email;
  if (phone) data.phone_number = phone;
  gtag("set", "user_data", data);
}

export function adsConversion(
  name: AdsConversionName,
  params?: { value?: number; currency?: string; transaction_id?: string },
): void {
  gtag("event", "conversion", {
    send_to: `${GOOGLE_ADS_ID}/${ADS_CONVERSION[name]}`,
    ...(params ?? {}),
  });
}
