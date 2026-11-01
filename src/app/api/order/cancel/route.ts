import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { refundPayment } from "@/lib/razorpay";
import { notifyOrderStatus } from "@/lib/order-notify";

export const runtime = "nodejs";

// Self-serve cancellation (no human). Eligibility is enforced in the DB:
// cancellable only while the order is still queued (before the label/print
// starts) and within 12 hours. If paid, the payment is refunded.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = body?.token;
  if (!token) return NextResponse.json({ ok: false, reason: "missing_token" }, { status: 400 });

  const { data, error } = await supabase.rpc("cancel_order_by_token", { p_token: token });
  if (error) {
    console.error("cancel_order_by_token failed:", error.message);
    return NextResponse.json({ ok: false, reason: "error" }, { status: 500 });
  }

  const r = data as {
    ok: boolean;
    reason?: string;
    order_id?: string;
    order_number?: number;
    was_paid?: boolean;
    razorpay_payment_id?: string | null;
  };

  if (r.ok && r.order_id) {
    if (r.was_paid && r.razorpay_payment_id) {
      try {
        await refundPayment(r.razorpay_payment_id);
      } catch (e) {
        console.error("refund on cancel failed:", e);
      }
    }
    try {
      await notifyOrderStatus(r.order_id, "cancelled");
    } catch (e) {
      console.error("cancel notify failed:", e);
    }
  }

  return NextResponse.json(r);
}
