import { serviceFetch } from "../../brand/service-transport";
const fetch: typeof globalThis.fetch = (input,init) => serviceFetch("publishing",input,init);
// The Google Ads API connection (REST). Founder, 8 Oct 2026: "build the
// Google Ads connection" — so the desk can see and pause campaigns without
// anyone opening the Ads UI.
//
// Three credentials, each from a Worker secret first and the desk's store
// (admin_config, service role only, never sent to a browser) second:
//   developer token  GOOGLE_ADS_DEVELOPER_TOKEN, or entered on the Ads tab.
//                    From API Center in the Zyvorah Manager account; Explorer
//                    access was approved on 22 Sep 2026.
//   OAuth client     GOOGLE_ADS_CLIENT_ID / _SECRET, or entered on the Ads tab,
//                    else the YouTube publisher's client (YT_CLIENT_ID/_SECRET).
//                    Its project must have the Google Ads API enabled and
//                    https://zyvorah.com/admin/google-ads/callback as a
//                    redirect URI.
//   refresh token    GOOGLE_ADS_REFRESH_TOKEN, or written by Connect Google Ads
//                    (/admin/google-ads/connect → callback).
//
// What the connection may do is deliberately small: read campaigns, and pause
// them. Pausing only ever reduces spend. Anything that starts spend belongs
// with the budget ledger, as the Meta launchers do, and is not here.

import { serviceClient, hasServiceRole } from "@/lib/marketing/db";
import {
  APP_KEY, CUSTOMER_ID, LOGIN_CUSTOMER_ID, REFRESH_KEY, apiVersions, mergeCampaigns, pausable, pauseOperations, toCampaign,
  type CampaignRow,
} from "./spec";

type Stored = { client_id?: string; client_secret?: string; developer_token?: string; refresh_token?: string; connected_at?: string; connected_by?: string };

async function stored(): Promise<{ app: Stored; refresh: Stored }> {
  if (!hasServiceRole()) return { app: {}, refresh: {} };
  try {
    const { data } = await serviceClient().from("admin_config").select("k, v").in("k", [APP_KEY, REFRESH_KEY]);
    const parse = (k: string): Stored => {
      const v = (data ?? []).find((r) => r.k === k)?.v;
      try {
        return v ? (JSON.parse(v as string) as Stored) : {};
      } catch {
        return {};
      }
    };
    return { app: parse(APP_KEY), refresh: parse(REFRESH_KEY) };
  } catch {
    return { app: {}, refresh: {} };
  }
}

export async function credentials() {
  const { app, refresh } = await stored();
  return {
    clientId: process.env.GOOGLE_ADS_CLIENT_ID || app.client_id || process.env.YT_CLIENT_ID,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET || app.client_secret || process.env.YT_CLIENT_SECRET,
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || app.developer_token,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN || refresh.refresh_token,
    connectedAt: refresh.connected_at ?? null,
    connectedBy: refresh.connected_by ?? null,
  };
}

/** Save app details entered on the desk; blank fields keep what is stored. */
export async function saveApp(patch: { clientId?: string; clientSecret?: string; developerToken?: string }): Promise<void> {
  const { app } = await stored();
  const next: Stored = {
    ...app,
    ...(patch.clientId ? { client_id: patch.clientId } : {}),
    ...(patch.clientSecret ? { client_secret: patch.clientSecret } : {}),
    ...(patch.developerToken ? { developer_token: patch.developerToken } : {}),
  };
  const { error } = await serviceClient().from("admin_config").upsert({ k: APP_KEY, v: JSON.stringify(next) }, { onConflict: "k" });
  if (error) throw new Error(`could not save: ${error.message}`);
}

export async function saveRefreshToken(refreshToken: string, by: string | null): Promise<void> {
  const v = JSON.stringify({ refresh_token: refreshToken, connected_at: new Date().toISOString(), connected_by: by ?? undefined });
  const { error } = await serviceClient().from("admin_config").upsert({ k: REFRESH_KEY, v }, { onConflict: "k" });
  if (error) throw new Error(`could not save the connection: ${error.message}`);
}

/** Exchange the code Google returned for tokens. */
export async function exchangeCode(code: string, redirectUri: string): Promise<{ refreshToken?: string }> {
  const c = await credentials();
  if (!c.clientId || !c.clientSecret) throw new Error("the Google OAuth client is not set");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const j = (await res.json().catch(() => ({}))) as { refresh_token?: string; error?: string; error_description?: string };
  if (!res.ok) throw new Error(`Google refused the sign-in: ${j.error_description ?? j.error ?? res.status}`);
  return { refreshToken: j.refresh_token };
}

async function accessToken(): Promise<string> {
  const c = await credentials();
  if (!c.clientId || !c.clientSecret || !c.refreshToken) throw new Error("Google Ads is not connected yet");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken, grant_type: "refresh_token" }),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !j.access_token) {
    throw new Error(j.error === "invalid_grant" ? "the Google sign-in has expired or was revoked — press Connect Google Ads again" : `Google token: ${j.error_description ?? j.error ?? res.status}`);
  }
  return j.access_token;
}

let version: string | null = null;

/** Call the API, finding a live version on the first call. */
async function call(path: string, body: unknown): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- API responses are untyped JSON
  const c = await credentials();
  if (!c.developerToken) throw new Error("the Google Ads developer token is not set");
  const token = await accessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    "developer-token": c.developerToken,
    "login-customer-id": LOGIN_CUSTOMER_ID,
    "Content-Type": "application/json",
  };
  const versions = version ? [version] : apiVersions();
  let last = "";
  for (const v of versions) {
    const res = await fetch(`https://googleads.googleapis.com/${v}/${path}`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
    if (res.status === 404 && !version) {
      last = `${v} not available`;
      continue;
    }
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Google Ads (${v}): ${adsError(j, res.status)}`);
    version = v;
    return j;
  }
  throw new Error(`no Google Ads API version answered (${last})`);
}

function adsError(j: any, status: number): string { // eslint-disable-line @typescript-eslint/no-explicit-any -- error bodies are untyped JSON
  const detail = j?.error?.details?.[0]?.errors?.[0]?.message;
  return detail || j?.error?.message || String(status);
}

async function search(query: string): Promise<any[]> { // eslint-disable-line @typescript-eslint/no-explicit-any -- GAQL rows are untyped JSON
  const rows: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any -- GAQL rows are untyped JSON
  let pageToken: string | undefined;
  do {
    const j = await call(`customers/${CUSTOMER_ID}/googleAds:search`, { query, ...(pageToken ? { pageToken } : {}) });
    rows.push(...(j?.results ?? []));
    pageToken = j?.nextPageToken || undefined;
  } while (pageToken && rows.length < 2000);
  return rows;
}

export async function listCampaigns(): Promise<CampaignRow[]> {
  const [all, last7] = await Promise.all([
    search("SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'"),
    search("SELECT campaign.id, metrics.cost_micros, metrics.clicks, metrics.impressions FROM campaign WHERE segments.date DURING LAST_7_DAYS AND campaign.status != 'REMOVED'"),
  ]);
  return mergeCampaigns(all.map(toCampaign), last7.map(toCampaign));
}

export type PauseOutcome = { paused: string[]; refused: string[] };

/** Pause these campaigns (status only). Refuses ids that are not running
 *  campaigns in this account rather than sending them. */
export async function pauseCampaigns(ids: string[]): Promise<PauseOutcome> {
  const { pause, refused } = pausable(await listCampaigns(), ids);
  if (!pause.length) return { paused: [], refused };
  await call(`customers/${CUSTOMER_ID}/campaigns:mutate`, pauseOperations(CUSTOMER_ID, pause.map((c) => c.id)));
  return { paused: pause.map((c) => c.name), refused };
}

export type Status = {
  pieces: { oauthClient: boolean; developerToken: boolean; signedIn: boolean };
  connectedAt: string | null;
  connectedBy: string | null;
  account: string;
  campaigns: CampaignRow[] | null;
  error: string | null;
};

export async function status(): Promise<Status> {
  const c = await credentials();
  const pieces = { oauthClient: !!(c.clientId && c.clientSecret), developerToken: !!c.developerToken, signedIn: !!c.refreshToken };
  let campaigns: CampaignRow[] | null = null;
  let error: string | null = null;
  if (pieces.oauthClient && pieces.developerToken && pieces.signedIn) {
    try {
      campaigns = await listCampaigns();
    } catch (e) {
      error = (e as Error).message;
    }
  }
  return { pieces, connectedAt: c.connectedAt, connectedBy: c.connectedBy, account: "905-946-7956", campaigns, error };
}
