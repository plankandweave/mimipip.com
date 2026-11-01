import { qualifyReviewPosts } from "@/lib/marketing/review-queue";
import { isPersonalPlan } from "@/lib/marketing/profiles";
// The write path for approval — the step the engine has been waiting on since
// 26 August.
//
// publishApproved() has always refused to post a slot without `approved_at` and
// a matching `approved_digest`, and nothing in this repo ever set them. The gate
// was real, the key did not exist, and 34 composed posts sat queued for a month
// while the dashboard described a "weekly batch approval" that had no button.
//
// Three actions, all founder-initiated:
//   approve    — sign this exact caption + these exact images, for its own day
//   reject     — this slot does not run; kept, not deleted, so the review can
//                show that it WAS rejected
//   regenerate — with a note, acted on now (applyNoteNow); without one, the
//                next tick composes it again and supersedes this row
//   posted     — LinkedIn only: an APPROVED post that was put up by hand
//                (until LinkedIn grants the page connection) is recorded as
//                published, with its link, so the calendar, the runway and
//                Astra's weekly brief all know it went out
//
// The seatbelt: the caller sends the digest of what it rendered on screen. The
// server recomputes the digest from the stored row and refuses when they differ
// — so an approval can only ever be for content the approver actually saw, not
// for whatever the row happened to contain by the time the click landed.
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { hasServiceRole, serviceClient } from "@/lib/marketing/db";
import { canApprove, canRevise, type ReviewableRow } from "@/lib/marketing/approval";
import { staffKey } from "@/lib/staff-key";
import { applyNoteNow } from "@/lib/marketing/pipeline";
import { activityUrnFromUrl } from "@/lib/marketing/linkedin-desk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Action = "approve" | "reject" | "regenerate" | "posted";
const ACTIONS: Action[] = ["approve", "reject", "regenerate", "posted"];

type Body = {
  key?: unknown;
  action?: unknown;
  /** One or more marketing_posts ids. A week is approved by sending seven. */
  ids?: unknown;
  /** Per-id digest of what the caller rendered: { [id]: digest }. Required for
   *  approve; ignored for reject/regenerate, which do not sign content. */
  digests?: unknown;
  /** Why, for reject/regenerate. Shown in the review. */
  reason?: unknown;
  /** Who — recorded on the row. Defaults to the signed-in staff identity. */
  by?: unknown;
  /** For "posted": the link to the post on LinkedIn. */
  url?: unknown;
};

async function keyOk(key: string): Promise<boolean> {
  const { data } = await supabase.rpc("intel_key_ok", { p_key: key });
  return !!data;
}

/** Cloudflare Access already gated the page (src/proxy.ts); it also tells us
 *  WHO, which is better provenance for "approved_by" than anything the client
 *  could claim. Falls back to whatever the caller named itself. */
function approver(req: Request, claimed: unknown): string {
  const email = req.headers.get("cf-access-authenticated-user-email");
  if (email) return email;
  return typeof claimed === "string" && claimed.trim() ? claimed.trim().slice(0, 120) : "admin";
}

type Outcome = { id: string; ok: boolean; status?: string; error?: string };

export async function POST(req: Request) {
  const url = new URL(req.url);
  const body = (await req.json().catch(() => null)) as Body | null;
  const key = await staffKey(req);
  if (!key || !(await keyOk(key))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hasServiceRole()) {
    // Without the service role the row cannot be written, and a 200 here would
    // tell the founder their week was approved when nothing was recorded.
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not set — approvals cannot be recorded" },
      { status: 503 },
    );
  }

  const action = body?.action;
  if (typeof action !== "string" || !ACTIONS.includes(action as Action)) {
    return NextResponse.json({ error: `action must be one of ${ACTIONS.join(", ")}` }, { status: 400 });
  }
  const ids = Array.isArray(body?.ids) ? body.ids.filter((i): i is string => typeof i === "string") : [];
  if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
  if (ids.length > 60) return NextResponse.json({ error: "too many ids in one call" }, { status: 400 });

  const digests = (body?.digests ?? {}) as Record<string, unknown>;
  const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : null;
  const who = approver(req, body?.by);
  const now = new Date().toISOString();
  const sb = serviceClient();

  const { data: rows, error } = await sb
    .from("marketing_posts")
    .select("id, plan_key, slot_key, status, channel, format, caption, media_urls, thumbnail_url, safety_passed, approved_at, regenerate_requested_at, plan_slot_id")
    .in("id", ids)
    .neq("status", "superseded");
  if (error) return NextResponse.json({ error: `read: ${error.message}` }, { status: 500 });

  const qualified = action === "approve" ? await qualifyReviewPosts(rows ?? [], sb).catch(() => null) : null;
  if (action === "approve" && !qualified) return NextResponse.json({error:"Review checks could not be completed. Nothing was approved."}, {status:503});
  const readiness = new Map((qualified ?? []).map(row => [row.id, row]));

  const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));
  const outcomes: Outcome[] = [];

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      outcomes.push({ id, ok: false, error: "not found (or already superseded)" });
      continue;
    }

    if (isPersonalPlan(row.plan_key) && (action === "approve" || action === "posted")) {
      outcomes.push({ id, ok: false, error: "Connect the personal publishing account before scheduling this creative." });
      continue;
    }

    if (action === "approve") {
      const ready = readiness.get(id);
      if (!ready?.review_ready) { outcomes.push({id,ok:false,error:ready?.review_hold ?? "This post is not ready for approval."}); continue; }
      const decision = canApprove(row as ReviewableRow, digests[id]);
      if (!decision.ok) {
        outcomes.push({ id, ok: false, error: decision.error });
        continue;
      }
      const current = decision.digest;
      const { error: upErr } = await sb
        .from("marketing_posts")
        .update({
          approved_at: now,
          approved_by: who,
          approved_digest: current,
          // Clear a previous regenerate request, or the next tick would
          // supersede the very row that was just approved.
          regenerate_requested_at: null,
          regenerate_requested_by: null,
          regenerate_reason: null,
        })
        .eq("id", id);
      if (upErr) outcomes.push({ id, ok: false, error: upErr.message });
      else outcomes.push({ id, ok: true, status: "approved" });
      continue;
    }

    if (action === "posted") {
      const link = typeof body?.url === "string" ? body.url.trim() : "";
      if ((row as { channel?: string }).channel !== "linkedin") {
        outcomes.push({ id, ok: false, error: "only a LinkedIn post can be marked as posted by hand" });
        continue;
      }
      if (!row.approved_at) {
        outcomes.push({ id, ok: false, error: "approve it first — only an approved post goes out" });
        continue;
      }
      if (row.status === "published") {
        outcomes.push({ id, ok: true, status: "already posted" });
        continue;
      }
      if (!/^https:\/\/(www\.)?linkedin\.com\//.test(link)) {
        outcomes.push({ id, ok: false, error: "paste the post's LinkedIn link (https://www.linkedin.com/…)" });
        continue;
      }
      const { error: upErr } = await sb
        .from("marketing_posts")
        .update({
          status: "published",
          published_at: now,
          // The activity URN when the link carries one, so the numbers can be
          // pulled for it once the connection lands; else the link itself.
          external_id: activityUrnFromUrl(link) ?? link,
          error: null,
        })
        .eq("id", id);
      if (upErr) outcomes.push({ id, ok: false, error: upErr.message });
      else outcomes.push({ id, ok: true, status: "posted" });
      continue;
    }

    if (action === "reject") {
      const decision = canRevise(row as ReviewableRow, "reject");
      if (!decision.ok) {
        outcomes.push({ id, ok: false, error: decision.error });
        continue;
      }
      const { error: upErr } = await sb
        .from("marketing_posts")
        .update({
          status: "skipped",
          approved_at: null,
          approved_by: null,
          approved_digest: null,
          error: reason ? `rejected by ${who}: ${reason}` : `rejected by ${who}`,
        })
        .eq("id", id);
      if (upErr) outcomes.push({ id, ok: false, error: upErr.message });
      else outcomes.push({ id, ok: true, status: "skipped" });
      continue;
    }

    // regenerate
    const decision = canRevise(row as ReviewableRow, "regenerate");
    if (!decision.ok) {
      outcomes.push({ id, ok: false, error: decision.error });
      continue;
    }
    const { error: upErr } = await sb
      .from("marketing_posts")
      .update({
        regenerate_requested_at: now,
        regenerate_requested_by: who,
        regenerate_reason: reason,
        // An approval cannot survive a request to rewrite the thing approved.
        approved_at: null,
        approved_by: null,
        approved_digest: null,
      })
      .eq("id", id);
    if (upErr) {
      outcomes.push({ id, ok: false, error: upErr.message });
      continue;
    }
    // With a note, act on it now rather than on the next hourly run — and for
    // a rotation post, at all: the old path discarded the note and wrote an
    // unrelated caption (see applyNoteNow).
    if (reason) {
      const applied = await applyNoteNow(id, reason).catch((e) => ({ done: "waiting" as const, why: (e as Error).message }));
      outcomes.push({
        id,
        ok: true,
        status:
          applied.done === "waiting"
            ? `regenerate requested — ${applied.why}`
            : applied.done === "caption"
              ? "caption updated"
              : applied.outcome.status === "failed"
                ? `sent back, but drawing it again failed: ${applied.outcome.error ?? "unknown"}`
                : "composed again",
      });
    } else outcomes.push({ id, ok: true, status: "regenerate requested" });
  }

  const ok = outcomes.filter((o) => o.ok).length;
  return NextResponse.json({ action, requested: ids.length, ok, outcomes });
}
