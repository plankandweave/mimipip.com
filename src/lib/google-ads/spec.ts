// Google Ads: the account, and the rules that decide what the connection may
// touch — pure, so they are tested without a network (spec.test.ts). The I/O
// lives in api.ts.

/** Zyvorah's advertiser account (docs/google-ads.md). */
export const CUSTOMER_ID = "9059467956";
/** Zyvorah Manager, through which the developer token is approved. */
export const LOGIN_CUSTOMER_ID = "3379638954";

export const ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
export const APP_KEY = "google_ads_app"; // {"client_id","client_secret","developer_token"} in admin_config
export const REFRESH_KEY = "google_ads_refresh"; // {"refresh_token","connected_at","connected_by"}

/** Newest first. Google retires a version about a year after release, so the
 *  client walks down this list until one answers and remembers it; a version
 *  Google has not released yet simply answers 404 and is skipped. */
export const API_VERSIONS = ["v25", "v24", "v23", "v22", "v21"];

export function apiVersions(pinned = process.env.GOOGLE_ADS_API_VERSION): string[] {
  const p = pinned?.trim();
  return p && /^v\d+$/.test(p) ? [p, ...API_VERSIONS.filter((v) => v !== p)] : API_VERSIONS;
}

/** "905-946-7956" or "9059467956" → "9059467956"; anything else → null. */
export function customerId(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/-/g, "").trim();
  return /^\d{10}$/.test(digits) ? digits : null;
}

/** Google Ads money is in micros of the account currency (INR here). */
export const microsToInr = (micros: unknown): number => Math.round(Number(micros ?? 0) / 1e4) / 100;

export type CampaignRow = {
  id: string;
  name: string;
  status: "ENABLED" | "PAUSED" | "REMOVED" | string;
  channel: string; // SEARCH, PERFORMANCE_MAX, VIDEO, DEMAND_GEN, …
  dailyBudgetInr: number;
  cost7dInr: number;
  clicks7d: number;
  impressions7d: number;
};

/** One GAQL result row → a campaign. Exported for tests. */
export function toCampaign(r: any): CampaignRow { // eslint-disable-line @typescript-eslint/no-explicit-any -- GAQL rows are untyped JSON
  return {
    id: String(r?.campaign?.id ?? ""),
    name: String(r?.campaign?.name ?? ""),
    status: String(r?.campaign?.status ?? ""),
    channel: String(r?.campaign?.advertisingChannelType ?? ""),
    dailyBudgetInr: microsToInr(r?.campaignBudget?.amountMicros),
    cost7dInr: microsToInr(r?.metrics?.costMicros),
    clicks7d: Number(r?.metrics?.clicks ?? 0),
    impressions7d: Number(r?.metrics?.impressions ?? 0),
  };
}

/** Merge the full campaign list with last-7-day metrics (a campaign with no
 *  activity has no metrics row, and must still be listed). Exported for tests. */
export function mergeCampaigns(all: CampaignRow[], withMetrics: CampaignRow[]): CampaignRow[] {
  const m = new Map(withMetrics.map((c) => [c.id, c]));
  return all
    .filter((c) => c.status !== "REMOVED")
    .map((c) => {
      const x = m.get(c.id);
      return x ? { ...c, cost7dInr: x.cost7dInr, clicks7d: x.clicks7d, impressions7d: x.impressions7d } : c;
    })
    .sort((a, b) => (a.status === b.status ? b.cost7dInr - a.cost7dInr : a.status === "ENABLED" ? -1 : 1));
}

/** Which of the asked-for ids may be paused: only campaigns that exist in
 *  this account and are running. Anything else is named, not attempted. */
export function pausable(campaigns: CampaignRow[], ids: string[]): { pause: CampaignRow[]; refused: string[] } {
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const pause: CampaignRow[] = [];
  const refused: string[] = [];
  for (const id of new Set(ids)) {
    const c = byId.get(id);
    if (!c) refused.push(`${id}: not a campaign in this account`);
    else if (c.status !== "ENABLED") refused.push(`${c.name}: already ${c.status.toLowerCase()}`);
    else pause.push(c);
  }
  return { pause, refused };
}

/** The mutate body that pauses these campaigns — status only, nothing else. */
export function pauseOperations(cid: string, ids: string[]) {
  return {
    operations: ids.map((id) => ({
      update: { resourceName: `customers/${cid}/campaigns/${id}`, status: "PAUSED" },
      updateMask: "status",
    })),
  };
}

export function authorizationUrl(clientId: string, redirectUri: string, state: string): string {
  return (
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: ADS_SCOPE,
      // offline + consent: the only way Google returns a refresh token, and a
      // reconnect must return a fresh one rather than reuse a revoked grant.
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    }).toString()
  );
}
