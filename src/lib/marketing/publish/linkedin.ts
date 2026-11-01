import { brand } from "../../../brand/current";
import { publishingAvailable } from "../../../brand/publishing-transport";
import { publishingFetch as fetch } from "../../../brand/publishing-transport";
// LinkedIn publisher (organization page posts) via the LinkedIn Posts + Images
// APIs. Images: register an upload, PUT the bytes, then create a Post referencing
// the image URN. Text-only posts skip the image step.
//
// Credentials. Since 5 October 2026 the founder connects from the desk: the
// "Connect LinkedIn" button (src/app/admin/linkedin/connect) runs LinkedIn's
// sign-in in her browser and the callback stores the token, the refresh token
// and the page in admin_config (service role only), so nothing needs a laptop.
// Worker secrets of the same names still work and win when set — that is how
// `node scripts/linkedin-connect.mjs` connected before the move to the cloud:
//   LINKEDIN_ACCESS_TOKEN   — member token with w_organization_social
//   LINKEDIN_ORG_URN        — e.g. "urn:li:organization:12345678"
//   LINKEDIN_REFRESH_TOKEN  — optional, valid a year
//   LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET — the app, for refresh+introspect
//
// Until a token exists, `configured` is false and publish() queues.
//
// A LINKEDIN ACCESS TOKEN LASTS 60 DAYS, which is the whole reason the last
// four items are here. The failure this repo has already lived through — see
// lib/elevated-key.ts — is a credential going stale and every job answering
// 401 in silence for eleven days. So: the token is introspected rather than
// assumed, refreshed before it lapses, and the renewed one is kept in
// admin_config (a Worker cannot rewrite its own secrets), which is read in
// preference to the secret. The expiry date is surfaced on the desk, so a
// connection that is about to die says so while there is still time.

import type { Publisher, PublishRequest, PublishResult, PublishHealth } from "./types";
import { queuedResult } from "./types";
import { serviceClient, hasServiceRole } from "../db";

const API = "https://api.linkedin.com/rest";
const OAUTH = "https://www.linkedin.com/oauth/v2";
/** Renew this long before expiry, so a lapse needs a fortnight of failures. */
const RENEW_WITHIN_MS = 14 * 24 * 3600_000;
/** Where a refreshed token lives, since the Worker's own secret is read-only. */
const CONFIG_KEY = "linkedin_access_token";
/** The rest of a connection made from the desk (admin_config, service role only). */
export const LINKEDIN_APP_KEY = "linkedin_app"; // {"client_id","client_secret"}
export const LINKEDIN_REFRESH_KEY = "linkedin_refresh_token"; // {"refresh_token","expires_at"}
export const LINKEDIN_ORG_KEY = "linkedin_org_urn"; // "urn:li:organization:…"
export { CONFIG_KEY as LINKEDIN_TOKEN_KEY };

/** What the desk connection stored, read by loadConnection(). Undefined until
 *  then, so a caller that never loads it sees exactly the old, env-only view. */
type StoredConnection = { org?: string; refreshToken?: string; clientId?: string; clientSecret?: string; hasToken?: boolean };
let stored: StoredConnection | undefined;

/** Read the desk connection from admin_config. Never throws. */
export async function loadConnection(): Promise<void> {
  if (!hasServiceRole()) return;
  try {
    const { data } = await serviceClient()
      .from("admin_config")
      .select("k, v")
      .in("k", [CONFIG_KEY, LINKEDIN_APP_KEY, LINKEDIN_REFRESH_KEY, LINKEDIN_ORG_KEY]);
    const row = (k: string) => (data ?? []).find((r) => r.k === k)?.v as string | undefined;
    const json = <T,>(k: string): T | undefined => {
      try {
        const v = row(k);
        return v ? (JSON.parse(v) as T) : undefined;
      } catch {
        return undefined;
      }
    };
    const appRow = json<{ client_id?: string; client_secret?: string }>(LINKEDIN_APP_KEY);
    stored = {
      org: row(LINKEDIN_ORG_KEY) || undefined,
      refreshToken: json<{ refresh_token?: string }>(LINKEDIN_REFRESH_KEY)?.refresh_token,
      clientId: appRow?.client_id,
      clientSecret: appRow?.client_secret,
      hasToken: !!json<Stored>(CONFIG_KEY)?.access_token,
    };
  } catch {
    /* an unreadable store leaves the env-only view */
  }
}

/** For tests: forget the stored connection. */
export function resetConnection() {
  stored = undefined;
}

function app() {
  const s = stored ?? {};
  return {
    org: process.env.LINKEDIN_ORG_URN || s.org,
    envToken: process.env.LINKEDIN_ACCESS_TOKEN,
    storedToken: !!s.hasToken,
    refreshToken: process.env.LINKEDIN_REFRESH_TOKEN || s.refreshToken,
    clientId: process.env.LINKEDIN_CLIENT_ID || s.clientId,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET || s.clientSecret,
  };
}

/** The app credentials, env first then the desk's store — for the connect flow. */
export async function linkedInApp(): Promise<{ clientId?: string; clientSecret?: string }> {
  await loadConnection();
  const { clientId, clientSecret } = app();
  return { clientId, clientSecret };
}

type Stored = { access_token: string; expires_at: number };

async function readStored(): Promise<Stored | null> {
  if (!hasServiceRole()) return null;
  try {
    const { data } = await serviceClient().from("admin_config").select("v").eq("k", CONFIG_KEY).maybeSingle();
    if (!data?.v) return null;
    const parsed = JSON.parse(data.v as string) as Stored;
    return parsed?.access_token ? parsed : null;
  } catch {
    return null;
  }
}

async function writeStored(s: Stored): Promise<void> {
  if (!hasServiceRole()) return;
  try {
    await serviceClient().from("admin_config").upsert({ k: CONFIG_KEY, v: JSON.stringify(s) }, { onConflict: "k" });
  } catch {
    /* a token we cannot persist still works for this request */
  }
}

/**
 * Has LinkedIn approved this app to post as a page yet?
 *
 * Asked at the authorisation endpoint, which rejects an unapproved scope
 * without anyone signing in. It matters because "no token" has two completely
 * different causes with two different owners: nobody has connected yet (ours,
 * a click), or LinkedIn has not granted the Community Management API (theirs,
 * a review queue). A single red dot for both is how a wait gets mistaken for a
 * broken thing, and vice versa.
 */
async function postingScopeApproved(clientId: string): Promise<boolean | null> {
  try {
    const url =
      `${OAUTH}/authorization?` +
      new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: `${brand.origin}/admin/linkedin/callback`,
        state: "probe",
        scope: "w_organization_social",
      });
    const body = await (await fetch(url)).text();
    if (/not authorized for your application|unauthorized_scope|invalid.{0,20}scope/i.test(body)) return false;
    if (/redirect_uri/i.test(body) && /does not match|not registered/i.test(body)) return null;
    return true;
  } catch {
    return null;
  }
}

/** Ask LinkedIn what a token actually is: active, which scopes, expiring when.
 *  Needs the app credentials; without them we cannot know and say so. */
export async function introspect(
  token: string,
): Promise<{ known: boolean; active?: boolean; scopes?: string[]; expiresAt?: number; detail?: string }> {
  const { clientId, clientSecret } = app();
  if (!clientId || !clientSecret) return { known: false, detail: "app credentials not set, so expiry is unverified" };
  try {
    const res = await fetch(`${OAUTH}/introspectToken`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, token }),
    });
    const j = (await res.json().catch(() => ({}))) as { active?: boolean; status?: string; scope?: string; expires_at?: number };
    if (!res.ok) return { known: false, detail: `introspection failed (${res.status})` };
    return {
      known: true,
      active: j.active !== false && j.status !== "revoked" && j.status !== "expired",
      scopes: (j.scope ?? "").split(/[, ]+/).filter(Boolean),
      expiresAt: j.expires_at ? j.expires_at * 1000 : undefined,
    };
  } catch (e) {
    return { known: false, detail: (e as Error).message };
  }
}

async function refresh(): Promise<Stored | null> {
  const { refreshToken, clientId, clientSecret } = app();
  if (!refreshToken || !clientId || !clientSecret) return null;
  const res = await fetch(`${OAUTH}/accessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) return null;
  const j = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
  };
  if (!j.access_token) return null;
  const fresh: Stored = { access_token: j.access_token, expires_at: Date.now() + (j.expires_in ?? 5_184_000) * 1000 };
  await writeStored(fresh);
  // LinkedIn may hand back a new refresh token; keep it, or the old one's
  // year runs out underneath a connection that looks alive.
  if (j.refresh_token && hasServiceRole()) {
    await serviceClient()
      .from("admin_config")
      .upsert(
        { k: LINKEDIN_REFRESH_KEY, v: JSON.stringify({ refresh_token: j.refresh_token, expires_at: Date.now() + (j.refresh_token_expires_in ?? 31_536_000) * 1000 }) },
        { onConflict: "k" },
      )
      .then(() => {}, () => {});
  }
  return fresh;
}

/**
 * The token to use right now: the stored (renewed) one while it is comfortably
 * alive, otherwise a refresh, otherwise the Worker secret as it was set. Never
 * throws — a caller with no token queues rather than crashing the run.
 */
export async function resolveToken(): Promise<string | undefined> {
  await loadConnection();
  const stored = await readStored();
  if (stored && stored.expires_at - Date.now() > RENEW_WITHIN_MS) return stored.access_token;
  const renewed = await refresh();
  if (renewed) return renewed.access_token;
  return stored?.access_token ?? app().envToken;
}

/**
 * The LinkedIn-Version values worth trying, best first.
 *
 * THIS IS WHY NOTHING POSTED. The version was pinned to "202410", and LinkedIn
 * retires each monthly version about a year after release — 202410 went on
 * 15 October 2025. A retired version is refused with 426 before the request is
 * even read, so every call (the page read behind "connected", the image upload,
 * the post itself) failed, and an approved post never went out.
 *
 * So no single month is pinned any more. An explicit LINKEDIN_API_VERSION is
 * tried first; then last month back through the eleven before it. The current
 * month is skipped because LinkedIn publishes a month's version partway
 * through it, and anything older than a year is retired by policy.
 */
export function candidateVersions(now = new Date(), pinned = process.env.LINKEDIN_API_VERSION): string[] {
  const out: string[] = [];
  if (pinned && /^\d{6}$/.test(pinned)) out.push(pinned);
  for (let back = 1; back <= 12; back++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const v = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/** The version LinkedIn last accepted, kept for the life of the isolate. */
let liveVersion: string | undefined;

/** For tests: forget the version learned so far. */
export function resetLinkedInVersion() {
  liveVersion = undefined;
}

/**
 * fetch() against the versioned REST API. A 426 means "that version is not
 * active" and is decided before the request is acted on, so trying the next
 * version is safe even for the POST that creates a post — nothing was made.
 */
async function rest(url: string, token: string, init: { method?: string; body?: string } = {}): Promise<Response> {
  const versions = candidateVersions();
  if (liveVersion) versions.unshift(liveVersion);
  let last: Response | undefined;
  for (const v of [...new Set(versions)]) {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": v,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });
    if (res.status !== 426) {
      liveVersion = v;
      return res;
    }
    last = res;
  }
  return last!;
}

/** Register + upload one image, returning its image URN. */
async function uploadImage(imageUrl: string, token: string, org: string): Promise<string> {
  const init = await rest(`${API}/images?action=initializeUpload`, token, {
    method: "POST",
    body: JSON.stringify({ initializeUploadRequest: { owner: org } }),
  });
  const initJson = await init.json();
  if (!init.ok) throw new Error(`LI init upload: ${initJson?.message || init.status}`);
  const { uploadUrl, image } = initJson.value;

  const bytes = Buffer.from(await (await fetch(imageUrl)).arrayBuffer());
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: bytes,
  });
  if (!put.ok) throw new Error(`LI upload bytes: ${put.status}`);
  return image; // urn:li:image:...
}

export class LinkedInPublisher implements Publisher {
  readonly channel = "linkedin" as const;

  get configured(): boolean {
    if (!publishingAvailable()) return false;
    const { org, envToken, storedToken, refreshToken, clientId, clientSecret } = app();
    // A refresh token plus the app is as good as a token: resolveToken() will
    // mint a live one. Either way the page URN is required — without it there
    // is nothing to post AS.
    return !!org && (!!envToken || storedToken || (!!refreshToken && !!clientId && !!clientSecret));
  }

  /** `configured`, after reading what the desk's Connect button stored. */
  async ready(): Promise<boolean> {
    await loadConnection();
    return this.configured;
  }

  /**
   * Is the connection real? "LinkedIn was connected" has been said of this
   * system while the Worker held no LinkedIn secret at all — so the desk asks
   * LinkedIn, not the environment. Introspects the token (status, scopes,
   * expiry) and reads the organisation it claims to post for. Never posts.
   */
  async health(): Promise<PublishHealth> {
    const token = await resolveToken();
    const { org } = app();
    if (!token || !org) {
      // Before reporting a missing token, find out whose move it is.
      const { clientId } = app();
      if (clientId) {
        const approved = await postingScopeApproved(clientId);
        if (approved === false) {
          return {
            configured: false,
            ok: false,
            detail:
              "waiting on LinkedIn — the app is requested for the Community Management API and the review is still in progress. That approval is what grants permission to post as the page; LinkedIn emails the decision. Nothing to do here until it lands.",
          };
        }
        if (approved === true) {
          return {
            configured: false,
            ok: false,
            detail:
              "LinkedIn has approved posting for this app — the connection just needs finishing: press Connect LinkedIn on the desk's LinkedIn tab and sign in once; the token, refresh token and page are stored automatically.",
          };
        }
      }
      const missing = [!token && "a sign-in", !org && "the company page"]
        .filter(Boolean)
        .join(" and ");
      return {
        configured: false,
        ok: false,
        detail: `not connected yet (missing ${missing}). Press Connect LinkedIn on the desk's LinkedIn tab and sign in once.`,
      };
    }

    // The 60-day clock is the thing that will break this quietly, so ask about
    // it first and report the date even when everything is fine.
    const t = await introspect(token);
    const expiresOn = t.expiresAt ? new Date(t.expiresAt).toISOString().slice(0, 10) : undefined;
    if (t.known && t.active === false) {
      return {
        configured: true,
        ok: false,
        expiresOn,
        detail: `the token is no longer valid${expiresOn ? ` (expired ${expiresOn})` : ""} — press Connect LinkedIn on the desk to sign in again`,
      };
    }
    if (t.known && t.scopes?.length && !t.scopes.includes("w_organization_social")) {
      return {
        configured: true,
        ok: false,
        expiresOn,
        detail: "the token is valid but lacks w_organization_social, so an approved post would be refused — the app needs the Community Management API product",
      };
    }

    const id = org.split(":").pop() ?? "";
    try {
      const res = await rest(`${API}/organizations/${id}`, token);
      if (res.ok) {
        const j = (await res.json().catch(() => ({}))) as { localizedName?: string };
        const exp = expiresOn ? `, token expires ${expiresOn}` : t.detail ? ` (${t.detail})` : "";
        return { configured: true, ok: true, expiresOn, detail: `connected to ${j.localizedName ?? org}${exp}` };
      }
      const j = (await res.json().catch(() => ({}))) as { message?: string };
      return {
        configured: true,
        ok: false,
        expiresOn,
        detail: `token set but LinkedIn refused (${res.status}${j.message ? `: ${j.message}` : ""}) — press Connect LinkedIn on the desk to sign in again`,
      };
    } catch (e) {
      return { configured: true, ok: false, expiresOn, detail: (e as Error).message };
    }
  }

  /**
   * How a post did: impressions, clicks, reactions, comments, reposts and
   * LinkedIn's own engagement rate. Needs the Community Management API — the
   * same approval that allows posting — and is best-effort: the caller skips a
   * post that fails rather than stopping the run.
   */
  async fetchMetrics(externalId: string): Promise<Record<string, number>> {
    const { org } = app();
    const token = await resolveToken();
    if (!token || !org) return {};
    const kind = externalId.includes(":ugcPost:") ? "ugcPosts" : "shares";
    const url =
      `${API}/organizationalEntityShareStatistics?q=organizationalEntity` +
      `&organizationalEntity=${encodeURIComponent(org)}&${kind}=List(${encodeURIComponent(externalId)})`;
    const res = await rest(url, token);
    if (!res.ok) throw new Error(`LI stats: ${res.status}`);
    const j = (await res.json()) as { elements?: { totalShareStatistics?: Record<string, number> }[] };
    const t = j.elements?.[0]?.totalShareStatistics ?? {};
    const out: Record<string, number> = {};
    const pick: [string, string][] = [
      ["impressionCount", "impressions"],
      ["uniqueImpressionsCount", "reach"],
      ["clickCount", "clicks"],
      ["likeCount", "reactions"],
      ["commentCount", "comments"],
      ["shareCount", "reposts"],
      ["engagement", "engagement_rate"],
    ];
    for (const [from, to] of pick) if (typeof t[from] === "number") out[to] = t[from];
    return out;
  }

  /** The page's follower count right now, or null when it cannot be read. */
  async followers(): Promise<number | null> {
    const { org } = app();
    const token = await resolveToken();
    if (!token || !org) return null;
    try {
      const res = await rest(`${API}/networkSizes/${encodeURIComponent(org)}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`, token);
      if (!res.ok) return null;
      const j = (await res.json()) as { firstDegreeSize?: number };
      return typeof j.firstDegreeSize === "number" ? j.firstDegreeSize : null;
    } catch {
      return null;
    }
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    if (!(await this.ready())) return queuedResult("linkedin");
    const { org } = app();
    const token = await resolveToken();
    if (!token || !org) return queuedResult("linkedin");
    try {
      // LinkedIn feed posts use the first image (single-image performs best on
      // pages); carousels/video use different flows we can add later.
      const post: Record<string, unknown> = {
        author: org,
        commentary: req.caption,
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: "PUBLISHED",
      };

      if (req.mediaUrls.length && req.kind !== "reel") {
        const imageUrn = await uploadImage(req.mediaUrls[0], token, org);
        post.content = { media: { id: imageUrn, title: req.title || brand.name } };
      }

      const res = await rest(`${API}/posts`, token, {
        method: "POST",
        body: JSON.stringify(post),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(`LI post: ${j?.message || res.status}`);
      }
      const id = res.headers.get("x-restli-id") || undefined;
      return { ok: true, externalId: id, url: id ? `https://www.linkedin.com/feed/update/${id}` : undefined };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}
