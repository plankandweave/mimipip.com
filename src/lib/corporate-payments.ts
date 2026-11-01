import "server-only";
import { partnerCapabilities } from "./partner-capabilities";
import { supabaseAdmin } from "./supabase-admin";
import { sendEmail } from "./email";

// The money leg of the corporate portal (migration 0094): a payment-first
// partner presses Pay Now, Razorpay captures, and the webhook lands here.
//
// Contract, in order of importance:
//  1. The webhook is the ONLY writer of payment_status='paid'. The browser's
//     checkout callback never marks anything paid — it just refreshes.
//  2. The captured paise must EXACTLY equal the frozen order's total. On any
//     mismatch nothing is marked paid, nothing is released, and the desk is
//     emailed — a wrong amount is a human's question, never an auto-release.
//  3. A verified payment is never lost: the paid stamp is saved BEFORE the OS
//     call, and if the OS is unreachable the desk gets the payment id so a
//     human can release the hold manually.
//  4. Everything here is idempotent, because Razorpay redelivers webhooks and
//     the OS endpoint is itself idempotent — re-running on a redelivery only
//     retries the OS release, never a second email and never a second "paid".

const DESK_EMAIL = process.env.CORPORATE_DESK_EMAIL || "hello@zyvorah.com";
const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");
const OS_TOKEN = process.env.ZYVORAH_WEBHOOK_TOKEN ?? "";

/** A payment.captured entity that names one of OUR corporate orders. */
export type CorporateCapture = {
  paymentId: string;
  razorpayOrderId: string | null;
  amountPaise: number;
  corporateOrderId: string;
  orderRef: string | null;
};

/** Pull a corporate capture out of a payment.captured payload, or null when
 *  the payment is someone else's (retail checkout, a trade link — those have
 *  their own flows and must stay untouched). */
export function corporateCaptureOf(event: { event: string; payload?: Record<string, unknown> }): CorporateCapture | null {
  if (event.event !== "payment.captured") return null;
  const payload = event.payload as {
    payment?: { entity?: { id?: string; order_id?: string; amount?: number; notes?: Record<string, unknown> | null } };
  } | undefined;
  const e = payload?.payment?.entity;
  const notes = (e?.notes ?? {}) as Record<string, unknown>;
  const corporateOrderId = typeof notes["corporate_order_id"] === "string" ? notes["corporate_order_id"] : null;
  if (!e?.id || !corporateOrderId) return null;
  return {
    paymentId: e.id,
    razorpayOrderId: typeof e.order_id === "string" ? e.order_id : null,
    amountPaise: Math.round(Number(e.amount ?? 0)),
    corporateOrderId,
    orderRef: typeof notes["order_ref"] === "string" ? notes["order_ref"] : null,
  };
}

const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/** Tell the OS the money arrived so it releases the awaiting_payment hold —
 *  the exact same settle path as the desk's "Payment received → Print". The
 *  endpoint is idempotent, so calling it again on a redelivery is safe. */
async function releaseOnOs(input: {
  orderRef: string;
  paymentId: string;
  razorpayOrderId: string;
  amountInr: number;
  paidAt: string;
}): Promise<{ ok: boolean; detail: string }> {
  if (!OS_TOKEN) return { ok: false, detail: "OS link not configured (ZYVORAH_WEBHOOK_TOKEN missing)" };
  try {
    const res = await fetch(`${OS_BASE}/api/zyvorah/payment-received`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-zyvorah-token": OS_TOKEN },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        orderRef: input.orderRef,
        razorpayPaymentId: input.paymentId,
        razorpayOrderId: input.razorpayOrderId,
        amountInr: input.amountInr,
        paidAt: input.paidAt,
      }),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, detail: `OS ${res.status}: ${text.slice(0, 300)}` };
    return { ok: true, detail: text.slice(0, 300) };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Handle one verified payment.captured for a corporate order. Idempotent —
 * safe to call again on a webhook redelivery: the paid transition happens at
 * most once (a conditional update claims it), emails ride only that first
 * transition, and the OS release is retried every time until it succeeds.
 */
export async function handleCorporateCapture(
  cap: CorporateCapture,
): Promise<{ ok: boolean; outcome: string; retry: boolean }> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, outcome: "storage_not_configured", retry: true };

  const { data: order } = await sb.from("corporate_orders")
    .select("*").eq("id", cap.corporateOrderId).maybeSingle();
  if (!order) {
    console.error("[corporate-pay] captured payment names an unknown order:", cap.corporateOrderId, cap.paymentId);
    await sendEmail({
      to: DESK_EMAIL,
      subject: `Razorpay payment ${cap.paymentId} — order not found`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:520px">
        <p>A captured Razorpay payment of <strong>${inr(cap.amountPaise / 100)}</strong> carries
        corporate_order_id <span style="font-family:monospace">${escapeHtml(cap.corporateOrderId)}</span>
        (${escapeHtml(cap.orderRef ?? "no ref")}), but no such order exists.</p>
        <p>Payment id <span style="font-family:monospace">${escapeHtml(cap.paymentId)}</span>. Nothing was released — please investigate.</p>
      </div>`,
    });
    return { ok: true, outcome: "unknown_order", retry: false };
  }

  const o = order as Record<string, unknown>;
  const { data: account } = await sb.from("corporate_accounts")
    .select("slug, capabilities").eq("id", o.account_id).maybeSingle();
  if (!account) return { ok: false, outcome: "account_policy_unavailable", retry: true };
  if (partnerCapabilities(account).poRequiredRelease) {
    if (!o.partner_confirmation_id || !o.partner_option_id) {
      return { ok: true, outcome: "po_gate_held", retry: false };
    }
    const { data: confirmation } = await sb.from("partner_private_confirmations")
      .select("account_id, option_ids, po_accepted_at")
      .eq("id", o.partner_confirmation_id).maybeSingle();
    if (!confirmation?.po_accepted_at || confirmation.account_id !== o.account_id ||
        !Array.isArray(confirmation.option_ids) || !confirmation.option_ids.includes(o.partner_option_id)) {
      return { ok: true, outcome: "po_gate_held", retry: false };
    }
  }
  const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
  const orderRef = String(o.order_ref ?? cap.orderRef ?? "");

  // The amount the partner owes is the FROZEN one: stored net (ex-GST) plus
  // stored GST — the same figures the freeze locked and the proforma shows.
  // Never recomputed from the live catalogue, never taken from the client.
  const net = num(o.amount);
  const gst = num(o.gst_amount);
  const total = num(o.total);
  const expectedPaise = Math.round(total * 100);
  const totalsReconcile = Math.abs(total - (net + gst)) < 0.011;
  // The capture must be against the Razorpay Order WE created for this row —
  // a payment for some other order must not release this one.
  const rzpOrderMatches =
    !o.razorpay_order_id || !cap.razorpayOrderId || o.razorpay_order_id === cap.razorpayOrderId;

  if (!o.frozen_at || !totalsReconcile || !rzpOrderMatches || cap.amountPaise !== expectedPaise) {
    console.error("[corporate-pay] capture does NOT match the frozen order — holding:", {
      orderRef, paymentId: cap.paymentId, got: cap.amountPaise, expected: expectedPaise,
      frozen: !!o.frozen_at, totalsReconcile, rzpOrderMatches,
    });
    await sendEmail({
      to: DESK_EMAIL,
      subject: `Razorpay payment NOT auto-released — ${orderRef}`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:560px">
        <p>A captured payment for <strong>${escapeHtml(orderRef)}</strong> did not match the frozen order, so
        <strong>nothing was marked paid and nothing was released to production</strong>.</p>
        <table style="border-collapse:collapse;font-size:13px">
          <tr><td style="padding:2px 10px 2px 0">Payment id</td><td style="font-family:monospace">${escapeHtml(cap.paymentId)}</td></tr>
          <tr><td style="padding:2px 10px 2px 0">Captured</td><td>${inr(cap.amountPaise / 100)} (${cap.amountPaise} paise)</td></tr>
          <tr><td style="padding:2px 10px 2px 0">Expected</td><td>${inr(total)} (${expectedPaise} paise, frozen total)</td></tr>
          <tr><td style="padding:2px 10px 2px 0">Checks</td><td>frozen: ${o.frozen_at ? "yes" : "NO"} · totals reconcile: ${totalsReconcile ? "yes" : "NO"} · Razorpay order matches: ${rzpOrderMatches ? "yes" : "NO"}</td></tr>
        </table>
        <p>Verify the money on the Razorpay dashboard, then release the order on the OS board by hand if it is genuine.</p>
      </div>`,
    });
    // 200 — a mismatch is a human's question; a redelivery can't answer it.
    return { ok: true, outcome: "mismatch_held", retry: false };
  }

  // Claim the paid transition exactly once. payment_status may be NULL or
  // 'created' here — both must win; a row already 'paid' must not.
  const paidAt = new Date().toISOString();
  const { data: claimed, error: claimErr } = await sb.from("corporate_orders")
    .update({
      payment_status: "paid",
      razorpay_payment_id: cap.paymentId,
      paid_at: paidAt,
      ...(cap.razorpayOrderId && !o.razorpay_order_id ? { razorpay_order_id: cap.razorpayOrderId } : {}),
    })
    .eq("id", cap.corporateOrderId)
    .or("payment_status.is.null,payment_status.neq.paid")
    .select("id");
  if (claimErr) {
    // The DB write failed — return retry so the webhook 500s and Razorpay
    // redelivers. Better a retry than a captured payment nobody recorded.
    console.error("[corporate-pay] paid claim failed:", claimErr.message);
    return { ok: false, outcome: "claim_failed", retry: true };
  }
  const firstPaid = (claimed?.length ?? 0) > 0;

  // Release the hold on the OS — retried on every redelivery until it lands
  // (the endpoint is idempotent, and answers `already` once settled).
  const release = await releaseOnOs({
    orderRef,
    paymentId: cap.paymentId,
    razorpayOrderId: cap.razorpayOrderId ?? String(o.razorpay_order_id ?? "unknown"),
    amountInr: total,
    paidAt: String(o.paid_at ?? paidAt),
  });

  if (!release.ok) {
    // The payment IS recorded (never lost) — production just hasn't heard.
    console.error("[corporate-pay] paid but OS unreachable:", orderRef, release.detail);
    if (firstPaid) {
      // One alert, on the first failure — the retries that follow just log,
      // or succeed silently.
      await sendEmail({
        to: DESK_EMAIL,
        subject: `PAID but not released — ${orderRef} needs a manual release`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:560px">
          <p><strong>${escapeHtml(orderRef)}</strong> is paid — ${inr(total)}, Razorpay payment
          <span style="font-family:monospace">${escapeHtml(cap.paymentId)}</span> — but the OS could not be told
          (${escapeHtml(release.detail)}).</p>
          <p>Open the order on the OS board and press <strong>Payment received → Print</strong> with this payment id as the reference. Razorpay will also retry this webhook, which retries the release automatically — if it lands, the order simply releases and nothing more is needed.</p>
        </div>`,
      });
    }
  }

  if (firstPaid) {
    // Partner + desk hear it once, on the transition — never on a redelivery.
    const placedBy = String(o.placed_by_email ?? "");
    const printName = String(o.print_name ?? "Custom wall");
    if (placedBy) {
      void sendEmail({
        to: placedBy,
        subject: `Payment received — ${orderRef} is in production`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:520px">
          <p style="font-size:14px;color:#475569">Thank you — we've received <strong>${inr(total)}</strong> for
          <strong>${escapeHtml(orderRef)}</strong>.</p>
          <p style="font-size:14px;color:#0f172a">${escapeHtml(printName)} · payment id
          <span style="font-family:monospace">${escapeHtml(cap.paymentId)}</span></p>
          <p style="font-size:14px;color:#0f172a">It has been released to production — you can follow every stage on your portal. Your GST invoice follows.</p>
          <p style="font-size:12px;color:#94a3b8;margin-top:22px">Zyvorah · made-to-order wallpaper</p>
        </div>`,
      });
    }
    void sendEmail({
      to: DESK_EMAIL,
      subject: `${orderRef} paid online — ${inr(total)}${release.ok ? " · auto-released to production" : " · RELEASE FAILED, see separate mail"}`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:520px">
        <p><strong>${escapeHtml(orderRef)}</strong> was paid through the portal: ${inr(total)},
        Razorpay payment <span style="font-family:monospace">${escapeHtml(cap.paymentId)}</span>.</p>
        <p>${release.ok
          ? "The OS confirmed the release — it is in the normal production flow, GST invoice raised on the OS."
          : "The OS could NOT be reached — release it manually on the board (details in the separate alert)."}</p>
      </div>`,
    });
    // The partner audit trail the portal team already reads (best-effort).
    void sb.from("corporate_audit").insert({
      account_id: o.account_id,
      actor_email: "razorpay-webhook",
      action: "order.paid",
      subject_type: "order",
      subject_id: String(o.id),
      detail: { orderRef, paymentId: cap.paymentId, amountInr: total, osReleased: release.ok },
    }).then(({ error }) => { if (error) console.error("[corporate-pay] audit failed:", error.message); });
  }

  // A failed release asks Razorpay to redeliver (retry=true → webhook 500s):
  // the paid state is already safe in the DB, and both this handler and the
  // OS endpoint are idempotent, so the retry can only ever fix things.
  return {
    ok: true,
    outcome: firstPaid ? (release.ok ? "paid_released" : "paid_os_failed") : (release.ok ? "already_paid_release_ok" : "already_paid_release_failed"),
    retry: !release.ok,
  };
}
