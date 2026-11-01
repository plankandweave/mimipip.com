import { NextResponse } from "next/server";
import { signArt } from "@/lib/corporate-files";
import { guardMeasureRequest, touchLink, MAX_WALLS } from "@/lib/measure-link";

export const dynamic = "force-dynamic";

/** Short. A signed URL handed to an unauthenticated phone is effectively public
 *  for its lifetime and is forwardable, so the store's own thumbnails get
 *  minutes rather than the DAY the gated pages use. */
const THUMB_TTL_S = 900;

// GET → everything the phone may know: which store, what head office asked for,
// and the walls saved so far. Nothing else.
//
// Deliberately NOT the serialiser used by /api/corporate/site-batch/[id], which
// returns design codes, series names, allocator warnings, composed artwork and
// approver emails — very nearly the exact complement of what a store contact
// should see. The batch id is never taken from the caller either; it is read off
// the resolved link.
//
// requireWritable:false — a submitted or expired link must still be able to
// render its own "already sent" / "expired" screen.
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const g = await guardMeasureRequest(req, token, "open", { requireWritable: false });
  if (!g.ok) return NextResponse.json({ ok: false, state: g.state, error: g.error }, { status: g.status });
  const { link, store, account, sb } = g.ctx;

  void touchLink(link.id, { opened: true });

  const walls = link.batch_id
    ? (await sb.from("corporate_site_batch_walls")
        .select("seq, name, room, width_mm, height_mm, notes, photo_path, photo_error")
        .eq("batch_id", link.batch_id).order("seq")).data ?? []
    : [];

  const serialised = await Promise.all(walls.map(async (w) => ({
    seq: w.seq as number,
    name: w.name as string,
    room: (w.room as string) ?? null,
    widthMm: w.width_mm as number,
    heightMm: w.height_mm as number,
    note: (w.notes as string) ?? null,
    hasPhoto: Boolean(w.photo_path),
    photoError: (w.photo_error as string) ?? null,
    photoUrl: w.photo_path ? await signArt(sb, w.photo_path as string, THUMB_TTL_S) : null,
  })));

  return NextResponse.json({
    ok: true,
    state: g.ctx.link.submitted_at ? "submitted" : "ok",
    store: {
      name: store.name,
      city: store.city,
      state: store.state,
      addressLine: store.address_line,
      floors: store.floors,
    },
    account: { name: account.name },
    brief: link.brief,
    expiresAt: link.expires_at,
    submittedAt: link.submitted_at,
    wallCap: MAX_WALLS,
    walls: serialised,
  });
}
