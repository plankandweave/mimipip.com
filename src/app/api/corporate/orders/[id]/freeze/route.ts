import { partnerCapabilities } from "@/lib/partner-capabilities";
import { istDateKey } from "@/lib/ist";
import { NextResponse } from "next/server";
import { can, currentCorporateSession, sessionActor } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { pushCorporateOrderToOs } from "@/lib/corporate-os";
import { engineOpeningsFromStored } from "@/lib/corporate-openings";
import { WALLPAPER_PRINT_TYPE, printRulesFor } from "@/lib/print-types";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Freezing is the commitment point for a partner who quotes their own client:
// the price stops tracking the catalogue, the order goes to production, and
// (for payment-first partners) the OS holds it at "awaiting payment" until the
// money lands. Everything before this is a draft they can keep re-quoting.
//
// Deliberately idempotent: a double-click must not push the same order twice.

const DESK_EMAIL = process.env.CORPORATE_DESK_EMAIL || "hello@zyvorah.com";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  // Agreement gate (0095): no mutations on an account that has not signed.
  if (session.agreementPending) {
    return NextResponse.json({ error: "agreement_required" }, { status: 403 });
  }
  // Freezing IS the spend — it pushes the order to production. Placing the
  // order was already gated on "order"; the commitment point must be too, or
  // a designer session (our staff included) could commit somebody's draft.
  if (!can(session, "order")) {
    return NextResponse.json({
      error: "Only a teammate with ordering permission can confirm an order to production.",
    }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { id } = await ctx.params;
  const acc = session.account;

  const { data: order } = await sb.from("corporate_orders")
    .select("*").eq("id", id).eq("account_id", acc.id).maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const o = order as Record<string, unknown>;
  if (o.frozen_at && (!o.source_study_id || (o.os_order_id && o.status !== "push_failed"))) {
    return NextResponse.json({ ok: true, alreadyFrozen: true, orderRef: o.order_ref });
  }

  const num = (v: unknown) => Number(v ?? 0);

  // Per-account minimum order (migration 0094), enforced HERE — at the
  // commitment point — never while the partner is quoting drafts. Compared on
  // the ex-GST net, the figure the minimum is set in. Null/0 = no minimum.
  const minOrder = num(acc.min_order_value_inr);
  const netAmount = num(o.amount);
  if (minOrder > 0 && netAmount + 0.001 < minOrder) {
    const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
    return NextResponse.json({
      error: `Minimum order is ${fmt(minOrder)} (ex-GST) — this order is ${fmt(netAmount)}, ${fmt(minOrder - netAmount)} short. Add walls or area to reach the minimum before confirming.`,
    }, { status: 400 });
  }

  const validity = Number(acc.proposal_validity_days ?? 30);
  const frozenAt = new Date();

  // Stamp the freeze BEFORE pushing: if the OS call fails we still have a
  // committed order to retry from, rather than a draft that silently reopened
  // to catalogue price changes.
  const { error: freezeErr } = await sb.from("corporate_orders").update({
    frozen_at: frozenAt.toISOString(),
    status: "frozen",
    // A validity date is a day on the Indian calendar; slicing the ISO string
    // in UTC expired the quote a day early for anything frozen after 18:30 UTC.
    proposal_valid_until: istDateKey(new Date(frozenAt.getTime() + validity * 86_400_000)),
  }).eq("id", id);
  if (freezeErr) {
    console.error("[corporate/freeze] update failed:", freezeErr.message);
    return NextResponse.json({ error: "Could not freeze the order." }, { status: 500 });
  }

  // Bill-time truth, replayed — the draft was quoted against the plan stored at
  // order time, so freezing must send THAT, not a fresh plan against whatever
  // the OS panel rules happen to say today.
  const stored = engineOpeningsFromStored(o.openings);

  // The print rules this wall goes to production under. Read from the type
  // STORED on the order, not re-derived from the product now: a wall quoted as
  // a wrap must freeze as a wrap even if the catalogue is re-categorised in
  // between. Rows written before migration 0104 default to wallpaper, which is
  // what the OS sent for all of them anyway.
  const printType = (o.print_type as string | null) ?? WALLPAPER_PRINT_TYPE;
  const printRules = await printRulesFor(sb, printType);

  const push = await pushCorporateOrderToOs({
    orderRef: String(o.order_ref),
    accountName: acc.name,
    channel: acc.slug.replace(/-/g, "_"),
    placedByEmail: String(o.placed_by_email || session.email),
    poNumber: (o.po_number as string | null) ?? null,
    // The sale this wall belongs to. Sent so the OS raises ONE proforma for the
    // whole project and one payment clears every wall of it.
    groupRef: (o.group_ref as string | null) ?? null,
    printName: (o.print_name as string | null) ?? null,
    designUrl: String(o.design_url),
    designRef: (o.design_ref as string | null) ?? null,
    widthMm: num(o.width_mm),
    heightMm: num(o.height_mm),
    amountInr: num(o.total),
    partnerCheckout: o.service_breakdown ? o.service_breakdown as {wallpaper:number;customisation:number;total:number} : undefined,
    productHandle: o.product_handle as string | null,
    materialSlug: o.material_slug as string | undefined,
    ratePerSqft: num(o.rate_per_sqft),
    gstin: (o.gstin as string | null) ?? null,
    state: (o.state as string | null) ?? null,
    shipAddress: (o.ship_address as string | null) ?? null,
    shipCity: (o.ship_city as string | null) ?? null,
    shipPincode: (o.ship_pincode as string | null) ?? null,
    shipContactName: (o.ship_contact_name as string | null) ?? null,
    shipContactPhone: (o.ship_contact_phone as string | null) ?? null,
    placement: (o.crop_data as never) ?? null,
    // Production policy travels with the order so the OS can hold it rather
    // than us relying on the two systems independently agreeing on terms.
    printGate: acc.print_gate,
    discountPct: num(o.discount_pct),
    listAmount: num(o.list_amount),
    openings: stored.openings,
    excludedSqft: stored.excludedSqft,
    chargeableSqft: stored.chargeableSqft,
    // The floor the quote was built on, from the ROW — a draft priced before
    // migration 0106 has none, and freezing must not invent one.
    minBillableWidthMm: (o.min_billable_width_mm as number | null) ?? null,
    billedSqft: num(o.area_sqft) || null,
    printType,
    printRules,
  });

  await sb.from("corporate_orders").update(
    push.ok
      ? { os_order_id: push.osOrderId ?? null, status: "frozen" }
      : { status: "push_failed", push_error: push.error ?? "unknown" },
  ).eq("id", id);

  if (o.source_study_id && !push.ok) return NextResponse.json({error:push.error ?? "The OS could not confirm this order. Retry confirmation before paying."},{status:503});
  const paymentFirst = acc.print_gate === "payment_first";
  const sizeLine = `${(num(o.width_mm) / 304.8).toFixed(1)} × ${(num(o.height_mm) / 304.8).toFixed(1)} ft`;

  // Tell our desk and the partner in the same breath — nobody should have to
  // ask what happens next.
  const actor = sessionActor(session);
  void sendEmail({
    to: DESK_EMAIL,
    subject: `${actor.name} froze ${o.order_ref}${actor.isStaff ? ` for ${acc.name}` : ""} — ${paymentFirst ? "awaiting payment" : "to production"}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px">
      <p><strong>${escapeHtml(actor.name)}</strong>${actor.isStaff ? ` (${escapeHtml(session.email)})` : ""} froze order <strong>${escapeHtml(String(o.order_ref))}</strong>${actor.isStaff ? ` on the <strong>${escapeHtml(acc.name)}</strong> account` : ""}.</p>
      <p>${escapeHtml(String(o.print_name || "Custom wall"))} · ${sizeLine} · Rs ${num(o.total).toLocaleString("en-IN")}</p>
      <p>${paymentFirst
        ? "Payment-first account — the OS is holding this until payment is confirmed on the desk."
        : "Credit account — this has gone straight to production."}</p>
      ${push.ok ? "" : `<p style="color:#b91c1c">OS push FAILED: ${escapeHtml(push.error ?? "unknown")} — needs a manual retry.</p>`}
    </div>`,
  });

  void sendEmail({
    to: String(o.placed_by_email || session.email),
    subject: `Order ${o.order_ref} confirmed${paymentFirst ? " — payment next" : ""}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px">
      <p style="font-size:14px;color:#475569">Thank you — <strong>${escapeHtml(String(o.order_ref))}</strong> is confirmed and the price is locked.</p>
      <p style="font-size:14px;color:#0f172a">${escapeHtml(String(o.print_name || "Custom wall"))} · ${sizeLine} · Rs ${num(o.total).toLocaleString("en-IN")} incl. GST</p>
      ${paymentFirst
        ? `<p style="font-size:14px;color:#0f172a">We'll email your proforma invoice shortly. It carries a UPI QR — scan it to pay,
             and printing begins as soon as the payment reaches us. If your client is raising a purchase order,
             reply to this email with the PO attached or upload it on your portal.</p>`
        : `<p style="font-size:14px;color:#0f172a">This is now in production. Your invoice follows on dispatch.</p>`}
      <p style="font-size:12px;color:#94a3b8;margin-top:22px">Zyvorah · made-to-order wallpaper</p>
    </div>`,
  });

  if (!push.ok) {
    console.error("[corporate/freeze] OS push failed:", push.error);
    return NextResponse.json({
      ok: true, orderRef: o.order_ref, frozen: true,
      warning: "Order frozen. Our team is confirming it with production manually.",
    });
  }

  return NextResponse.json({ ok: true, orderRef: o.order_ref, frozen: true, paymentFirst });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
