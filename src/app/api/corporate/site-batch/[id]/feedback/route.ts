import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse, after } from "next/server";
import { currentCorporateSession } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { internalTokenOk, loadBatch } from "@/lib/site-batch";
import { reviseFromFeedback } from "@/lib/site-batch-revise";
import { POST as driveBatch } from "../drive/route";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET → the feedback thread on this proposal (both sides see the same one).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const loaded = await loadBatch(sb, id);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!internalTokenOk(req)) {
    const session = await currentCorporateSession();
    if (!session || session.account.id !== loaded.batch.account_id) {
      return NextResponse.json({ error: "Not authorised" }, { status: 401 });
    }
  }
  const { data } = await sb.from("corporate_site_batch_feedback")
    .select("id, created_at, wall_seq, body, author_email, author_side, status, ai_reply, changed_seqs")
    .eq("batch_id", id).order("created_at");
  return NextResponse.json({ ok: true, feedback: data ?? [] });
}

// POST → the partner's team asks for a change, in their own words. Any member
// of the account may write (this is their proposal to react to); the revision
// itself only ever re-allocates from their approved library and never touches
// a wall already in production.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const loaded = await loadBatch(sb, id);
  if (!loaded || loaded.batch.account_id !== session.account.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const b = await req.json().catch(() => ({})) as { body?: string; wallSeq?: number };
  const body = String(b.body ?? "").trim();
  if (body.length < 3) return NextResponse.json({ error: "Write what you'd like changed." }, { status: 400 });
  const wallSeq = Number.isFinite(Number(b.wallSeq)) && Number(b.wallSeq) > 0 ? Number(b.wallSeq) : null;

  const { data: entry, error } = await sb.from("corporate_site_batch_feedback").insert({
    batch_id: id, wall_seq: wallSeq, body: body.slice(0, 2000),
    author_email: session.email, author_side: "client",
  }).select().single();
  if (error || !entry) return NextResponse.json({ error: "Could not save the feedback." }, { status: 500 });

  // Answer it now: the client is waiting on the page.
  try {
    const rev = await reviseFromFeedback(sb, loaded.batch, loaded.walls, [
      { body, wall_seq: wallSeq, author_email: session.email },
    ]);
    for (const w of loaded.walls) {
      const a = rev.perWall.get(w.id);
      if (!a) continue;
      await sb.from("corporate_site_batch_walls").update({
        design_ids: a.ids,
        context_json: { context: a.context, note: a.note },
        art_json: null, status: "allocated",
      }).eq("id", w.id);
    }
    await sb.from("corporate_site_batch_feedback").update({
      status: rev.changedSeqs.length ? "actioned" : "cannot_action",
      ai_reply: rev.reply + (rev.unmet.length ? `\n\nNot possible from your approved library yet: ${rev.unmet.join(" ")}` : ""),
      changed_seqs: rev.changedSeqs, actioned_at: new Date().toISOString(),
    }).eq("id", entry.id);

    if (rev.changedSeqs.length) {
      // Increment. This wrote back `revision ?? 1` — the value it had just
      // read — so the counter never moved off 1 no matter how many revisions a
      // client asked for, and the record of WHICH revision was approved was
      // wrong in a flow that creates printing obligations.
      //
      // The bump is also what re-opens proposing: propose re-sends while
      // revision > proposed_revision, so a revised store can go back out for
      // approval instead of dead-ending here.
      //
      // The changed walls now have art_json null and status 'allocated'.
      // Something has to recompose them: this route set art_json to null and
      // returned recomposing:true, but nothing ever called compose and the
      // review page only reloaded — so a single change request left the batch
      // stuck at 'allocated' with no artwork and the approve buttons gone. The
      // drive worker picks batches up by STATUS, so setting 'allocated' and
      // kicking it is the whole fix.
      await sb.from("corporate_site_batches").update({
        status: "allocated",
        revision: (loaded.batch.revision ?? 1) + 1,
        revision_note: rev.reply,
      }).eq("id", id);

      // A revision is a continuation of an already-released survey, so it needs
      // no second release tap.
      const bridgeToken = process.env.ZYVORAH_WEBHOOK_TOKEN;
      if (bridgeToken && loaded.batch.released_at) {
        // IN-PROCESS, not over HTTP — a Worker fetching its own zone is fragile
        // (see the approve route, PR #356). The drive route is built to be
        // invoked in-process and still gates on the bridge token it is handed.
        after(() => {
          const dreq = new Request(new URL(`/api/corporate/site-batch/${id}/drive`, req.url), {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-zyvorah-token": bridgeToken },
          });
          void driveBatch(dreq, { params: Promise.resolve({ id }) })
            .catch((e) => console.error("[feedback] drive kick failed:", id, e));
        });
      }
    }
    return NextResponse.json({
      ok: true, reply: rev.reply, changedSeqs: rev.changedSeqs, unmet: rev.unmet,
      recomposing: rev.changedSeqs.length > 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not action the feedback";
    await sb.from("corporate_site_batch_feedback").update({ status: "open", ai_reply: `Could not action automatically: ${msg}` }).eq("id", entry.id);
    return NextResponse.json({ ok: true, reply: null, error: msg }, { status: 200 });
  }
}
