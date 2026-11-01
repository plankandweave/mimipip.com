import { NextResponse, after } from "next/server";
import { partnerCapabilities } from "@/lib/partner-capabilities";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { CorporateAccount } from "@/lib/corporate-auth";
import {
  escapeHtml, minOrderShortfall, placeProject, priceProjectLines, projectTotals,
} from "@/lib/corporate-project";
import { fetchCorporateQuote, quoteExpired } from "@/lib/corporate-quote";
import { sendEmail } from "@/lib/email";
import { recordCommercialEvent } from "@/lib/server-events";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST -> the purchase order is raised; place the project.
//
// The caller is the customer's PO raiser, who has no login and never will —
// the unguessable token IS the credential, exactly as the retail order page
// works. So the only two things read from the request are the PO number and
// the approver's name. The walls, the sizes, the ship-to and the account all
// come off the stored quotation, and every rupee is re-derived here from the
// account's CURRENT rate rather than from anything the quote row remembers.

const DESK_EMAIL = process.env.CORPORATE_DESK_EMAIL || "hello@zyvorah.com";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const q = await fetchCorporateQuote(token);
  if (!q) return NextResponse.json({ error: "This quotation link is not valid." }, { status: 404 });
  const { data: accRow } = await sb.from("corporate_accounts").select("*").eq("id", q.account_id).maybeSingle();
  const acc = accRow as CorporateAccount | null;
  if (!acc) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  if (partnerCapabilities(acc).poRequiredRelease) {
    return NextResponse.json({ error: "Use authenticated purchasing in the private customer workspace." }, { status: 403 });
  }
  if (q.group_ref || q.approved_at) {
    // Already done — a second tap on a slow connection, or a forwarded link.
    // Not an error to the person holding it; just tell them where it stands.
    return NextResponse.json({ ok: true, already: true, groupRef: q.group_ref, poNumber: q.po_number });
  }
  if (q.declined_at) return NextResponse.json({ error: "This quotation was declined." }, { status: 409 });
  if (quoteExpired(q)) {
    return NextResponse.json({
      error: "This quotation has expired. Ask for a fresh one — your measurements are safe.",
    }, { status: 410 });
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  // The PO number is the entire reason this page exists — approving without one
  // would just be a slower "send to print".
  const poNumber = str(b.poNumber);
  if (!poNumber) return NextResponse.json({ error: "Enter your purchase order number." }, { status: 400 });
  if (poNumber.length > 60) return NextResponse.json({ error: "That PO number is too long." }, { status: 400 });
  const approvedBy = str(b.approvedByName) || q.recipient_name || null;

  const priced = await priceProjectLines(acc, q.lines as Record<string, unknown>[]);
  if (!priced.ok) {
    // The walls no longer price — a catalogue design withdrawn, a material
    // retired. Never guess; the partner has to re-send.
    return NextResponse.json({
      error: `${priced.error} Please ask ${q.created_by_email} to send a fresh quotation.`,
    }, { status: priced.status });
  }
  const lines = priced.lines;

  const shortfall = minOrderShortfall(acc, lines);
  if (shortfall) return NextResponse.json({ error: shortfall }, { status: 400 });

  // Claim the quotation BEFORE placing anything. The conditional update is the
  // lock: whoever wins it places the project, and a duplicate tap finds
  // approved_at already set and falls into the "already" branch above.
  const { data: claimed } = await sb.from("corporate_quotes")
    .update({
      approved_at: new Date().toISOString(),
      approved_by_name: approvedBy,
      po_number: poNumber,
    })
    .eq("id", q.id)
    .is("approved_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) {
    return NextResponse.json({ ok: true, already: true, poNumber });
  }

  const profile = {
    state: q.state ?? "",
    gstin: q.gstin,
    address_line: q.ship_address,
    city: q.ship_city,
    pincode: q.ship_pincode,
    contact_name: q.ship_contact_name,
    contact_phone: q.ship_contact_phone,
  };

  const result = await placeProject({
    sb, acc, lines, profile,
    // The order belongs to the partner who composed it — they are the account
    // user, and the dashboard's "who placed this" must stay answerable.
    placedByEmail: q.created_by_email,
    poNumber,
  });
  if (!result.ok) {
    // Release the claim so a retry is possible; the lines that did land are
    // named in the error and the desk email below.
    await sb.from("corporate_quotes").update({ approved_at: null }).eq("id", q.id);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { groupRef, placed } = result;
  await sb.from("corporate_quotes").update({ group_ref: groupRef }).eq("id", q.id);

  // One event per WALL, exactly as the batch route emits them. A project that
  // arrives by this road is still a project that was bought, and analytics
  // reconciles these against corporate_orders — orders placed here without
  // their events would make that reconciliation quietly under-count.
  after(() =>
    Promise.all(
      placed.map((pl) =>
        recordCommercialEvent({
          event: "order_placed",
          subject: pl.id,
          valueInr: pl.line.price.total,
          meta: {
            family: "corporate", order_ref: pl.orderRef, batch: placed.length,
            via: "quotation", po_number: poNumber,
          },
        }),
      ),
    ),
  );

  const { totalSqft, totalInr } = projectTotals(placed);
  const failed = placed.filter(p => p.pushError);

  const who = approvedBy ? `${approvedBy} (${q.recipient_email ?? q.recipient_phone ?? "—"})` : (q.recipient_email ?? "the client");
  void sendEmail({
    to: DESK_EMAIL,
    cc: q.created_by_email,
    subject: `PO ${poNumber} approved project ${groupRef} for ${acc.name} — ${placed.length} walls · ${totalSqft} sq ft`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:560px">
      <p><strong>${escapeHtml(who)}</strong> approved the quotation sent by ${escapeHtml(q.created_by_email)}
      against <strong>PO ${escapeHtml(poNumber)}</strong>, placing project <strong>${escapeHtml(groupRef)}</strong>
      for <strong>${escapeHtml(acc.name)}</strong>.</p>
      <table style="border-collapse:collapse;font-size:13px">${placed.map(p => `
        <tr>
          <td style="padding:3px 10px 3px 0"><strong>${escapeHtml(p.orderRef)}</strong></td>
          <td style="padding:3px 10px 3px 0">${escapeHtml(p.line.printName ?? "—")}</td>
          <td style="padding:3px 10px 3px 0">${(p.line.widthMm / 304.8).toFixed(1)} × ${(p.line.heightMm / 304.8).toFixed(1)} ft</td>
          <td style="padding:3px 0">Rs ${p.line.price.total.toLocaleString("en-IN")}</td>
        </tr>`).join("")}
      </table>
      <p><strong>${totalSqft} sq ft · Rs ${totalInr.toLocaleString("en-IN")} incl. GST</strong></p>
      <p>${acc.print_gate === "payment_first"
        ? "Payment-first account — all lines are DRAFTS until the partner freezes them."
        : "Credit account — every line has gone to production."}</p>
      ${failed.length ? `<p style="color:#b91c1c">OS push FAILED on ${failed.map(p => escapeHtml(p.orderRef)).join(", ")} — needs a manual retry from the desk.</p>` : ""}
    </div>`,
  });

  return NextResponse.json({
    ok: true, groupRef, poNumber,
    orders: placed.map(p => p.orderRef),
    totalSqft, totalInr,
    draft: acc.print_gate === "payment_first",
  });
}
