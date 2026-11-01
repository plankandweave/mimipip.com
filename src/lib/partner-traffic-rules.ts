/**
 * Partner traffic — how a visit from a partner's own people is labelled.
 *
 * WHY THIS EXISTS
 * HomeLane trained its designers on the portal on 30 September 2026, and the
 * daily report's "Sources the store saw" list could not see them: a designer
 * who types zyvorah.com/partners/homelane or opens a bookmark arrives as
 * "direct", and one who clicks through from an email arrives as whatever sent
 * the email. Their visits were real, and filed under the wrong name.
 *
 * A visit is a partner's when the browser holds a signed-in partner-portal
 * session (`zyv_corp`) for a partner member — not for our own staff, who sign
 * in to the same portals to work on the account. Such a visit is recorded with
 * the partner's slug as its source and `partner-portal` as its medium, so it
 * groups like any other source ("homelane / partner-portal"), and what the
 * referrer alone would have said is kept beside it as `via`.
 *
 * A partner's store employee opening a measurement link (/measure/<token>)
 * has no login, but the link names its account, so that visit is the
 * partner's too, under `partner-measure-link`. Across the board, for every
 * partner (Roheena, 1 October 2026): "when we say direct, we should know
 * which portals it is coming from".
 *
 * Pure: the route and the session code do the I/O.
 */

export const PARTNER_MEDIUM = "partner-portal";
/** A store employee opening a partner's measurement link (/measure/<token>).
 *  No login: the link itself says whose it is. */
export const PARTNER_LINK_MEDIUM = "partner-measure-link";
export const PARTNER_MEDIUMS: readonly string[] = [PARTNER_MEDIUM, PARTNER_LINK_MEDIUM];

export function isPartnerMedium(medium: string | null | undefined): boolean {
  return PARTNER_MEDIUMS.includes(String(medium ?? ""));
}

/** A partner as the report names it. Read from corporate_accounts, so a new
 *  partner is named the day its account exists, without a code change. */
export type PartnerAccount = { slug: string; name: string; active?: boolean };

export function partnerLabel(slug: string, accounts: PartnerAccount[] = []): string {
  return accounts.find((a) => a.slug === slug)?.name?.trim() || slug;
}

/** The measurement-link token in a landing path, or null. Shape-checked the
 *  same way measure-link.ts does (43 url-safe chars in practice, 40–64
 *  accepted), so a hostile path segment never becomes a query. */
export function measureTokenFromLanding(path: string | null | undefined): string | null {
  const m = /^\/measure\/([A-Za-z0-9_-]{40,64})\/?$/.exec(String(path ?? ""));
  return m ? m[1] : null;
}

/** The source and medium for a visit by this portal session, or null when the
 *  visit should keep its ordinary attribution (no session, or our own staff). */
export function partnerAttribution(
  session: { staff: boolean; account: { slug: string } } | null,
): { source: string; medium: string } | null {
  if (!session || session.staff || !session.account?.slug) return null;
  return { source: session.account.slug, medium: PARTNER_MEDIUM };
}

/** Re-label a recorded visit's meta as a partner's, keeping what it said before.
 *  Idempotent: an already-relabelled visit keeps its original `via`. */
export function relabelMeta(
  meta: Record<string, unknown> | null | undefined,
  source: string,
): Record<string, unknown> {
  const m = { ...(meta ?? {}) };
  if (!isPartnerMedium(String(m.medium ?? ""))) {
    m.via = `${String(m.source ?? "unknown")} / ${String(m.medium ?? "unknown")}`;
  }
  m.source = source;
  m.medium = PARTNER_MEDIUM;
  return m;
}

export type SourceRow = { source: string; medium: string; sessions: number; visitors: number };

/** The rows the daily report prints: the top `limit` sources, plus every
 *  partner-portal source even when it falls below the cut — a partner's
 *  designers are the thing being watched, and a quiet day must still show
 *  their line rather than drop it. */
export function reportSources(rows: SourceRow[], limit = 6): SourceRow[] {
  const top = rows.slice(0, limit);
  const partners = rows.slice(limit).filter((r) => isPartnerMedium(r.medium));
  return [...top, ...partners];
}

/** One recorded partner visit, as the brief reads it from site_events_human. */
export type PartnerVisit = {
  token: string | null;
  source: string;
  medium: string;
  /** What the referrer alone would have said, e.g. "direct / none". */
  via: string | null;
};

export type PartnerTrafficLine = {
  slug: string;
  name: string;
  sessions: number;
  visitors: number;
  portal: number;
  measureLinks: number;
  /** Of `sessions`, how many the referrer alone would have filed as direct. */
  wouldBeDirect: number;
};

export type PartnerTrafficSummary = {
  lines: PartnerTrafficLine[];
  sessions: number;
  wouldBeDirect: number;
  /** Active partners with no visits in the window, by name. */
  quiet: string[];
};

/** Per-partner sessions, visitors and how much of it would have read as
 *  direct — the answer to "when the report says direct, whose was it?". */
export function summarisePartnerTraffic(
  visits: PartnerVisit[],
  accounts: PartnerAccount[],
): PartnerTrafficSummary {
  const by = new Map<string, { sessions: number; tokens: Set<string>; portal: number; links: number; direct: number }>();
  for (const v of visits) {
    if (!isPartnerMedium(v.medium) || !v.source) continue;
    const e = by.get(v.source) ?? { sessions: 0, tokens: new Set<string>(), portal: 0, links: 0, direct: 0 };
    e.sessions++;
    if (v.token) e.tokens.add(v.token);
    if (v.medium === PARTNER_LINK_MEDIUM) e.links++;
    else e.portal++;
    if (String(v.via ?? "").startsWith("direct")) e.direct++;
    by.set(v.source, e);
  }
  const lines: PartnerTrafficLine[] = [...by.entries()]
    .map(([slug, e]) => ({
      slug,
      name: partnerLabel(slug, accounts),
      sessions: e.sessions,
      visitors: e.tokens.size,
      portal: e.portal,
      measureLinks: e.links,
      wouldBeDirect: e.direct,
    }))
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
  const seen = new Set(lines.map((l) => l.slug));
  const quiet = accounts
    .filter((a) => a.active !== false && !seen.has(a.slug))
    .map((a) => a.name?.trim() || a.slug)
    .sort((a, b) => a.localeCompare(b));
  return {
    lines,
    sessions: lines.reduce((n, l) => n + l.sessions, 0),
    wouldBeDirect: lines.reduce((n, l) => n + l.wouldBeDirect, 0),
    quiet,
  };
}
