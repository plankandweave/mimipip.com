// One definition of an approval task, shared by the desk, email and write gate.
import { isPersonalPlan } from "./profiles";
import { isRetiredStoryFrame } from "./story-frame";
import { productionHold, type ProductionSlot } from "./production-readiness";
import { slotFrameTextProblem } from "./frame-text";
import { layoutHold } from "./layout-check";

export type ReviewPost = {
  id: string; status: string; channel: string; format: string;
  caption: string | null; media_urls: string[] | null; thumbnail_url?: string | null;
  safety_passed: boolean | null; approved_at?: string | null;
  regenerate_requested_at?: string | null; plan_slot_id?: string | null;
  plan_key?: string | null; slot_key?: string | null;
};
export type ReviewPlan = ProductionSlot & {
  plan_key?: string | null; hook?: string | null; collection?: string | null;
};
export type ReviewQualification = { review_ready: boolean; review_hold: string | null };
/** The one place an Instagram post's need for a measured plan item is stated.
 * Review, approval and the publisher all refuse an Instagram row without one,
 * so the composer asks this too: on 9 October 2026 the daily cadence had
 * rendered 35 plan-less Instagram rows that no check could ever pass, and the
 * brief reported them as "blocked" every morning. */
export const PLAN_REQUIRED = "A measured source plan is required before Instagram approval.";
export function needsPlanItem(channel: string | null | undefined, planSlotId: string | null | undefined): boolean {
  return (channel ?? "instagram") === "instagram" && !planSlotId;
}
export const reviewDay = (now = new Date()) => new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);

export function reviewHold(post: ReviewPost, plan: ReviewPlan | null, options: {
  today?: string; planStatus?: string | null; sequenceError?: string | null;
} = {}): string | null {
  if (post.status !== "queued") return "This post is not awaiting approval.";
  if (post.approved_at) return "This post is already approved.";
  if (post.regenerate_requested_at) return "This post is waiting for a rewrite.";
  if (!post.safety_passed) return "This post needs a brand-safety correction.";
  if (isPersonalPlan(post.plan_key)) return "Connect the personal publishing account before scheduling this creative.";
  if (!post.caption?.trim() || !post.media_urls?.length) return "The finished caption and media are required.";
  const day = (post.slot_key ?? "").split("#")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < (options.today ?? reviewDay())) return "This post needs a current publishing date before review.";
  if (post.plan_slot_id && !plan) return "The source plan item is missing.";
  if (needsPlanItem(post.channel, post.plan_slot_id)) return PLAN_REQUIRED;
  if (post.plan_key && !["draft", "live"].includes(options.planStatus ?? "")) return "The source campaign is not active.";
  if (plan) {
    if (plan.status !== "planned") return "The source plan item is not scheduled for production.";
    if (plan.art?.selected === false) return "The source plan item is not selected for production.";
    const hold = productionHold(plan) ?? slotFrameTextProblem(plan);
    if (hold) return hold;
  }
  if (options.sequenceError) return options.sequenceError;
  if (isRetiredStoryFrame(post)) return "This Story needs to be redrawn in the current frame.";
  const layout = layoutHold(plan?.art, post.media_urls, post.thumbnail_url, post.channel === "instagram");
  if (layout) return layout;
  return null;
}
