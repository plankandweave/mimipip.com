// Shared media types for the compositor and publishers.

export type MediaKind = "feed" | "carousel" | "story" | "reel";

/** A finished, uploaded piece of media ready to publish. */
export type RenderedMedia = {
  kind: MediaKind;
  contentType: string; // "image/jpeg" | "video/mp4"
  url: string | null; // public URL once uploaded; null if not persisted
  localPath?: string; // set when written to disk in dev instead of uploaded
  width: number;
  height: number;
  slides?: string[]; // for carousels: one public URL per slide
  durationSec?: number; // for reels
};

/** Instagram-preferred canvas sizes. */
export const CANVAS = {
  feed: { w: 1080, h: 1350 }, // 4:5 portrait — max feed real estate
  square: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 }, // 9:16
  reel: { w: 1080, h: 1920 }, // 9:16
} as const;

/**
 * WHERE INSTAGRAM DRAWS ITS OWN CHROME, in pixels of a 1080×1920 frame.
 *
 * A Story is full-screen and Instagram paints over it: the progress bars, the
 * avatar + account name + timestamp on the left, the ⋯ and ✕ on the right,
 * and the reply bar along the foot. Meta's own Stories guidance is to keep
 * logos and text out of the top and bottom 250px, and on 26 September 2026 the
 * founder saw exactly why — our monogram sat at y81 and Instagram printed
 * "zyvorah." straight through it, while ZYVORAH.COM collided with "Send
 * message".
 *
 * A Reel reserves less at the top but much more at the foot (username and
 * caption) and a column on the right for the like/comment/share rail.
 */
export const IG_SAFE = {
  story: { top: 250, bottom: 250 },
  reel: { top: 180, bottom: 330, right: 180 },
} as const;
