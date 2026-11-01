import "server-only";

/**
 * The quotation a site visit produced, read from (and settled against) the OS.
 *
 * The OS is the system of record for measured walls and their price; this file
 * is the only place the store talks to it about quotes. Shared-secret gated,
 * server-side only — the token never reaches a browser.
 */

const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");
const TOKEN = process.env.ZYVORAH_WEBHOOK_TOKEN ?? "";

export type QuoteLine = {
  desc: string; sub?: string | null; qtyLabel?: string; rateLabel?: string; incl: number;
};

export type QuoteView = {
  ok: boolean;
  orderId: number;
  customerName: string | null;
  firstName: string | null;
  number: string | null;
  grandTotal: number | null;
  taxableTotal: number | null;
  cgst: number | null; sgst: number | null; igst: number | null;
  lines: QuoteLine[];
  walls: number;
  quotedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  paidAt: string | null;
};

/** Read a quotation by its page token. Null when it doesn't exist. */
export async function fetchQuote(token: string): Promise<QuoteView | null> {
  try {
    const r = await fetch(`${OS_BASE}/api/zyvorah/q/${encodeURIComponent(token)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as QuoteView;
    return j?.ok ? j : null;
  } catch {
    return null;
  }
}

/**
 * Tell the OS the quote was PAID. Called only after this server has verified
 * Razorpay's HMAC — the OS refuses anything that isn't shared-secret signed,
 * so a browser can never claim a payment on its own.
 */
export async function markQuotePaid(
  token: string, paymentId: string, amountInr: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!TOKEN) return { ok: false, error: "os_link_not_configured" };
  try {
    const r = await fetch(`${OS_BASE}/api/zyvorah/q/${encodeURIComponent(token)}/paid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-zyvorah-token": TOKEN },
      body: JSON.stringify({ paymentId, amountInr }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return { ok: false, error: `os_${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "os_unreachable" };
  }
}

/** Accept WITHOUT paying — the customer agrees, money follows on our terms. */
export async function acceptQuote(token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${OS_BASE}/api/zyvorah/q/${encodeURIComponent(token)}/accept`, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return { ok: false, error: `os_${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "os_unreachable" };
  }
}
