import { qualifyReviewPosts } from "@/lib/marketing/review-queue";
import { designSequenceCheck } from "@/lib/marketing/plan";
import { belongsToProfile, PERSONAL_PLAN_PREFIX } from "@/lib/marketing/profiles";
import { NextResponse } from "next/server";
import { sceneMatchesRoom, chooseLeadScene } from "@/lib/marketing/pipeline";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { hasServiceRole, serviceClient } from "@/lib/marketing/db";
import { listPlans, planSlotsBetween, reelSequenceSlots, slotKeyOf, type PlanSlot } from "@/lib/marketing/plan";
import { describeViolation, reelSequenceViolations } from "@/lib/marketing/reel-sequence";
import { logicalDayKey } from "@/lib/dailyRotation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The desk's one read: every plan, every intended post in a date range, and
// for each the composed result (if any) and a catalogue picture to stand in
// until it is composed. Joined here, on the server, so the page draws a grid
// and a calendar from one shape rather than reconciling three.

export type DeskPost = {
  review_ready?: boolean;
  review_hold?: string | null;
  id: string;
  status: string;
  channel: string;
  format: string;
  caption: string | null;
  media_urls: string[];
  thumbnail_url: string | null;
  safety_passed: boolean;
  safety_issues: { severity: string; code: string; detail: string }[] | null;
  approved_at: string | null;
  approved_by: string | null;
  regenerate_requested_at: string | null;
  regenerate_reason: string | null;
  published_at: string | null;
  external_id: string | null;
  error: string | null;
  metrics: Record<string, number> | null;
  product_handle: string | null;
  pillar: string | null;
  /** Reels only: false = posts off the profile grid (share_to_feed). */
  share_to_feed: boolean | null;
};

export type DeskSlot = PlanSlot & {
  design_sequence_error?: string | null;
  slot_key: string;
  post: DeskPost | null;
  /** A catalogue picture for a slot not yet composed: the first room render,
   *  else the flat artwork. */
  preview: string | null;
  flat: string | null;
  /** True for a post the rotation made outside any plan. */
  unplanned?: boolean;
};

const POST_COLS =
  "id, status, channel, format, caption, media_urls, thumbnail_url, safety_passed, safety_issues, approved_at, approved_by, regenerate_requested_at, regenerate_reason, published_at, external_id, error, metrics, product_handle, pillar, share_to_feed, slot_key, plan_slot_id, plan_key";

export async function GET(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return notStaff();
  if (!hasServiceRole()) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set — the plan cannot be read" }, { status: 503 });
  }

  const url = new URL(req.url);
  const today = logicalDayKey();
  const profile = url.searchParams.get("profile") === "roheena" ? "roheena" : "zyvorah";
  // Unscheduled personal ideas remain visible after the brand calendar moves on.
  const from = url.searchParams.get("from") ?? (profile === "roheena" ? "2026-09-27" : shiftDays(today, -45));
  const to = url.searchParams.get("to") ?? (profile === "roheena" ? "2100-12-31" : shiftDays(today, 100));
  const includeRemoved = url.searchParams.get("removed") === "1";

  const sb = serviceClient();
  const [allPlans, allSlots, postsRes, statsRes] = await Promise.all([
    listPlans(),
    planSlotsBetween(from, to, { includeRemoved, profile }),
    sb
      .from("marketing_posts")
      .select(POST_COLS)
      .or(profile === "roheena" ? `plan_key.like.${PERSONAL_PLAN_PREFIX}%` : `plan_key.is.null,plan_key.not.like.${PERSONAL_PLAN_PREFIX}%`)
      .neq("status", "superseded")
      .gte("slot_key", `${from}#0`)
      .lte("slot_key", `${to}#~`)
      .order("slot_key", { ascending: true }),
    // The LinkedIn page's follower count, one row a day (the 09:30 run).
    sb
      .from("marketing_channel_stats")
      .select("channel, day_key, followers")
      .gte("day_key", shiftDays(today, -120))
      .order("day_key", { ascending: true }),
  ]);
  if (postsRes.error) return NextResponse.json({ error: postsRes.error.message }, { status: 500 });
  const plans = allPlans.filter((p) => belongsToProfile(p.key, profile));
  const slots = allSlots.filter((s) => belongsToProfile(s.plan_key, profile));
  const rawPosts = ((postsRes.data ?? []) as (DeskPost & { slot_key: string; plan_slot_id: string | null; plan_key: string | null })[]).filter((p) => belongsToProfile(p.plan_key, profile));

  let posts: typeof rawPosts;
  try { posts = await qualifyReviewPosts(rawPosts, sb); }
  catch { posts = rawPosts.map(p => ({...p,review_ready:false,review_hold:"Review checks could not be completed."})); }

  // Catalogue stand-ins for every design named in the range.
  const handles = [...new Set([...slots.map((s) => s.handle), ...posts.map((p) => p.product_handle)].filter((h): h is string => !!h))];
  const preview = new Map<string, { scenes: string[]; flat: string | null }>();
  if (handles.length) {
    const { data: prods } = await sb
      .from("products")
      .select("handle, product_images ( url, is_flat, position )")
      .in("handle", handles);
    for (const p of (prods ?? []) as { handle: string; product_images: { url: string; is_flat: boolean; position: number }[] }[]) {
      const imgs = [...(p.product_images ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      preview.set(p.handle, {
        scenes: imgs.filter((i) => !i.is_flat).map((i) => i.url),
        flat: imgs.find((i) => i.is_flat)?.url ?? null,
      });
    }
  }
  // The stand-in a planned-not-composed tile shows must be the render the
  // composer will actually lead with — the slot's named room, or the chapter
  // rotation's pick — never the catalogue's first image. On 25 Sep 2026 three
  // Katha designs whose first render shares one template all previewed as the
  // same gold hare on a plinth, and the founder read the week as "identical".
  const previewFor = (s: { handle: string | null; art: Record<string, unknown> | null }): { scene: string | null; flat: string | null } => {
    const pv = s.handle ? preview.get(s.handle) : undefined;
    // A slot with no catalogue design but its own picture (A Life Collected's
    // concept rooms: art.image_url) must show that picture before it is
    // composed. Without this the whole serial rendered as blank tiles and read
    // as "missing" (founder, 26 Sep 2026).
    const own = typeof s.art?.image_url === "string" && /^https:\/\//.test(s.art.image_url as string)
      ? (s.art.image_url as string)
      : null;
    if (!pv) return { scene: own, flat: null };
    // A picture the founder pinned with the grid-frame tool (art.scene_url)
    // outranks everything: the tool showed her this render and her saved
    // window applies to it, so the stand-in must keep showing the same one.
    const pinned = typeof s.art?.scene_url === "string" && pv.scenes.includes(s.art.scene_url as string)
      ? (s.art.scene_url as string)
      : null;
    const room = typeof s.art?.scene === "string" ? (s.art.scene as string) : null;
    const scene =
      pinned ??
      (room ? pv.scenes.find((u) => sceneMatchesRoom(u, room)) : undefined) ??
      chooseLeadScene(pv.scenes) ??
      null;
    return { scene, flat: pv.flat };
  };

  const byPlanSlot = new Map<string, typeof posts[number]>();
  const byKey = new Map<string, typeof posts[number]>();
  for (const p of posts) {
    // A syndicated Short keeps its source pointer for holds, but must not
    // replace the Instagram receipt on the source plan card.
    if (p.plan_slot_id) byPlanSlot.set(`${p.plan_slot_id}:${p.channel}`, p);
    // The key fallback exists for rotation posts composed before the plan
    // pointer existed — posts that belong to NO slot. A post that carries a
    // pointer to a DIFFERENT slot is another plan's history, and attaching it
    // by day put an archived plan's dead frames on top of the live plan's
    // tiles: on 25 Sep 2026 the founder's Katha and Stallion weeks rendered as
    // identity-q4's skipped ocean and bedroom, and she read the grid, rightly,
    // as "random again".
    if (!p.plan_slot_id) byKey.set(p.slot_key, p);
  }

  const claimed = new Set<string>();
  const out: DeskSlot[] = slots.map((s) => {
    const key = slotKeyOf(s);
    // Match by the pointer first, then by key (rows composed before the
    // pointer existed, or by the static calendar).
    const post = byPlanSlot.get(`${s.id}:${s.channel}`) ?? (s.status !== "removed" ? byKey.get(key) : undefined) ?? null;
    if (post) claimed.add(post.id);
    const pv = previewFor(s);
    return {
      ...s,
      slot_key: key,
      post: post ? strip(post) : null,
      preview: pv.scene ?? pv.flat ?? null,
      flat: pv.flat,
    };
  });

  // What the rotation made on days no plan covers — shown so the grid is the
  // truth, not just the plan.
  for (const p of posts) {
    if (claimed.has(p.id)) continue;
    if (p.status === "skipped") continue;
    const day = p.slot_key.split("#")[0];
    // parseInt, not Number: a YouTube Short's key is "<day>#<n>~yt".
    const seq = parseInt(p.slot_key.split("#")[1] ?? "0", 10) || 0;
    const pv = previewFor({ handle: p.product_handle ?? null, art: null });
    out.push({
      id: `post:${p.id}`,
      plan_key: "",
      day_key: day,
      seq,
      channel: (p.channel as DeskSlot["channel"]) ?? "instagram",
      kind: (p.format as DeskSlot["kind"]) ?? "feed",
      beat: null,
      collection: null,
      handle: p.product_handle,
      title: p.product_handle,
      devanagari: null,
      meaning: null,
      price: null,
      hook: null,
      caption: p.caption,
      visual_brief: null,
      cta: null,
      art: { pillar: p.pillar },
      status: "planned",
      comments: [],
      removed_at: null,
      removed_by: null,
      created_at: "",
      updated_at: "",
      slot_key: p.slot_key,
      post: strip(p),
      preview: pv?.scene ?? pv?.flat ?? null,
      flat: pv?.flat ?? null,
      unplanned: true,
    });
  }
  out.sort((a, b) => (a.day_key === b.day_key ? a.seq - b.seq : a.day_key < b.day_key ? -1 : 1));

  let removedCount = 0;
  if (!includeRemoved && plans.length) {
    const { count } = await sb
      .from("marketing_plan_slots")
      .select("id", { count: "exact", head: true })
      .eq("status", "removed")
      .in("plan_key", plans.map((p) => p.key))
      .gte("day_key", from)
      .lte("day_key", to);
    removedCount = count ?? 0;
  }

  // A missing stats table must not take the desk down with it.
  const channelStats = profile === "roheena" || statsRes.error ? [] : (statsRes.data ?? []);

  // The Library-reel rule, checked on every desk read: a breach the hourly run
  // is holding shows here with its fix. One already published is history.
  let reelSequence: { slot: string; swap_with: string | null; line: string }[] = [];
  if (profile === "zyvorah") {
    try {
      const seq = await reelSequenceSlots();
      const done = new Set(seq.filter((s) => s.published).map((s) => slotKeyOf(s)));
      reelSequence = reelSequenceViolations(seq)
        .filter((v) => !done.has(v.slot))
        .map((v) => ({ slot: v.slot, swap_with: v.swap_with, line: describeViolation(v) }));
    } catch (e) {
      reelSequence = [{ slot: "", swap_with: null, line: `the reel sequence could not be checked: ${(e as Error).message}` }];
    }
  }

  if (profile === "zyvorah") {
    try {
      const violations = await designSequenceCheck();
      for(const slot of out) slot.design_sequence_error = violations.find(v=>v.slot===slot.id)?.reason ?? null;
    } catch(e) {
      for(const slot of out) slot.design_sequence_error = `Design sequence could not be verified: ${(e as Error).message}`;
    }
  }
  return NextResponse.json({ today, from, to, plans, slots: out, removedCount, channelStats, reelSequence });
}

function strip(p: DeskPost & { slot_key?: string; plan_slot_id?: string | null }): DeskPost {
  const rest = { ...p };
  delete rest.slot_key;
  delete rest.plan_slot_id;
  return rest;
}

function shiftDays(dayKey: string, n: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
