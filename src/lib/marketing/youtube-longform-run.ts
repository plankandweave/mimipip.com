// Server-only: runs the long-form YouTube pipeline for Library films.
// The rules are in youtube-longform.ts; this file does the I/O.
//
// Triggers, both without anyone having to remember:
//   - Roheena taps "Publish to YouTube" on a widescreen film in the Library
//     (the approval is written on the film, then the film runs at once);
//   - the hourly marketing cron drains every film still queued, blocked on
//     something that may since have been settled, or failed and retryable.
//
// Never twice: a run CLAIMS the film on its updated_at before touching
// YouTube, and before every upload it looks through the channel's own uploads
// for this film (hidden film tag, or the exact title). A found video is
// recorded, not re-uploaded. Every refusal and failure is written on the film
// with the reason and returned — nothing fails quietly.

import { hasServiceRole, serviceClient } from "./db";
import { privateBucket } from "@/lib/r2-media";
import { asPosts, deriveStatus, type Post } from "./library-record";
import { accessToken, auditState, ZYVORAH_CHANNEL_ID, YouTubePublisher } from "./publish/youtube";
import {
  buildLongformCopy, gateFilm, isThisFilm, longformOf, nextStep, watchUrl,
  type FilmRow, type Longform, type LongformCopy,
} from "./youtube-longform";

const LIBRARY = "marketing_asset_library";
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3";
/** Uploads read back through while reconciling: 4 pages of 50. */
const RECONCILE_PAGES = 4;
/** YouTube refuses a custom thumbnail over 2 MB. */
const THUMB_MAX = 2 * 1024 * 1024;

type Row = FilmRow & Record<string, unknown> & { updated_at?: string; posts?: unknown };

export type LongformOutcome = {
  id: string;
  title: string;
  state: Longform["state"] | "skipped" | "waiting";
  url?: string;
  error?: string;
};

async function readRow(id: string): Promise<Row> {
  const { data, error } = await serviceClient().from(LIBRARY).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Library read: ${error.message}`);
  if (!data) throw new Error(`the Library film ${id} is no longer in the Library`);
  return data as Row;
}

/** Write the pipeline's record, only if nobody else wrote the row since we
 *  read it. Returns the new row, or null when another writer got there first. */
async function writeLongform(row: Row, lf: Longform, extra: Record<string, unknown> = {}): Promise<Row | null> {
  const youtube = { ...((row.youtube as Record<string, unknown>) ?? {}), longform: lf };
  let q = serviceClient().from(LIBRARY).update({ youtube, ...extra, updated_at: new Date().toISOString() }).eq("id", row.id);
  if (row.updated_at) q = q.eq("updated_at", row.updated_at);
  const { data, error } = await q.select("*");
  if (error) throw new Error(`Library write: ${error.message}`);
  return ((data ?? [])[0] as Row | undefined) ?? null;
}

async function yt(token: string, path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`YouTube ${path.split("?")[0]}: ${json?.error?.message || res.status}`);
  return json;
}

/** The connected channel, refused unless it is @zyvorahwallpapers. */
async function ourUploadsPlaylist(token: string): Promise<string> {
  const json = await yt(token, "channels?part=id,contentDetails&mine=true");
  const ch = (json.items as { id: string; contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] | undefined)?.[0];
  if (!ch || ch.id !== ZYVORAH_CHANNEL_ID) throw new Error(`the YouTube token is for ${ch?.id ?? "no channel"}, not @zyvorahwallpapers — nothing was uploaded`);
  const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error("YouTube did not name the channel's uploads list — cannot check for an earlier upload, so nothing was uploaded");
  return uploads;
}

type Video = { id: string; snippet?: { title?: string; tags?: string[]; channelId?: string }; status?: { privacyStatus?: string } };

async function videos(token: string, ids: string[]): Promise<Video[]> {
  if (!ids.length) return [];
  const json = await yt(token, `videos?part=snippet,status&id=${ids.join(",")}`);
  return (json.items as Video[] | undefined) ?? [];
}

/** This film, if it is already on the channel. */
async function findExisting(token: string, uploads: string, row: Row, copy: LongformCopy): Promise<Video | null> {
  let pageToken = "";
  for (let page = 0; page < RECONCILE_PAGES; page++) {
    const json = await yt(token, `playlistItems?part=contentDetails&maxResults=50&playlistId=${encodeURIComponent(uploads)}${pageToken ? `&pageToken=${pageToken}` : ""}`);
    const ids = ((json.items as { contentDetails?: { videoId?: string } }[] | undefined) ?? [])
      .map((i) => i.contentDetails?.videoId).filter((v): v is string => !!v);
    const hit = (await videos(token, ids)).find((v) => isThisFilm({ tags: v.snippet?.tags, title: v.snippet?.title }, row.id, copy.title));
    if (hit) return hit;
    pageToken = (json.nextPageToken as string | undefined) ?? "";
    if (!pageToken) break;
  }
  return null;
}

/** Stream a stored object into a fetch body without holding it in memory. */
function streamBody(body: ReadableStream, size: number): ReadableStream {
  const FLS = (globalThis as unknown as { FixedLengthStream?: new (n: number) => TransformStream }).FixedLengthStream;
  if (!FLS) return body;
  const fixed = new FLS(size);
  void body.pipeTo(fixed.writable).catch(() => {});
  return fixed.readable;
}

async function upload(token: string, row: Row, copy: LongformCopy): Promise<Video> {
  const bucket = await privateBucket();
  if (!bucket) throw new Error("media storage is not bound in this runtime — the film cannot be uploaded from here");
  const obj = await bucket.get(String(row.media_key));
  if (!obj) throw new Error(`the video file for “${row.title}” is missing from private storage`);

  const metadata = {
    snippet: {
      title: copy.title,
      description: copy.description,
      tags: copy.tags,
      categoryId: "26", // Howto & Style
      defaultLanguage: copy.defaultLanguage,
      ...(copy.defaultAudioLanguage ? { defaultAudioLanguage: copy.defaultAudioLanguage } : {}),
    },
    status: {
      privacyStatus: "public",
      selfDeclaredMadeForKids: false,
      // The rooms are rendered and the narration is a generated voice: say so.
      containsSyntheticMedia: true,
      embeddable: true,
      license: "youtube",
      publicStatsViewable: true,
    },
  };
  const start = await fetch(`${UPLOAD}/videos?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(obj.size),
    },
    body: JSON.stringify(metadata),
  });
  if (!start.ok) {
    const err = await start.json().catch(() => null);
    throw new Error(`YouTube refused to start the upload: ${err?.error?.message || start.status}`);
  }
  const session = start.headers.get("location");
  if (!session) throw new Error("YouTube started the upload without an upload address");

  const put = await fetch(session, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(obj.size) },
    body: streamBody(obj.body, obj.size),
    // Node's fetch needs this for a stream body; workerd ignores it.
    ...({ duplex: "half" } as Record<string, unknown>),
  });
  const json = await put.json().catch(() => ({}));
  if (!put.ok || !json?.id) throw new Error(`YouTube upload failed: ${json?.error?.message || put.status}`);
  return json as Video;
}

/** The cover as the video's thumbnail. YouTube only allows this on a verified
 *  channel, so a refusal is recorded on the film, not treated as a failed publish. */
async function setThumbnail(token: string, row: Row, videoId: string): Promise<string> {
  if (!row.cover_key) return "no cover in the Library — YouTube chose a frame";
  const bucket = await privateBucket();
  const obj = bucket ? await bucket.get(String(row.cover_key)) : null;
  if (!obj) return "the cover file is missing from storage — YouTube chose a frame";
  if (obj.size > THUMB_MAX) return `the cover is ${(obj.size / 1048576).toFixed(1)} MB; YouTube takes 2 MB — YouTube chose a frame`;
  const type = String(row.cover_key).endsWith(".png") ? "image/png" : "image/jpeg";
  const res = await fetch(`${UPLOAD}/thumbnails/set?videoId=${videoId}&uploadType=media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": type },
    body: await obj.arrayBuffer(),
  });
  if (res.ok) return "set from the Library cover";
  const err = await res.json().catch(() => null);
  return `YouTube refused the cover: ${err?.error?.message || res.status}`;
}

/** The film's captions file, when the Library has one. */
async function uploadCaptions(token: string, row: Row, videoId: string, lang: string): Promise<string> {
  if (!row.captions_key) return "none in the Library";
  const bucket = await privateBucket();
  const obj = bucket ? await bucket.get(String(row.captions_key)) : null;
  if (!obj) return "the captions file is missing from storage";
  const boundary = `zyv${crypto.randomUUID().replace(/-/g, "")}`;
  const text = new TextDecoder().decode(await obj.arrayBuffer());
  const body = [
    `--${boundary}`, "Content-Type: application/json; charset=UTF-8", "",
    JSON.stringify({ snippet: { videoId, language: lang, name: "", isDraft: false } }),
    `--${boundary}`, "Content-Type: application/octet-stream", "", text, `--${boundary}--`, "",
  ].join("\r\n");
  const res = await fetch(`${UPLOAD}/captions?part=snippet&uploadType=multipart`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (res.ok) return `uploaded (${lang})`;
  const err = await res.json().catch(() => null);
  return `YouTube refused the captions: ${err?.error?.message || res.status}`;
}

/** File the video on the film as a proven post, the way recordLibraryPost does
 *  for Instagram — with what YouTube itself said about it. */
async function recordPublished(row: Row, video: Video, lf: Longform): Promise<Row> {
  const url = watchUrl(video.id);
  const [checked] = await videos(await accessToken(), [video.id]);
  if (!checked) throw new Error(`YouTube has no video ${video.id} — nothing recorded`);
  const channelId = checked.snippet?.channelId ?? "";
  const privacy = checked.status?.privacyStatus ?? "unknown";
  if (channelId !== ZYVORAH_CHANNEL_ID) throw new Error(`video ${video.id} is on channel ${channelId}, not @zyvorahwallpapers`);

  const posts = asPosts(row.posts).filter((p) => !(p.platform === "youtube" && p.url.includes(video.id)));
  const post: Post = {
    id: crypto.randomUUID(),
    platform: "youtube",
    url,
    recorded_at: new Date().toISOString(),
    recorded_by: `YouTube long-form pipeline (approved by ${lf.approved_by})`,
    verified: true,
    verified_at: new Date().toISOString(),
    evidence: { videoId: video.id, channelId, privacyStatus: privacy },
  };
  const next = [...posts, post];
  const done: Longform = {
    ...lf, state: "published", video_id: video.id, url, privacy, channel_id: channelId,
    published_at: new Date().toISOString(), error: undefined, failed_at: undefined,
  };
  const saved = await writeLongform(row, done, { posts: next, status: deriveStatus(next) });
  if (!saved) {
    // Someone touched the row mid-run: re-read and write once more on the fresh copy.
    const fresh = await readRow(row.id);
    const freshPosts = asPosts(fresh.posts).filter((p) => !(p.platform === "youtube" && p.url.includes(video.id)));
    const again = await writeLongform(fresh, done, { posts: [...freshPosts, post], status: deriveStatus([...freshPosts, post]) });
    if (!again) throw new Error(`video ${video.id} is live but the Library row kept changing — rerun to record it`);
    return again;
  }
  if (privacy !== "public") throw new Error(`video ${video.id} is on the channel but YouTube made it ${privacy}, not public`);
  return saved;
}

/** Run one film through the pipeline. Never throws: the outcome carries the reason. */
export async function runLongform(id: string): Promise<LongformOutcome> {
  let row: Row;
  try { row = await readRow(id); } catch (e) { return { id, title: id, state: "failed", error: (e as Error).message }; }
  const title = row.title;
  const lf = longformOf(row);
  const step = nextStep(lf, Date.now());
  if (step === "skip") return { id, title, state: lf?.state === "published" ? "published" : "skipped", url: lf?.url, error: lf?.error };
  if (step === "wait") return { id, title, state: "waiting", error: "another run is uploading this film now" };
  const base = lf!;

  const copy = buildLongformCopy(row);
  const blocked = gateFilm(row, copy, base.approved_by);
  if (blocked.length) {
    const error = blocked.join("; ");
    if (base.state !== "blocked" || base.error !== error) await writeLongform(row, { ...base, state: "blocked", error, failed_at: new Date().toISOString() }).catch(() => null);
    return { id, title, state: "blocked", error };
  }
  const pub = new YouTubePublisher();
  if (!pub.configured) return { id, title, state: "blocked", error: "YouTube is not connected on the store (YT_* secrets missing)" };
  if ((await auditState()) === "pending") {
    const error = "Google has not cleared this API project for public uploads yet — an upload now would go up private";
    if (base.state !== "blocked" || base.error !== error) await writeLongform(row, { ...base, state: "blocked", error }).catch(() => null);
    return { id, title, state: "blocked", error };
  }

  // Claim: only one run gets past this line for a given version of the row.
  const claim = crypto.randomUUID();
  const claimed = await writeLongform(row, {
    ...base, state: "uploading", claim, claimed_at: new Date().toISOString(), attempts: (base.attempts ?? 0) + 1, title: copy.title, error: undefined,
  }).catch(() => null);
  if (!claimed) return { id, title, state: "waiting", error: "another run claimed this film first" };
  row = claimed;
  const held = longformOf(row)!;

  try {
    const token = await accessToken();
    const uploads = await ourUploadsPlaylist(token);
    const existing = await findExisting(token, uploads, row, copy);
    let video: Video;
    let reconciled = false;
    if (existing) {
      video = existing;
      reconciled = true;
    } else {
      video = await upload(token, row, copy);
    }
    const thumbnail = reconciled && held.thumbnail ? held.thumbnail : await setThumbnail(token, row, video.id).catch((e) => `thumbnail failed: ${(e as Error).message}`);
    const captions = reconciled && held.captions ? held.captions
      : await uploadCaptions(token, row, video.id, copy.defaultAudioLanguage ?? copy.defaultLanguage).catch((e) => `captions failed: ${(e as Error).message}`);
    row = await readRow(id);
    const saved = await recordPublished(row, video, { ...held, reconciled, thumbnail, captions });
    const out = longformOf(saved)!;
    return { id, title, state: "published", url: out.url };
  } catch (e) {
    const error = (e as Error).message;
    // The claim stays readable: the next run reconciles against the channel
    // before it would ever upload again.
    try {
      const fresh = await readRow(id);
      const now = longformOf(fresh);
      if (now?.state !== "published") await writeLongform(fresh, { ...(now ?? held), state: "failed", error, failed_at: new Date().toISOString() });
    } catch { /* the outcome below still carries the reason */ }
    return { id, title, state: "failed", error };
  }
}

/** Record Roheena's approval on a film and queue it. */
export async function approveLongform(id: string, approvedBy: string, requestedBy: string): Promise<void> {
  const row = await readRow(id);
  const lf = longformOf(row);
  if (lf?.state === "published") throw new Error(`“${row.title}” is already on YouTube: ${lf.url}`);
  if (lf?.state === "uploading" && nextStep(lf, Date.now()) === "wait") throw new Error(`“${row.title}” is uploading now`);
  const saved = await writeLongform(row, {
    ...(lf ?? {}), state: "queued", approved_by: approvedBy, approved_at: new Date().toISOString(), requested_by: requestedBy,
    attempts: 0, error: undefined, failed_at: undefined,
  });
  if (!saved) throw new Error("the film changed while approving — try again");
}

/** Cron: every film waiting on the pipeline, one at a time. */
export async function drainLongform(limit = 3): Promise<LongformOutcome[]> {
  if (!hasServiceRole()) return [];
  const { data, error } = await serviceClient()
    .from(LIBRARY)
    .select("id,youtube")
    .eq("format", "youtube")
    .in("youtube->longform->>state", ["queued", "blocked", "failed", "uploading"]);
  if (error) throw new Error(`Library read: ${error.message}`);
  const due = ((data ?? []) as Row[]).filter((r) => nextStep(longformOf(r), Date.now()) === "go").slice(0, limit);
  const out: LongformOutcome[] = [];
  for (const r of due) out.push(await runLongform(r.id));
  return out;
}
