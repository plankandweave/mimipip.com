import "server-only";

import { sendEmail } from "./email";

// SOMEBODY TRIED TO GIVE US MONEY AND COULDN'T. TELL A HUMAN.
//
// The gap this closes (Roheena, 2026-09-02): sendFounderNote fires on payment
// SUCCESS and nothing at all fires on failure, so orders #54 (₹11,978, 14 Aug)
// and #56 (₹18,639, 2 Sep) — the only two real customer orders this store has
// ever taken, both from the same person, both dead at the payment leg — were
// never reported to anyone. She tried twice, three weeks apart, and we found
// out from a photograph of her screen.
//
// Three halves, on purpose:
//   • recordCheckoutFailure() — called on every known failure path in
//     /api/checkout, and by /api/payment-failed when the browser reports the
//     Razorpay window itself refusing a payment. Precise, immediate, names
//     the stage.
//   • the stalled-checkouts cron — sweeps checkout_start with no order_placed.
//     Coarser and later, but it is the half that catches what we did NOT
//     anticipate: a function the runtime kills for memory writes no failure
//     row, and that is exactly how #54 and #56 died.
//   • the same cron's gateway autopsy (lib/payment-autopsy.ts) — for every
//     order that exists and stays unpaid, it asks Razorpay's API what
//     happened inside the window. #89 (9 October 2026) died THERE: order
//     created, window opened, closed in seven seconds, twice — and because
//     every server leg had succeeded and the browser only reports success
//     and dismissal, nothing anywhere said so.
//
// Neither may ever break a checkout. Every call here is best-effort and
// swallowed: the customer's experience of a bad checkout must not be made
// worse by the thing whose only job is to tell us about it.

const ALERT_TO = process.env.CHECKOUT_ALERT_TO || "roheena@plankandweave.com";
const FROM = "Zyvorah alerts <hello@mail.zyvorah.com>";
const REPLY_TO = "hello@zyvorah.com";

/** Where in checkout it died. Free text by design — a new failure mode must be
 *  reportable the day it appears, not after a migration. */
export type CheckoutFailureStage =
  | "no_cart"
  | "invalid_email"
  | "payments_unconfigured"
  | "payment_link_failed"
  | "resume_payment_link_failed"
  | "install_not_serviceable"
  | "checkout_rpc_failed"
  | "stalled_checkout"
  | "payment_failed"
  | "payment_abandoned";

export type CheckoutFailure = {
  stage: CheckoutFailureStage;
  detail?: string | null;
  email?: string | null;
  orderNumber?: number | null;
  orderId?: string | null;
  valueInr?: number | null;
  sessionToken?: string | null;
  meta?: Record<string, unknown>;
};

const rupees = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n)
    ? `₹${Math.round(n).toLocaleString("en-IN")}`
    : "an unknown amount";

/** The one line that says how bad this is, in the subject, so it is legible
 *  from a phone's lock screen without opening anything. */
function subjectFor(f: CheckoutFailure): string {
  const amount = rupees(f.valueInr);
  const order = f.orderNumber ? ` (order #${f.orderNumber})` : "";
  if (f.stage === "stalled_checkout") {
    return `Checkout started and never completed — ${amount}`;
  }
  // Nothing failed: the customer opened the payment window and closed it
  // without trying to pay. Calling that a failure sent people hunting for a
  // fault that was never there (order #91, 10 October 2026).
  if (f.stage === "payment_abandoned") {
    return `Checkout abandoned — ${amount}${order}`;
  }
  return `Checkout FAILED — ${amount}${order}`;
}

/** The first line of the email, saying the same thing the subject does. */
function headlineFor(f: CheckoutFailure): string {
  return f.stage === "payment_abandoned"
    ? "A customer abandoned checkout."
    : "A customer could not complete checkout.";
}

const EXPLAIN: Record<CheckoutFailureStage, string> = {
  no_cart: "Their cart cookie was missing or expired when they pressed Place order.",
  invalid_email: "The email address was rejected before the order was created.",
  payments_unconfigured:
    "Razorpay keys are not configured, so no payment could be started at all. Nothing was charged and no order exists.",
  payment_link_failed:
    "The order WAS created, but Razorpay refused to create the payment link, so the customer had no way to pay. This is the failure that killed #54 and #56 — check the Razorpay dashboard for account activation and per-transaction limits.",
  resume_payment_link_failed:
    "They came back to a checkout that had already consumed its cart, and the retry ALSO could not get a payment link. They are now wedged and cannot complete this order themselves.",
  install_not_serviceable:
    "They asked for installation at a pincode we do not service. This one may be working as intended — but it is worth knowing how often it happens.",
  checkout_rpc_failed: "checkout_cart refused the order outright.",
  stalled_checkout:
    "A checkout started and no order was ever created. Nothing recorded a specific failure, which usually means the request died outright rather than returning an error.",
  payment_failed:
    "The order exists and the payment window opened, but the payment itself FAILED at the gateway. The detail below is Razorpay's own account of why. This is the leg that was invisible for order #89 (9 October 2026) — nothing before this stage went wrong, so no other alert fires.",
  payment_abandoned:
    "The order exists and the payment window opened, but the customer closed it without attempting a payment. Nothing failed at the gateway. If the order is international, the detail below says what to check.",
};

function html(f: CheckoutFailure): string {
  const rows: [string, string][] = [
    ["What happened", EXPLAIN[f.stage] ?? f.stage],
    ["Stage", f.stage],
    ["Value", rupees(f.valueInr)],
    ["Customer", f.email || "not captured"],
    ["Order", f.orderNumber ? `#${f.orderNumber}` : "never created"],
    ["Detail", f.detail || "—"],
    ["When", new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST"],
  ];
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;color:#111">
  <p style="font-size:16px;margin:0 0 14px"><strong>${headlineFor(f)}</strong></p>
  <table cellpadding="6" style="border-collapse:collapse">
    ${rows
      .map(
        ([k, v]) =>
          `<tr><td style="color:#666;vertical-align:top;white-space:nowrap">${k}</td><td>${String(v).replace(/</g, "&lt;")}</td></tr>`,
      )
      .join("")}
  </table>
  <p style="color:#666;margin:16px 0 0">Sent by the checkout watch. If this is noisy, the fix is to make checkout stop failing, not to mute the alert.</p>
</div>`;
}

/**
 * Record a failed checkout and email whoever is on watch.
 *
 * Never throws, never awaits anything the customer's response depends on —
 * call it inside `after()` or let it float. Returns nothing on purpose: no
 * caller should branch on whether the alert worked.
 */
export async function recordCheckoutFailure(f: CheckoutFailure): Promise<void> {
  // Log first and unconditionally: even if both the row and the email fail,
  // the runtime log still carries the fact.
  console.error(
    `checkout failure [${f.stage}]`,
    JSON.stringify({
      email: f.email ?? null,
      orderNumber: f.orderNumber ?? null,
      valueInr: f.valueInr ?? null,
      detail: f.detail ?? null,
    }),
  );

  let rowId: string | null = null;
  try {
    const { supabaseAdmin } = await import("./supabase-admin");
    const admin = supabaseAdmin();
    if (admin) {
      const { data, error } = await admin.rpc("log_checkout_failure", {
        p_stage: f.stage,
        p_detail: f.detail ?? null,
        p_email: f.email ?? null,
        p_order_number: f.orderNumber ?? null,
        p_order_id: f.orderId ?? null,
        p_value_inr: f.valueInr ?? null,
        p_session_token: f.sessionToken ?? null,
        p_meta: f.meta ?? {},
      });
      if (error) console.error("log_checkout_failure failed:", error.message);
      else rowId = (data as string | null) ?? null;
    }
  } catch (e) {
    console.error("checkout failure row not written:", e);
  }

  try {
    const ok = await sendEmail({
      to: ALERT_TO,
      subject: subjectFor(f),
      html: html(f),
      from: FROM,
      replyTo: REPLY_TO,
    });
    if (ok && rowId) {
      const { supabaseAdmin } = await import("./supabase-admin");
      const admin = supabaseAdmin();
      await admin
        ?.from("checkout_failures")
        .update({ alerted_at: new Date().toISOString() })
        .eq("id", rowId);
    }
  } catch (e) {
    console.error("checkout failure alert not sent:", e);
  }
}
