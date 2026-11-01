import { NextResponse } from "next/server";
import { caRemove, caSignedUrl } from "@/lib/corporate-art-store";
import { MAX_MARKS, MAX_VIDEO_SECONDS, MAX_WALKS } from "@/lib/prospect-walk";
import {
  guardWalkRequest, touchWalkLink, walkOfLink, type ProspectMarkRow, type ProspectWalkRow,
} from "@/lib/prospect-walk-server";

export const dynamic = "force-dynamic";

/**
 * The guest walkthrough link, for a prospect with no account.
 *
 * GET                       → the link's shell (company, brief, state) and its walks
 * POST { action: "start" }  → open a walk, BEFORE recording begins
 * POST { action: "mark" }   → a tap on "This wall": when in the walk
 * POST { action: "note" }   → a typed note on a walk, or a label on one mark
 * POST { action: "delete" } → drop a walk and its files
 *
 * Authority comes from the token in the path and nothing else. No prices, no
 * catalogue, no partner data: the response carries the company name the OS
 * gave us and the walker's own recordings.
 *
 * The walk row exists before a frame is recorded, so every tap and every file
 * is addressed by an id that already exists — a phone that dies mid-walk has
 * still saved every wall it marked.
 */

const STILL_TTL_S = 900;

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const g = await guardWalkRequest(req, token, "open", { allowClosed: true });
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error, state: g.state }, { status: g.status });
  const { sb, link, state } = g.ctx;
  await touchWalkLink(sb, link, true);

  const { data: rows } = await sb.from("prospect_walks")
    .select("*").eq("link_id", link.id).order("created_at");
  const walks = (rows ?? []) as ProspectWalkRow[];
  const ids = walks.map((w) => w.id);
  const { data: markRows } = ids.length
    ? await sb.from("prospect_walk_marks").select("*").in("walk_id", ids).order("seq")
    : { data: [] as ProspectMarkRow[] };

  const out = await Promise.all(walks.map(async (w) => ({
    id: w.id,
    seconds: w.video_seconds,
    hasVideo: Boolean(w.video_path),
    videoError: w.video_error,
    note: w.note,
    submittedAt: w.submitted_at,
    marks: await Promise.all(((markRows ?? []) as ProspectMarkRow[])
      .filter((m) => m.walk_id === w.id)
      .map(async (m) => ({
        seq: m.seq,
        atSeconds: Number(m.at_seconds),
        label: m.label,
        stillUrl: m.still_path ? await caSignedUrl(m.still_path, STILL_TTL_S) : null,
      }))),
  })));

  return NextResponse.json({
    ok: true,
    state,
    company: link.company_name,
    recipientName: link.recipient_name,
    brief: link.brief,
    expiresAt: link.expires_at,
    submittedAt: link.submitted_at,
    maxSeconds: MAX_VIDEO_SECONDS,
    maxMarks: MAX_MARKS,
    maxWalks: MAX_WALKS,
    walks: out,
  }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const b = await req.json().catch(() => null) as {
    action?: string; id?: string; seq?: number; atSeconds?: number; note?: string; label?: string;
  } | null;
  if (!b) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });

  const g = await guardWalkRequest(req, token, "write");
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error, state: g.state }, { status: g.status });
  const { sb, link } = g.ctx;
  const action = String(b.action ?? "");

  if (action === "start") {
    const { count } = await sb.from("prospect_walks")
      .select("id", { count: "exact", head: true }).eq("link_id", link.id);
    if ((count ?? 0) >= MAX_WALKS) {
      return NextResponse.json({ ok: false, error: `This link holds ${MAX_WALKS} walks. Send these to Zyvorah, and we will send another link for the rest.` }, { status: 409 });
    }
    const { data, error } = await sb.from("prospect_walks").insert({ link_id: link.id }).select("id").single();
    if (error || !data) {
      console.error("[walk] start failed:", error?.message);
      return NextResponse.json({ ok: false, error: "Could not start the walk." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: data.id as string });
  }

  const walk = await walkOfLink(sb, link.id, b.id);
  if (!walk) return NextResponse.json({ ok: false, error: "That walk isn't on this link." }, { status: 404 });

  if (action === "delete") {
    const { data: marks } = await sb.from("prospect_walk_marks").select("still_path").eq("walk_id", walk.id);
    const paths = [walk.video_path, walk.audio_path, ...((marks ?? []).map((m) => m.still_path as string | null))]
      .filter(Boolean) as string[];
    if (paths.length) await caRemove(paths);
    await sb.from("prospect_walks").delete().eq("id", walk.id);
    return NextResponse.json({ ok: true, deleted: walk.id });
  }

  if (action === "note") {
    const text = String(b.note ?? b.label ?? "").trim().slice(0, 2000) || null;
    if (b.seq != null) {
      await sb.from("prospect_walk_marks").update({ label: text?.slice(0, 200) ?? null })
        .eq("walk_id", walk.id).eq("seq", Number(b.seq));
    } else {
      await sb.from("prospect_walks").update({ note: text }).eq("id", walk.id);
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "mark") {
    const { count } = await sb.from("prospect_walk_marks")
      .select("id", { count: "exact", head: true }).eq("walk_id", walk.id);
    if ((count ?? 0) >= MAX_MARKS) {
      return NextResponse.json({ ok: false, error: `A walk holds ${MAX_MARKS} walls. Finish this one and start another.` }, { status: 409 });
    }
    const atSeconds = Math.max(0, Math.min(MAX_VIDEO_SECONDS * 2, Number(b.atSeconds) || 0));
    // seq is assigned here, never taken from the caller; the unique index decides.
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: last } = await sb.from("prospect_walk_marks")
        .select("seq").eq("walk_id", walk.id).order("seq", { ascending: false }).limit(1);
      const seq = ((last?.[0]?.seq as number | undefined) ?? 0) + 1;
      const { data: created, error } = await sb.from("prospect_walk_marks")
        .insert({ walk_id: walk.id, seq, at_seconds: atSeconds }).select("seq").maybeSingle();
      if (created) return NextResponse.json({ ok: true, seq: created.seq as number });
      if (error && !/duplicate key/i.test(error.message)) {
        console.error("[walk] mark failed:", error.message);
        return NextResponse.json({ ok: false, error: "Could not mark that wall." }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: false, error: "Could not mark that wall — try again." }, { status: 409 });
  }

  return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
}
