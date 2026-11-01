// Which Story frame is CURRENT, and which ones are retired.
//
// On 30 September 2026 Roheena sent a Tulip Heritage Story back with "Rewrite
// it" because it was in the old frame — the ZYVORAH label pressed up under
// Instagram's own account name, the layout storyHouseSvg had since moved below
// that chrome. It came back to the review queue in the same old frame, with a
// feed caption and hashtags added underneath. Two things let that happen:
//
//   1. A composed Story is pixels in storage. Changing the frame's code changes
//      every FUTURE Story and none of the ones already queued, and a queued slot
//      counts as done, so nothing ever went back for them.
//   2. Her note did not name a room, a crop or a close-up, so the note router
//      read it as a note about the WORDS: the caption writer rewrote a caption
//      a Story never posts, and the picture she objected to was kept.
//
// So the frame is VERSIONED, in the storage path every composed Story frame is
// written under. A queued, unsigned Story whose frame is not the current version
// is not "done" — the compose run draws it again — and it cannot be approved or
// shown for review, so the old frame can never come back to her. Bump
// STORY_FRAME whenever storyHouseSvg or composeEditorialStory changes what a
// Story looks like; every unsigned Story then recomposes on its own.
//
// Pure: imported by the review page and the desk (client side) as well as the
// composer, so it must not pull in sharp or node:fs.

/** The current Story frame. Written into the path: stories/<STORY_FRAME>/… */
export const STORY_FRAME = "house-v5";

/** Storage folder for a composed Story frame of the current version. */
export const storyFramePath = (name: string) => `stories/${STORY_FRAME}/${name}`;

/**
 * Is this post a Story drawn in a frame that has since been retired?
 *
 * Corrections and supplied frames are pixels too: an old correction or
 * unversioned delivery cannot prove the current visual rules. New corrections
 * use the current folder and withdraw approval for a fresh visual review.
 */
export function isRetiredStoryFrame(post: { format?: string | null; media_urls?: string[] | null }): boolean {
  if (post.format !== "story") return false;
  return (post.media_urls ?? []).some((url) => {
    const at = url.indexOf("/stories/");
    if (at < 0) return true;
    const rest = url.slice(at + "/stories/".length);
    return !rest.startsWith(`${STORY_FRAME}/`);
  });
}
