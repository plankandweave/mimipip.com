// What a saved idea already carries, read the way the composer reads a plan
// slot. Pure, so the desk (client) and the composer (server) agree on it.
//
// The review board (scripts/marketing-board-assets.ts, /admin/marketing/
// board-refresh) saves its ideas with the picture, the product and the Library
// cut in REVIEW fields — art.review_image_url, art.product_url,
// art.review_library_id — and leaves slot.handle empty. The composer only reads
// handle / image_url / library_id, so on 3 October 2026 every Ahimsa idea from
// 3 to 9 October showed its picture on the desk and still had no Compose
// button: by the composer's reading it had no design and no frame.
//
// Nothing is overwritten: a field the slot already sets wins, and the review
// fields are kept as they were.

const PRODUCT_URL = /^https:\/\/(?:www\.)?zyvorah\.com\/products\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?(?:[?#].*)?$/;
const VIDEO = /\.(?:mp4|mov)(?:\?|$)/i;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The design a product page URL names, or null for anything else (a
 *  collection page, another site, a plate). */
export function handleFromProductUrl(url: unknown): string | null {
  const u = str(url);
  return u ? (u.match(PRODUCT_URL)?.[1] ?? null) : null;
}

export function ideaSource(slot: { kind: string; handle: string | null; art: Record<string, unknown> | null }): {
  handle: string | null;
  art: Record<string, unknown>;
} {
  const art: Record<string, unknown> = { ...(slot.art ?? {}) };
  const handle = slot.handle ?? handleFromProductUrl(art.product_url);

  const still = str(art.review_image_url);
  if (still && still.startsWith("https://") && !VIDEO.test(still)) {
    // With a design, the reviewed picture is the render to lead with (the
    // composer honours art.scene_url when it is one of the design's own
    // renders). Without one, it is the finished frame itself.
    if (handle) art.scene_url ??= still;
    else art.image_url ??= still;
  }

  if (slot.kind === "reel") {
    const film = str(art.review_library_id);
    const video = str(art.review_video_url);
    if (film && !str(art.library_id) && !str(art.video_url)) art.library_id = film;
    else if (video && video.startsWith("https://") && VIDEO.test(video) && !str(art.video_url) && !str(art.library_id)) art.video_url = video;
  }

  return { handle, art };
}
