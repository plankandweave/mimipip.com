import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { notifyOrderStatus } from "@/lib/order-notify";
import { generateDispatchInvoice } from "@/lib/dispatch-invoice";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// Automated production signal — the print/RIP system calls this (no human) when
// a label prints (production started) and when a mural finishes printing.
// Secret-gated via PRODUCTION_WEBHOOK_SECRET. Moving to 'in_production' closes
// the cancellation window; each transition fires its customer email.
//
// POST { secret, orderNumber, event }
//   event ∈ started|printing|label_printed | completed|printed|done | dispatched|shipped
//
// 'dispatched' is called by the OS desk when it scans the POD. The OS
// deliberately does NOT email the customer for a website order — this route
// does, so the customer gets our ONE dispatch email (tracking + the installer,
// their start OTP and what to expect) instead of one message per system.
// Courier/AWB/tracking ride along so that email can carry them.
//
// Dispatched – closed (Roheena, 9 October 2026): a courier parcel to a
// customer closes the moment it leaves with a tracking number. The OS decides
// which parcels qualify and says so with `closed: true` on 'dispatched', or
// with event 'closed' (a backfill, or an AWB that came back later). Closing
// only stamps orders.parcel_closed_at: the status stays 'shipped', no email is
// sent and nothing about payment changes.
export async function POST(req: Request) {
  const secret = process.env.PRODUCTION_WEBHOOK_SECRET;
  // The OS authenticates with the token the two systems ALREADY share, so the
  // dispatch handoff needs no new secret provisioned on its side. That token
  // also authorises creating orders and reading install briefs, so accepting it
  // here grants its holder nothing it couldn't already do.
  const osToken = process.env.ZYVORAH_WEBHOOK_TOKEN;
  if (!secret && !osToken) return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const supplied = body?.secret;
  const authorised =
    (typeof supplied === "string" && supplied.length > 0) &&
    ((!!secret && supplied === secret) || (!!osToken && supplied === osToken));
  if (!authorised) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const orderNumber = Number(body?.orderNumber);
  if (!orderNumber || !Number.isFinite(orderNumber)) {
    return NextResponse.json({ error: "invalid_order_number" }, { status: 400 });
  }

  const ev = String(body?.event ?? "").toLowerCase();
  if (ev === "closed") {
    const closed = await markParcelClosed(orderNumber);
    if (!closed.ok) return NextResponse.json({ error: closed.error }, { status: closed.status });
    return NextResponse.json({ ok: true, orderNumber, closed: true });
  }
  const status =
    ["started", "printing", "label_printed", "label"].includes(ev)
      ? "in_production"
      : ["completed", "printed", "done", "complete"].includes(ev)
        ? "printed"
        : ["dispatched", "shipped"].includes(ev)
          ? "shipped"
          : null;
  if (!status) return NextResponse.json({ error: "unknown_event" }, { status: 400 });

  const { data, error } = await supabase.rpc("set_order_status_by_number", {
    p_order_number: orderNumber,
    p_status: status,
  });
  if (error || !data) {
    if (error) console.error("set_order_status_by_number failed:", error.message);
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }

  const orderId = (data as { order_id: string }).order_id;

  // Dispatch invoice: this webhook is the OS's dispatch handoff, so it must
  // generate the invoice on the same trigger as /api/admin/advance does
  // (status becoming 'shipped') — previously only the admin path did this,
  // so orders dispatched via the OS (retail AND trade) never got one. GST tax
  // invoice for INR orders, commercial export invoice for USD orders
  // (lib/dispatch-invoice.ts). Idempotent (early-returns if already issued)
  // and never blocks the response on failure, matching admin/advance's posture.
  if (status === "shipped") {
    try {
      await generateDispatchInvoice(orderId);
    } catch (e) {
      console.error("dispatch invoice generation failed:", e);
    }
  }

  // Save what the courier gave the OS, so the dispatch email can show real
  // tracking rather than a bare "it's on its way". Best-effort: a missing
  // courier must not cost the customer their email.
  if (status === "shipped" && (body?.courier || body?.awb || body?.trackingUrl)) {
    const { error: shipErr } = await supabase.rpc("set_order_shipping", {
      p_order_id: orderId,
      p_courier: body.courier ?? null,
      p_awb: body.awb ?? null,
      p_tracking_url: body.trackingUrl ?? null,
    });
    if (shipErr) console.error("set_order_shipping failed:", shipErr.message);
  }

  if (status === "shipped" && body?.closed === true) {
    const closed = await markParcelClosed(orderNumber);
    if (!closed.ok) console.error("parcel close failed:", closed.error);
  }

  try {
    await notifyOrderStatus(orderId, status);
  } catch (e) {
    console.error("notify failed:", e);
  }

  return NextResponse.json({ ok: true, orderNumber, status });
}

/** Stamp "dispatched – closed" on a shipped order. Service role only. */
async function markParcelClosed(orderNumber: number): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const admin = supabaseAdmin();
  if (!admin) return { ok: false, error: "store_admin_not_configured", status: 503 };
  const { data, error } = await admin.rpc("set_order_parcel_closed", { p_order_number: orderNumber });
  if (error) {
    console.error("set_order_parcel_closed failed:", error.message);
    return { ok: false, error: "close_failed", status: 500 };
  }
  if (!data) return { ok: false, error: "order_not_shipped", status: 404 };
  return { ok: true };
}
