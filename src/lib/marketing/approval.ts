import {approvalMedia} from "./digest-web";
// What may be approved, and what may not.
//
// Pulled out of the route so the rules are testable without a database, a
// session or a live admin key. The route does I/O; this decides. Every refusal
// here is one the founder should be able to read and act on, so each carries
// its own sentence rather than a generic "invalid".
import { slotDigest } from "./digest";
import { isRetiredStoryFrame } from "./story-frame";

export type ReviewAction = "approve" | "reject" | "regenerate";

export type ReviewableRow = {
  id: string;
  status: string;
  caption: string | null;
  media_urls: string[] | null;
  safety_passed: boolean | null;
  format?: string | null;
  thumbnail_url?:string|null;
};

export type Decision =
  | { ok: true; digest: string }
  | { ok: false; error: string };

/**
 * May this row be approved, against the digest the reviewer's screen computed?
 *
 * The digest comparison is the whole point of the mechanism: publishApproved()
 * re-checks it before posting, so an approval that was signed against different
 * content would be refused later anyway — silently, a day later, with nobody
 * watching. Refusing it here turns that into a sentence the founder reads while
 * they are still looking at the post.
 */
export function canApprove(row: ReviewableRow, claimedDigest: unknown): Decision {
  if (row.status === "published") return { ok: false, error: "already published" };
  if (row.status === "superseded") return { ok: false, error: "superseded by a newer version" };
  if (!row.safety_passed) {
    return {
      ok: false,
      error: "failed the brand-safety gate — regenerate it, it cannot be approved",
    };
  }
  if (isRetiredStoryFrame(row)) {
    return {
      ok: false,
      error: "this Story is in the old frame — it is being drawn again in the current one and will come back for review",
    };
  }
  if (typeof claimedDigest !== "string" || !claimedDigest) {
    return { ok: false, error: "no digest sent — refusing to sign unseen content" };
  }
  const current = slotDigest(row.caption, approvalMedia(row));
  if (claimedDigest !== current) {
    return { ok: false, error: "this post changed since it was displayed — reload and look at it again" };
  }
  return { ok: true, digest: current };
}

/** Reject and regenerate do not sign content, so they need no digest — but
 *  neither can undo something already on Instagram. */
export function canRevise(row: ReviewableRow, action: "reject" | "regenerate"): Decision {
  if (row.status === "published") {
    return {
      ok: false,
      error:
        action === "reject"
          ? "already published — it cannot be un-posted from here"
          : "already published",
    };
  }
  if (row.status === "superseded") return { ok: false, error: "superseded by a newer version" };
  return { ok: true, digest: "" };
}
