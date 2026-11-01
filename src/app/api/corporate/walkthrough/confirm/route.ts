import { NextResponse } from "next/server";
import { recordAudit, wallSizeRejection } from "@/lib/corporate-auth";
import { CACHE_MUTABLE } from "@/lib/storage-body";
import { caDownload, caUpload } from "@/lib/corporate-art-store";
import { ensureAreaBatch, guardCapture, MAX_WALLS, nextSeq } from "@/lib/portfolio-capture";
import { areaLabel } from "@/lib/portfolio";
import { walkthroughInArea, type MarkRow } from "@/lib/walkthrough";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Turn confirmed marks into real walls.
 *
 * THIS IS THE HUMAN STEP, and it is the reason the drafting pass is allowed to
 * be wrong. Nothing a model proposed becomes a wall until somebody ticks it
 * through here — and because they are ticking, they can also have corrected the
 * name, the brief and the size first.
 *
 * IDEMPOTENT BY CONSTRUCTION. A mark that already carries confirmed_wall_seq is
 * skipped rather than re-created, so a double tap, a retried request or a
 * second pass over the same walk cannot fill a space with duplicate walls.
 *
 * The still becomes the wall's PHOTOGRAPH — copied, not moved, so deleting the
 * walkthrough later cannot pull the picture out from under a wall that is by
 * then being designed against.
 */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as {
    areaId?: string; id?: string; markIds?: string[];
  };

  const g = await guardCapture(String(b.areaId ?? ""));
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { sb, area, session } = g.ctx;

  const walk = await walkthroughInArea(sb, area.id, session.account.id, String(b.id ?? ""));
  if (!walk) return NextResponse.json({ ok: false, error: "That walkthrough isn't in this space." }, { status: 404 });

  const wanted = Array.isArray(b.markIds) ? b.markIds.map(String) : [];
  if (wanted.length === 0) {
    return NextResponse.json({ ok: false, error: "Tick the walls you want to add." }, { status: 400 });
  }

  const { data: markRows } = await sb.from("corporate_walkthrough_marks")
    .select("*").eq("walkthrough_id", walk.id).in("id", wanted).order("seq");
  const marks = (markRows ?? []) as MarkRow[];
  if (marks.length === 0) {
    return NextResponse.json({ ok: false, error: "Those walls aren't in this walkthrough." }, { status: 404 });
  }

  const batchId = await ensureAreaBatch(g.ctx);
  if (!batchId) {
    return NextResponse.json({ ok: false, error: "Could not open a survey for this space." }, { status: 500 });
  }

  const { data: batch } = await sb.from("corporate_site_batches")
    .select("released_at").eq("id", batchId).maybeSingle();
  if (batch?.released_at) {
    return NextResponse.json({
      ok: false, error: "This space has been sent for design. Ask us to reopen it before adding walls.",
    }, { status: 409 });
  }

  const room = areaLabel(area);
  const added: { seq: number; name: string }[] = [];
  const skipped: { name: string; why: string }[] = [];

  for (const mark of marks) {
    if (mark.confirmed_wall_seq != null) {
      skipped.push({ name: mark.draft_name ?? `Wall ${mark.seq}`, why: "already added" });
      continue;
    }

    const name = (mark.draft_name ?? "").trim() || `Wall ${mark.seq}`;

    // A wall needs a size, and a walk does not reliably give one. Video gives
    // the space, the light and the intent; it does not give dimensions. So an
    // unsized mark is refused HERE, by name, rather than being written as a
    // wall of zero — which is the shape that makes the allocator hand the whole
    // library to one wall.
    const w = mark.draft_width_mm ?? 0;
    const h = mark.draft_height_mm ?? 0;
    const bad = wallSizeRejection(w, h);
    if (bad) {
      skipped.push({ name, why: "needs a width and a height" });
      continue;
    }

    const { count } = await sb.from("corporate_site_batch_walls")
      .select("id", { count: "exact", head: true }).eq("batch_id", batchId);
    if ((count ?? 0) >= MAX_WALLS) {
      skipped.push({ name, why: `the space is full at ${MAX_WALLS} walls` });
      continue;
    }

    // The brief carries the estimate warning INTO the wall, so nobody reading
    // it later has to remember where the number came from.
    const brief = mark.size_estimated
      ? [mark.draft_brief, "(Size taken from the walkthrough — confirm before printing.)"]
          .filter(Boolean).join("\n\n")
      : mark.draft_brief;

    let created: { seq: number } | null = null;
    for (let attempt = 0; attempt < 4 && !created; attempt++) {
      const seq = await nextSeq(sb, batchId);
      const { data, error } = await sb.from("corporate_site_batch_walls").insert({
        batch_id: batchId, seq, name, room,
        width_mm: w, height_mm: h,
        brief,
        notes: `From the walkthrough on ${new Date(walk.created_at).toISOString().slice(0, 10)}`,
      }).select("seq").maybeSingle();
      if (data) created = { seq: data.seq as number };
      else if (error && !/duplicate key/i.test(error.message)) {
        console.error("[walkthrough/confirm] insert failed:", error.message);
        break;
      }
    }
    if (!created) {
      skipped.push({ name, why: "could not be added — try again" });
      continue;
    }

    // Copy the still onto the wall's own photo path. Copied rather than
    // repointed so the wall keeps its picture even if the walk is deleted.
    if (mark.still_path) {
      const { data: file } = await caDownload(mark.still_path);
      if (file) {
        const wallPath = `site/${batchId}/w${String(created.seq).padStart(2, "0")}.jpg`;
        const up = await caUpload(
          wallPath,
          Buffer.from(await file.arrayBuffer()),
          { contentType: "image/jpeg", upsert: true, cacheControl: CACHE_MUTABLE },
        );
        await sb.from("corporate_site_batch_walls").update(
          up.error
            ? { photo_path: null, photo_error: "the walkthrough frame could not be copied" }
            : { photo_path: wallPath, photo_error: null },
        ).eq("batch_id", batchId).eq("seq", created.seq);
      }
    }

    await sb.from("corporate_walkthrough_marks").update({
      confirmed_wall_seq: created.seq,
      confirmed_at: new Date().toISOString(),
    }).eq("id", mark.id);

    added.push({ seq: created.seq, name });
  }

  await recordAudit(session, "walkthrough.confirm", { type: "area", id: area.id },
    { id: walk.id, added: added.length, skipped: skipped.length });

  return NextResponse.json({
    ok: true,
    added,
    skipped,
    // Reported rather than silently swallowed: "six added, two need a size" is
    // the sentence somebody can act on.
    message: added.length
      ? `${added.length} ${added.length === 1 ? "wall" : "walls"} added to ${room}.`
      : "Nothing was added.",
  });
}
