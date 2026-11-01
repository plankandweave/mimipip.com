// Server-only: asks the platform whether a recorded post is really ours.
// A link to someone else's video is refused outright; a link the server simply
// could not check (no credentials, API down, no API for that platform) is kept
// as UNVERIFIED with the reason, and re-checked on later loads.

import { lookupYouTubeVideo, ZYVORAH_CHANNEL_ID } from "./publish/youtube";
import { metaIgAccountId, metaPublishToken } from "@/lib/meta-env";
import { PLATFORM_LABEL, type Platform, type Post } from "./library-record";

type Check = Pick<Post, "verified" | "verified_at" | "evidence" | "unverified_reason">;
export type Verdict = Check | { refuse: string };

const GRAPH = () => `https://graph.facebook.com/${process.env.IG_GRAPH_VERSION || process.env.META_GRAPH_VERSION || "v21.0"}`;
/** How far back through the account's posts to look: 4 pages of 50. */
const IG_PAGES = 4;

const unverified = (reason: string): Check => ({ verified: false, unverified_reason: reason });

async function checkYouTube(videoId: string): Promise<Verdict> {
  let video;
  try { video = await lookupYouTubeVideo(videoId); } catch (e) {
    return unverified(`Could not check with YouTube: ${(e as Error).message}`);
  }
  if (!video) return { refuse: "YouTube has no video at that link." };
  if (video.channelId !== ZYVORAH_CHANNEL_ID) return { refuse: "That video is on another channel, not @zyvorahwallpapers." };
  return {
    verified: true,
    verified_at: new Date().toISOString(),
    evidence: { videoId, channelId: video.channelId, privacyStatus: video.privacyStatus },
  };
}

async function checkInstagram(shortcode: string): Promise<Verdict> {
  const igId = metaIgAccountId();
  const access = metaPublishToken();
  if (!igId || !access) return unverified("Instagram is not connected to the site, so the post could not be checked.");
  let next: string | null = `${GRAPH()}/${igId}/media?fields=id,shortcode&limit=50&access_token=${encodeURIComponent(access)}`;
  try {
    for (let page = 0; next && page < IG_PAGES; page++) {
      const res: Response = await fetch(next);
      const json = await res.json();
      if (!res.ok) return unverified(`Could not check with Instagram: ${json?.error?.message || res.status}`);
      const hit = (json.data ?? []).find((m: { shortcode?: string }) => m.shortcode === shortcode);
      if (hit) return { verified: true, verified_at: new Date().toISOString(), evidence: { mediaId: String(hit.id), shortcode } };
      next = json.paging?.next ?? null;
    }
  } catch (e) {
    return unverified(`Could not check with Instagram: ${(e as Error).message}`);
  }
  return unverified(`Not found among @zyvorah's latest ${IG_PAGES * 50} posts — a collaborator's post, or not ours.`);
}

export async function verifyPost(platform: Platform, ref: string | undefined): Promise<Verdict> {
  if (platform === "youtube" && ref) return checkYouTube(ref);
  if (platform === "instagram" && ref) return checkInstagram(ref);
  return unverified(`${PLATFORM_LABEL[platform]} cannot be checked automatically yet — the link is recorded, not proven.`);
}

/** Whether a stored post is worth asking about again: the platform can be
 *  asked, and the last answer was "could not check" or "private for now". */
export const worthRechecking = (p: Post) =>
  (p.platform === "youtube" || p.platform === "instagram") &&
  (!p.verified || p.evidence?.privacyStatus === "private" || p.evidence?.privacyStatus === "unlisted");
