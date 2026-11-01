import { serviceAvailable } from "../brand/services";
// Google Analytics Data API (GA4) — dependency-free service-account client.
//
// The official googleapis SDK is enormous and assumes Node's crypto module;
// this runs on Cloudflare's workerd as well, so the JWT is signed with
// WebCrypto (crypto.subtle exists in both runtimes) and everything else is
// plain fetch against the REST surface.
//
// Env (all three required before anything is fetched):
//   GA4_PROPERTY_ID     numeric property id, e.g. 123456789 (NOT the G-XXXX
//                       measurement id — that one only tags the site)
//   GA_SA_CLIENT_EMAIL  the service account's email, which must be added to
//                       the GA4 property as a Viewer
//   GA_SA_PRIVATE_KEY   the service account's PEM private key; \n-escaped or
//                       real newlines both work
//
// Absent config every caller gets null and the daily report says so — the
// report must go out on day 1, before the Google side is wired.

import { googleAccessToken, SCOPE_ANALYTICS } from "@/lib/google-auth";
import { addIstDays, istDateKey } from "@/lib/ist";

// The JWT signing and token exchange used to live here. Search Console needs
// the same service-account key with a different scope, and a Google token is
// scoped at mint time, so the flow moved to lib/google-auth.ts rather than
// being copied. That file caches per scope — one shared cache slot would hand
// an Analytics token to a Search Console call and fail with a 403 that reads
// exactly like a missing permission.

export function gaReportingConfigured(): boolean {
  return Boolean(
    process.env.GA4_PROPERTY_ID &&
      process.env.GA_SA_CLIENT_EMAIL &&
      process.env.GA_SA_PRIVATE_KEY,
  );
}

const accessToken = () => googleAccessToken(SCOPE_ANALYTICS);

type RunReportBody = {
  dateRanges: { startDate: string; endDate: string }[];
  dimensions?: { name: string }[];
  metrics: { name: string }[];
  orderBys?: unknown[];
  limit?: string;
  dimensionFilter?: unknown;
};

type ReportRow = { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] };

async function runReport(body: RunReportBody): Promise<ReportRow[] | null> {
  if (!serviceAvailable("analytics")) return null;
  const property = process.env.GA4_PROPERTY_ID;
  if (!property) return null;
  try {
    const token = await accessToken();
    if (!token) return null;
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) {
      console.error("[ga-data] runReport failed:", res.status, await res.text());
      return null;
    }
    const json = (await res.json()) as { rows?: ReportRow[] };
    return json.rows ?? [];
  } catch (e) {
    console.error("[ga-data] runReport error:", e);
    return null;
  }
}

const num = (row: ReportRow, i: number) => Number(row.metricValues?.[i]?.value ?? 0);
const dim = (row: ReportRow, i: number) => row.dimensionValues?.[i]?.value ?? "";

export type GaDaySnapshot = {
  date: string; // YYYY-MM-DD as GA saw it (property timezone — set it to IST)
  sessions: number;
  totalUsers: number;
  newUsers: number;
  pageViews: number;
  avgSessionSeconds: number;
  purchases: number;
  purchaseRevenue: number;
  sources: { source: string; sessions: number; users: number }[];
  pages: { path: string; views: number }[];
};

/**
 * One day of GA4 numbers. `date` must be YYYY-MM-DD in the property's own
 * timezone (ours is IST — set the property to Asia/Kolkata when creating it).
 * Returns null when GA reporting isn't configured or the totals call failed.
 */
export async function fetchGaDay(date: string): Promise<GaDaySnapshot | null> {
  if (!gaReportingConfigured()) return null;

  const range = [{ startDate: date, endDate: date }];
  const [totals, sources, pages] = await Promise.all([
    runReport({
      dateRanges: range,
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "newUsers" },
        { name: "screenPageViews" },
        { name: "averageSessionDuration" },
        { name: "ecommercePurchases" },
        { name: "purchaseRevenue" },
      ],
    }),
    runReport({
      dateRanges: range,
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: "8",
    }),
    runReport({
      dateRanges: range,
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: "8",
    }),
  ]);

  if (!totals) return null;
  const t = totals[0];
  return {
    date,
    sessions: t ? num(t, 0) : 0,
    totalUsers: t ? num(t, 1) : 0,
    newUsers: t ? num(t, 2) : 0,
    pageViews: t ? num(t, 3) : 0,
    avgSessionSeconds: t ? Math.round(num(t, 4)) : 0,
    purchases: t ? num(t, 5) : 0,
    purchaseRevenue: t ? num(t, 6) : 0,
    sources: (sources ?? []).map((r) => ({
      source: dim(r, 0) || "(unknown)",
      sessions: num(r, 0),
      users: num(r, 1),
    })),
    pages: (pages ?? []).map((r) => ({ path: dim(r, 0) || "/", views: num(r, 0) })),
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * The SEO window.
 *
 * `fetchGaDay` above answers "how did yesterday go" for the founder's email.
 * This answers a different question, for a different reader: "which pages are
 * failing, and at what scale" — the input to the daily site-health agent.
 *
 * Three deliberate differences from the daily snapshot:
 *   - a 28-day window, not one day. A page with 3 views yesterday is noise;
 *     the same page with 90 views a month and a 100% bounce is a defect.
 *   - engagement and bounce alongside views. Views alone cannot tell a page
 *     that works from a page people land on and immediately leave.
 *   - pageTitle beside pagePath. The title is how a broken page confesses:
 *     "This design has moved", "404", "Product" with no name — each is a
 *     routing or metadata fault visible in no other dimension.
 *
 * Returns null when GA reporting is not configured, exactly like fetchGaDay,
 * so a caller can degrade instead of failing.
 * ───────────────────────────────────────────────────────────────────────── */

export type GaSeoPage = {
  path: string;
  title: string;
  views: number;
  sessions: number;
  /** 0-1. GA4's own engagement definition: >10s, a conversion, or 2+ views. */
  engagementRate: number;
  /** 0-1, and simply 1 - engagementRate. Kept because it is how people read. */
  bounceRate: number;
};

export type GaSeoWindow = {
  /** Inclusive, YYYY-MM-DD in the property's timezone (IST). */
  from: string;
  to: string;
  days: number;
  sessions: number;
  totalUsers: number;
  pageViews: number;
  /** Sessions by GA channel — "Organic Search" here is the SEO scoreboard. */
  channels: { channel: string; sessions: number }[];
  /** Where sessions began. A bad landing page costs more than a bad page. */
  landingPages: { path: string; sessions: number; bounceRate: number }[];
  /** Most-viewed pages, worst-engaging first among equals. */
  pages: GaSeoPage[];
};

const rate = (row: ReportRow, i: number) => {
  const v = Number(row.metricValues?.[i]?.value ?? 0);
  return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : 0;
};

/**
 * A window of GA4 numbers shaped for technical-SEO triage.
 *
 * `days` counts back from yesterday, never today: GA4's standard reports lag
 * collection by up to 48 hours, so a window that includes today reports a
 * partial day as a real one and every trend read off it is wrong.
 */
export async function fetchGaSeoWindow(days = 28): Promise<GaSeoWindow | null> {
  if (!gaReportingConfigured()) return null;

  // endDate "yesterday" and startDate "NdaysAgo" are GA's own relative tokens,
  // resolved in the property's timezone — which is why this does no date maths
  // of its own and cannot drift against the IST clock the rest of the app uses.
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: "yesterday" }];

  const [totals, channels, landing, pages] = await Promise.all([
    runReport({
      dateRanges,
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "screenPageViews" }],
    }),
    runReport({
      dateRanges,
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: "12",
    }),
    runReport({
      dateRanges,
      dimensions: [{ name: "landingPage" }],
      metrics: [{ name: "sessions" }, { name: "bounceRate" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: "40",
    }),
    runReport({
      dateRanges,
      dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
      metrics: [
        { name: "screenPageViews" },
        { name: "sessions" },
        { name: "engagementRate" },
        { name: "bounceRate" },
      ],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: "120",
    }),
  ]);

  // Totals are the one call that must succeed: without a denominator every
  // rate below is unreadable, and a half-empty window invites false alarms.
  if (!totals) return null;
  const t = totals[0];

  // GA resolves the relative tokens on its side; report the same window back
  // in absolute dates so the consumer is never guessing which days these are.
  const end = addIstDays(istDateKey(), -1);
  const start = addIstDays(end, -(days - 1));

  return {
    from: start,
    to: end,
    days,
    sessions: t ? num(t, 0) : 0,
    totalUsers: t ? num(t, 1) : 0,
    pageViews: t ? num(t, 2) : 0,
    channels: (channels ?? []).map((r) => ({
      channel: dim(r, 0) || "(unassigned)",
      sessions: num(r, 0),
    })),
    landingPages: (landing ?? []).map((r) => ({
      path: dim(r, 0) || "/",
      sessions: num(r, 0),
      bounceRate: rate(r, 1),
    })),
    pages: (pages ?? []).map((r) => ({
      path: dim(r, 0) || "/",
      title: dim(r, 1),
      views: num(r, 0),
      sessions: num(r, 1),
      engagementRate: rate(r, 2),
      bounceRate: rate(r, 3),
    })),
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * Paid-traffic rows for the daily ad-channel review (lib/ad-channels.ts).
 *
 * One report, source × medium × campaign, over an inclusive date range in
 * the property's timezone (IST). advertiserAdClicks / advertiserAdCost are
 * populated by the Google Ads ↔ GA4 link for Google campaigns and stay 0
 * for everything else — Meta spend comes from Meta's own API, not GA.
 * ───────────────────────────────────────────────────────────────────────── */

export type GaPaidRow = {
  source: string;
  medium: string;
  campaign: string;
  sessions: number;
  purchases: number;
  revenue: number;
  adClicks: number;
  adCost: number;
};

export async function fetchGaPaidTraffic(
  startDate: string,
  endDate: string,
): Promise<GaPaidRow[] | null> {
  if (!gaReportingConfigured()) return null;
  const rows = await runReport({
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      { name: "sessionSource" },
      { name: "sessionMedium" },
      { name: "sessionCampaignName" },
    ],
    metrics: [
      { name: "sessions" },
      { name: "ecommercePurchases" },
      { name: "purchaseRevenue" },
      { name: "advertiserAdClicks" },
      { name: "advertiserAdCost" },
    ],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: "250",
  });
  if (!rows) return null;
  return rows.map((r) => ({
    source: dim(r, 0) || "(unknown)",
    medium: dim(r, 1) || "",
    campaign: dim(r, 2) || "(not set)",
    sessions: num(r, 0),
    purchases: num(r, 1),
    revenue: num(r, 2),
    adClicks: num(r, 3),
    adCost: num(r, 4),
  }));
}

/** Google Ads campaign name → campaign type ("Search", "Performance Max",
 *  "Video", "Demand Gen" …) for the linked Ads account. A separate query so
 *  that a dimension GA refuses can cost the YouTube split, never the paid
 *  table itself. null when GA is unconfigured or the call failed. */
export async function fetchGaAdsCampaignTypes(
  startDate: string,
  endDate: string,
): Promise<Map<string, string> | null> {
  if (!gaReportingConfigured()) return null;
  const rows = await runReport({
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "sessionCampaignName" }, { name: "sessionGoogleAdsCampaignType" }],
    metrics: [{ name: "sessions" }, { name: "advertiserAdCost" }],
    limit: "250",
  });
  if (!rows) return null;
  const out = new Map<string, string>();
  for (const r of rows) {
    const type = dim(r, 1);
    if (type && type !== "(not set)") out.set(dim(r, 0), type);
  }
  return out;
}

/** Diagnose acquisition and buying intent together; missing reports stay null. */
export async function fetchGaConversionDiagnostics(days = 28) {
  const { diagnosticWindow, DIAGNOSTIC_EVENTS } = await import("./conversion-diagnostics");
  const window = diagnosticWindow(days);
  if (!gaReportingConfigured()) return { window, available: false as const, reason: "GA reporting is not configured" };
  const dateRanges = [{ startDate: window.from, endDate: window.to }];
  const limit = 250;
  const [landing, events] = await Promise.all([
    runReport({
      dateRanges,
      dimensions: ["landingPage", "sessionSourceMedium", "sessionCampaignName", "deviceCategory", "country"].map(name => ({ name })),
      metrics: ["sessions", "engagedSessions", "addToCarts", "checkouts", "ecommercePurchases"].map(name => ({ name })),
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: String(limit),
      // Only public buying paths. Private partner/token routes must not end
      // up in a committed snapshot, and are not retail acquisition traffic.
      dimensionFilter: { filter: { fieldName: "landingPage", stringFilter: {
        matchType: "FULL_REGEXP", value: "^(/|/(products|collections|concepts|projects)(/[^?]*)?)$",
      } } },
    }),
    runReport({
      dateRanges,
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
      dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: [...DIAGNOSTIC_EVENTS] } } },
      limit: "100",
    }),
  ]);
  return {
    window, available: landing !== null || events !== null,
    coverage: { landingAvailable: landing !== null, eventsAvailable: events !== null, landingMayBeTruncated: landing?.length === limit, landingLimit: limit },
    // These are activity counts, not an ordered, same-session funnel. In
    // particular addToCarts is a count of events, not unique cart visitors.
    landing: landing?.map(r => ({
      path: dim(r, 0), sourceMedium: dim(r, 1), campaign: dim(r, 2), device: dim(r, 3), country: dim(r, 4),
      sessions: num(r, 0), engagedSessions: num(r, 1), addToCarts: num(r, 2), checkouts: num(r, 3), purchases: num(r, 4),
    })) ?? null,
    events: events?.map(r => ({ event: dim(r, 0), count: num(r, 0), users: num(r, 1) })) ?? null,
    notes: ["GA reports can lag 48 hours. New diagnostic events have no historical backfill.", "Event/user counts are not an ordered funnel; do not sum users across events.", "Concept enquiries and sample purchases are distinct from full retail purchases."],
  };
}
