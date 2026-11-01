import { NextResponse } from "next/server";
import { staffKey } from "@/lib/staff-key";
import { supabase } from "@/lib/supabase";
import { generateDispatchInvoice } from "@/lib/dispatch-invoice";
import { notifyOrderStatus } from "@/lib/order-notify";
import { signDoc } from "@/lib/private-doc";

export const runtime = "nodejs";
export const maxDuration = 60;

// Admin status transitions run through the server so each one can fire its
// customer email (and generate the GST tax invoice on dispatch). The caller
// must be signed in; admin_set_order_status re-checks the key that stands for. Shipping is the one human step —
// courier/AWB/tracking are captured on the order, then the "shipped" email
// carries them to the customer.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { orderId, status } = body ?? {};
  if (!orderId || !status) return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const { error } = await supabase.rpc("admin_set_order_status", {
    p_key: await staffKey(req),
    p_order_id: orderId,
    p_status: status,
  });
  if (error) {
    console.error("admin advance failed:", error.message);
    return NextResponse.json({ error: "update_failed" }, { status: 400 });
  }

  let invoiceUrl: string | null = null;
  if (status === "shipped") {
    try {
      invoiceUrl = await generateDispatchInvoice(orderId);
    } catch (e) {
      console.error("dispatch invoice generation failed:", e);
    }
  }

  try {
    await notifyOrderStatus(orderId, status);
  } catch (e) {
    console.error("notify failed:", e);
  }

  // Signed rather than returned as a bucket reference: nothing consumes this
  // today, and a dead URL sitting in a response is a trap for whoever does.
  return NextResponse.json({ ok: true, invoiceUrl: await signDoc(invoiceUrl) });
}
