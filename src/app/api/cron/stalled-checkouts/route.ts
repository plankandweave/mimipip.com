import { NextResponse } from "next/server";
import { recoverExclusivePayments } from "@/lib/concept-payment-recovery";
import { withCronRun } from "@/lib/cron-run";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { recordCheckoutFailure } from "@/lib/checkout-alert";
import { classifyGatewayPayments, fetchGatewayPayments } from "@/lib/payment-autopsy";
import { isInternalOrder } from "@/lib/internal-orders";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Somebody started checking out and no order ever appeared.
 *
 * The safety net BEHIND the explicit failure alerts in /api/checkout. Those
 * cover the paths we thought of; this covers the ones we did not. It is also
 * the half that would actually have caught orders #54 and #56: both died
 * inside a request the runtime killed outright for memory, and a process that
 * is killed writes no failure row and returns no error — the browser just sees
 * a dead socket. The only durable trace is a checkout_start with nothing after
 * it, which is exactly what this reads.
 *
 * Deliberately NOT an abandoned-cart marketing sweep. It fires on a checkout
 * that STARTED — the customer had pressed the button — and it goes to us, not
 * to them.
 *
 * Dedupe: one alert per visitor token per stalled checkout, recorded as a
 * checkout_failures row with stage 'stalled_checkout'. The cron runs every
 * few minutes; without this it would re-report the same stall for 24 hours.
 *
 * Auth: Vercel cron sends `Authorization: Bearer <CRON_SECRET>`.
 */

/** Long enough that a customer still typing their card is not "stalled",
 *  short enough that we hear about it while they may still be reachable. */
const GRACE_MINUTES = 20;
const WINDOW_HOURS = 24;

/** The unpaid-order autopsy looks further back than the stall sweep: an order
 *  is a durable row, its failure stays actionable for days, and the per-order
 *  dedupe means an old order is examined once, not re-reported. */
const AUTOPSY_WINDOW_DAYS = 7;
/** Gateway lookups per run, so the sweep can never spend its whole budget
 *  on Razorpay — same bound concept-payment-recovery uses. */
const AUTOPSY_LOOKUPS_PER_RUN = 5;

/**
 * The third half of the checkout watch (see lib/checkout-alert.ts): orders
 * that EXIST and stay unpaid. The stall sweep below cannot see them — their
 * checkout_start has an order_placed after it — and the browser reports
 * success and dismissal but not what the gateway did. So ask the gateway.
 * Order #89 (9 October 2026, ₹30,439, Canada) sat in exactly this blind spot
 * through two payment attempts seventeen hours apart.
 *
 * Also the net under a dead webhook: a payment CAPTURED while the browser
 * died is found here and the order marked paid — previously only exclusive
 * orders got that rescue (concept-payment-recovery.ts).
 */
async function sweepUnpaidPaymentLegs(
  admin: NonNullable<ReturnType<typeof supabaseAdmin>>,
): Promise<{ examined: number; alerted: number; recovered: number }> {
  const now = Date.now();
  const { data, error } = await admin
    .from("orders")
    .select("id, order_number, email, total, created_at, razorpay_order_id, shipping_address")
    .eq("status", "pending")
    .eq("payment_status", "pending")
    .not("razorpay_order_id", "is", null)
    .gte("created_at", new Date(now - AUTOPSY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString())
    .lte("created_at", new Date(now - GRACE_MINUTES * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) {
    console.error("unpaid-order sweep query failed:", error.message);
    return { examined: 0, alerted: 0, recovered: 0 };
  }

  type Row = {
    id: string;
    order_number: number;
    email: string | null;
    total: number | string | null;
    created_at: string;
    razorpay_order_id: string;
    shipping_address: { countryCode?: string; country?: string } | null;
  };

  let examined = 0;
  let alerted = 0;
  let recovered = 0;

  for (const row of (data ?? []) as Row[]) {
    if (examined >= AUTOPSY_LOOKUPS_PER_RUN) break;
    // The flow checker places real orders it never pays; those are expected
    // non-payments, not customers (orders #83–88 were exactly this, and a
    // report that cannot tell them apart cried wolf about six of them).
    if (isInternalOrder(row.email)) continue;

    // One examination per order, however many times the cron sees it.
    const { data: seen } = await admin
      .from("checkout_failures")
      .select("id")
      .eq("order_id", row.id)
      .in("stage", ["payment_failed", "payment_abandoned"])
      .limit(1);
    if (seen && seen.length > 0) continue;

    examined++;
    const state = await fetchGatewayPayments(row.razorpay_order_id);
    // No keys or no answer: leave the order unexamined and try next run.
    if (!state) continue;

    const autopsy = classifyGatewayPayments(row.razorpay_order_id, state.gateway, state.payments);
    const valueInr = row.total == null ? null : Math.round(Number(row.total));
    const country = row.shipping_address?.countryCode || row.shipping_address?.country || "IN";

    if (autopsy.kind === "captured") {
      // The money arrived and nothing told us — the webhook-less UPI/closed-tab
      // case. Same steps, same idempotent RPCs as the webhook and verify paths.
      const { error: paidError } = await admin.rpc("mark_order_paid_by_rzp", {
        p_rzp_order_id: row.razorpay_order_id,
        p_payment_id: autopsy.paymentId,
        p_signature: "verified-gateway-recovery",
      });
      if (paidError) {
        console.error(`unpaid-order sweep: #${row.order_number} captured at gateway but could not be marked paid:`, paidError.message);
        continue;
      }
      const { spendReservedGift, settlePaidOrder, produceThenNotify } = await import("@/lib/retail-paid");
      await spendReservedGift(row.id);
      await settlePaidOrder(row.id, { paymentReference: autopsy.paymentId });
      await produceThenNotify(row.id);
      recovered++;
      continue;
    }

    if (autopsy.kind === "no_attempts") {
      await recordCheckoutFailure({
        stage: "payment_abandoned",
        detail:
          `Order #${row.order_number} (${country}) was placed, the payment window opened, and the gateway recorded ZERO payment attempts.` +
          (country !== "IN"
            ? " This is an international order — if the window offered no usable payment method, enabling international payments on the Razorpay account is the fix, not asking the customer to retry."
            : ""),
        email: row.email,
        orderNumber: row.order_number,
        orderId: row.id,
        valueInr,
        meta: { rzpOrderId: row.razorpay_order_id, via: "gateway-sweep", country },
      });
      alerted++;
      continue;
    }

    // failed or authorized: the gateway's own account of the death.
    await recordCheckoutFailure({
      stage: "payment_failed",
      detail:
        autopsy.kind === "failed"
          ? `Order #${row.order_number} (${country}): ${autopsy.attempts} failed attempt${autopsy.attempts === 1 ? "" : "s"} at the gateway. Last attempt — ${autopsy.detail}`
          : `Order #${row.order_number} (${country}): ${autopsy.detail}`,
      email: row.email,
      orderNumber: row.order_number,
      orderId: row.id,
      valueInr,
      meta: {
        rzpOrderId: row.razorpay_order_id,
        via: "gateway-sweep",
        country,
        ...(autopsy.kind === "failed" ? { attempts: autopsy.attempts, methods: autopsy.methods } : { paymentId: autopsy.paymentId }),
      },
    });
    alerted++;
  }

  return { examined, alerted, recovered };
}

async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  // Only the authenticated scheduled run may recover captured exclusive orders.
  if (secret) await recoverExclusivePayments();

  // Orders that exist and stay unpaid: ask the gateway what happened inside
  // the payment window (and mark paid any the webhook-less site never heard
  // about). Gateway reads and idempotent paid RPCs only.
  const unpaid = secret
    ? await sweepUnpaidPaymentLegs(admin)
    : { examined: 0, alerted: 0, recovered: 0 };

  const { data, error } = await admin.rpc("stalled_checkouts", {
    p_grace_minutes: GRACE_MINUTES,
    p_window_hours: WINDOW_HOURS,
  });
  if (error) {
    console.error("stalled_checkouts failed:", error.message);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const rows = (data ?? []) as { token: string; started_at: string; value_inr: number | null }[];
  let alerted = 0;

  for (const row of rows) {
    // Already reported? The token is the natural key — one stalled checkout per
    // visitor, however many times this cron sees it.
    const { data: seen } = await admin
      .from("checkout_failures")
      .select("id")
      .eq("stage", "stalled_checkout")
      .eq("session_token", row.token)
      .gte("created_at", row.started_at)
      .limit(1);
    if (seen && seen.length > 0) continue;

    // Enrich, because an alert that cannot say WHO or HOW MUCH is one nobody
    // can act on — the recovery is a phone call, and you cannot ring a token.
    //
    // Two attempts, in order of certainty:
    //  1. orders.visitor_token — exact, when it is there. Today it is null on
    //     every order in the table, so this is currently the branch that never
    //     fires; it stays first because it is the correct join the moment the
    //     token starts being written, and costs one indexed lookup.
    //  2. The nearest unpaid order in time. A guess, and labelled as one — but
    //     it is the guess that turns "someone stalled at 18:01" into "shades
    //     furnishings, Rs 18,639, order #56", which is the whole point.
    type OrderRow = {
      order_number?: number;
      email?: string;
      total?: number;
      status?: string;
      payment_status?: string;
    };

    const started = new Date(row.started_at);
    const NEAR_MS = 30 * 60 * 1000;

    const { data: exact } = await admin
      .from("orders")
      .select("order_number, email, total, status, payment_status")
      .eq("visitor_token", row.token)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let o = exact as OrderRow | null;
    let matchedBy: "token" | "time" | null = o ? "token" : null;

    if (!o) {
      const { data: near } = await admin
        .from("orders")
        .select("order_number, email, total, status, payment_status")
        .neq("payment_status", "paid")
        .gte("created_at", new Date(started.getTime() - NEAR_MS).toISOString())
        .lte("created_at", new Date(started.getTime() + NEAR_MS).toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      o = (near as OrderRow | null) ?? null;
      if (o) matchedBy = "time";
    }

    await recordCheckoutFailure({
      stage: "stalled_checkout",
      detail:
        `Checkout started ${started.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST` +
        ` and no order was recorded within ${GRACE_MINUTES} minutes.` +
        (o?.order_number
          ? matchedBy === "token"
            ? ` Order #${o.order_number} belongs to this visit (${o.status}/${o.payment_status}) — it may be unpaid and unpayable.`
            : ` An unpaid order #${o.order_number} (${o.status}/${o.payment_status}) was created within 30 minutes of this — very likely the same customer, though not confirmed.`
          : " No unpaid order was created near this time, so the attempt may have died before an order row existed."),
      email: o?.email ?? null,
      orderNumber: o?.order_number ?? null,
      valueInr: row.value_inr ?? o?.total ?? null,
      sessionToken: row.token,
      meta: { startedAt: row.started_at, graceMinutes: GRACE_MINUTES, matchedBy },
    });
    alerted++;
  }

  return NextResponse.json({ ok: true, stalled: rows.length, alerted, unpaid });
}

export const GET = withCronRun("stalled-checkouts", handler);
