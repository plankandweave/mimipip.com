import { STORY_LINK_HOLD, storyProductUrl } from "./story-link";
import { frameChecks, LAYOUT_VERSION, type LayoutFrame, type LayoutReceipt } from "./layout-check";

// Exact operational hold used when the founder's Link rule was applied to
// already-approved Stories. Other skipped reasons must never be reopened.
export const PRESERVED_STORY_LINK_HOLD = "Story link rule (2 October 2026): held for a clickable Link sticker to the exact wallpaper. Creative approval preserved; do not publish through the stickerless API.";

export type StoryReplacementRow = {
  id: string; status: string; format: string; channel: string; product_handle: string | null; media_urls: string[];
  published_at: string | null; external_id: string | null; error: string | null;
  caption: string | null; approved_at: string | null; approved_by: string | null;
  approved_digest: string | null;
  regenerate_requested_at: string | null; regenerate_requested_by: string | null; regenerate_reason: string | null;
};

export function isExactStoryLinkHold(error: string | null): boolean {
  return error === STORY_LINK_HOLD || error === PRESERVED_STORY_LINK_HOLD;
}

export function canReplaceStory(row: StoryReplacementRow | null): boolean {
  return !!row && row.format === "story" && row.published_at === null && row.external_id === null
    && (["queued", "approved"].includes(row.status)
      || (row.status === "skipped" && row.channel === "instagram" && !!storyProductUrl(row.product_handle) && isExactStoryLinkHold(row.error)));
}

export function storyReplacementReviewState(row: StoryReplacementRow) {
  return {
    status: row.status === "skipped" && !isExactStoryLinkHold(row.error) ? "skipped" : "queued",
    // Replacing pixels always requires fresh approval. The retired sticker-only
    // hold no longer blocks the replacement; unrelated skips remain skipped.
    error: row.status === "skipped" && !isExactStoryLinkHold(row.error) ? row.error : null,
    approved_at: null, approved_by: null, approved_digest: null,
  };
}

type SnapshotQuery<T> = { eq(column: string, value: string): T; is(column: string, value: null): T };

// Compare the observed row atomically at UPDATE time. A publication, cancellation,
// new hold, approval or competing artwork/copy change while uploading wins.
export function guardStoryReplacement<T extends SnapshotQuery<T>>(query: T, row: StoryReplacementRow): T {
  for (const column of ["id", "status", "format", "channel", "product_handle", "published_at", "external_id", "error", "caption", "approved_at", "approved_by", "approved_digest", "regenerate_requested_at", "regenerate_requested_by", "regenerate_reason"] as const) {
    const value = row[column];
    query = value === null ? query.is(column, null) : query.eq(column, value);
  }
  const mediaArray = `{${row.media_urls.map((url) => JSON.stringify(url)).join(",")}}`;
  return query.eq("media_urls", mediaArray);
}

// A corrected Story is drawn in the measured portrait frame (renderMeasuredStory,
// the daily cadence's Story) and its receipt is that measurement — never a set
// of coordinates typed into the route. Until 9 October 2026 the replace route
// drew the editorial-story frame (no Z. at the top, a footer to y≈1840) and
// wrote a portrait receipt it had not measured, so the layout gate passed
// pixels it had never seen.

/** The kicker over a corrected Story's title. */
export function storyReplacementKicker(sourceUrl: string): string {
  return /\/taash\//i.test(sourceUrl) ? "Zyvorah · Taash" : "Zyvorah";
}

/** Why a measured frame cannot be stored as a Story, or null when it can. */
export function storyFrameRefusal(frame: LayoutFrame | null | undefined): string | null {
  if (!frame || frame.surface !== "portrait") return "The Story was not measured in the portrait frame.";
  const failed = frameChecks(frame).filter((c) => !c.ok).map((c) => c.label);
  return failed.length ? `Layout check failed: ${failed.join(", ")}. Shorten the headline or subline and rebuild.` : null;
}

/** The receipt for a stored Story: exactly the frame the media container measured. */
export function storyLayoutReceipt(url: string, sha256: string, frame: LayoutFrame): LayoutReceipt {
  const refusal = storyFrameRefusal(frame);
  if (refusal) throw new Error(refusal);
  return { version: LAYOUT_VERSION, assets: [{ url, sha256, frames: [frame] }] };
}
