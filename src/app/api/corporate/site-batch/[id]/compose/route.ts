import { NextResponse } from "next/server";
import { currentCorporateSession, isAccountAdmin } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { composeNextWall, internalTokenOk, loadBatch } from "@/lib/site-batch";
import { recordSynergy, reviewFloorSynergy } from "@/lib/floor-synergy";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST → compose ONE wall's print master per call (the caller loops until
// {done:true}). One wall per invocation keeps a 40-wall store inside
// serverless time limits, and a failure names the wall it failed on.
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
  const { data: acc } = await sb.from("corporate_accounts").select("slug").eq("id", loaded.batch.account_id).single();

  const r = await composeNextWall(sb, (acc?.slug as string) ?? "corporate", id);
  if (r.done && !r.error) {
    // `done` alone is NOT success. Now that walls which have exhausted their
    // compose attempts are skipped rather than retried forever, the loop
    // finishes with a hole in the batch — and propose only ever checked
    // status==='composed', so a partial store would have gone to the client for
    // approval looking complete. A batch with failed walls parks at
    // needs_attention instead, and propose refuses it.
    //
    // A SILENT recompose goes back to 'proposed', not 'composed'. When this
    // revision has already been proposed (revision ≤ proposed_revision, no
    // mail error), the client holds a live link: landing on 'composed' would
    // take their approve buttons away and the drive worker would never send
    // them back (nextStep proposes only a NEWER revision). The composition
    // simply updates in place — "whenever they open the original email, they
    // see the updated composition", no second email (Roheena, 6 Oct 2026).
    const alreadyProposedThisRevision = loaded.batch.proposed_at != null
      && loaded.batch.email_error == null
      && (loaded.batch.revision ?? 1) <= (loaded.batch.proposed_revision ?? 0);
    await sb.from("corporate_site_batches")
      .update({ status: r.failed > 0 ? "needs_attention" : alreadyProposedThisRevision ? "proposed" : "composed" })
      .eq("id", id);
    if (r.failed === 0) {
      // Stand back and look at the whole floor (Roheena, 6 Oct 2026): every
      // composed wall in clockwise order, judged as one project — palette
      // harmony, floor-line continuity, odd wall out. Findings go into the
      // batch warnings the reviewer reads; a vision hiccup changes nothing.
      const fresh = await loadBatch(sb, id);
      if (fresh) {
        const verdict = await reviewFloorSynergy(fresh.walls).catch(() => null);
        await recordSynergy(sb, id, fresh.batch.allocation_json, verdict);
      }
    }
  }
  return NextResponse.json({ ok: !r.error, ...r });
}
