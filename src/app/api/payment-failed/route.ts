import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { recordCheckoutFailure } from "@/lib/checkout-alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The browser's half of the payment-window watch. Razorpay's checkout emits
// payment.failed with its own error object when a payment dies inside the
// window — the one moment of checkout that, until order #89 (9 October 2026),
// reported to nobody. The gateway sweep in /api/cron/stalled-checkouts finds
// the same death within the hour from the server side; this route is the
// immediate, detailed report for the browsers that survive to send it.
//
// Trust: the caller proves it belongs to the order by knowing the order's
// UUID (handed out only in that browser's own checkout response) or the
// order's private access token. The report writes a diagnostic row and an
// email to us — it can never move money or change the order.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clamp = (v: unknown, n: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const orderId = clamp(body?.orderId, 36);
  const orderToken = clamp(body?.orderToken, 36);
  if ((!orderId || !UUID.test(orderId)) && (!orderToken || !UUID.test(orderToken))) {
    return NextResponse.json({ ok: true });
  }

  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true });

  const query = admin
    .from("orders")
    .select("id, order_number, email, total, payment_status, razorpay_order_id");
  const { data: order } = orderId && UUID.test(orderId)
    ? await query.eq("id", orderId).maybeSingle()
    : await query.eq("access_token", orderToken!).maybeSingle();

  // Unknown order or already paid: nothing to report. Answer ok either way —
  // this route must never teach a prober which UUIDs exist.
  if (!order || order.payment_status !== "pending") return NextResponse.json({ ok: true });

  // One report per order per quarter hour: a customer retrying three times
  // inside the window is one story, not three emails.
  const { data: recent } = await admin
    .from("checkout_failures")
    .select("id")
    .eq("order_id", order.id)
    .eq("stage", "payment_failed")
    .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
    .limit(1);
  if (recent && recent.length > 0) return NextResponse.json({ ok: true });

  const e = body?.error ?? {};
  const detail = [
    clamp(e.code, 60) && `code ${clamp(e.code, 60)}`,
    clamp(e.description, 300),
    clamp(e.reason, 120) && `reason: ${clamp(e.reason, 120)}`,
    (clamp(e.source, 60) || clamp(e.step, 60)) && `at ${[clamp(e.source, 60), clamp(e.step, 60)].filter(Boolean).join("/")}`,
  ]
    .filter(Boolean)
    .join(" · ");

  after(() =>
    recordCheckoutFailure({
      stage: "payment_failed",
      detail: detail || "The payment window reported a failure with no detail.",
      email: order.email,
      orderNumber: order.order_number,
      orderId: order.id,
      valueInr: order.total == null ? null : Math.round(Number(order.total)),
      meta: { via: "browser", rzpOrderId: order.razorpay_order_id },
    }),
  );
  return NextResponse.json({ ok: true });
}
