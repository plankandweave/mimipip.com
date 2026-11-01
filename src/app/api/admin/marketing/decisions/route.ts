// The founder's decision page (/admin/marketing/decisions).
//
// GET  — every upcoming Diwali post that waits on HER, with its picture and
//        the one decision it needs (owner-decisions.ts), plus the posts that
//        wait on production, listed so she can see them but never asked.
// POST — her answer:
//   approve      — "go ahead with this design / this film matches": her holds
//                  are cleared, and a post with nothing else held is drawn
//                  again in the measured house frame, then waits on the review
//                  page for her final yes. Nothing is approved here.
//   set-product  — "this post sells that wallpaper": the design is set, her
//                  holds are cleared, and the post is drawn the same way.
//   remove       — "don't run this": the plan item is removed and its post
//                  skipped (removeSlot), kept, never deleted.
// Every answer is recorded on the plan item (art.owner_decisions).
import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { hasServiceRole, serviceClient } from "@/lib/marketing/db";
import { planSlotById, removeSlot } from "@/lib/marketing/plan";
import { composePlanSlot } from "@/lib/marketing/pipeline";
import { loadCandidates } from "@/lib/marketing/select";
import { blockersAfterAnswer, decisionFor } from "@/lib/marketing/owner-decisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// An answer redraws one post inside the request.
export const maxDuration = 300;

const DECISION_PLAN = "diwali-owner-review-20261002";

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const blockersOf = (art: Record<string, unknown>) =>
  Array.isArray(art.blockers) ? art.blockers.filter((b): b is string => typeof b === "string" && !!b.trim()) : [];
const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

export async function GET(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  if (!hasServiceRole()) return NextResponse.json({ error: "Decisions cannot be read right now." }, { status: 503 });
  const sb = serviceClient();
  const { data: slots, error } = await sb
    .from("marketing_plan_slots")
    .select("id, day_key, seq, kind, status, handle, title, collection, caption, art")
    .eq("plan_key", DECISION_PLAN)
    .gte("day_key", todayIst())
    .neq("status", "removed")
    .order("day_key")
    .order("seq");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = (slots ?? []).map((s) => s.id as string);
  const { data: posts } = ids.length
    ? await sb
        .from("marketing_posts")
        .select("plan_slot_id, status, approved_at, thumbnail_url, media_urls")
        .in("plan_slot_id", ids)
        .neq("status", "superseded")
    : { data: [] as Record<string, unknown>[] };
  const postBySlot = new Map((posts ?? []).map((p) => [p.plan_slot_id as string, p]));

  const items = [];
  for (const s of slots ?? []) {
    const post = postBySlot.get(s.id as string);
    // Approved or already gone out: nothing left to decide.
    if (post?.approved_at || post?.status === "published") continue;
    const art = (s.art ?? {}) as Record<string, unknown>;
    const decision = decisionFor({ format: s.kind as string, blockers: blockersOf(art) });
    const media = Array.isArray(post?.media_urls) ? (post.media_urls as string[]) : [];
    items.push({
      id: s.id,
      day: s.day_key,
      format: s.kind,
      title: s.title ?? s.handle ?? "Untitled",
      collection: s.collection,
      handle: s.handle,
      caption: s.caption,
      picture: str(post?.thumbnail_url) ?? media[0] ?? str(art.review_image_url) ?? str(art.review_poster_url),
      pictures: media.filter((u) => !/\.(mp4|mov)(\?|$)/i.test(u)).slice(0, 6),
      film: str(art.review_video_url) ?? media.find((u) => /\.(mp4|mov)(\?|$)/i.test(u)) ?? null,
      decided: Array.isArray(art.owner_decisions) && art.owner_decisions.length > 0,
      ...decision,
    });
  }
  const needsProducts = items.some((i) => i.kind === "choose-product");
  const products = needsProducts
    ? (await loadCandidates().catch(() => []))
        .filter((c) => c.sceneUrls.length)
        .map((c) => ({ handle: c.handle, title: c.title, picture: c.sceneUrls[0] }))
        .sort((a, b) => a.title.localeCompare(b.title))
    : [];
  return NextResponse.json({ items, products }, { headers: { "cache-control": "no-store" } });
}

type Body = { id?: unknown; action?: unknown; handle?: unknown };

export async function POST(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return notStaff();
  if (!hasServiceRole()) return NextResponse.json({ error: "Your answer cannot be recorded right now." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Body | null;
  const id = str(body?.id);
  const action = str(body?.action);
  if (!id || !action || !["approve", "set-product", "remove"].includes(action)) {
    return NextResponse.json({ error: "id and action (approve, set-product, remove) required" }, { status: 400 });
  }
  const slot = await planSlotById(id);
  if (!slot || slot.plan_key !== DECISION_PLAN) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (slot.status === "removed") return NextResponse.json({ error: "This post was already removed." }, { status: 409 });

  if (action === "remove") {
    await removeSlot(id, staff.email, "not running this (decisions page)");
    return NextResponse.json({ ok: true, message: "Removed. It will not run." });
  }

  let handle = slot.handle;
  if (action === "set-product") {
    handle = str(body?.handle)?.toLowerCase() ?? null;
    if (!handle) return NextResponse.json({ error: "choose a wallpaper" }, { status: 400 });
    const known = (await loadCandidates()).some((c) => c.handle === handle);
    if (!known) return NextResponse.json({ error: "That wallpaper is not in the catalogue." }, { status: 400 });
  }

  const before = blockersOf(slot.art);
  const decision = decisionFor({ format: slot.kind, blockers: before });
  if (decision.kind === "production") {
    return NextResponse.json({ error: "Nothing here is yours to decide; production is finishing it." }, { status: 409 });
  }
  const now = new Date().toISOString();
  const blockers = blockersAfterAnswer(before);
  const record = { at: now, by: staff.email, decision: decision.kind, action, handle, cleared: before.filter((b) => !blockers.includes(b)) };
  const art: Record<string, unknown> = {
    ...slot.art,
    blockers,
    owner_decisions: [...(Array.isArray(slot.art.owner_decisions) ? slot.art.owner_decisions : []), record],
    ...(handle && action === "set-product" ? { product_url: `https://zyvorah.com/products/${handle}` } : {}),
  };
  const sb = serviceClient();
  const { error } = await sb
    .from("marketing_plan_slots")
    .update({ art, ...(action === "set-product" ? { handle } : {}), updated_at: now })
    .eq("id", id);
  if (error) return NextResponse.json({ error: `record: ${error.message}` }, { status: 500 });

  if (blockers.length) {
    return NextResponse.json({ ok: true, message: "Recorded. Production is finishing the rest; it comes to your review page when ready." });
  }
  // Nothing held any more: draw it again now, in the measured house frame.
  // The old picture (if any) is marked for redraw so the composer replaces it
  // instead of treating the slot as done.
  await sb
    .from("marketing_posts")
    .update({ regenerate_requested_at: now, regenerate_requested_by: staff.email, regenerate_reason: `owner decision: ${decision.kind}` })
    .eq("plan_slot_id", id)
    .is("approved_at", null)
    .in("status", ["queued", "failed"]);
  try {
    const out = await composePlanSlot(id);
    if (out.status !== "queued" || out.error) {
      return NextResponse.json({ ok: true, message: `Recorded. The new picture did not draw yet (${out.error ?? out.status}); we are on it.` });
    }
    return NextResponse.json({ ok: true, message: "Done. The new picture is on your review page for a final yes." });
  } catch (e) {
    return NextResponse.json({ ok: true, message: `Recorded. The new picture did not draw yet (${e instanceof Error ? e.message : "error"}); we are on it.` });
  }
}
