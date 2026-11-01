// Server-only: the bridge from the Library to the marketing desk.
//
// A finished Library film reaches Instagram the same way every other post
// does — a plan slot (kind 'reel', art.library_id) that the engine composes
// into marketing_posts, Roheena approves on the desk, and publishApproved
// posts at its time, with a YouTube Short twin. This file owns the two ends
// only the Library knows about (Roheena, 29 Sep 2026: "let them all go
// through"):
//
//   compose → libraryVideoForSlot(): the film, checked (in the Library,
//             licence settled, a shape a Reel takes), copied from private
//             storage to the public media store under its own content hash,
//             so the URL the approval signs can never point at other bytes.
//   publish → recordLibraryPost(): the link the platform returned, checked
//             against the platform and written to the film's record, so its
//             status moves from the platform's answer, not anyone's word.
//
// Every refusal throws with the reason. A Library film never quietly turns
// into some other post.

import { hasServiceRole, serviceClient } from "./db";
import { mediaBucket, privateBucket } from "@/lib/r2-media";
import { R2_DOMAIN_BASE } from "@/lib/media-url";
import { asPosts, deriveStatus, normaliseClearance, parsePostUrl, type Post } from "./library-record";
import { verifyPost } from "./library-verify";
import { filmOf } from "./video-divisions";
import { metaPublishToken } from "@/lib/meta-env";

const LIBRARY = "marketing_asset_library";
/** Longest film a Reel (and its Short twin) takes, with the Library's own slack. */
const REEL_MAX_S = 180.5;

type LibraryRow = Record<string, unknown> & { id: string };

async function libraryRow(id: string): Promise<LibraryRow> {
  const { data, error } = await serviceClient().from(LIBRARY).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Library read: ${error.message}`);
  if (!data) throw new Error(`the Library film ${id} is no longer in the Library`);
  return data as LibraryRow;
}

/** The public URL of a Library film for this slot, after every check a post
 *  needs. Throws with the reason when the film may not go out as a Reel. */
export async function libraryVideoForSlot(libraryId: string): Promise<string> {
  const row = await libraryRow(libraryId);
  const title = String(row.title);
  if (!row.media_key || !row.media_sha256) throw new Error(`“${title}” has no stored video file`);
  const clearance = normaliseClearance(row.clearance);
  // Listening is settled by the approval itself; the licences must be settled first.
  const unlicensed = (["voice", "music"] as const).filter((k) => clearance[k].state === "pending");
  if (unlicensed.length) throw new Error(`“${title}” is not cleared: ${unlicensed.join(" and ")} licence pending in the Library`);
  const film = filmOf(row as Parameters<typeof filmOf>[0]);
  if (!film) throw new Error(`“${title}” has not been measured yet — open the Library once so its shape and length are read`);
  if (film.width >= film.height) throw new Error(`“${title}” is ${film.width}×${film.height}; a Reel must be vertical — widescreen films go to YouTube from the Library's “Publish to YouTube”`);
  if (film.durationS > REEL_MAX_S) throw new Error(`“${title}” runs ${Math.round(film.durationS)}s; a Reel and its Short take at most 180s`);

  return publicFilmUrl(row);
}

/** Where a Library film's public copy lives: keyed by its content hash, so
 *  one URL can never point at other bytes. Shared by Reels and site films. */
export const publicFilmKey = (sha256: string) => `marketing-media/library/${sha256}.mp4`;

/** Copy a private Library file to the public media store (once) and return
 *  its public URL. Throws with the reason when it cannot. */
export async function copyToPublic(sourceKey: string, targetKey: string, contentType: string, title: string): Promise<string> {
  const source = await privateBucket();
  const target = await mediaBucket();
  if (!source || !target) throw new Error("media storage is not bound in this runtime — the film cannot be published from here");
  if (!(await target.head(targetKey))) {
    const obj = await source.get(sourceKey);
    if (!obj) throw new Error(`the file ${sourceKey} for “${title}” is missing from private storage`);
    // Streamed store to store: a three-minute film never has to fit in memory.
    await target.put(targetKey, obj.body, { httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" } });
    const copied = await target.head(targetKey);
    if (!copied || copied.size !== obj.size) throw new Error(`copying “${title}” to the public store failed (size ${copied?.size ?? 0} of ${obj.size})`);
  }
  return `${R2_DOMAIN_BASE}/${targetKey}`;
}

async function publicFilmUrl(row: LibraryRow): Promise<string> {
  return copyToPublic(String(row.media_key), publicFilmKey(String(row.media_sha256)), "video/mp4", String(row.title));
}

/** Instagram returns a media id; the Library files posts by their permalink. */
async function instagramPermalink(mediaId: string): Promise<string | null> {
  const token = metaPublishToken();
  if (!token) return null;
  const graph = `https://graph.facebook.com/${process.env.IG_GRAPH_VERSION || process.env.META_GRAPH_VERSION || "v21.0"}`;
  const res = await fetch(`${graph}/${encodeURIComponent(mediaId)}?fields=permalink&access_token=${encodeURIComponent(token)}`);
  const json = await res.json().catch(() => ({}));
  return res.ok && typeof json.permalink === "string" ? json.permalink : null;
}

type PublishedRow = { slot_key?: unknown; plan_slot_id?: unknown; channel?: unknown };

/** The plan slot a published row came from — a YouTube twin names its Reel's
 *  slot key plus "~yt" and inherits the Reel's slot. */
async function slotIdFor(row: PublishedRow): Promise<string | null> {
  if (typeof row.plan_slot_id === "string") return row.plan_slot_id;
  const key = typeof row.slot_key === "string" ? row.slot_key : "";
  if (!key.endsWith("~yt")) return null;
  const { data } = await serviceClient()
    .from("marketing_posts")
    .select("plan_slot_id")
    .eq("slot_key", key.slice(0, -3))
    .neq("status", "superseded")
    .maybeSingle();
  return (data?.plan_slot_id as string | null) ?? null;
}

/** After a post goes live: if it carried a Library film, file the link on
 *  that film, as the platform confirms it. A post that is not a Library film
 *  is left alone. */
export async function recordLibraryPost(row: PublishedRow, externalId: string | undefined): Promise<void> {
  if (!hasServiceRole() || !externalId) return;
  const slotId = await slotIdFor(row);
  if (!slotId) return;
  const { data: slot } = await serviceClient().from("marketing_plan_slots").select("art").eq("id", slotId).maybeSingle();
  const libraryId = (slot?.art as Record<string, unknown> | undefined)?.library_id;
  if (typeof libraryId !== "string") return;

  const url = row.channel === "youtube"
    ? `https://www.youtube.com/shorts/${externalId}`
    : await instagramPermalink(externalId);
  if (!url) throw new Error(`Instagram did not return a permalink for media ${externalId}; the Library film was not updated`);
  const parsed = parsePostUrl(url);
  if ("error" in parsed) throw new Error(`the published link ${url} could not be filed: ${parsed.error}`);
  const verdict = await verifyPost(parsed.platform, parsed.ref);
  const check = "refuse" in verdict ? { verified: false, unverified_reason: verdict.refuse } : verdict;

  const film = await libraryRow(libraryId);
  const posts = asPosts(film.posts);
  if (posts.some((p) => p.url === parsed.url)) return;
  const post: Post = {
    id: crypto.randomUUID(),
    platform: parsed.platform,
    url: parsed.url,
    recorded_at: new Date().toISOString(),
    recorded_by: "marketing desk (approved post)",
    ...check,
  };
  const next = [...posts, post];
  const { error } = await serviceClient().from(LIBRARY)
    .update({ posts: next, status: deriveStatus(next), updated_at: new Date().toISOString() })
    .eq("id", libraryId);
  if (error) throw new Error(`Library write: ${error.message}`);
}
