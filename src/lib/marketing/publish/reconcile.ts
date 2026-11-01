// The publish reconciler's judgement: given a row publishApproved claimed and
// never finished, and what Instagram actually carries, what happened?
//
// publishApproved claims a row (status 'approved') BEFORE it contacts the
// platform, so a manual click and a cron can never post it twice. A Worker
// killed mid-publish leaves it claimed — on 27 Sep 2026 a reel sat at
// "publishing · awaiting confirmation" for two days, nobody knowing whether it
// went out. This decides from Instagram's own record, never from the row:
//
//   one matching post  → published, with Instagram's id and time
//   two or more        → unconfirmed; we do not guess between them
//   none               → it did not go out (or, for a Story past Instagram's
//                        24-hour window, unconfirmed — the evidence is gone)
//
// A match needs all three: the same kind of post, a time inside the window the
// publish could have happened in, and — where the post carries one — the same
// caption. A caption alone is a self-report shaped like evidence (the same
// words can go out twice in a collection week).

import type { LiveMedia } from "./instagram";

/** A claim older than this is stale — no live publish takes this long. */
export const STALE_CLAIM_MS = 15 * 60_000;
/** How long after the claim a post can still have landed. */
const LATE_MS = 2 * 3600_000;
const STORY_LIFE_MS = 24 * 3600_000;
/** The phrase publishApproved retries on (same day only). */
export const INTERRUPTED = "publish was interrupted mid-publish and Instagram has no such post — it did not go out";

export type ClaimedRow = {
  slot_key: string;
  format: string;
  caption: string | null;
  claimed_at: string | null;
};

export type Verdict =
  | { kind: "published"; media: LiveMedia }
  | { kind: "failed"; error: string };

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Midnight IST at the start of a YYYY-MM-DD day key. */
function dayStartMs(dayKey: string): number {
  return Date.parse(`${dayKey}T00:00:00+05:30`);
}

function kindMatches(format: string, m: LiveMedia): boolean {
  const product = (m.media_product_type ?? "").toUpperCase();
  const type = m.media_type.toUpperCase();
  if (format === "story") return product === "STORY";
  if (format === "reel") return product === "REELS" || (type === "VIDEO" && product !== "STORY");
  if (format === "carousel") return type === "CAROUSEL_ALBUM";
  return type === "IMAGE" && product !== "STORY";
}

/** Is this claim stale enough to reconcile? A claim with no time (claimed
 *  before claimed_at existed) is stale once its day has passed. */
export function isStale(row: ClaimedRow, todayKey: string, now: number): boolean {
  if (row.claimed_at) return now - Date.parse(row.claimed_at) >= STALE_CLAIM_MS;
  return row.slot_key.split("#")[0] < todayKey;
}

export function judgeClaim(row: ClaimedRow, live: LiveMedia[], now: number): Verdict {
  const dayKey = row.slot_key.split("#")[0];
  const from = dayStartMs(dayKey);
  const until = (row.claimed_at ? Date.parse(row.claimed_at) : from + 24 * 3600_000) + LATE_MS;
  const caption = norm(row.caption);
  const isStory = row.format === "story";

  const hits = live.filter((m) => {
    const t = Date.parse(m.timestamp);
    if (!(t >= from && t <= until)) return false;
    if (!kindMatches(row.format, m)) return false;
    // Stories carry no caption on Instagram; every other kind must match it.
    return isStory || norm(m.caption) === caption;
  });

  if (hits.length === 1) return { kind: "published", media: hits[0] };
  if (hits.length > 1) {
    const links = hits.map((h) => h.permalink ?? h.id).join(", ");
    return { kind: "failed", error: `unconfirmed: the publish was interrupted and ${hits.length} Instagram posts match it (${links}) — not guessing which` };
  }
  if (isStory && now - from > STORY_LIFE_MS) {
    return {
      kind: "failed",
      error: "unconfirmed: the publish was interrupted, and Instagram no longer shows whether this Story went out (Stories expire after 24 hours)",
    };
  }
  return { kind: "failed", error: INTERRUPTED };
}
