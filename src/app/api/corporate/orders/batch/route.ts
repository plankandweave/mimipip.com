import { receiverMobile } from "@/lib/receiver-mobile";
import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse, after } from "next/server";
import { checkShipTo } from "@/lib/corporate-ship-to";
import { resolvePincode } from "@/lib/pincode-resolver";
import { checkGstin, gstinStateMismatch } from "@/lib/gstin";
import { can, currentCorporateSession, recordAudit, sessionActor, shipStateAllowed } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  escapeHtml, minOrderShortfall, placeProject, priceProjectLines, projectTotals,
} from "@/lib/corporate-project";
import { recordCommercialEvent } from "@/lib/server-events";
import { sendEmail } from "@/lib/email";
import { partnerWorkflow } from "@/lib/ai-keys";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST -> place one PROJECT: several walls, several designs, one submission.
//
// A partner sale is rarely one wall — Vijay Sales' Series 2 sale is seven
// creatives at seven sizes (~1,200 sq ft). Forcing that through the single-
// order form means seven submissions and seven strays on the dashboard, so
// this endpoint takes the lines together, prices each one server-side exactly
// like the single route, and stamps them all with one group_ref.
//
// The pricing and the placement themselves live in lib/corporate-project.ts —
// a project can also arrive by a second road (a quotation the customer's PO
// raiser approved days later), and those two roads must bill identically.

const DESK_EMAIL = process.env.CORPORATE_DESK_EMAIL || "hello@zyvorah.com";

export async function POST(req: Request) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  // Agreement gate (0095): no mutations on an account that has not signed.
  if (session.agreementPending) {
    return NextResponse.json({ error: "agreement_required" }, { status: 403 });
  }
  if (!can(session, "order")) {
    return NextResponse.json({
      error: "You don't have permission to place orders. Ask one of your account admins.",
    }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const rawLines = Array.isArray(b.lines) ? b.lines : [];
  if (rawLines.length < 1) return NextResponse.json({ error: "Add at least one wall to the project." }, { status: 400 });
  const state = str(b.state);
  if (!state) return NextResponse.json({ error: "Choose the dispatch state." }, { status: 400 });

  const acc = session.account;
  if (!shipStateAllowed(acc, state)) {
    return NextResponse.json({ error: `We don't ship to ${state} on this account. Contact us at hello@zyvorah.com to add it.` }, { status: 400 });
  }
  // Destination is per ORDER (see corporate-ship-to.ts): a blank one is
  // refused here rather than guessed downstream.
  // A blank PIN is looked up, not demanded (pincode-resolver.ts). A typed
  // one is left alone.
  if (!str(b.shipPincode) && str(b.shipAddress)) {
    const found = await resolvePincode({ address: str(b.shipAddress), city: str(b.shipCity), state }, { workflow: partnerWorkflow(acc.slug) });
    if (found) b.shipPincode = found.pincode;
  }
  const shipTo = checkShipTo({ address: b.shipAddress, city: b.shipCity, pincode: b.shipPincode });
  if (!shipTo.ok) return NextResponse.json({ error: shipTo.error }, { status: 400 });
  // The courier rings this number (founder, 14 October 2026); Vijay Sales may
  // leave it blank, the OS carries that receiver's mobile itself.
  const receiver = receiverMobile(acc.slug, b.shipContactPhone);
  if (!receiver.ok) return NextResponse.json({ error: receiver.error }, { status: 400 });

  const priced = await priceProjectLines(acc, rawLines);
  if (!priced.ok) return NextResponse.json({ error: priced.error }, { status: priced.status });
  const lines = priced.lines;

  const shortfall = minOrderShortfall(acc, lines);
  if (shortfall) return NextResponse.json({ error: shortfall }, { status: 400 });

  // Remember this state's address + GSTIN once for the whole project.
  // Partners paste "GSTIN: 24XXXXX..." with the label — the OS caps the field
  // at 20 chars, so a labelled paste fails every push. Keep just the number.
  // A GSTIN is checked BEFORE it is stored. This value is saved against the
  // state profile, so it auto-fills every future order into that state, and the
  // OS matches the accounting customer on it — a malformed one matches nothing
  // and silently mints a new customer instead (`27HCV3778L1ZK`, two letters
  // short, did exactly that on 12 Aug 2026). Blank stays allowed; wrong does not.
  const gstinCheck = checkGstin(b.gstin as string | null | undefined);
  if ("error" in gstinCheck) {
    return NextResponse.json({ error: gstinCheck.error }, { status: 400 });
  }
  const stateMismatch = gstinStateMismatch(gstinCheck.value, state);
  if (stateMismatch) {
    return NextResponse.json({ error: stateMismatch }, { status: 400 });
  }

  const profile = {
    state,
    gstin: gstinCheck.value,
    address_line: shipTo.value.address,
    city: shipTo.value.city,
    pincode: shipTo.value.pincode,
    contact_name: str(b.shipContactName) || null,
    contact_phone: receiver.value,
  };
  await sb.from("corporate_state_profiles").upsert(
    { account_id: acc.id, ...profile, updated_at: new Date().toISOString() },
    { onConflict: "account_id,state" },
  );

  const poNumber = str(b.poNumber) || null;

  const result = await placeProject({
    sb, acc, lines, profile, placedByEmail: session.email, poNumber,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { groupRef, placed } = result;

  // One line per PROJECT, not per wall: "who placed this" is a question about
  // the submission, and each wall already carries placed_by_email of its own.
  await recordAudit(session, "order.place", null, {
    walls: placed.length, orderRefs: placed.map(p => p.orderRef),
  });

  // One event per WALL, not per submission. The audit line above is about who
  // submitted; this is about what was bought, and a batch of six walls is six
  // orders in corporate_orders — so six rows here, or the reconciliation against
  // that table can never balance.
  after(() =>
    Promise.all(
      placed.map((pl) =>
        recordCommercialEvent({
          event: "order_placed",
          subject: pl.id,
          valueInr: pl.line.price.total,
          meta: { family: "corporate", order_ref: pl.orderRef, batch: placed.length },
        }),
      ),
    ),
  );

  const { totalSqft, totalInr, totalExcludedSqft } = projectTotals(placed);
  const failed = placed.filter(p => p.pushError);

  // ONE desk email for the project — seven separate mails for one sale is how
  // a batch gets half-read.
  const actor = sessionActor(session);
  void sendEmail({
    to: DESK_EMAIL,
    subject: `${actor.name} placed project ${groupRef}${actor.isStaff ? ` for ${acc.name}` : ""} — ${placed.length} walls · ${totalSqft} sq ft`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:560px">
      <p><strong>${escapeHtml(actor.name)}</strong>${actor.isStaff ? ` (${escapeHtml(session.email)})` : ""} placed <strong>${placed.length} walls</strong>${actor.isStaff ? ` for <strong>${escapeHtml(acc.name)}</strong>` : ""} as project <strong>${escapeHtml(groupRef)}</strong>${poNumber ? ` (PO ${escapeHtml(poNumber)})` : ""}.</p>
      <table style="border-collapse:collapse;font-size:13px">${placed.map(p => `
        <tr>
          <td style="padding:3px 10px 3px 0"><strong>${escapeHtml(p.orderRef)}</strong></td>
          <td style="padding:3px 10px 3px 0">${escapeHtml(p.line.printName ?? "—")}</td>
          <td style="padding:3px 10px 3px 0">${(p.line.widthMm / 304.8).toFixed(1)} × ${(p.line.heightMm / 304.8).toFixed(1)} ft</td>
          <td style="padding:3px 0">Rs ${p.line.price.total.toLocaleString("en-IN")}</td>
        </tr>`).join("")}
      </table>
      <p><strong>${totalSqft} sq ft · Rs ${totalInr.toLocaleString("en-IN")} incl. GST</strong></p>
      ${totalExcludedSqft > 0 ? `<p style="color:#047857">${totalExcludedSqft} sq ft excluded as marked openings — neither printed nor billed.</p>` : ""}
      <p>${acc.print_gate === "payment_first"
        ? "Payment-first account — all lines are DRAFTS until the partner freezes them."
        : "Credit account — every line has gone to production."}</p>
      ${failed.length ? `<p style="color:#b91c1c">OS push FAILED on ${failed.map(p => escapeHtml(p.orderRef)).join(", ")} — needs a manual retry from the desk.</p>` : ""}
    </div>`,
  });

  return NextResponse.json({
    ok: true,
    groupRef,
    orders: placed.map(p => ({ orderRef: p.orderRef, orderId: p.id })),
    totalSqft, totalInr,
    draft: acc.print_gate === "payment_first",
    warning: failed.length
      ? `Project placed. ${failed.length} wall(s) need manual confirmation by our team — nothing is lost.`
      : undefined,
  });
}
