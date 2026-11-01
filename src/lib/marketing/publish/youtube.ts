import { brand } from "../../../brand/current";
import { publishingAvailable } from "../../../brand/publishing-transport";
import { publishingFetch as fetch } from "../../../brand/publishing-transport";
// YouTube publisher (Shorts) via the YouTube Data API v3 resumable upload.
//
// Every approved Instagram Reel is syndicated here as a Short (see
// queueYouTubeTwin in pipeline.ts): a vertical MP4 with #Shorts in the title.
// Auth is OAuth2 with a long-lived refresh token (YouTube has no page-token
// equivalent). We exchange the refresh token for an access token, start a
// resumable upload session, PUT the bytes, and set snippet + status.
//
// Credentials live on the zyvorah-store Worker as secrets, written by
// `node scripts/youtube-connect.mjs` (one Google sign-in, nothing printed):
//   YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN
// Until then, `configured` is false and publish() queues.
//
// PRIVATE UNTIL AUDITED. Google restricts every video uploaded through an API
// project created after 28 July 2020 to PRIVATE until that project passes the
// YouTube API Services compliance audit. We always ASK for public; YouTube
// answers with the privacy it actually applied. The first upload that comes
// back public is the proof the audit has passed — that is recorded in
// admin_config, and releasePrivateShorts() then turns every earlier Short
// public, once. No switch for anyone to remember to flip.

import type { Publisher, PublishRequest, PublishResult, PublishHealth } from "./types";
import { queuedResult } from "./types";
import { serviceClient, hasServiceRole } from "../db";
import { startYouTubeUpload, finishYouTubeUpload, type UploadMetadata } from "./youtube-upload";

/** @zyvorahwallpapers — a token for any other channel must never post. */
export const ZYVORAH_CHANNEL_ID = brand.publishing?.youtubeChannelId || "";
/** "audited" once an upload comes back public; "released" once earlier private Shorts were made public. */
const AUDIT_KEY = "youtube_public_ok";
const API = "https://www.googleapis.com/youtube/v3";

function creds() {
  return {
    clientId: process.env.YT_CLIENT_ID,
    clientSecret: process.env.YT_CLIENT_SECRET,
    refreshToken: process.env.YT_REFRESH_TOKEN,
  };
}

export async function accessToken(): Promise<string> {
  const { clientId, clientSecret, refreshToken } = creds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken!,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`YT token: ${json?.error_description || json?.error || res.status}`);
  return json.access_token;
}

export async function auditState(): Promise<"pending" | "audited" | "released"> {
  if (!hasServiceRole()) return "pending";
  try {
    const { data } = await serviceClient().from("admin_config").select("v").eq("k", AUDIT_KEY).maybeSingle();
    const v = data?.v as string | undefined;
    return v === "audited" || v === "released" ? v : "pending";
  } catch {
    return "pending";
  }
}

async function setAuditState(v: "audited" | "released"): Promise<void> {
  if (!hasServiceRole()) return;
  await serviceClient().from("admin_config").upsert({ k: AUDIT_KEY, v }, { onConflict: "k" });
}

/** "Hook line #Shorts" — YouTube caps titles at 100 characters. */
function shortTitle(req: PublishRequest): string {
  const first = (req.title || req.caption.split("\n").find((l) => l.trim()) || brand.name).replace(/#\S+/g, "").trim();
  const clipped = first.length > 90 ? `${first.slice(0, 89).trimEnd()}…` : first;
  return `${clipped} #Shorts`;
}

export class YouTubePublisher implements Publisher {
  readonly channel = "youtube" as const;

  get configured(): boolean {
    if (!publishingAvailable()) return false;
    const { clientId, clientSecret, refreshToken } = creds();
    return !!clientId && !!clientSecret && !!refreshToken;
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    if (!this.configured) return queuedResult("youtube");
    if (req.kind !== "reel") {
      // YouTube only takes video here; stills are not syndicated.
      return { ok: false, error: "youtube: only reel/video posts are syndicated." };
    }
    try {
      const token = await accessToken();
      const media = await fetch(req.mediaUrls[0]);
      if (!media.ok) throw new Error(`YT media fetch: ${media.status}`);
      const videoBytes = new Uint8Array(await media.arrayBuffer());

      const metadata: UploadMetadata = {
        snippet: { title: shortTitle(req), description: req.caption, categoryId: "26" /* Howto & Style */ },
        status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
      };

      const uploadUrl = await startYouTubeUpload(token, metadata, videoBytes.length);
      const json = await finishYouTubeUpload(uploadUrl, videoBytes);

      // YouTube returns the privacy it actually applied. Public means the
      // project has passed Google's audit — record it so earlier Shorts follow.
      if (json?.status?.privacyStatus === "public" && (await auditState()) === "pending") {
        await setAuditState("audited").catch(() => {});
      }
      return { ok: true, externalId: json.id, url: `https://youtube.com/shorts/${json.id}` };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async health(): Promise<PublishHealth> {
    if (!this.configured) {
      return {
        configured: false,
        ok: false,
        detail: "not connected — run `node scripts/youtube-connect.mjs` once (one Google sign-in, choose the Zyvorah channel)",
      };
    }
    const token = await accessToken();
    const res = await fetch(`${API}/channels?part=id,snippet&mine=true`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (!res.ok) return { configured: true, ok: false, detail: `YouTube refused the token: ${json?.error?.message || res.status}` };
    const ch = json?.items?.[0];
    if (!ch || ch.id !== ZYVORAH_CHANNEL_ID) {
      return {
        configured: true,
        ok: false,
        detail: `connected to the WRONG channel (${ch?.snippet?.title ?? "none"}) — re-run scripts/youtube-connect.mjs and pick Zyvorah`,
      };
    }
    const audit = await auditState();
    return {
      configured: true,
      ok: true,
      username: ch.snippet?.customUrl ?? "@zyvorahwallpapers",
      detail:
        audit === "pending"
          ? `connected as ${ch.snippet?.title}. Shorts upload PRIVATE until Google approves the API audit — they turn public automatically the day it does`
          : `connected as ${ch.snippet?.title}. Shorts publish publicly`,
    };
  }

  async fetchMetrics(externalId: string): Promise<Record<string, number>> {
    const token = await accessToken();
    const res = await fetch(`${API}/videos?part=statistics&id=${externalId}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (!res.ok) throw new Error(`YT videos.list: ${json?.error?.message || res.status}`);
    // Gone from the channel: no counts. The privacy policy promises they are
    // deleted when the video is, and an empty result is how backfill does it.
    if (!json?.items?.length) return {};
    const s = json.items[0].statistics ?? {};
    return {
      views: Number(s.viewCount || 0),
      likes: Number(s.likeCount || 0),
      comments: Number(s.commentCount || 0),
    };
  }
}

/**
 * Once the audit has passed, turn every Short that went up private while it
 * was pending public — once. Cheap to call every tick: until the audit it is a
 * single admin_config read, and afterwards it runs exactly one time.
 */
export async function releasePrivateShorts(): Promise<{ released: number } | null> {
  const pub = new YouTubePublisher();
  if (!pub.configured || !hasServiceRole()) return null;
  if ((await auditState()) !== "audited") return null;

  const { data, error } = await serviceClient()
    .from("marketing_posts")
    .select("external_id")
    .eq("channel", "youtube")
    .eq("status", "published")
    .not("external_id", "is", null);
  if (error) throw new Error(`marketing_posts read: ${error.message}`);
  const ids = (data ?? []).map((r) => r.external_id as string);

  const token = await accessToken();
  let released = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const res = await fetch(`${API}/videos?part=status&id=${ids.slice(i, i + 50).join(",")}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`YT videos.list: ${json?.error?.message || res.status}`);
    for (const v of json.items ?? []) {
      if (v.status?.privacyStatus !== "private") continue;
      const up = await fetch(`${API}/videos?part=status`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        // videos.update replaces the whole status part, so carry the mutable
        // fields over rather than letting them fall back to defaults.
        body: JSON.stringify({
          id: v.id,
          status: {
            privacyStatus: "public",
            selfDeclaredMadeForKids: false,
            embeddable: v.status.embeddable,
            license: v.status.license,
            publicStatsViewable: v.status.publicStatsViewable,
          },
        }),
      });
      if (!up.ok) {
        const err = await up.json().catch(() => null);
        throw new Error(`YT make public ${v.id}: ${err?.error?.message || up.status}`);
      }
      released++;
    }
  }
  await setAuditState("released");
  return { released };
}

/**
 * One video as YouTube itself reports it — the channel it lives on and its
 * privacy — for checking a link someone says is ours. `null` when YouTube has
 * no such video; throws when the credentials are missing or the API fails, so
 * the caller can tell "not ours" from "could not check".
 */
export async function lookupYouTubeVideo(videoId: string): Promise<{ channelId: string; privacyStatus: string } | null> {
  if (!new YouTubePublisher().configured) throw new Error("YouTube credentials are not configured");
  const token = await accessToken();
  const res = await fetch(`${API}/videos?part=snippet,status&id=${encodeURIComponent(videoId)}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json();
  if (!res.ok) throw new Error(`YT videos.list: ${json?.error?.message || res.status}`);
  const item = json?.items?.[0];
  if (!item) return null;
  return { channelId: item.snippet?.channelId ?? "", privacyStatus: item.status?.privacyStatus ?? "unknown" };
}
