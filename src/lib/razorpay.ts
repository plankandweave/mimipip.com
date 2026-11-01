import { serviceAvailable } from "../brand/services";
// Shared Razorpay order creation. Returns null (payment stubbed) when keys
// aren't configured — the caller then captures the order as "payment pending",
// exactly as the mural checkout does. Keys live only in the server env:
// RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET (production secrets on Cloudflare).

export type RazorpayOrder = { razorpayOrderId: string; keyId: string; amount: number; currency: "INR" | "USD" };

/** Create an INR or USD Razorpay order, or return null if keys are absent.
 *  `notes` ride the order onto every payment entity Razorpay emits for it —
 *  the corporate portal uses them to route payment.captured back to its order
 *  (retail callers pass nothing and are unchanged). */
export async function createRazorpayOrderWithTransport(
  amount: number,
  receipt: string,
  notes: Record<string, string> | undefined,
  currency: "INR" | "USD",
  transport: typeof fetch,
): Promise<RazorpayOrder | null> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  const minorAmount = Math.round(amount * 100);
  if (!Number.isSafeInteger(minorAmount) || minorAmount <= 0) return null;
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  try {
    const res = await transport("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ amount: minorAmount, currency, receipt, ...(notes ? { notes } : {}) }),
    });
    if (!res.ok) {
      console.error("razorpay order create failed:", res.status);
      return null;
    }
    const data = await res.json();
    if (typeof data.id !== "string" || !data.id.startsWith("order_") || data.amount !== minorAmount || data.currency !== currency) {
      console.error("razorpay order create returned an invalid order");
      return null;
    }
    return { razorpayOrderId: data.id, keyId, amount: data.amount, currency };
  } catch {
    // Preserve callers' recovery + failure-recording paths on timeouts,
    // network errors and malformed replies, not only HTTP error statuses.
    console.error("razorpay order create unavailable");
    return null;
  }
}

/** Application entry point: offline isolation cannot be enabled by credentials. */
export async function maybeCreateRazorpayOrder(amount: number, receipt: string, notes?: Record<string,string>, currency: "INR" | "USD" = "INR"): Promise<RazorpayOrder | null> {
  if (!serviceAvailable("payments")) return null;
  return createRazorpayOrderWithTransport(amount, receipt, notes, currency, fetch);
}

/** Shared authenticated call against the Razorpay/RazorpayX REST API.
 *  Returns the parsed JSON, or null on missing keys or a non-2xx response —
 *  matching maybeCreateRazorpayOrder's degrade-to-null contract. */
async function rzpPost<T>(
  path: string,
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): Promise<T | null> {
  if (!serviceAvailable("payments")) return null;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`razorpay ${path} failed:`, res.status, await res.text());
    return null;
  }
  return (await res.json()) as T;
}

export type RazorpayPaymentLink = { id: string; shortUrl: string; status: string };

/** Create a payment link (trade orders: the end customer pays on Razorpay's
 *  page, confirmation arrives via webhook — no browser of ours involved).
 *  Full payment only; we send our own co-branded email, so Razorpay's
 *  notifications stay off. */
export async function maybeCreatePaymentLink(opts: {
  amountInr: number;
  referenceId: string;
  description: string;
  customer: { name?: string; email?: string; contact?: string };
  callbackUrl?: string;
}): Promise<RazorpayPaymentLink | null> {
  const data = await rzpPost<{ id: string; short_url: string; status: string }>("/v1/payment_links", {
    amount: Math.round(opts.amountInr * 100),
    currency: "INR",
    accept_partial: false,
    reference_id: opts.referenceId,
    description: opts.description,
    customer: opts.customer,
    notify: { sms: false, email: false },
    reminder_enable: true,
    ...(opts.callbackUrl ? { callback_url: opts.callbackUrl, callback_method: "get" } : {}),
  });
  return data ? { id: data.id, shortUrl: data.short_url, status: data.status } : null;
}

// ── RazorpayX (payouts) ────────────────────────────────────────────────────
// Same key pair authenticates, but money moves from the RazorpayX current
// account named by RAZORPAYX_ACCOUNT_NUMBER. Every helper degrades to null
// when that env is absent, so the site runs fine without X enabled.

function rzpxAccountNumber(): string | null {
  return process.env.RAZORPAYX_ACCOUNT_NUMBER || null;
}

/** Create a RazorpayX contact (one per trade partner). */
export async function createRzpxContact(opts: {
  name: string;
  email?: string;
  contact?: string;
  referenceId: string;
}): Promise<string | null> {
  const data = await rzpPost<{ id: string }>("/v1/contacts", {
    name: opts.name,
    email: opts.email,
    contact: opts.contact,
    type: "vendor",
    reference_id: opts.referenceId,
  });
  return data?.id ?? null;
}

/** Register a partner's bank account under their contact. */
export async function createRzpxFundAccount(
  contactId: string,
  bank: { name: string; ifsc: string; accountNumber: string },
): Promise<string | null> {
  const data = await rzpPost<{ id: string }>("/v1/fund_accounts", {
    contact_id: contactId,
    account_type: "bank_account",
    bank_account: { name: bank.name, ifsc: bank.ifsc, account_number: bank.accountNumber },
  });
  return data?.id ?? null;
}

export type FundAccountValidation = {
  id: string;
  status: string; // created | completed | failed
  registeredName: string | null;
  accountStatus: string | null; // active | invalid ...
};

/** Penny-drop validation of a fund account (₹1, auto-reversed). The caller
 *  polls or takes the webhook; `registeredName` is what the bank returned and
 *  is what must be matched against the PAN name. */
export async function validateFundAccount(fundAccountId: string): Promise<FundAccountValidation | null> {
  const accountNumber = rzpxAccountNumber();
  if (!accountNumber) return null;
  const data = await rzpPost<{
    id: string;
    status: string;
    results?: { registered_name?: string; account_status?: string };
  }>("/v1/fund_accounts/validations", {
    account_number: accountNumber,
    fund_account: { id: fundAccountId },
    amount: 100,
    currency: "INR",
  });
  if (!data) return null;
  return {
    id: data.id,
    status: data.status,
    registeredName: data.results?.registered_name ?? null,
    accountStatus: data.results?.account_status ?? null,
  };
}

export type RazorpayPayout = { id: string; status: string };

/** Send money to a partner. `idempotencyKey` (the ledger entry id) makes a
 *  retried call return the original payout instead of paying twice — never
 *  call without it. */
export async function createPayout(opts: {
  fundAccountId: string;
  amountInr: number;
  referenceId: string;
  idempotencyKey: string;
  narration?: string;
}): Promise<RazorpayPayout | null> {
  const accountNumber = rzpxAccountNumber();
  if (!accountNumber) return null;
  const data = await rzpPost<{ id: string; status: string }>(
    "/v1/payouts",
    {
      account_number: accountNumber,
      fund_account_id: opts.fundAccountId,
      amount: Math.round(opts.amountInr * 100),
      currency: "INR",
      mode: "IMPS",
      purpose: "payout",
      queue_if_low_balance: true,
      reference_id: opts.referenceId,
      narration: opts.narration,
    },
    { "X-Payout-Idempotency": opts.idempotencyKey },
  );
  return data ? { id: data.id, status: data.status } : null;
}

/** Refund a captured payment in full. No-op (false) if keys aren't configured. */
export async function refundPayment(paymentId: string): Promise<boolean> {
  if (!serviceAvailable("payments")) return false;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret || !paymentId) return false;
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ speed: "normal" }),
  });
  if (!res.ok) {
    console.error("razorpay refund failed:", res.status, await res.text());
    return false;
  }
  return true;
}
