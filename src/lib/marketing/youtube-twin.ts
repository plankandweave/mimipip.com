// A YouTube Short is the TWIN of an Instagram Reel the founder approved: same
// video, same words, a second destination. It is not a new piece of content,
// so it needs no second approval — but for the same reason it must not say
// anything she did not approve. The caption is therefore a MECHANICAL
// translation of the approved Reel caption, never a fresh AI generation:
// only the Instagram-only phrasing ("link in bio", which means nothing on
// YouTube) is swapped for a real link.

import { SITE_URL } from "../seo";

/** The twin's slot key. Distinct (slot_key is unique per live row) and still day-first, so `split("#")[0]` is the day. */
export function youtubeTwinKey(reelSlotKey: string): string {
  return `${reelSlotKey}~yt`;
}

export function isYouTubeTwinKey(slotKey: string): boolean {
  return slotKey.endsWith("~yt");
}

/** Approved Reel caption → Short description. */
export function youtubeCaption(reelCaption: string, productHandle: string | null): string {
  const link = productHandle ? `${SITE_URL}/products/${productHandle}` : SITE_URL;
  let text = reelCaption.replace(/(→\s*)?link in (the )?bio\.?/gi, (_m, arrow) => `${arrow ?? "→ "}${link}`);
  if (!text.includes(SITE_URL)) text = `${text.trimEnd()}\n\n${link}`;
  return text;
}
