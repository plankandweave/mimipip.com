// What actually happened inside the payment window — asked of the gateway.
//
// Order #89 (Abigail Chandonnet, Canada, ₹30,439 / USD 613, 9 October 2026)
// opened the Razorpay window twice, seventeen hours apart, and closed it
// within seven seconds both times. The site recorded nothing: every server
// leg of checkout had succeeded, so no checkout_failures row was written;
// the browser listens for success and dismissal but not failure; and the
// webhook has never delivered an event (razorpay_events is empty — the
// production worker has no RAZORPAY_WEBHOOK_SECRET). Everything after
// rp.open() was a blind spot, and a paying customer lived in it.
//
// The gateway, however, saw everything, and the server holds API keys that
// can ask it (concept-payment-recovery.ts has quietly done so for exclusive
// orders since September). GET /v1/orders/<id>/payments returns every
// attempt with Razorpay's own error_code and error_description — no webhook,
// no dashboard sign-in, no browser cooperation required.
//
// classify() is a pure function so the reading of the gateway's answer is
// pinned by payment-autopsy.test.ts; fetchGatewayPayments() is the only I/O.
// No "server-only" marker, as razorpay.ts: the keys are read from process.env
// inside the fetch helper, which simply returns null in a browser-less test.

export type GatewayOrder = {
  id?: string;
  status?: string; // created | attempted | paid
  amount?: number; // minor units
  amount_paid?: number;
  currency?: string;
  attempts?: number;
};

export type GatewayPayment = {
  id?: string;
  order_id?: string;
  status?: string; // created | authorized | captured | refunded | failed
  amount?: number;
  currency?: string;
  method?: string | null;
  error_code?: string | null;
  error_description?: string | null;
  error_source?: string | null;
  error_step?: string | null;
  error_reason?: string | null;
  created_at?: number;
};

export type PaymentAutopsy =
  /** The money arrived and we never heard: mark the order paid. */
  | { kind: "captured"; paymentId: string }
  /** Money is blocked on the customer's card but was never captured. */
  | { kind: "authorized"; paymentId: string; detail: string }
  /** The customer tried and the gateway refused — here is its reason. */
  | { kind: "failed"; attempts: number; detail: string; methods: string[] }
  /** The window opened and nothing was ever attempted at the gateway. */
  | { kind: "no_attempts" };

const describe = (p: GatewayPayment): string => {
  const parts = [
    p.error_code && `code ${p.error_code}`,
    p.error_description,
    p.error_reason && `reason: ${p.error_reason}`,
    (p.error_source || p.error_step) && `at ${[p.error_source, p.error_step].filter(Boolean).join("/")}`,
    p.method && `method: ${p.method}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "the gateway recorded a failed attempt with no stated reason";
};

/** Read the gateway's record of one Razorpay order. Pure. */
export function classifyGatewayPayments(
  rzpOrderId: string,
  gateway: GatewayOrder,
  payments: GatewayPayment[],
): PaymentAutopsy {
  const own = payments.filter((p) => p.order_id === rzpOrderId);

  // Paid, with the same strictness concept-payment-proof applies: the order
  // itself says paid AND a captured payment matches its amount and currency.
  if (gateway.id === rzpOrderId && gateway.status === "paid" && gateway.amount && gateway.amount_paid === gateway.amount) {
    const captured = own.find(
      (p) => p.status === "captured" && p.amount === gateway.amount && p.currency === gateway.currency && typeof p.id === "string",
    );
    if (captured?.id) return { kind: "captured", paymentId: captured.id };
  }

  // Authorized but never captured: the customer's bank has blocked the money.
  // This needs a human in the dashboard (capture or void), not a retry.
  const authorized = own.find((p) => p.status === "authorized" && typeof p.id === "string");
  if (authorized?.id) {
    return {
      kind: "authorized",
      paymentId: authorized.id,
      detail: `Payment ${authorized.id} is AUTHORIZED but was never captured — the customer's money may be blocked. Capture or void it in the Razorpay dashboard.`,
    };
  }

  const failed = own.filter((p) => p.status === "failed");
  if (failed.length > 0) {
    const last = failed.reduce((a, b) => ((a.created_at ?? 0) >= (b.created_at ?? 0) ? a : b));
    return {
      kind: "failed",
      attempts: failed.length,
      detail: describe(last),
      methods: [...new Set(failed.map((p) => p.method).filter((m): m is string => !!m))],
    };
  }

  return { kind: "no_attempts" };
}

/** Ask Razorpay for an order and its payments. Null when keys are absent or
 *  the gateway cannot answer — the caller simply tries again next sweep. */
export async function fetchGatewayPayments(
  rzpOrderId: string,
): Promise<{ gateway: GatewayOrder; payments: GatewayPayment[] } | null> {
  const key = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key || !secret) return null;
  const headers = { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}` };
  try {
    const root = `https://api.razorpay.com/v1/orders/${encodeURIComponent(rzpOrderId)}`;
    const [a, b] = await Promise.all([
      fetch(root, { headers, signal: AbortSignal.timeout(8000) }),
      fetch(`${root}/payments`, { headers, signal: AbortSignal.timeout(8000) }),
    ]);
    if (!a.ok || !b.ok) return null;
    const gateway = (await a.json()) as GatewayOrder;
    const payments = (await b.json()) as { items?: GatewayPayment[] };
    return { gateway, payments: Array.isArray(payments.items) ? payments.items : [] };
  } catch {
    return null;
  }
}
