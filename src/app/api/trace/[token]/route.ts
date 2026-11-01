import { tracePlansEnabled } from "@/lib/trace-plan";
import { traceRequestId } from "@/lib/trace-request-id";
import { NextResponse, after } from "next/server";
import { draftWallsForWalk } from "@/lib/pulse-draft";
import { signArt } from "@/lib/corporate-files";
import { MAX_MARKS, MAX_PIECES, PIECE_SECONDS, MAX_WALK_SECONDS } from "@/lib/trace";
import {
  guardTraceRequest, touchTraceLink, walkOnLink,
  type TraceMarkRow, type TraceSegmentRow, type TraceWalkRow,
} from "@/lib/trace-link";

export const dynamic = "force-dynamic";

/** Short: a signed URL handed to an unauthenticated phone is public for its
 *  lifetime, so the walker's own thumbnails get minutes, not a day. */
const THUMB_TTL_S = 900;

// GET → what the phone may know: which campus, what was asked, and the walks
// already recorded on this link (so a second session continues the story).
// Nothing else: no documents, no designs, no people.
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const g = await guardTraceRequest(req, token, "open", { allowClosed: true });
  if (!g.ok) return NextResponse.json({ ok: false, state: g.state, error: g.error }, { status: g.status });
  const { link, blueprint, account, sb } = g.ctx;
  void touchTraceLink(link.id, true);

  const { data: walkRows } = await sb.from("trace_walks")
    .select("*").eq("link_id", link.id).order("started_at", { ascending: false }).limit(20);
  const walks = (walkRows ?? []) as TraceWalkRow[];
  const ids = walks.map((w) => w.id);
  const [{ data: segRows }, { data: markRows }] = ids.length
    ? await Promise.all([
        sb.from("trace_segments").select("walk_id, seq, seconds, video_path").in("walk_id", ids),
        sb.from("trace_marks").select("walk_id, seq, still_path").in("walk_id", ids),
      ])
    : [{ data: [] as Partial<TraceSegmentRow>[] }, { data: [] as Partial<TraceMarkRow>[] }];

  return NextResponse.json({
    ok: true,
    state: "ok",
    campus: { name: blueprint.name, city: blueprint.city },
    account: { name: account.name },
    recipient: link.recipient_name,
    brief: link.brief,
    expiresAt: link.expires_at,
    canUploadPlans: tracePlansEnabled(account),
    pieceSeconds: PIECE_SECONDS,
    maxPieces: MAX_PIECES,
    maxMarks: MAX_MARKS,
    walks: await Promise.all(walks.map(async (w) => {
      const segs = ((segRows ?? []) as Partial<TraceSegmentRow>[]).filter((s) => s.walk_id === w.id);
      const marks = ((markRows ?? []) as Partial<TraceMarkRow>[]).filter((m) => m.walk_id === w.id);
      const firstStill = marks.find((m) => m.still_path)?.still_path ?? null;
      return {
        id: w.id, walker: w.walker_name, where: w.where_label, status: w.status,
        startedAt: w.started_at, seconds: segs.reduce((n, s) => n + (s.seconds ?? 0), 0),
        pieces: segs.length, walls: marks.length,
        stillUrl: firstStill ? await signArt(sb, firstStill, THUMB_TTL_S) : null,
      };
    })),
  });
}

// POST { action: "start" | "mark" | "piece" | "end" }
//
// start  → a walk row BEFORE a frame is recorded, so every piece and tap has
//          somewhere to land if the phone dies.
// piece  → a piece row for seq n, before its files are uploaded (same idea).
// mark   → a tap: which piece, when in it, when in the walk.
// end    → the walk is over; its length is the sum of its pieces.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const b = await req.json().catch(() => ({})) as {
    action?: string; requestId?: string; walkId?: string; walkerName?: string; walkerPhone?: string; where?: string;
    seq?: number; atSeconds?: number; walkSeconds?: number; label?: string; seconds?: number;
  };
  const action = String(b.action ?? "");
  if (!["start", "mark", "piece", "end"].includes(action)) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
  const g = await guardTraceRequest(req, token, "write");
  if (!g.ok) return NextResponse.json({ ok: false, state: g.state, error: g.error }, { status: g.status });
  const { link, blueprint, account, sb } = g.ctx;
  void touchTraceLink(link.id);

  let requestRowId: string | null = null;
  try {
    if (action === "start" || action === "mark") {
      requestRowId = traceRequestId(action === "start" ? link.id : `${link.id}:${String(b.walkId ?? "")}`, action, b.requestId);
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid retry key." }, { status: 400 });
  }

  if (action === "start") {
    if (requestRowId) {
      const prior = await walkOnLink(sb, g.ctx, requestRowId);
      if (prior) return NextResponse.json({ ok: true, walkId: prior.id });
    }
    const walkerName = String(b.walkerName ?? "").trim().slice(0, 120) || link.recipient_name;
    const { data, error } = await sb.from("trace_walks").insert({
      ...(requestRowId ? { id: requestRowId } : {}),
      link_id: link.id, blueprint_id: blueprint.id, account_id: account.id,
      walker_name: walkerName || null,
      walker_phone: String(b.walkerPhone ?? "").trim().slice(0, 40) || null,
      where_label: String(b.where ?? "").trim().slice(0, 200) || null,
      status: "recording",
    }).select("id").single();
    if (error || !data) {
      // Another request may have committed while this one was in flight.
      if (requestRowId) {
        const prior = await walkOnLink(sb, g.ctx, requestRowId);
        if (prior) return NextResponse.json({ ok: true, walkId: prior.id });
      }
      console.error("[trace] start failed:", error?.message);
      return NextResponse.json({ ok: false, error: "Could not start the walk. Try again." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, walkId: data.id });
  }

  const walk = await walkOnLink(sb, g.ctx, String(b.walkId ?? ""));
  if (!walk) return NextResponse.json({ ok: false, error: "That walk isn't on this link." }, { status: 404 });
  const priorMark = async () => requestRowId
    ? (await sb.from("trace_marks").select("id, seq").eq("id", requestRowId).eq("walk_id", walk.id).maybeSingle()).data
    : null;
  if (action === "mark" && requestRowId) {
    const prior = await priorMark();
    if (prior) return NextResponse.json({ ok: true, markId: prior.id, seq: prior.seq });
  }
  if (walk.status === "ended" && action !== "end") {
    return NextResponse.json({ ok: false, error: "That walk has ended. Start a new one." }, { status: 409 });
  }

  if (action === "piece") {
    const seq = Math.round(Number(b.seq));
    if (!Number.isFinite(seq) || seq < 1 || seq > MAX_PIECES) {
      return NextResponse.json({ ok: false, error: `A walk is at most ${MAX_PIECES} pieces — end this one and start another.` }, { status: 413 });
    }
    const { data, error } = await sb.from("trace_segments")
      .upsert({ walk_id: walk.id, seq }, { onConflict: "walk_id,seq", ignoreDuplicates: true })
      .select("id").maybeSingle();
    if (error) {
      console.error("[trace] piece failed:", error.message);
      return NextResponse.json({ ok: false, error: "Could not open that piece." }, { status: 500 });
    }
    const id = (data?.id as string | undefined)
      ?? ((await sb.from("trace_segments").select("id").eq("walk_id", walk.id).eq("seq", seq).maybeSingle()).data?.id as string | undefined);
    return NextResponse.json({ ok: true, segmentId: id ?? null, seq });
  }

  if (action === "mark") {
    const { count } = await sb.from("trace_marks").select("id", { count: "exact", head: true }).eq("walk_id", walk.id);
    if ((count ?? 0) >= MAX_MARKS) {
      return NextResponse.json({ ok: false, error: `That is ${MAX_MARKS} walls — plenty for one walk.` }, { status: 413 });
    }
    const walkSeconds = Math.max(0, Math.min(MAX_WALK_SECONDS, Number(b.walkSeconds) || 0));
    const atSeconds = Math.max(0, Math.min(PIECE_SECONDS * 2, Number(b.atSeconds) || 0));
    const segmentSeq = Math.max(1, Math.min(MAX_PIECES, Math.round(Number(b.seq)) || 1));
    const label = String(b.label ?? "").trim().slice(0, 160) || null;
    // seq is assigned here and the unique index decides: two taps in flight
    // cannot both become wall 7.
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: last } = await sb.from("trace_marks").select("seq").eq("walk_id", walk.id)
        .order("seq", { ascending: false }).limit(1);
      const seq = ((last?.[0]?.seq as number | undefined) ?? 0) + 1;
      if (seq > MAX_MARKS) return NextResponse.json({ ok: false, error: "This walk has reached its wall limit." }, { status: 413 });
      const { data, error } = await sb.from("trace_marks").insert({
        ...(requestRowId ? { id: requestRowId } : {}),
        walk_id: walk.id, seq, segment_seq: segmentSeq,
        at_seconds: Math.round(atSeconds * 100) / 100, walk_seconds: Math.round(walkSeconds * 100) / 100, label,
      }).select("id").maybeSingle();
      if (data) return NextResponse.json({ ok: true, markId: data.id, seq });
      const prior = await priorMark();
      if (prior) return NextResponse.json({ ok: true, markId: prior.id, seq: prior.seq });
      if (error && !/duplicate key/i.test(error.message)) {
        console.error("[trace] mark failed:", error.message);
        break;
      }
    }
    return NextResponse.json({ ok: false, error: "Could not mark that wall." }, { status: 500 });
  }

  // end
  const { data: segs, error: readError } = await sb.from("trace_segments").select("seconds").eq("walk_id", walk.id);
  if (readError) return NextResponse.json({ ok: false, error: "Could not check the saved files. Retry." }, { status: 500 });
  const seconds = (segs ?? []).reduce((n, s) => n + ((s.seconds as number | null) ?? 0), 0);
  const { error: endError } = await sb.from("trace_walks").update({
    status: "ended", ended_at: new Date().toISOString(),
    seconds: Math.max(seconds, Math.min(MAX_WALK_SECONDS, Math.round(Number(b.seconds) || 0))),
  }).eq("id", walk.id);
  if (endError) return NextResponse.json({ ok: false, error: "Could not finish the receipt. Retry." }, { status: 500 });
  // The taps become walls on the Pulse board once the phone has its answer;
  // the walker never waits on it, and the Vault retries anything that fails.
  after(() => draftWallsForWalk(sb, walk.id).catch((e) => console.error("[trace] draft after end:", (e as Error)?.message)));
  return NextResponse.json({ ok: true });
}
