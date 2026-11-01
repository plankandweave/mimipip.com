import { NextResponse } from "next/server";
import { currentCorporateSession, isAccountAdmin } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { internalTokenOk, loadBatch, requeueRecompose } from "@/lib/site-batch";

export const dynamic = "force-dynamic";

// POST → compose every open wall of this batch again, silently.
//
// The drive worker picks it up on its next tick. Nothing is emailed: a batch
// the client was already mailed returns to 'proposed' on the same link (see
// the compose route). Staff and the account's own admins only — it spends a
// vision call and a render per wall.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const loaded = await loadBatch(sb, id);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!internalTokenOk(req)) {
    const session = await currentCorporateSession();
    if (!session || session.account.id !== loaded.batch.account_id || (!isAccountAdmin(session) && !session.staff)) {
      return NextResponse.json({ error: "Not authorised" }, { status: 401 });
    }
  }
  const r = await requeueRecompose(sb, id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json({ ok: true, walls: r.walls, emailed: false });
}
