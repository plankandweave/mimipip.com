/**
 * Google Search Console — the words people actually typed.
 *
 * WHY THIS EXISTS
 * The morning brief could report how much organic traffic arrived and where it
 * landed, and had to say plainly that the queries were unknown: Analytics knows
 * a visit came from search, never what was searched for. That is the difference
 * between a volume and a conversation. Search Console is the only source of the
 * query, and as of 25 September 2026 the Analytics service account has been
 * given access to the zyvorah.com property.
 *
 * WHAT THE NUMBERS MEAN, because three of the four are easy to misread:
 *   impressions  how often a page of ours appeared in results at all
 *   clicks       how often someone chose it
 *   ctr          clicks ÷ impressions, i.e. how compelling the listing was
 *   position     average rank, where LOWER IS BETTER and 1.0 is the top result
 *
 * A query with many impressions and few clicks is a listing problem: Google is
 * already showing us and people are not choosing us. A query with a good rank
 * and few impressions is simply a rare search. The two call for opposite work,
 * which is why the brief prints impressions beside clicks rather than clicks
 * alone.
 *
 * THE 2-3 DAY LAG is real and not a bug. Search Console finalises data slowly,
 * so "yesterday" is usually empty and a 7-day window ending 3 days ago is the
 * freshest honest read. Asking for a window ending yesterday returns a
 * truthful-looking set of numbers that are simply incomplete, so this module
 * does not offer that as an option.
 *
 * Env: GA_SA_CLIENT_EMAIL, GA_SA_PRIVATE_KEY (shared with Analytics), and
 * optionally SEARCH_CONSOLE_SITE to pin the property. Without it the property
 * is DISCOVERED by asking Search Console which sites this service account can
 * read, which avoids the commonest failure in this integration: guessing
 * "https://zyvorah.com/" when the property is registered as the domain
 * "sc-domain:zyvorah.com", and getting a 403 that reads exactly like a missing
 * permission.
 */

import { googleAccessToken, SCOPE_SEARCH_CONSOLE, serviceAccountConfigured } from "@/lib/google-auth";

const API = "https://searchconsole.googleapis.com/webmasters/v3";

/** Search Console is 2-3 days behind. Ending the window here keeps every figure
 *  final; ending it yesterday silently reports a partial day as a real one. */
const SETTLE_DAYS = 3;

export type SearchRow = {
  key: string;
  clicks: number;
  impressions: number;
  /** 0-1. */
  ctr: number;
  /** Average rank. LOWER IS BETTER. */
  position: number;
};

export type SearchConsoleWindow = {
  site: string;
  from: string;
  to: string;
  days: number;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  queries: SearchRow[];
  pages: SearchRow[];
};

export function searchConsoleConfigured(): boolean {
  return serviceAccountConfigured();
}

/**
 * Why Search Console is not answering, in enough detail to fix it.
 *
 * "No readable property" has at least four causes and they need four different
 * actions — the API not enabled on the Cloud project, the grant given to a
 * different email, the property registered in a form we are not asking for, or
 * an unverified-user listing that cannot read data. Reporting the bare fact
 * sends whoever reads it to the wrong console, so this reports the identity
 * that asked, whether a token was minted, and exactly what Google said.
 *
 * Safe to show on a staff-gated page: the service-account EMAIL is an
 * identifier, and it is precisely the string that has to be pasted into Search
 * Console's user list. The private key is never read here and never returned.
 */
export type SearchConsoleDiagnosis = {
  serviceAccount: string | null;
  tokenMinted: boolean;
  sitesStatus: number | null;
  sitesError: string | null;
  sites: { siteUrl: string; permissionLevel: string }[];
  pinned: string | null;
  likelyCause: string | null;
};

export async function diagnose(): Promise<SearchConsoleDiagnosis> {
  const out: SearchConsoleDiagnosis = {
    serviceAccount: process.env.GA_SA_CLIENT_EMAIL ?? null,
    tokenMinted: false,
    sitesStatus: null,
    sitesError: null,
    sites: [],
    pinned: process.env.SEARCH_CONSOLE_SITE ?? null,
    likelyCause: null,
  };
  if (!serviceAccountConfigured()) {
    out.likelyCause = "No service-account credentials are configured on this deployment.";
    return out;
  }

  const token = await googleAccessToken(SCOPE_SEARCH_CONSOLE);
  out.tokenMinted = Boolean(token);
  if (!token) {
    out.likelyCause =
      "Google refused to issue a token for the Search Console scope. The same key works for Analytics, so this is usually the Search Console API not being enabled on the service account's Google Cloud project.";
    return out;
  }

  try {
    const res = await fetch(`${API}/sites`, { headers: { Authorization: `Bearer ${token}` } });
    out.sitesStatus = res.status;
    const body = await res.text();
    if (!res.ok) {
      // Google's own error body names the API when it is disabled, and says
      // "insufficient permission" when it is a grant problem. Both are safe to
      // show, and both are the actual answer.
      out.sitesError = body.slice(0, 600);
      out.likelyCause =
        res.status === 403 && /accessNotConfigured|has not been used|is disabled/i.test(body)
          ? "The Search Console API is not enabled on the service account's Google Cloud project. Enable it there and this will work with no further grant."
          : res.status === 403
            ? "Google accepted the identity but refused the call. Check that this exact service-account address is a user on the Search Console property."
            : `Search Console answered ${res.status}.`;
      return out;
    }
    const json = JSON.parse(body) as { siteEntry?: { siteUrl?: string; permissionLevel?: string }[] };
    out.sites = (json.siteEntry ?? []).map((e) => ({
      siteUrl: String(e.siteUrl ?? ""),
      permissionLevel: String(e.permissionLevel ?? ""),
    }));

    if (!out.sites.length) {
      out.likelyCause =
        "Search Console answered and this account can see no properties at all. The access was very likely granted to a different address than the one shown here — add THIS one as a user on the zyvorah.com property.";
    } else if (!out.sites.some((s) => s.siteUrl.includes("zyvorah.com"))) {
      out.likelyCause =
        "This account can read properties, but none of them is zyvorah.com. Add it as a user on the zyvorah.com property.";
    } else if (out.sites.every((s) => s.permissionLevel === "siteUnverifiedUser")) {
      out.likelyCause =
        "The account is listed on the property but only as an unverified user, which cannot read data. Give it at least Restricted access.";
    }
    return out;
  } catch (e) {
    out.sitesError = e instanceof Error ? e.message : "unknown error";
    out.likelyCause = "The call to Search Console threw before it answered.";
    return out;
  }
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The settled window: `days` long, ending SETTLE_DAYS before today. */
export function settledWindow(days: number, now: Date = new Date()): { from: string; to: string } {
  const to = new Date(now.getTime() - SETTLE_DAYS * 86_400_000);
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  return { from: dayKey(from), to: dayKey(to) };
}

/** Which property to read. Pinned by env, else discovered.
 *
 *  ONLY SUCCESS IS CACHED. Caching a failure would mean that the moment someone
 *  fixes the Google side — enabling the API, adding the grant — a warm isolate
 *  goes on insisting there is no property, and whoever just made the change
 *  checks, sees the same error, and concludes it did not work. Making a correct
 *  fix look like a failed one is how an integration like this gets abandoned
 *  one step from working.
 *
 *  A failure therefore costs one extra call on the next request, which is the
 *  right price: the failing path is rare, and by definition nobody is being
 *  served useful data while it lasts. */
let cachedSite: string | undefined;

export async function resolveSite(): Promise<string | null> {
  if (cachedSite !== undefined) return cachedSite;

  const pinned = process.env.SEARCH_CONSOLE_SITE;
  if (pinned) {
    cachedSite = pinned;
    return pinned;
  }

  const token = await googleAccessToken(SCOPE_SEARCH_CONSOLE);
  if (!token) return null;
  try {
    const res = await fetch(`${API}/sites`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      console.error("[search-console] site list failed:", res.status);
      return null;
    }
    const json = (await res.json()) as {
      siteEntry?: { siteUrl?: string; permissionLevel?: string }[];
    };
    const entries = (json.siteEntry ?? []).filter(
      (e) => e.siteUrl && e.permissionLevel && e.permissionLevel !== "siteUnverifiedUser",
    );
    // Prefer a domain property: it covers every subdomain and both schemes, so
    // it cannot miss traffic a URL-prefix property would.
    const zyvorah = entries.filter((e) => String(e.siteUrl).includes("zyvorah.com"));
    const pick =
      zyvorah.find((e) => String(e.siteUrl).startsWith("sc-domain:"))?.siteUrl ??
      zyvorah[0]?.siteUrl ??
      null;
    if (!pick) {
      console.error("[search-console] no readable zyvorah.com property in the site list");
      return null;
    }
    cachedSite = pick;
    return pick;
  } catch (e) {
    console.error("[search-console] site list error:", e);
    return null;
  }
}

async function query(
  site: string,
  token: string,
  body: Record<string, unknown>,
): Promise<SearchRow[] | null> {
  const res = await fetch(`${API}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("[search-console] query failed:", res.status);
    return null;
  }
  const json = (await res.json()) as {
    rows?: { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }[];
  };
  return (json.rows ?? []).map((r) => ({
    key: r.keys?.[0] ?? "",
    clicks: Number(r.clicks ?? 0),
    impressions: Number(r.impressions ?? 0),
    ctr: Number(r.ctr ?? 0),
    position: Number(r.position ?? 0),
  }));
}

/**
 * The settled search window: totals, the top queries, and the top pages.
 *
 * Returns null when Search Console cannot be read at all — no credentials, no
 * readable property, or the API refused. Callers must present that as "not
 * read" and never as zero: a real zero would mean nobody found us on Google,
 * which is a very different and much more alarming thing to tell a founder.
 */
export async function fetchSearchWindow(days = 7, limit = 10): Promise<SearchConsoleWindow | null> {
  if (!searchConsoleConfigured()) return null;
  const [token, site] = await Promise.all([
    googleAccessToken(SCOPE_SEARCH_CONSOLE),
    resolveSite(),
  ]);
  if (!token || !site) return null;

  const { from, to } = settledWindow(days);
  const base = { startDate: from, endDate: to, type: "web" as const };

  try {
    const [totals, queries, pages] = await Promise.all([
      query(site, token, base),
      query(site, token, { ...base, dimensions: ["query"], rowLimit: limit }),
      query(site, token, { ...base, dimensions: ["page"], rowLimit: limit }),
    ]);
    if (!totals) return null;

    const t = totals[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0, key: "" };
    return {
      site,
      from,
      to,
      days,
      clicks: t.clicks,
      impressions: t.impressions,
      ctr: t.ctr,
      position: t.position,
      queries: queries ?? [],
      pages: pages ?? [],
    };
  } catch (e) {
    console.error("[search-console] window error:", e);
    return null;
  }
}
