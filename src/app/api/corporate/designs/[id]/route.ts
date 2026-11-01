import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse } from "next/server";
import { can, currentCorporateSession, recordAudit } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// Where the studio hears about a partner's comments. Overridable per deploy;
// the desk thread is the record either way — this is just the nudge.
const STUDIO_NOTIFY = process.env.STUDIO_NOTIFY_EMAIL || "hello@zyvorah.com";

// Comment on a design. Approval is retired (2026-08-11) — designs land in the
// library ready to print, so there is no verdict left to pass and no owner to
// pass it. What survives is the CONVERSATION: anyone on the account can ask
// the studio for a change, and the studio answers from the desk with the
// reworked file.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease || !partnerCapabilities(session.account).customLibrary) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  // Agreement gate (0095): no mutations on an account that has not signed.
  if (session.agreementPending) {
    return NextResponse.json({ error: "agreement_required" }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { id } = await params;
  let body: { action?: string; comment?: string; series?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const { data: design } = await sb.from("corporate_designs")
    .select("*").eq("id", id).eq("account_id", session.account.id).maybeSingle();
  if (!design) return NextResponse.json({ error: "Design not found" }, { status: 404 });

  // Take a design OUT of the library. Not a verdict — housekeeping. It exists
  // because the partner now uploads their own artwork and will sooner or later
  // upload the wrong file, and they should be able to unpick that themselves.
  //
  // The row is ARCHIVED, not deleted: the artwork, the code and the whole
  // thread survive (a mis-click is undoable, and a byte-identical repeat print
  // still resolves), and it simply leaves the library (listing filters
  // status != 'archived'). Same shape as the desk's own archiveDesign, so we
  // don't fork the state model.
  if (body.action === "remove") {
    if (!can(session, "upload")) {
      return NextResponse.json({ error: "You don't have permission to change the library." }, { status: 403 });
    }
    if (design.status === "archived") return NextResponse.json({ ok: true, status: "archived" });
    const { error } = await sb.from("corporate_designs").update({
      status: "archived", updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return NextResponse.json({ error: "Could not save that." }, { status: 500 });
    await recordAudit(session, "design.remove", { type: "design", id }, { title: design.title });

    void sendEmail({
      to: STUDIO_NOTIFY,
      subject: `${session.account.name} removed “${design.title}” from their library`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:520px">
        <p><strong>${design.title}</strong> was removed by ${session.email} — it is out of the ${session.account.name} library.</p>
        <p>The file and its thread are preserved; nothing has been deleted.</p>
      </div>`,
    });
    return NextResponse.json({ ok: true, status: "archived" });
  }

  // Move a design into a different collection — i.e. rewrite its series name.
  //
  // Collections are not a table: a collection IS the set of designs sharing a
  // series_name, so "move to another series" is exactly one string write. An
  // empty/absent series drops the design into the collectionless pile, which is
  // how you take one out of a collection without inventing a holding pen.
  //
  // No studio email: this is the partner tidying their own shelves, and a batch
  // fix would otherwise fire twenty notifications. The audit log has it.
  if (body.action === "move") {
    if (!can(session, "upload")) {
      return NextResponse.json({ error: "You don't have permission to change the library." }, { status: 403 });
    }
    const series = (body.series ?? "").trim().slice(0, 120) || null;
    const { error } = await sb.from("corporate_designs").update({
      series_name: series, updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return NextResponse.json({ error: "Could not move that design." }, { status: 500 });
    await recordAudit(session, "design.move", { type: "design", id }, {
      title: design.title, from: design.series_name ?? null, to: series,
    });
    return NextResponse.json({ ok: true, series_name: series });
  }

  if (body.action === "comment") {
    const comment = (body.comment ?? "").trim();
    if (!comment) return NextResponse.json({ error: "Write the change you need." }, { status: 400 });
    const { error } = await sb.from("corporate_design_messages").insert({
      design_id: id, author_kind: "approver", author_email: session.email, body: comment,
    });
    if (error) return NextResponse.json({ error: "Could not save the comment." }, { status: 500 });
    // A comment no longer changes the design's status. It used to knock it into
    // 'changes_requested', which pulled it out of the library until someone
    // ticked it back — with approval gone there is nobody to tick, so asking a
    // question about a design would have quietly made it unorderable.
    await sb.from("corporate_designs").update({ updated_at: new Date().toISOString() }).eq("id", id);
    await recordAudit(session, "design.comment", { type: "design", id }, { title: design.title });

    void sendEmail({
      to: STUDIO_NOTIFY,
      subject: `${session.account.name}: comment on “${design.title}”`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:520px">
        <p>${session.email} commented on <strong>${design.title}</strong>:</p>
        <blockquote style="border-left:3px solid #cbd5e1;margin:8px 0;padding:4px 12px;color:#334155">${comment.replace(/</g, "&lt;")}</blockquote>
        <p>Reply with the reworked file from the desk (Partners → design library). The design stays in their library throughout — it is orderable while you work on it.</p>
      </div>`,
    });
    return NextResponse.json({ ok: true, status: design.status });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
