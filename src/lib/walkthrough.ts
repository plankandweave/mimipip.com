import "server-only";
import type { SupabaseClient } from "@/brand/database-types";

// Shared bits of the walkthrough routes, so the three of them agree about what
// a walkthrough is and where its files live.

export const BUCKET = "corporate-art";

/** Three minutes at phone quality is roughly 35 MB, which clears the storage
 *  limits comfortably and is about as long as anyone narrates one space for.
 *  A building is covered by several walkthroughs, not one long one — which is
 *  also how it is actually walked. */
export const MAX_VIDEO_SECONDS = 180;
export const MAX_VIDEO_BYTES = 96 * 1024 * 1024;
/** Opus at speech bitrate: a couple of megabytes for the same three minutes,
 *  and well inside the 25 MB transcription ceiling that the video is not. */
export const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
export const MAX_STILL_BYTES = 6 * 1024 * 1024;
export const MAX_MARKS = 40;

/** Containers a phone's MediaRecorder actually produces, and the extension we
 *  store each under. An allow-list, because the caller's content type decides a
 *  path segment and must never be free text. Chrome and Android give webm;
 *  iOS Safari gives mp4. */
const VIDEO_EXT: Record<string, string> = {
  "video/webm": "webm",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};
const AUDIO_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
};

const extFrom = (table: Record<string, string>, contentType: string): string | null => {
  const base = String(contentType ?? "").split(";")[0].trim().toLowerCase();
  return table[base] ?? null;
};

export const videoExtension = (t: string) => extFrom(VIDEO_EXT, t);
export const audioExtension = (t: string) => extFrom(AUDIO_EXT, t);

/** Every file a walkthrough owns, addressed by its id — never by anything the
 *  caller sends. A path from a request body is a traversal primitive into a
 *  bucket holding every partner's artwork. */
export const walkthroughPath = {
  video: (slug: string, id: string, ext: string) => `walkthroughs/${slug}/${id}/walk.${ext}`,
  audio: (slug: string, id: string, ext: string) => `walkthroughs/${slug}/${id}/narration.${ext}`,
  still: (slug: string, id: string, seq: number) =>
    `walkthroughs/${slug}/${id}/mark-${String(seq).padStart(2, "0")}.jpg`,
};

export type WalkthroughRow = {
  id: string; account_id: string; area_id: string;
  title: string | null;
  video_path: string | null; video_seconds: number | null; video_error: string | null;
  audio_path: string | null;
  transcript: string | null; transcript_error: string | null; transcribed_at: string | null;
  drafted_at: string | null; draft_error: string | null;
  note: string | null; created_by_email: string | null; created_at: string;
};

export type MarkRow = {
  id: string; walkthrough_id: string; seq: number; at_seconds: number;
  still_path: string | null; still_error: string | null;
  draft_name: string | null; draft_brief: string | null;
  draft_width_mm: number | null; draft_height_mm: number | null;
  size_estimated: boolean;
  confirmed_wall_seq: number | null; confirmed_at: string | null;
};

/** One walkthrough, proven to belong to the area the session already resolved.
 *
 *  The same rule as everywhere else in this feature: a caller supplies an id,
 *  and the id is looked up scoped to what they are already allowed to see. */
export async function walkthroughInArea(
  sb: SupabaseClient, areaId: string, accountId: string, id: string,
): Promise<WalkthroughRow | null> {
  const { data } = await sb.from("corporate_walkthroughs")
    .select("*").eq("id", id).eq("area_id", areaId).eq("account_id", accountId)
    .maybeSingle();
  return (data as WalkthroughRow | null) ?? null;
}
