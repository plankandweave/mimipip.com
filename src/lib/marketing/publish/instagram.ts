import { publishingAvailable } from "../../../brand/publishing-transport";
import { publishingFetch as fetch } from "../../../brand/publishing-transport";
// Instagram publisher via the Instagram Graph API (Content Publishing).
//
// Flow for a single image/reel: create a media container, then publish it.
// Carousels: create a child container per slide, then a parent carousel
// container referencing the children, then publish the parent. Reels: a video
// container with media_type=REELS, poll until the container is FINISHED, then
// publish.
//
// Credentials are Cloudflare Worker secrets on the zyvorah.com Worker (the app
// moved off Vercel to Cloudflare Workers on 5 Sep 2026 — see deploy.yml). They
// resolve through lib/meta-env.ts, so ONE Meta system-user token can serve both
// the ads integration and organic publishing:
//   IG account:  IG_BUSINESS_ACCOUNT_ID, else META_IG_ACCOUNT_ID (same account)
//   token:       IG_ACCESS_TOKEN, else the ads token (META_ADS_TOKEN /
//                META_SYSTEM_USER_TOKEN) — which works for organic when that
//                system user also holds instagram_content_publish
//   IG_GRAPH_VERSION / META_GRAPH_VERSION — optional, defaults to a known-good version
//
// Until a token resolves, `configured` is false and publish() returns
// queuedResult(). The code path is complete and testable the day it arrives; a
// token that resolves but lacks the publish permission fails with the Graph
// API's own message on the row, not silently.

import type { Publisher, PublishRequest, PublishResult, PublishHealth } from "./types";
import { queuedResult } from "./types";
import { metaIgAccountId, metaPublishToken } from "@/lib/meta-env";

const GRAPH = () =>
  `https://graph.facebook.com/${process.env.IG_GRAPH_VERSION || process.env.META_GRAPH_VERSION || "v21.0"}`;

function creds() {
  return {
    igId: metaIgAccountId(),
    token: metaPublishToken(),
  };
}

/** A Meta unix-seconds timestamp as YYYY-MM-DD, or undefined for "never" (0). */
function isoDay(unixSeconds: unknown): string | undefined {
  const n = Number(unixSeconds);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return new Date(n * 1000).toISOString().slice(0, 10);
}

/**
 * Instagram's collaborator invite. Usernames only, no leading "@", and the
 * field is simply absent when there is nobody to invite — sending an empty
 * array is rejected. A Story takes no collaborators, so this returns nothing
 * for one; the caption's mention carries it there instead.
 */
function collabFields(req: PublishRequest): Record<string, string> {
  const names = (req.collaborators ?? [])
    .map((n) => n.trim().replace(/^@/, ""))
    .filter(Boolean);
  return names.length ? { collaborators: JSON.stringify(names) } : {};
}

async function graphPost(path: string, params: Record<string, string>): Promise<any> {
  const { token } = creds();
  const body = new URLSearchParams({ ...params, access_token: token! });
  const res = await fetch(`${GRAPH()}/${path}`, { method: "POST", body });
  const json = await res.json();
  if (!res.ok) throw new Error(`IG ${path}: ${json?.error?.message || res.status}`);
  return json;
}

async function graphGet(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<any> {
  const { token } = creds();
  const qs = new URLSearchParams({ ...params, access_token: token! });
  const res = await fetch(`${GRAPH()}/${path}?${qs}`, { signal });
  const json = await res.json();
  if (!res.ok) throw new Error(`IG ${path}: ${json?.error?.message || res.status}`);
  return json;
}

/** Poll a container until it's FINISHED (reels/videos need processing time). */
async function waitForContainer(containerId: string, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { status_code } = await graphGet(containerId, { fields: "status_code" });
    if (status_code === "FINISHED") return;
    if (status_code === "ERROR") throw new Error(`IG container ${containerId} processing ERROR`);
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error(`IG container ${containerId} not ready within timeout`);
}

/** What Instagram actually carries — the evidence the publish reconciler
 *  checks an interrupted claim against. Feed and reels come from /media (the
 *  latest 50); Stories from /stories, which only holds the last 24 hours. */
export type LiveMedia = {
  id: string;
  caption: string | null;
  timestamp: string;
  media_type: string;
  media_product_type: string | null;
  permalink: string | null;
};

export async function recentInstagramMedia(edge: "media" | "stories"): Promise<LiveMedia[]> {
  const { igId, token } = creds();
  if (!igId || !token) throw new Error("Instagram is not connected");
  const json = await graphGet(`${igId}/${edge}`, {
    fields: "id,caption,timestamp,media_type,media_product_type,permalink",
    limit: "50",
  });
  return (Array.isArray(json?.data) ? json.data : []).map((m: Record<string, unknown>) => ({
    id: String(m.id),
    caption: typeof m.caption === "string" ? m.caption : null,
    timestamp: String(m.timestamp),
    media_type: String(m.media_type ?? ""),
    media_product_type: typeof m.media_product_type === "string" ? m.media_product_type : null,
    permalink: typeof m.permalink === "string" ? m.permalink : null,
  }));
}

/** Meta's media ID is not Instagram's URL shortcode. Read the actual link;
 *  never manufacture a /p/{numeric ID} URL. Stories may have no permalink. */
export async function instagramPermalink(externalId: string): Promise<string | null> {
  if (!/^\d+$/.test(externalId)) return null;
  const media = await graphGet(externalId, { fields: "permalink" }, AbortSignal.timeout(10_000));
  const link = media?.permalink;
  if (typeof link !== "string") return null;
  try {
    const url = new URL(link);
    return url.protocol === "https:" && ["instagram.com", "www.instagram.com"].includes(url.hostname)
      && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export class InstagramPublisher implements Publisher {
  readonly channel = "instagram" as const;

  get configured(): boolean {
    if (!publishingAvailable()) return false;
    const { igId, token } = creds();
    return !!igId && !!token;
  }

  /**
   * Ask Meta whether the credentials actually work — the difference between "a
   * token is set" and "a post will go out". Reads only; never posts, never
   * returns the token. When the token can be introspected it also reports the
   * two ways a *set* token still fails to publish: a missing
   * `instagram_content_publish` scope, and an expiry that has passed (or is
   * approaching — the date is surfaced so it can be refreshed in time).
   */
  async health(): Promise<PublishHealth> {
    const { igId, token } = creds();
    if (!igId || !token) {
      const missing = [!igId && "the IG account id (META_IG_ACCOUNT_ID)", !token && "a token (META_ADS_TOKEN)"]
        .filter(Boolean)
        .join(" and ");
      return { configured: false, ok: false, detail: `not connected — missing ${missing}` };
    }
    try {
      // Token introspection is the real diagnosis, but debug_token is not
      // available on every setup — so a failure here is not fatal: fall back to
      // a plain reachability read of the account.
      let scopeNote = "";
      let expiresOn: string | undefined;
      try {
        const dbg = await graphGet("debug_token", { input_token: token });
        const d = dbg?.data ?? {};
        expiresOn = isoDay(d.expires_at) ?? isoDay(d.data_access_expires_at);
        if (d.is_valid === false) {
          return {
            configured: true,
            ok: false,
            expiresOn,
            detail: expiresOn ? `token is no longer valid (expired ${expiresOn}) — regenerate it` : "token is no longer valid — regenerate it",
          };
        }
        const scopes: string[] = Array.isArray(d.scopes) ? d.scopes : [];
        if (scopes.length && !scopes.includes("instagram_content_publish")) {
          return {
            configured: true,
            ok: false,
            expiresOn,
            detail: "token is valid but lacks the instagram_content_publish permission — approved posts will be refused",
          };
        }
        if (!scopes.length) scopeNote = " (publish scope unconfirmed)";
      } catch {
        scopeNote = " (scope & expiry unverified)";
      }
      const acct = await graphGet(`${igId}`, { fields: "username" });
      const who = acct?.username ? `@${acct.username}` : igId;
      const exp = expiresOn ? `, token expires ${expiresOn}` : "";
      return { configured: true, ok: true, username: acct?.username, expiresOn, detail: `connected as ${who}${exp}${scopeNote}` };
    } catch (e) {
      return { configured: true, ok: false, detail: (e as Error).message };
    }
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    const first = await this.publishOnce(req);
    // A collab invite Instagram refuses (a renamed, private or ineligible
    // account) must not cost the post itself: it goes out on our grid, and
    // the refusal is reported so the partner row can be fixed.
    if (!first.ok && req.collaborators?.length && /collaborat/i.test(first.error ?? "")) {
      const retry = await this.publishOnce({ ...req, collaborators: [] });
      if (retry.ok) return { ...retry, note: `published without the collab — Instagram refused it: ${first.error}` };
    }
    return first;
  }

  private async publishOnce(req: PublishRequest): Promise<PublishResult> {
    if (!this.configured) return queuedResult("instagram");
    const { igId } = creds();
    try {
      let creationId: string;

      if (req.kind === "story") {
        const source = req.mediaUrls[0];
        const isVideo = /[.](?:mp4|mov)(?:$|[?#])/i.test(source);
        const container = await graphPost(`${igId}/media`, {
          media_type: "STORIES",
          ...(isVideo ? { video_url: source } : { image_url: source }),
        });
        await waitForContainer(container.id);
        creationId = container.id;
      } else if (req.kind === "carousel") {
        // One child container per slide (is_carousel_item=true), then a parent.
        const childIds: string[] = [];
        for (const url of req.mediaUrls) {
          const child = await graphPost(`${igId}/media`, {
            image_url: url,
            is_carousel_item: "true",
          });
          childIds.push(child.id);
        }
        const parent = await graphPost(`${igId}/media`, {
          media_type: "CAROUSEL",
          children: childIds.join(","),
          caption: req.caption,
          ...collabFields(req),
        });
        creationId = parent.id;
      } else if (req.kind === "reel") {
        const container = await graphPost(`${igId}/media`, {
          media_type: "REELS",
          video_url: req.mediaUrls[0],
          caption: req.caption,
          ...collabFields(req),
          // false keeps the reel off the profile grid (reels tab only) — the
          // cadence's daily reel; every fourth day's reel joins the grid.
          share_to_feed: req.shareToFeed === false ? "false" : "true",
          ...(req.thumbnailUrl ? { cover_url: req.thumbnailUrl } : {}),
        });
        await waitForContainer(container.id);
        creationId = container.id;
      } else {
        // Single feed image.
        const container = await graphPost(`${igId}/media`, {
          image_url: req.mediaUrls[0],
          caption: req.caption,
          ...collabFields(req),
        });
        creationId = container.id;
      }

      // Every container, not just video: on 26 Sep 2026 an approved image
      // Story failed with "Media ID is not available" because media_publish
      // ran before Instagram had finished fetching the picture. Images are
      // usually FINISHED on the first poll, so this costs a second at most.
      await waitForContainer(creationId);
      let published: { id: string };
      try {
        published = await graphPost(`${igId}/media_publish`, { creation_id: creationId });
      } catch (e) {
        // The same race can still show up at publish time; one patient retry.
        if (!/not available|not ready|9007/i.test((e as Error).message)) throw e;
        await new Promise((r) => setTimeout(r, 8000));
        published = await graphPost(`${igId}/media_publish`, { creation_id: creationId });
      }
      // Publication has already succeeded. A read/permission failure here
      // must not turn that success into a failed row eligible for a retry.
      const url = await instagramPermalink(published.id).catch(() => null);
      return {
        ok: true,
        externalId: published.id,
        ...(url ? { url } : {}),
      };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async fetchMetrics(externalId: string): Promise<Record<string, number>> {
    // Media Insights: reach, likes, comments, saved, shares (+ plays for reels).
    const data = await graphGet(`${externalId}/insights`, {
      metric: "reach,likes,comments,saved,shares",
    });
    const out: Record<string, number> = {};
    for (const m of data.data ?? []) {
      const val = m?.values?.[0]?.value;
      if (typeof val === "number") out[m.name] = val;
    }
    return out;
  }
}
