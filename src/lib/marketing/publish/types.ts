// The common publisher contract. Every channel implements Publisher. The
// pipeline never calls a platform SDK directly — it asks a Publisher to post a
// PublishRequest and gets back a PublishResult. When a channel's credentials are
// absent, `configured` is false and the pipeline leaves the post in the ledger
// as `queued` instead of publishing — so the whole engine runs end-to-end today
// and starts posting the moment credentials land, with zero code changes.

import type { MediaKind } from "../media/types";

export type PublishRequest = {
  kind: MediaKind; // feed | carousel | story | reel
  caption: string;
  // Public media URLs. One for feed/story/reel; many for carousel slides.
  mediaUrls: string[];
  // Reels/videos: a poster/thumbnail URL if the platform wants one.
  thumbnailUrl?: string;
  // Reels only: false posts the reel WITHOUT putting it on the profile grid
  // (Instagram share_to_feed). The daily cadence reel is off-grid except
  // every fourth day — the grid is a designed surface. Default true.
  shareToFeed?: boolean;
  /**
   * Instagram COLLAB: usernames invited as co-authors, so the post appears on
   * their profile and grid too and the reach is shared. TAASH is a
   * collaboration with Mati, and the founder's rule (26 Sep 2026) is that
   * every Taash post tags and collabs that account.
   *
   * Feed, carousel and reel only — Instagram has no collaborator on a Story,
   * where a mention in the caption is the equivalent. An invite the other
   * account has not accepted simply leaves the post on ours, so this can
   * never block a publish.
   */
  collaborators?: string[];
  // YouTube/LinkedIn extras.
  title?: string;
};

export type PublishResult = {
  ok: boolean;
  externalId?: string; // platform media/post id
  url?: string; // permalink if returned
  error?: string;
  queued?: boolean; // true when skipped for missing credentials
  note?: string; // published, but with something worth telling (e.g. collab refused)
};

/**
 * A live credential check. `configured` only says the env vars are present;
 * this asks the platform whether the token actually works — the difference
 * between "a token is set" and "a post will go out". `detail` is human-readable
 * for the board; `expiresOn` (YYYY-MM-DD) surfaces an approaching expiry before
 * it silently stops publishing.
 */
export type PublishHealth = {
  configured: boolean;
  ok: boolean;
  detail: string;
  username?: string;
  expiresOn?: string;
};

export interface Publisher {
  readonly channel: "instagram" | "youtube" | "linkedin";
  /** True when all required credentials are present. */
  readonly configured: boolean;
  /** `configured`, for a publisher whose credentials may live in the
   *  database rather than the environment (LinkedIn, connected from the desk). */
  ready?(): Promise<boolean>;
  publish(req: PublishRequest): Promise<PublishResult>;
  /** Pull performance metrics for a previously published post. */
  fetchMetrics?(externalId: string): Promise<Record<string, number>>;
  /** Ask the platform whether the credentials actually work, right now. */
  health?(): Promise<PublishHealth>;
}

/** Uniform "not configured yet" result. */
export function queuedResult(channel: string): PublishResult {
  return { ok: false, queued: true, error: `${channel}: credentials not configured — left queued.` };
}
