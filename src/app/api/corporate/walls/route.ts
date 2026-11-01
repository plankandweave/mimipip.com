import { NextResponse } from "next/server";
import { caRemove } from "@/lib/corporate-art-store";
import { recordAudit, wallSizeRejection } from "@/lib/corporate-auth";
import { signArt } from "@/lib/corporate-files";
import { ensureAreaBatch, guardCapture, MAX_WALLS, nextSeq } from "@/lib/portfolio-capture";

export const dynamic = "force-dynamic";

/**
 * The walls inside one space.
 *
 * GET  ?areaId=…            → the space's open survey and its walls
 * POST { action: "save" }   → add or update one wall
 * POST { action: "delete" } → remove one wall
 *
 * Photos and voice notes have their own routes, because both are two-step: the
 * bytes go straight to storage and never through a function here.
 *
 * A wall is saved BEFORE its photo or recording is attached, deliberately. The
 * measurements are the part that cannot be recovered from a phone that has left
 * the building; an upload that fails on a lift-lobby connection has to be a
 * retry against a wall that already exists, not a lost wall.
 */

const PREVIEW_TTL_S = 900;

type WallRow = {
  id: string; seq: number; name: string; room: string | null;
  width_mm: number; height_mm: number;
  photo_path: string | null; photo_error: string | null;
  notes: string | null; brief: string | null;
  voice_path: string | null; voice_seconds: number | null;
  voice_transcript: string | null; voice_error: string | null;
};

const text = (v: unknown, max: number) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

export async function GET(req: Request) {
  const areaId = new URL(req.url).searchParams.get("areaId") ?? "";
  const g = await guardCapture(areaId);
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { sb, area } = g.ctx;

  // Read-only: the survey is NOT created here. Opening a space to look at it
  // must not put an empty survey on the board.
  const { data: batch } = await sb.from("corporate_site_batches")
    .select("id, status, released_at").eq("area_id", area.id)
    .eq("status", "collecting").maybeSingle();

  if (!batch) {
    return NextResponse.json({ ok: true, area, walls: [], batchId: null, released: false });
  }

  const { data: rows, error } = await sb.from("corporate_site_batch_walls")
    .select("id, seq, name, room, width_mm, height_mm, photo_path, photo_error, notes, brief, voice_path, voice_seconds, voice_transcript, voice_error")
    .eq("batch_id", batch.id).order("seq");
  if (error) {
    console.error("[corporate/walls] list failed:", error.message);
    return NextResponse.json({ ok: false, error: "Could not load these walls." }, { status: 500 });
  }

  // Signed one at a time rather than in a burst: a space is capped at forty
  // walls, and a signed URL cannot be cached anyway.
  const walls = await Promise.all(((rows ?? []) as WallRow[]).map(async (w) => ({
    ...w,
    photoUrl: w.photo_path ? await signArt(sb, w.photo_path, PREVIEW_TTL_S) : null,
    voiceUrl: w.voice_path ? await signArt(sb, w.voice_path, PREVIEW_TTL_S) : null,
  })));

  return NextResponse.json({
    ok: true, area, walls,
    batchId: batch.id as string,
    released: Boolean(batch.released_at),
  });
}

export async function POST(req: Request) {
  let b: {
    action?: string; areaId?: string; seq?: number;
    name?: string; widthMm?: number; heightMm?: number;
    notes?: string; brief?: string;
  };
  try { b = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const g = await guardCapture(String(b.areaId ?? ""));
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { sb, area, session } = g.ctx;

  const batchId = await ensureAreaBatch(g.ctx);
  if (!batchId) {
    return NextResponse.json({ ok: false, error: "Could not open a survey for this space." }, { status: 500 });
  }

  // A released survey is being designed against. Letting a wall change under it
  // would mean the proposal on someone's screen no longer describes the walls
  // it was built from.
  const { data: batch } = await sb.from("corporate_site_batches")
    .select("released_at").eq("id", batchId).maybeSingle();
  if (batch?.released_at) {
    return NextResponse.json({
      ok: false,
      error: "This space has been sent for design. Ask us to reopen it before changing a wall.",
    }, { status: 409 });
  }

  // ── Delete ───────────────────────────────────────────────────────────────
  // seq is left with a hole rather than renumbering the walls after it. The
  // photo and recording are addressed by seq, and shifting the numbers would
  // silently re-point every one of them at the wrong wall.
  if (b.action === "delete") {
    const seq = Math.round(Number(b.seq));
    if (!Number.isFinite(seq)) {
      return NextResponse.json({ ok: false, error: "Which wall?" }, { status: 400 });
    }
    const { data: gone } = await sb.from("corporate_site_batch_walls")
      .delete().eq("batch_id", batchId).eq("seq", seq)
      .select("id, name, photo_path, voice_path").maybeSingle();
    if (!gone) return NextResponse.json({ ok: false, error: "That wall is already gone." }, { status: 404 });

    // Take the files out too — an orphaned object in a shared bucket is storage
    // nobody will ever reclaim by hand.
    const orphans = [gone.photo_path, gone.voice_path].filter(Boolean) as string[];
    if (orphans.length) await caRemove(orphans);

    await recordAudit(session, "wall.delete", { type: "area", id: area.id },
      { seq, name: gone.name });
    return NextResponse.json({ ok: true, deleted: seq });
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  const widthMm = Math.round(Number(b.widthMm));
  const heightMm = Math.round(Number(b.heightMm));
  // The authoritative size check, and the one that has to hold: a wall stored
  // with height 0 makes the allocator assign the entire library to it. Same
  // function the measurement link uses, so both doors agree on what a wall is.
  const bad = wallSizeRejection(widthMm, heightMm);
  if (bad) return NextResponse.json({ ok: false, error: bad }, { status: 400 });

  const name = text(b.name, 160);
  if (!name) {
    return NextResponse.json({ ok: false, error: "Name the wall — 'facing the entrance', 'behind reception'." }, { status: 400 });
  }

  const patch = {
    name,
    width_mm: widthMm,
    height_mm: heightMm,
    notes: text(b.notes, 2000),
    brief: text(b.brief, 4000),
    // The space this wall is in, denormalised onto the wall the way the
    // measurement link writes a room name — the allocator reads it from here.
    room: area.floor ? `${area.floor} · ${area.name}` : area.name,
  };

  // Update an existing wall.
  if (Number.isFinite(Number(b.seq))) {
    const seq = Math.round(Number(b.seq));
    const { data: saved, error } = await sb.from("corporate_site_batch_walls")
      .update(patch).eq("batch_id", batchId).eq("seq", seq)
      .select("id, seq").maybeSingle();
    if (error || !saved) {
      console.error("[corporate/walls] update failed:", error?.message);
      return NextResponse.json({ ok: false, error: "Could not save that wall." }, { status: error ? 500 : 404 });
    }
    await recordAudit(session, "wall.update", { type: "area", id: area.id }, { seq, name });
    return NextResponse.json({ ok: true, seq, batchId });
  }

  // Add a new one.
  const { count } = await sb.from("corporate_site_batch_walls")
    .select("id", { count: "exact", head: true }).eq("batch_id", batchId);
  if ((count ?? 0) >= MAX_WALLS) {
    return NextResponse.json({
      ok: false,
      error: `A space holds ${MAX_WALLS} walls. Add another space for the rest.`,
    }, { status: 409 });
  }

  // seq is assigned server-side, never taken from the caller: two phones adding
  // a wall at once must not both claim wall 7. The unique index on
  // (batch_id, seq) is what actually decides, so a collision is retried rather
  // than trusted away.
  for (let attempt = 0; attempt < 4; attempt++) {
    const seq = await nextSeq(sb, batchId);
    const { data: created, error } = await sb.from("corporate_site_batch_walls")
      .insert({ batch_id: batchId, seq, ...patch })
      .select("id, seq").maybeSingle();
    if (created) {
      await recordAudit(session, "wall.create", { type: "area", id: area.id }, { seq, name });
      return NextResponse.json({ ok: true, seq: created.seq as number, batchId });
    }
    if (error && !/duplicate key/i.test(error.message)) {
      console.error("[corporate/walls] create failed:", error.message);
      return NextResponse.json({ ok: false, error: "Could not add that wall." }, { status: 500 });
    }
  }
  return NextResponse.json({
    ok: false, error: "Two people are adding walls at once — try that again.",
  }, { status: 409 });
}
