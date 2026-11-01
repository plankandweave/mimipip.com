import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse } from "next/server";
import { currentCorporateSession } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { DAY, artPathOf, poPath, signArt } from "@/lib/corporate-files";
import { caUpload } from "@/lib/corporate-art-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Attach the client's purchase order to a frozen order. Optional by design —
// some partners' clients issue a PO, some just pay — so this never gates
// production on its own. It is the paper trail that makes an order auditable
// back to the partner's own client, and it carries the PO number onto the
// invoice (the OS puts it on the Odoo sale order's client reference).

const MAX_BYTES = 20 * 1024 * 1024;
const DESK_EMAIL = process.env.CORPORATE_DESK_EMAIL || "hello@zyvorah.com";

/** The partner's (and our desk's) way back to an attached PO — signed fresh on
 *  every click, session-gated, scoped to their own account. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await currentCorporateSession();
  if (!session) return new NextResponse("Not signed in", { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  const sb = supabaseAdmin();
  if (!sb) return new NextResponse("Unavailable", { status: 503 });

  const { id } = await ctx.params;
  const { data } = await sb.from("corporate_orders")
    .select("po_url").eq("id", id).eq("account_id", session.account.id).maybeSingle();
  const stored = (data as { po_url: string | null } | null)?.po_url;
  if (!stored) return new NextResponse("No purchase order attached", { status: 404 });

  const path = artPathOf(stored);
  if (!path) return new NextResponse("Could not open the PO", { status: 500 });
  const url = await signArt(sb, path, DAY);
  if (!url) return new NextResponse("Could not open the PO", { status: 500 });
  return NextResponse.redirect(url);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  // Agreement gate (0095): no mutations on an account that has not signed.
  if (session.agreementPending) {
    return NextResponse.json({ error: "agreement_required" }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { id } = await ctx.params;
  const acc = session.account;

  const { data: order } = await sb.from("corporate_orders")
    .select("id, order_ref, po_number, status").eq("id", id).eq("account_id", acc.id).maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const o = order as { id: string; order_ref: string; po_number: string | null; status: string };

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const poNumber = String(form?.get("poNumber") ?? "").trim();
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach the PO as a PDF or image." }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is over 20 MB — please send a smaller copy." }, { status: 413 });
  }

  const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
  const path = poPath(acc.slug, o.order_ref, ext);
  const up = await caUpload(
    path,
    Buffer.from(await file.arrayBuffer()),
    { contentType: file.type || "application/pdf", upsert: true },
  );
  if (up.error) {
    console.error("[corporate/po] upload failed:", up.error.message);
    return NextResponse.json({ error: "Upload failed — please try again." }, { status: 502 });
  }
  // Private bucket — the desk's notification needs a signature it can actually
  // open, and a PO gets looked at long after it lands, so sign it generously.
  const poUrl = await signArt(sb, path, 180 * DAY);

  // A PO can arrive before or after freezing; only advance the status when it
  // is the meaningful next step, never backwards from something further along.
  const nextStatus = o.status === "frozen" || o.status === "draft" ? "po_received" : o.status;

  // Store the PATH; the partner's link re-signs on every click (GET below).
  const { error } = await sb.from("corporate_orders").update({
    po_url: path,
    po_received_at: new Date().toISOString(),
    po_number: poNumber || o.po_number,
    status: nextStatus,
  }).eq("id", id);
  if (error) {
    console.error("[corporate/po] update failed:", error.message);
    return NextResponse.json({ error: "Could not save the PO." }, { status: 500 });
  }

  void sendEmail({
    to: DESK_EMAIL,
    subject: `PO received for ${o.order_ref} — ${acc.name}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px">
      <p><strong>${escapeHtml(acc.name)}</strong> attached a purchase order to <strong>${escapeHtml(o.order_ref)}</strong>.</p>
      ${poNumber ? `<p>PO number: <strong>${escapeHtml(poNumber)}</strong></p>` : ""}
      ${poUrl ? `<p><a href="${poUrl}">View the PO</a></p>` : `<p>Open it from the order on the desk.</p>`}
    </div>`,
  });

  return NextResponse.json({ ok: true, poUrl, poNumber: poNumber || o.po_number, status: nextStatus });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
