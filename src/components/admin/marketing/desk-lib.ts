import {layoutHold} from "@/lib/marketing/layout-check";
// What the desk says about a slot, decided in one place.
//
// A slot is intent (the plan) joined to a result (the composed post). The two
// together answer the only questions the founder asks of a tile: what is this,
// what state is it in, and what can I do to it. Pure, so the rules are testable
// without a browser.

import type { DeskSlot, DeskPost } from "@/app/api/admin/marketing/plan/route";
import { isRetiredStoryFrame } from "@/lib/marketing/story-frame";
import { storyProductUrl } from "@/lib/marketing/story-link";
import { ideaSource } from "@/lib/marketing/idea-source";
import { slotFrameTextProblem } from "@/lib/marketing/frame-text";
import { isPersonalPlan } from "@/lib/marketing/profiles";
import { productionHold } from "@/lib/marketing/production-readiness";
import { lockedTimeIST } from "@/lib/marketing/publish-time";

export type SlotState =
  | "idea"
  | "planned"
  | "composing"
  | "review"
  | "approved"
  | "posted"
  | "failed"
  | "redo"
  | "held"
  | "missed"
  | "removed";

export type StateLabel = { state: SlotState; label: string; colour: string; bg: string };

export const STATE_STYLE: Record<SlotState, { label: string; colour: string; bg: string }> = {
  idea: { label: "idea", colour: "#6b6b6b", bg: "#f1f1ef" },
  planned: { label: "planned", colour: "#3f3f3f", bg: "#f4f2ec" },
  composing: { label: "composing…", colour: "#8250df", bg: "#f3eefc" },
  review: { label: "ready to review", colour: "#8250df", bg: "#f3eefc" },
  approved: { label: "approved", colour: "#0969da", bg: "#e7f0fb" },
  posted: { label: "posted", colour: "#1a7f37", bg: "#e6f4ea" },
  failed: { label: "failed", colour: "#cf222e", bg: "#fdecec" },
  redo: { label: "being redone", colour: "#9a6700", bg: "#fff4d6" },
  held: { label: "not running", colour: "#57606a", bg: "#f1f1ef" },
  missed: { label: "missed", colour: "#57606a", bg: "#f1f1ef" },
  removed: { label: "removed", colour: "#57606a", bg: "#f1f1ef" },
};

export function slotState(s: DeskSlot, today: string): SlotState {
  if (s.status === "removed") return "removed";
  if (s.post?.status === "published") return "posted";
  if (s.design_sequence_error || productionHold(s)) return "held";
  if (s.status === "idea") return "idea";
  const p = s.post;
  if (!p) return s.day_key < today ? "missed" : "planned";
  if (p.status === "published") return "posted";
  if (p.regenerate_requested_at) return "redo";
  // A Story in a retired frame is drawn again by the next compose run; it is
  // never offered for approval as it stands (story-frame.ts).
  if (p.status === "queued" && !p.approved_at && isRetiredStoryFrame(p)) return "redo";
  if (p.status === "failed") return "failed";
  if (p.status === "skipped" || p.review_hold) return "held";
  if (layoutHold(s.art,p.media_urls,p.thumbnail_url,s.channel === "instagram")) return "held";
  if (p.approved_at) return "approved";
  if (p.status === "queued" && p.safety_passed) return "review";
  if (p.status === "queued") return "failed"; // queued but blocked by the gate
  return "planned";
}

export function stateLabel(s: DeskSlot, today: string, now: Date = new Date()): StateLabel {
  const state = slotState(s, today);
  const st = STATE_STYLE[state];
  let label = st.label;
  if (state === "held") {
    if (s.design_sequence_error) label = "needs a different design";
    else if (productionHold(s)) label = "needs finished creative";
    else if (s.post?.status === "skipped") label = "removed from publishing";
    else if (s.post?.review_hold) label = s.post.review_hold;
    else label = "needs layout correction";
  }
  if (state === "approved" && s.channel === "linkedin" && s.day_key < today && s.post?.status !== "approved") {
    return { state: "missed", ...STATE_STYLE.missed, label: "overdue · approved, not posted" };
  }
  // A locked release time is when the publisher will post it (publish-time.ts),
  // so the tile names that time — "waiting to publish" on a post due this
  // evening read as a stuck post on 4 October 2026.
  const at = typeof s.art?.publish_at === "string" ? Date.parse(s.art.publish_at) : NaN;
  const time = lockedTimeIST(s.art);
  if (state === "approved" && s.day_key > today) label = `approved · posts ${shortDay(s.day_key)}${time ? ` ${time}` : ""}`;
  else if (state === "approved" && s.post?.status === "approved") label = "publishing · awaiting confirmation";
  else if (state === "approved" && time && now.getTime() < at) label = `approved · posts ${time} today`;
  else if (state === "approved" && time) label = `approved · due ${time}, not posted yet`;
  else if (state === "approved") label = "approved · waiting to publish";
  return { state, ...st, label };
}

const isVideoUrl = (u: string) => /\.(?:mp4|mov)(?:\?|$)/i.test(u);

/** Both library imports and delivered masters are reviewable before approval. */
export function reviewVideo(s: DeskSlot): string | null {
  if (s.post) return null;
  const src = s.art?.review_video_url ?? s.art?.video_url;
  return typeof src === "string" && src.trim() ? src : null;
}

/** A Library film's own cover, through the staff-only Library route. */
function libraryCover(s: DeskSlot): string | null {
  const id = s.art?.library_id ?? s.art?.review_library_id;
  return typeof id === "string" ? `/api/admin/marketing/library/media?id=${encodeURIComponent(id)}&kind=cover` : null;
}

/** The picture a tile shows: the composed frame when there is one, else the
 *  catalogue stand-in (a room render, else the flat artwork). Never a video
 *  file: an <img> pointed at an .mp4 is the broken-picture box the Reels rail
 *  showed for every Library film (29 Sep 2026) — a reel with no poster shows
 *  its film's Library cover, else the plan's still. */
export function tileImage(s: DeskSlot): { src: string | null; composed: boolean; video: boolean } {
  const p = s.post;
  if (p?.media_urls?.length) {
    if (p.format === "reel") {
      if (p.thumbnail_url && !isVideoUrl(p.thumbnail_url)) return { src: p.thumbnail_url, composed: true, video: false };
      const still = libraryCover(s) ?? (typeof s.art?.image_url === "string" ? (s.art.image_url as string) : null) ?? s.preview;
      return { src: still, composed: !!still, video: true };
    }
    if (p.format === "story" && /\.mp4(?:\?|$)|\.mov(?:\?|$)/i.test(p.media_urls[0])) {
      return { src: p.thumbnail_url ?? (s.art?.image_url as string | undefined) ?? s.preview, composed: true, video: true };
    }
    return { src: p.media_urls[0], composed: true, video: false };
  }
  const reelCover = s.kind === "reel" && typeof s.art?.reel_cover_url === "string" ? s.art.reel_cover_url : null;
  if (reelCover) return { src: reelCover, composed: true, video: false };
  const own = typeof s.art?.review_image_url === "string" && !isVideoUrl(s.art.review_image_url) ? s.art.review_image_url : null;
  return { src: libraryCover(s) ?? own ?? s.preview, composed: false, video: !!reviewVideo(s) };
}

/** Awaiting the founder: composed, passed the gate, unsigned, not sent back. */
export function awaitingReview(s: DeskSlot): boolean {
  const p = s.post;
  // A frame that prints a working note as its headline is never offered for
  // approval — see frame-text.ts (3 Oct 2026, "publication verification required").
  return !!p && p.review_ready === true && p.status === "queued" && !p.approved_at && !p.regenerate_requested_at && s.status !== "removed";

}

/** An Instagram idea that already carries what a planned slot needs — copy,
 *  and a design or a finished frame (a Story: the exact design for its Link
 *  sticker) — so the desk offers to compose it. The server re-checks with the
 *  import's own rules (ideaReadyArt) and says why when it refuses. */
export function composableIdea(s: DeskSlot): boolean {
  if (s.status !== "idea" || s.channel !== "instagram" || s.kind === "ad" || isPersonalPlan(s.plan_key)) return false;
  if (!s.caption?.trim() || slotFrameTextProblem(s)) return false;
  // The review board keeps the design, picture and film in review fields.
  const { handle, art } = ideaSource(s);
  if (s.kind === "story") {
    const design = typeof art.story_design_handle === "string" && art.story_design_handle.trim() ? art.story_design_handle.trim() : handle;
    return !!storyProductUrl(design);
  }
  const frame = !!(
    art.image_url || art.image_b64 || art.video_url ||
    (s.kind === "reel" && ((Array.isArray(art.scene_urls) && art.scene_urls.length) || typeof art.library_id === "string"))
  );
  return !!handle || frame;
}

export const BEAT_LABEL: Record<string, string> = {
  wall: "WALL",
  detail: "DETAIL",
  word: "WORD",
  story: "STORY",
  launch: "LAUNCH",
  ad: "AD",
};

export const CHANNEL_LABEL: Record<string, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  google: "Google Ads",
  meta: "Meta ads",
  chatgpt: "ChatGPT ads",
};

/** Instagram's own order: newest at the top left, three to a row. Feed kinds
 *  only — Stories are not on the grid, and neither is a reel posted with
 *  share_to_feed=false (the daily cadence reel lives on the Reels rail). */
export function gridOrder(slots: DeskSlot[]): DeskSlot[] {
  return slots
    .filter((s) => s.channel === "instagram" && s.kind !== "story" && s.kind !== "ad" && s.status !== "removed")
    .filter((s) => !(s.kind === "reel" && s.post?.share_to_feed === false))
    .sort((a, b) => (a.day_key === b.day_key ? b.seq - a.seq : a.day_key < b.day_key ? 1 : -1));
}

/** Every reel on the plan, oldest first — the Reels rail: one a day, the
 *  grid ones marked. */
export function reelsInOrder(slots: DeskSlot[]): DeskSlot[] {
  return slots
    .filter((s) => s.kind === "reel" && s.channel === "instagram" && s.status !== "removed")
    .sort((a, b) => (a.day_key === b.day_key ? a.seq - b.seq : a.day_key < b.day_key ? -1 : 1));
}

export function storiesInOrder(slots: DeskSlot[]): DeskSlot[] {
  return slots
    .filter((s) => s.kind === "story" && s.status !== "removed")
    .sort((a, b) => (a.day_key === b.day_key ? a.seq - b.seq : a.day_key < b.day_key ? -1 : 1));
}

export function adsByChannel(slots: DeskSlot[]): Map<string, DeskSlot[]> {
  const out = new Map<string, DeskSlot[]>();
  for (const s of slots) {
    if (s.kind !== "ad" || s.status === "removed") continue;
    if (!out.has(s.channel)) out.set(s.channel, []);
    out.get(s.channel)!.push(s);
  }
  return out;
}

/** Days grouped into Monday-start weeks, each with its slots. */
export type WeekGroup = { start: string; end: string; days: { day: string; slots: DeskSlot[] }[] };

export function weeksBetween(slots: DeskSlot[], from: string, to: string): WeekGroup[] {
  const byDay = new Map<string, DeskSlot[]>();
  for (const s of slots) {
    if (s.status === "removed" || s.kind === "ad") continue;
    if (!byDay.has(s.day_key)) byDay.set(s.day_key, []);
    byDay.get(s.day_key)!.push(s);
  }
  const weeks: WeekGroup[] = [];
  let cur: WeekGroup | null = null;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!cur || weekdayIndex(d) === 0) {
      cur = { start: d, end: d, days: [] };
      weeks.push(cur);
    }
    cur.end = d;
    cur.days.push({ day: d, slots: (byDay.get(d) ?? []).sort((a, b) => a.seq - b.seq) });
  }
  return weeks;
}

/** 0 = Monday. */
export function weekdayIndex(dayKey: string): number {
  const dow = new Date(`${dayKey}T00:00:00Z`).getUTCDay();
  return (dow + 6) % 7;
}

export function addDays(dayKey: string, n: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function shortDay(dayKey: string): string {
  const [, m, d] = dayKey.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export function longDay(dayKey: string): string {
  return `${DAYS[weekdayIndex(dayKey)]} ${shortDay(dayKey)}`;
}

export function monthOf(dayKey: string): string {
  const [y, m] = dayKey.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "Mayur (मयूर)" → "Mayur" for a chip; the full title stays on the card. */
export function shortTitle(s: Pick<DeskSlot, "title" | "handle">): string {
  // A daily-cadence reel carries no plan title, only its design's handle —
  // shown as words ("Taash Ikka Eent"), not as a slug ("taash-ikka-eent").
  const t = s.title ?? (s.handle ? s.handle.split("-").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : "");
  return t.replace(/\s*\([^)]*\)\s*$/, "");
}

export function postSummary(p: DeskPost | null): string {
  if (!p) return "";
  if (p.status === "published") return `posted${p.published_at ? ` ${p.published_at.slice(0, 10)}` : ""}`;
  if (p.error) return p.error;
  return p.status;
}

/** Google's "this API is switched off" error carries the console URL that
 *  switches it on. Pull it out rather than asking her to find the project.
 *  Only console.developers.google.com and console.cloud.google.com are accepted,
 *  so a link can never come from anywhere but Google's own error. */
export function enableUrl(sitesError: string | null | undefined): string | null {
  if (!sitesError) return null;
  const m = sitesError.match(/https:\/\/console\.(?:developers|cloud)\.google\.com\/[^\s"\\]+/);
  return m ? m[0] : null;
}
