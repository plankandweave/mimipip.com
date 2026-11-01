// Server-only: qualify the exact stored media before asking for a decision.
import type { SupabaseClient } from "@supabase/supabase-js";
import { PERSONAL_PLAN_PREFIX } from "./profiles";
import { serviceClient } from "./db";
import { designSequenceCheck } from "./plan";
import { verifyLayoutFiles } from "./layout-verify";
import { reviewDay, reviewHold, type ReviewPlan, type ReviewPost, type ReviewQualification } from "./review-readiness";

export async function qualifyReviewPosts<T extends ReviewPost>(rows: T[], db: SupabaseClient = serviceClient(), today = reviewDay()): Promise<(T & ReviewQualification)[]> {
  const candidates = rows.filter(p => p.status === "queued" && !p.approved_at && !p.regenerate_requested_at);
  if (!candidates.length) return rows.map(p => ({ ...p, review_ready: false, review_hold: null }));
  const ids = [...new Set(candidates.map(p => p.plan_slot_id).filter((id): id is string => !!id))];
  const plans = new Map<string, ReviewPlan>();
  for (let i = 0; i < ids.length; i += 100) {
    const {data, error} = await db.from("marketing_plan_slots").select("id,plan_key,title,hook,collection,kind,status,art").in("id", ids.slice(i,i+100));
    if (error) throw new Error(`Review source plans: ${error.message}`);
    for (const plan of data ?? []) plans.set(plan.id, plan);
  }
  const {data: campaigns, error} = await db.from("marketing_plans").select("key,status");
  if (error) throw new Error(`Review campaigns: ${error.message}`);
  const statuses = new Map((campaigns ?? []).map(p => [p.key, p.status]));
  const violations = candidates.some(p => p.channel === "instagram") ? await designSequenceCheck() : [];
  const result: (T & ReviewQualification)[] = [];
  for (const post of rows) {
    if (!candidates.includes(post)) { result.push({...post, review_ready:false, review_hold:null}); continue; }
    const plan = post.plan_slot_id ? plans.get(post.plan_slot_id) ?? null : null;
    let hold = reviewHold(post, plan, { today, planStatus: statuses.get(post.plan_key ?? plan?.plan_key ?? ""), sequenceError: violations.find(v => v.slot === post.plan_slot_id)?.reason });
    if (!hold) hold = await verifyLayoutFiles(plan?.art, post.media_urls, post.thumbnail_url, post.channel === "instagram");
    result.push({...post, review_ready: !hold, review_hold: hold});
  }
  return result;
}

export async function fetchReviewLedger(db: SupabaseClient = serviceClient()) {
  const rows: (ReviewPost & {created_at:string; published_at:string|null; product_handle:string|null; pillar:string|null; error:string|null})[] = [];
  // No arbitrary 200/400-row cutoff: the email and queue read the same ledger.
  for (let start = 0;; start += 1000) {
    const {data,error} = await db.from("marketing_posts")
      .select("id,status,channel,format,caption,media_urls,thumbnail_url,safety_passed,approved_at,regenerate_requested_at,plan_slot_id,plan_key,slot_key,created_at,published_at,product_handle,pillar,error")
      .or(`plan_key.is.null,plan_key.not.like.${PERSONAL_PLAN_PREFIX}%`)
      .neq("status","superseded").order("id").range(start,start+999);
    if (error) throw new Error(`Review posts: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  return qualifyReviewPosts(rows, db);
}
