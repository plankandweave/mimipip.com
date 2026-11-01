import { NextResponse } from "next/server";
import { currentCorporateSession, isAccountAdmin } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { allocateDesigns, internalTokenOk, loadBatch } from "@/lib/site-batch";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST → the AI pass: read every wall photo, assign design chains — clockwise
// continuity, preferred series first, no design repeated anywhere in the
// store. The no-repetition and cover-the-width rules are re-enforced in code
// after the model call; the model chooses, the validator guarantees.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const loaded = await loadBatch(sb, id);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!internalTokenOk(req)) {
    const session = await currentCorporateSession();
    // Account admins run their own store, and OUR OWN STAFF run the pipeline
    // they built — `can()` has always granted staff everything, but this gate
    // asked isAccountAdmin, which is member?.role and therefore NULL for
    // staff. That locked Zyvorah out of allocate/compose on every account
    // (live 401, 19 Aug 2026). Client sign-off (approve) and the client's own
    // member list stay account-admin only.
    if (!session || session.account.id !== loaded.batch.account_id || (!isAccountAdmin(session) && !session.staff)) {
      return NextResponse.json({ error: "Not authorised" }, { status: 401 });
    }
  }

  if (!["collecting", "allocated", "composed", "proposed"].includes(loaded.batch.status)) {
    return NextResponse.json({ error: `Batch is ${loaded.batch.status} — allocation is closed.` }, { status: 409 });
  }

  const body = await req.json().catch(() => ({})) as { seqs?: number[]; series?: string[] };
  const seqs = Array.isArray(body.seqs) ? body.seqs.map(Number).filter(Number.isFinite) : undefined;
  // Optional per-pass series brief — lets one floor run a different series to
  // another without rewriting the batch row between calls.
  const series = Array.isArray(body.series)
    ? body.series.map(String).map((x) => x.trim()).filter(Boolean)
    : undefined;
  try {
    const { perWall, warnings } = await allocateDesigns(sb, loaded.batch, loaded.walls, seqs, series);
    for (const w of loaded.walls) {
      const a = perWall.get(w.id);
      if (!a) continue;
      await sb.from("corporate_site_batch_walls").update({
        design_ids: a.ids,
        context_json: { context: a.context, note: a.note },
        art_json: null, status: "allocated",
      }).eq("id", w.id);
    }
    const prevWarnings = seqs?.length ? (loaded.batch.allocation_json?.warnings ?? []) : [];
    await sb.from("corporate_site_batches").update({
      status: "allocated", allocation_json: { warnings: [...warnings, ...prevWarnings.filter((w) => !warnings.includes(w))] }, error: null,
    }).eq("id", id);
    return NextResponse.json({ ok: true, warnings });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Allocation failed";
    await sb.from("corporate_site_batches").update({ error: msg }).eq("id", id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
