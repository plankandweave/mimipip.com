import { NextResponse } from "next/server";
import { caRemove } from "@/lib/corporate-art-store";
import { wallSizeRejection } from "@/lib/corporate-auth";
import { ensureDraftBatch, guardMeasureRequest, touchLink, MAX_WALLS } from "@/lib/measure-link";

export const dynamic = "force-dynamic";

// PATCH → save ONE wall. Called the moment a wall is complete, not at the end,
// so a killed tab or a dead battery loses at most the wall in progress. Keyed on
// (batch_id, seq), which the unique index enforces, so a retry from the offline
// queue overwrites rather than duplicating.
export async function PATCH(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const g = await guardMeasureRequest(req, token, "save");
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { link, store, account, sb } = g.ctx;

  const b = await req.json().catch(() => ({})) as {
    seq?: number; name?: string; room?: string; widthMm?: number; heightMm?: number; note?: string;
  };

  const widthMm = Math.round(Number(b.widthMm) || 0);
  const heightMm = Math.round(Number(b.heightMm) || 0);
  // Validated BEFORE the draft batch is created, so a fumbled first entry does
  // not leave an empty survey on the board.
  const bad = wallSizeRejection(widthMm, heightMm);
  if (bad) return NextResponse.json({ ok: false, error: `That measurement can't be right — ${bad}.` }, { status: 400 });

  const batchId = await ensureDraftBatch(sb, link, store, account);
  if (!batchId) return NextResponse.json({ ok: false, error: "Could not start this survey." }, { status: 500 });

  // An explicit seq edits that wall; no seq appends the next one. Appending is
  // the common case — someone walking clockwise adding walls as they go.
  const { data: existing } = await sb.from("corporate_site_batch_walls")
    .select("seq").eq("batch_id", batchId).order("seq");
  const taken = (existing ?? []).map((r) => r.seq as number);
  const wanted = Number.isFinite(Number(b.seq)) && Number(b.seq) > 0 ? Math.round(Number(b.seq)) : null;
  const seq = wanted ?? (taken.length ? Math.max(...taken) + 1 : 1);

  if (!taken.includes(seq) && taken.length >= MAX_WALLS) {
    return NextResponse.json({
      ok: false,
      error: `A single survey holds ${MAX_WALLS} walls. Send this one and ask head office for a second link.`,
    }, { status: 400 });
  }

  const name = String(b.name ?? "").trim().slice(0, 160) || `Wall ${seq}`;
  const room = b.room ? String(b.room).trim().slice(0, 120) || null : null;
  const note = b.note ? String(b.note).trim().slice(0, 500) || null : null;

  const { error } = await sb.from("corporate_site_batch_walls").upsert({
    batch_id: batchId, seq,
    name, room,
    width_mm: widthMm, height_mm: heightMm,
    notes: note,
  }, { onConflict: "batch_id,seq" });
  if (error) {
    console.error("[measure] wall save failed:", batchId, seq, error.message);
    return NextResponse.json({ ok: false, error: "Could not save that wall." }, { status: 500 });
  }

  void touchLink(link.id, { wrote: true });
  return NextResponse.json({ ok: true, seq, walls: taken.includes(seq) ? taken.length : taken.length + 1 });
}

// DELETE → remove a wall. People mis-count and need to take one out; leaving a
// wrong wall in would put wallpaper on it.
//
// The gap in seq is left alone on purpose. Renumbering would silently change
// which wall "Wall 7" means, and seq IS the clockwise walking order the
// allocator reads to decide which walls are the entrance.
export async function DELETE(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const g = await guardMeasureRequest(req, token, "save");
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { link, sb } = g.ctx;

  const seq = Math.round(Number(new URL(req.url).searchParams.get("seq")));
  if (!Number.isFinite(seq) || seq < 1) {
    return NextResponse.json({ ok: false, error: "Which wall?" }, { status: 400 });
  }
  if (!link.batch_id) return NextResponse.json({ ok: true, removed: 0 });

  const { data: gone } = await sb.from("corporate_site_batch_walls")
    .delete().eq("batch_id", link.batch_id).eq("seq", seq)
    .select("photo_path").maybeSingle();

  // Take the photo with it — otherwise a deleted wall's image sits in the
  // bucket for ever with nothing referencing it.
  if (gone?.photo_path) {
    await caRemove([gone.photo_path as string]);
  }

  void touchLink(link.id, { wrote: true });
  return NextResponse.json({ ok: true, removed: gone ? 1 : 0 });
}
