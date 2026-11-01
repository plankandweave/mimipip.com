import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse } from "next/server";
import { currentCorporateSession } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { maybeCreateRazorpayOrder } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

// Pay Now for a payment-first partner: creates (or returns) the Razorpay Order
// for a FROZEN corporate order, so the portal can open standard Razorpay
// Checkout. The amount is computed here, server-side, from the frozen row's
// stored figures — never from the client, never from the live catalogue (the
// price stopped tracking the catalogue the moment it was frozen).
//
// This route moves no money and marks nothing paid. The verified
// payment.captured webhook (src/lib/corporate-payments.ts) is the only thing
// that ever sets payment_status='paid' and releases production.

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  // Agreement gate (0095): no mutations on an account that has not signed.
  if (session.agreementPending) {
    return NextResponse.json({ error: "agreement_required" }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const acc = session.account;
  if (acc.print_gate !== "payment_first") {
    // Credit partners (Vijay Sales) pay on invoice — there is nothing to pay
    // here, and this button must never appear for them.
    return NextResponse.json({ error: "This account pays on invoice — there's nothing to pay online." }, { status: 400 });
  }

  const { id } = await ctx.params;
  const { data: order } = await sb.from("corporate_orders")
    .select("*").eq("id", id).eq("account_id", acc.id).maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const o = order as Record<string, unknown>;
  if (o.source_study_id && (!o.os_order_id || o.status === "push_failed")) {
    return NextResponse.json({error:"Confirm the order with the OS before payment so its invoice includes customisation."},{status:409});
  }
  if (!o.frozen_at) {
    return NextResponse.json({ error: "Confirm the order first — payment is taken against the locked price." }, { status: 400 });
  }
  if (o.payment_status === "paid") {
    return NextResponse.json({ error: "This order is already paid." }, { status: 400 });
  }
  // Only an UNANSWERED request blocks payment. Once the desk has ruled (0128),
  // a declined request means the piece is printing and is owed for; a granted
  // one has already moved the order to status 'cancelled'.
  if (o.cancel_requested_at && !o.cancel_resolved_at) {
    return NextResponse.json({ error: "You've requested cancellation of this order — contact us before paying." }, { status: 400 });
  }
  if (o.cancel_outcome === "cancelled") {
    return NextResponse.json({ error: "This order was cancelled." }, { status: 400 });
  }

  // The frozen figures ARE the price: stored ex-GST net + stored GST. The same
  // arithmetic the quote locked (priceWall: total = amount + gst_amount) — if
  // the stored pieces don't reconcile, stop rather than guess at money.
  const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
  const net = num(o.amount);
  const gst = num(o.gst_amount);
  const total = num(o.total);
  if (!(total > 0) || Math.abs(total - (net + gst)) > 0.011) {
    console.error("[corporate/pay] stored amounts don't reconcile:", o.order_ref, { net, gst, total });
    return NextResponse.json({ error: "This order's stored amounts don't reconcile — our team has been alerted; please contact hello@zyvorah.com." }, { status: 500 });
  }
  const amountPaise = Math.round(total * 100);
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) return NextResponse.json({ error: "Online payment isn't available right now — pay via the UPI QR on your proforma." }, { status: 503 });

  // Idempotent: one Razorpay Order per corporate order. An unpaid one stays
  // payable indefinitely, so a second click (or a fresh visit) reuses it.
  if (o.razorpay_order_id && o.payment_status === "created") {
    return NextResponse.json({
      ok: true, keyId, razorpayOrderId: String(o.razorpay_order_id),
      amount: amountPaise, orderRef: String(o.order_ref), reused: true,
    });
  }

  // notes are how the webhook routes the capture back to this exact order.
  const rzp = await maybeCreateRazorpayOrder(total, `corp-${String(o.order_ref)}`.slice(0, 40), {
    corporate_order_id: String(o.id),
    order_ref: String(o.order_ref),
  });
  if (!rzp) return NextResponse.json({ error: "Online payment isn't available right now — pay via the UPI QR on your proforma." }, { status: 503 });

  // Claim the slot: only the FIRST creation lands; a concurrent double-click
  // loses the claim and is handed the winner's order instead of minting two.
  const { data: claimed } = await sb.from("corporate_orders")
    .update({ razorpay_order_id: rzp.razorpayOrderId, payment_status: "created" })
    .eq("id", id).is("razorpay_order_id", null)
    .select("id");
  if (!claimed?.length) {
    const { data: fresh } = await sb.from("corporate_orders")
      .select("razorpay_order_id, payment_status").eq("id", id).maybeSingle();
    const f = fresh as Record<string, unknown> | null;
    if (f?.payment_status === "paid") {
      return NextResponse.json({ error: "This order is already paid." }, { status: 400 });
    }
    if (f?.razorpay_order_id) {
      return NextResponse.json({
        ok: true, keyId, razorpayOrderId: String(f.razorpay_order_id),
        amount: amountPaise, orderRef: String(o.order_ref), reused: true,
      });
    }
    return NextResponse.json({ error: "Could not start the payment — please try again." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true, keyId, razorpayOrderId: rzp.razorpayOrderId,
    amount: rzp.amount, orderRef: String(o.order_ref),
  });
}
