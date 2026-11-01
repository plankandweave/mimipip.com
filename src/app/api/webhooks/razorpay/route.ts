import { NextResponse, after } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay-verify";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { processTradePayoutFor, confirmTradePayoutProcessed, confirmTradePayoutFailed } from "@/lib/trade-ledger";
import { corporateCaptureOf, handleCorporateCapture } from "@/lib/corporate-payments";
import { tradeLinkPaidOf } from "@/lib/trade-link-paid";
import { handleTradeLinkPaid } from "@/lib/trade-os";
import { recordCommercialEvent } from "@/lib/server-events";
import { sendGaPurchaseForOrder } from "@/lib/ga-mp";
import { sendMetaPurchaseForOrder } from "@/lib/meta-capi";
import { releaseSoldExclusiveFromNav } from "@/lib/concept-availability";
import { refundLedgerInput } from "@/lib/measurement-report";

async function produceTradeOrder(orderId: string): Promise<void> {
  try {
    const { producePaidOrder } = await import("@/lib/retail-paid");
    await producePaidOrder(orderId);
  } catch (e) {
    console.error(`trade order ${orderId}: print files / order copy failed:`, e);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Razorpay webhook receiver. Until now the site had NO webhook — payment
// confirmation was purely the browser calling /api/razorpay/verify. That is
// fine for on-site checkout but useless for payment links (trade orders),
// where the customer pays on Razorpay's page and no browser of ours is
// involved. This route is the server-side source of truth for those.
//
// Security: HMAC-SHA256 of the RAW body against RAZORPAY_WEBHOOK_SECRET (the
// dashboard's webhook secret — NOT the key secret). Without the secret we
// reject everything: an unverified "payment_link.paid" is an instruction to
// pay out commission, which is exactly what a forged request would want.
//
// Idempotency: Razorpay retries and can double-deliver. Every event is
// claimed by inserting its x-razorpay-event-id into razorpay_events first;
// losing that insert means the event was already handled — return 200 and do
// nothing, so retries and replays are harmless.

type RazorpayWebhookEvent = {
  event: string; // e.g. "payment_link.paid", "payout.processed"
  created_at?: number;
  payload?: Record<string, unknown>;
};

export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  if (!signature || !verifyWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let event: RazorpayWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }
  if (!event?.event) return NextResponse.json({ error: "bad_payload" }, { status: 400 });

  const admin = supabaseAdmin();
  // Without storage we can't guarantee exactly-once handling; 503 makes
  // Razorpay retry later rather than us processing an unclaimable event.
  if (!admin) return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });

  // Persist refund money before claiming the webhook event. If this write
  // fails, Razorpay's retry must be able to attempt it again; claiming first
  // would make the retry look like an already-finished duplicate.
  if (event.event === "refund.created" || event.event === "refund.processed") {
    const ledger = refundLedgerInput(event);
    if (!ledger.ok) {
      // This is a signed money event. Acknowledging malformed money would stop
      // provider retries and let a later report claim complete refund coverage.
      console.error("razorpay webhook: signed refund missing required ledger fields", { event: event.event });
      return NextResponse.json({ error: "refund_missing_fields" }, { status: 500 });
    }
    const { error: refundError } = await admin.rpc("record_payment_refund", {
      p_refund_id: ledger.value.refundId,
      p_payment_id: ledger.value.paymentId,
      p_amount: ledger.value.amount,
      p_currency: ledger.value.currency,
      p_provider_status: ledger.value.providerStatus,
      p_provider_created_at: ledger.value.providerCreatedAt,
      p_processed_at: ledger.value.processedAt,
    });
    if (refundError) {
      console.error("razorpay webhook: refund ledger failed:", refundError.message);
      return NextResponse.json({ error: "refund_ledger_failed" }, { status: 500 });
    }
  }

  // A signed capture must confirm retail orders even if the buyer closed the browser.
  // Run before claiming the event: failures remain retryable, and the paid trigger is idempotent.
  if(event.event==="payment.captured"){
    const payment=(event.payload as {payment?:{entity?:{id?:string;order_id?:string}}})?.payment?.entity;
    if(payment?.id&&payment.order_id){
      const {data:retail,error:lookupError}=await admin.from("orders").select("id").eq("razorpay_order_id",payment.order_id).maybeSingle();
      if(lookupError)return NextResponse.json({error:"retail_lookup_failed"},{status:503});
      if(retail){
        const {data:paidPayload,error:paidError}=await admin.rpc("mark_order_paid_by_rzp",{p_rzp_order_id:payment.order_id,p_payment_id:payment.id,p_signature:"verified-webhook"});
        if(paidError)return NextResponse.json({error:"retail_confirmation_failed"},{status:503});
        after(()=>releaseSoldExclusiveFromNav(retail.id));
        // The order becomes an order here too, not only at /api/razorpay/verify.
        // Until 8 October 2026 this branch marked the order paid and stopped:
        // a customer whose browser never came back from the UPI app had paid
        // for a wall that got no ZVY number, no print files, no OS push and no
        // confirmation email. The same steps as verify (lib/retail-paid.ts),
        // all idempotent, so verify and this webhook racing cannot double them.
        const paymentId=payment.id;
        after(async()=>{
          const {spendReservedGift,settlePaidOrder,produceThenNotify}=await import("@/lib/retail-paid");
          // A partial gift card reserved at checkout is spent only on payment.
          await spendReservedGift(retail.id);
          await settlePaidOrder(retail.id,{paymentReference:paymentId,shipping:(paidPayload as import("@/lib/fulfillment/types").ShippingOrder|null)??null});
          await produceThenNotify(retail.id);
        });
        // The GA4 purchase for a buyer whose browser never came back —
        // the only path that reports it. No-op if the verify route already did.
        after(()=>sendGaPurchaseForOrder(retail.id));
        // Likewise for Meta. This webhook is a server-to-server call from
        // Razorpay, so it carries none of the shopper's cookies — match
        // quality rests on the hashed email and phone on the order. Meta
        // drops this one if the verify route's already landed.
        after(()=>sendMetaPurchaseForOrder(retail.id));
        // Spend the order's discount code for a buyer whose browser never came
        // back to /api/razorpay/verify — until 7 October 2026 only verify did,
        // so a closed tab left a one-use code open. Idempotent with verify: a
        // collaboration row is marked once, and the OS answers a second redeem
        // of the same code harmlessly.
        after(async()=>{
          const {data:o}=await admin.from("orders").select("discount_code, order_number").eq("id",retail.id).maybeSingle();
          const row=o as {discount_code?:string|null;order_number?:number}|null;
          if(row?.discount_code&&row.order_number!=null){
            const {redeemDiscount}=await import("@/lib/discounts");
            await redeemDiscount(row.discount_code,{orderId:retail.id,orderNumber:row.order_number});
          }
        });
      }
    }
  }

  // Razorpay sends a unique event id per event; retries reuse it.
  const eventId = req.headers.get("x-razorpay-event-id");
  if (!eventId) return NextResponse.json({ error: "missing_event_id" }, { status: 400 });

  const { data: claimed, error } = await admin
    .from("razorpay_events")
    .upsert(
      { event_id: eventId, event_type: event.event, payload: event.payload ?? null },
      { onConflict: "event_id", ignoreDuplicates: true },
    )
    .select("event_id");
  if (error) {
    console.error("razorpay webhook: claim failed:", error.message);
    return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  }
  if (!claimed?.length) {
    // Already handled once — with ONE exception. A corporate payment.captured
    // may have recorded its paid state but failed the OS release call on the
    // first delivery; a redelivery is our retry. handleCorporateCapture is
    // idempotent (the paid transition and its emails happen at most once), so
    // re-running it here only re-attempts the OS release. Every other event
    // type stays exactly as before: acknowledged and skipped.
    const cap = corporateCaptureOf(event);
    if (cap) {
      const r = await handleCorporateCapture(cap);
      return NextResponse.json({ ok: r.ok, duplicate: true, outcome: r.outcome }, { status: r.retry ? 500 : 200 });
    }
    // Same reasoning for a trade payment_link.paid: the paid stamp and the
    // commission ledger row happen at most once inside mark_trade_order_paid,
    // so a redelivery only ever retries the OS push (which the first delivery
    // may have failed — that failure is why we answered 500 and Razorpay is
    // back here at all). Commission payout is not re-fired: the trade-payouts
    // cron already sweeps any ledger row the first delivery's attempt missed.
    const tl = tradeLinkPaidOf(event);
    if (tl) {
      const r = await handleTradeLinkPaid(tl);
      if (r.orderId) after(() => produceTradeOrder(r.orderId!));
      return NextResponse.json({ ok: r.ok, duplicate: true, outcome: r.outcome }, { status: r.retry ? 500 : 200 });
    }
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // The trade-partner money engine. Each case does the fast, required DB write
  // inline (so the ack to Razorpay is quick and reliable) and defers the
  // slower network call (payout attempt, PDF generation) to after() — same
  // split the retail razorpay/verify route uses. after() isn't guaranteed to
  // fire on every Vercel invocation (see src/app/api/cron/studio-drain's own
  // comment on this), which is exactly why /api/cron/trade-payouts exists as
  // a backstop sweep.
  switch (event.event) {
    case "payment_link.paid": {
      const cap = tradeLinkPaidOf(event);
      if (!cap) {
        console.error("razorpay webhook: payment_link.paid without a trade-<n> reference — ignored", {
          event_id: eventId,
        });
        return NextResponse.json({ ok: true, ignored: "missing_fields" });
      }

      // Stamp the order paid AND hand it to the OS with the payment attached
      // (mark_trade_order_paid + pushOrderToOs). The push is awaited, not
      // after()ed, for the same reason the corporate capture below is: it is
      // the call that releases production, and a retry-worthy failure must 500
      // so Razorpay redelivers — the duplicate branch above re-runs it, and
      // every leg is idempotent, so a redelivery can only heal.
      const r = await handleTradeLinkPaid(cap);
      // Print files and the order copy, after the reply — the same slow half
      // retail runs once the order is settled. Idempotent per line.
      if (r.orderId) after(() => produceTradeOrder(r.orderId!));

      // A trade order is paid on Razorpay's own page — no browser of ours is
      // involved, so this webhook is the ONLY place the payment can be recorded.
      after(() =>
        recordCommercialEvent({
          event: "payment_captured",
          subject: cap.paymentId,
          valueInr: null,
          meta: { method: "payment_link", family: "trade", order_number: cap.orderNumber },
        }),
      );
      if (r.ledgerId) {
        const ledgerId = r.ledgerId;
        after(() => processTradePayoutFor(ledgerId).catch((e) => console.error("trade payout attempt failed:", e)));
      }
      return NextResponse.json({ ok: r.ok, outcome: r.outcome }, { status: r.retry ? 500 : 200 });
    }

    case "payout.processed": {
      const payload = event.payload as { payout?: { entity?: { id?: string } } };
      const payoutId = payload.payout?.entity?.id;
      if (!payoutId) return NextResponse.json({ ok: true, ignored: "missing_payout_id" });
      // Two ledgers share the RazorpayX payout stream: trade-partner
      // commissions (here) and collaborator royalties, which the Magnitude OS
      // confirms on its own webhook since 1 Oct 2026. The confirm is a no-op
      // when the id is not this ledger's, so every payout event is offered.
      after(() => confirmTradePayoutProcessed(payoutId).catch((e) => console.error("trade payout confirm failed:", e)));
      return NextResponse.json({ ok: true });
    }

    case "payout.failed":
    case "payout.reversed": {
      const payload = event.payload as {
        payout?: { entity?: { id?: string; status_details?: { description?: string; reason?: string } } };
      };
      const payoutId = payload.payout?.entity?.id;
      if (!payoutId) return NextResponse.json({ ok: true, ignored: "missing_payout_id" });
      const reason =
        payload.payout?.entity?.status_details?.description ||
        payload.payout?.entity?.status_details?.reason ||
        event.event;
      after(() => confirmTradePayoutFailed(payoutId, reason).catch((e) => console.error("trade payout failure-confirm failed:", e)));
      return NextResponse.json({ ok: true });
    }

    // The corporate portal's Pay Now (migration 0094). Only captures whose
    // notes name one of our corporate orders are acted on — a retail on-site
    // capture (confirmed by /api/razorpay/verify) or a trade payment link
    // falls through untouched, exactly as before this case existed.
    case "payment.captured": {
      // Record EVERY capture, whoever it belongs to, before deciding whether
      // this one also releases a corporate job. A retail capture is normally
      // reported by /api/razorpay/verify, but that route only runs if the
      // customer's browser survived the redirect — and both paths key the event
      // on the same payment id, so recording it twice costs one row, not two.
      {
        const payload = event.payload as {
          payment?: { entity?: { id?: string; amount?: number; notes?: Record<string, unknown> } };
        };
        const paymentId = payload.payment?.entity?.id;
        const paise = payload.payment?.entity?.amount;
        if (paymentId) {
          after(async () => {
            const { data: order } = await admin
              .from("orders")
              .select("visitor_token, order_number")
              .eq("razorpay_payment_id", paymentId)
              .maybeSingle();
            await recordCommercialEvent({
              event: "payment_captured",
              subject: paymentId,
              token: (order as { visitor_token?: string | null } | null)?.visitor_token ?? null,
              // Razorpay speaks in paise. Rupees is what every other number in
              // this system is in, and mixing the two is how a report ends up a
              // hundred times wrong.
              valueInr: typeof paise === "number" ? paise / 100 : null,
              meta: {
                method: "razorpay",
                via: "webhook",
                order_number: (order as { order_number?: number | null } | null)?.order_number ?? null,
              },
            });
          });
        }
      }

      const cap = corporateCaptureOf(event);
      if (!cap) return NextResponse.json({ ok: true, ignored: "not_corporate" });
      // Awaited, not after(): this is the write that releases production, and
      // a retry-worthy failure must 500 so Razorpay redelivers (the handler
      // and the OS endpoint are both idempotent — a redelivery can only fix).
      const r = await handleCorporateCapture(cap);
      return NextResponse.json({ ok: r.ok, outcome: r.outcome }, { status: r.retry ? 500 : 200 });
    }

    // A payment that died inside the window, reported by the gateway itself.
    // The browser's /api/payment-failed report and the stalled-checkouts
    // gateway sweep cover the same death; this path is the fastest and works
    // when the browser vanished. Dedupe is per order via checkout_failures,
    // shared with the sweep, so the three paths tell the story once.
    case "payment.failed": {
      const payload = event.payload as {
        payment?: { entity?: {
          id?: string; order_id?: string; amount?: number; method?: string;
          error_code?: string | null; error_description?: string | null;
          error_source?: string | null; error_step?: string | null; error_reason?: string | null;
        } };
      };
      const p = payload.payment?.entity;
      if (!p?.order_id) return NextResponse.json({ ok: true, ignored: "missing_order_id" });
      const { data: retail } = await admin
        .from("orders")
        .select("id, order_number, email, total, payment_status")
        .eq("razorpay_order_id", p.order_id)
        .maybeSingle();
      // Not a retail order (trade links and corporate orders have their own
      // books), or already paid on a later attempt: nothing to raise.
      if (!retail || retail.payment_status !== "pending") {
        return NextResponse.json({ ok: true, ignored: "not_pending_retail" });
      }
      const { isInternalOrder } = await import("@/lib/internal-orders");
      if (isInternalOrder(retail.email)) return NextResponse.json({ ok: true, ignored: "internal" });
      const { data: seen } = await admin
        .from("checkout_failures")
        .select("id")
        .eq("order_id", retail.id)
        .in("stage", ["payment_failed", "payment_abandoned"])
        .limit(1);
      if (seen && seen.length > 0) return NextResponse.json({ ok: true, duplicate: "already_reported" });
      const detail = [
        p.error_code && `code ${p.error_code}`,
        p.error_description,
        p.error_reason && `reason: ${p.error_reason}`,
        (p.error_source || p.error_step) && `at ${[p.error_source, p.error_step].filter(Boolean).join("/")}`,
        p.method && `method: ${p.method}`,
      ].filter(Boolean).join(" · ");
      after(async () => {
        const { recordCheckoutFailure } = await import("@/lib/checkout-alert");
        await recordCheckoutFailure({
          stage: "payment_failed",
          detail: detail || "Razorpay reported a failed payment with no stated reason.",
          email: retail.email,
          orderNumber: retail.order_number,
          orderId: retail.id,
          valueInr: retail.total == null ? null : Math.round(Number(retail.total)),
          meta: { via: "webhook", rzpOrderId: p.order_id, paymentId: p.id ?? null },
        });
      });
      return NextResponse.json({ ok: true, recorded: "payment_failed" });
    }

    // Refunds. Nothing in the site handled these before, so net revenue was not
    // a number anybody could produce — a refunded order still read as its full
    // value forever. The refund is recorded as its own event rather than by
    // adjusting the payment: the payment did happen, and a ledger that edits its
    // own past is not a ledger.
    case "refund.created":
    case "refund.processed": {
      const payload = event.payload as {
        refund?: { entity?: {
          id?: string; amount?: number; payment_id?: string; currency?: string;
          status?: string; created_at?: number; notes?: Record<string, unknown>;
        } };
      };
      const entity = payload.refund?.entity;
      const refundId = entity?.id;
      const paymentId = entity?.payment_id;
      const paise = entity?.amount;
      if (!refundId) return NextResponse.json({ ok: true, ignored: "missing_refund_id" });
      after(async () => {
        const { data: order } = paymentId
          ? await admin.from("orders").select("visitor_token, order_number").eq("razorpay_payment_id", paymentId).maybeSingle()
          : { data: null };
        await recordCommercialEvent({
          event: "refund",
          subject: refundId,
          token: (order as { visitor_token?: string | null } | null)?.visitor_token ?? null,
          // Positive rupees. The sign belongs to the reader — an event named
          // `refund` carrying a negative number invites it to be added twice.
          valueInr: typeof paise === "number" ? paise / 100 : null,
          meta: {
            payment_id: paymentId ?? null,
            razorpay_event: event.event,
            order_number: (order as { order_number?: number | null } | null)?.order_number ?? null,
          },
        });
      });
      return NextResponse.json({ ok: true, recorded: "refund" });
    }

    default:
      return NextResponse.json({ ok: true, stored: event.event });
  }
}
