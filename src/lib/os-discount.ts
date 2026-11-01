// Discount codes are minted by the Magnitude OS (zyvorah_discount_codes); this
// store validates and redeems them server-to-server with the shared webhook
// token. The OS is the authority on whether a code exists; THIS file is the
// authority on whether the buyer in front of us may use it.
//
// THE RULE (Roheena 2026-09-02). A discount is only ever valid because:
//   • credit_note             — money we owe back, taken as a price adjustment
//   • error_correction        — we got something wrong and the system made good
//   • install_insert_referral — the 15% QR on the physical install insert
// There is no fourth reason. A code cannot be bought, won, shared out of a
// campaign, or issued to a dealer for being a dealer. Anything the OS returns
// with a reason outside this set is refused here as well, so a row inserted by
// hand on the OS still buys nobody a discount.
//
// And referral codes are RETAIL ONLY. A dealer's discount is their contract
// price on the account (HomeLane at list −40%, and so on); a referral code on
// top of that is double-dipping on the same order. Credit notes and error
// corrections are not restricted — we owe those to whoever we owe them to.
//
// Env-gated: OS_BASE_URL (defaults to the live OS) + the shared webhook token.
// Without the token every validate returns not_configured and checkout simply
// ignores discount codes — never a hard failure.

const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");
const TOKEN = process.env.ZYVORAH_WEBHOOK_TOKEN ?? "";

/** The only reasons a discount may exist. Mirrors DISCOUNT_REASONS on the OS. */
export const ALLOWED_REASONS = ["credit_note", "error_correction", "install_insert_referral"] as const;
export type DiscountReason = (typeof ALLOWED_REASONS)[number];

/** Reasons a trade/corporate buyer may never use — they already price lower. */
const RETAIL_ONLY_REASONS: readonly DiscountReason[] = ["install_insert_referral"];

export type DiscountRefusal =
  | "unknown_code"
  | "already_redeemed"
  | "expired"
  | "not_allowed"
  | "trade_account"
  | "not_configured"
  | "unreachable";

export type DiscountCheck =
  | { valid: true; pct: number; issuedFor: DiscountReason }
  | { valid: false; reason: DiscountRefusal };

const CODE_RE = /^[A-Z0-9-]{4,60}$/;

function isAllowedReason(v: unknown): v is DiscountReason {
  return typeof v === "string" && (ALLOWED_REASONS as readonly string[]).includes(v);
}

/** Does the OS know this code, and is it a kind of discount we honour at all?
 *  Buyer-independent — apply {@link discountRefusalFor} on top of it. */
export async function validateOsDiscount(rawCode: string): Promise<DiscountCheck> {
  const code = rawCode.trim().toUpperCase();
  if (!CODE_RE.test(code)) return { valid: false, reason: "unknown_code" };
  if (!TOKEN) return { valid: false, reason: "not_configured" };
  try {
    const r = await fetch(`${OS_BASE}/api/zyvorah/discount/validate/${encodeURIComponent(code)}`, {
      headers: { "x-zyvorah-token": TOKEN },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!r.ok) return { valid: false, reason: "unreachable" };
    const j = (await r.json()) as { valid?: boolean; pct?: number; reason?: string; issuedFor?: string };
    if (j.valid && typeof j.pct === "number" && j.pct > 0) {
      // A code the OS calls valid but cannot say WHY it exists is refused. An
      // older OS that predates issuedFor fails closed here, which is correct:
      // a discount with no stated reason is exactly what this rule forbids.
      if (!isAllowedReason(j.issuedFor)) return { valid: false, reason: "not_allowed" };
      return { valid: true, pct: j.pct, issuedFor: j.issuedFor };
    }
    const reason =
      j.reason === "already_redeemed" || j.reason === "expired" || j.reason === "not_allowed"
        ? (j.reason as DiscountRefusal)
        : "unknown_code";
    return { valid: false, reason };
  } catch {
    return { valid: false, reason: "unreachable" };
  }
}

/** The buyer-dependent half of the rule: a referral code is refused for a
 *  trade/corporate account. Returns null when the code may be used. */
export function discountRefusalFor(
  check: DiscountCheck,
  buyer: { isTradeAccount: boolean },
): DiscountRefusal | null {
  if (!check.valid) return check.reason;
  if (buyer.isTradeAccount && RETAIL_ONLY_REASONS.includes(check.issuedFor)) return "trade_account";
  return null;
}

/** Marks the code used on the OS once payment is confirmed. Fire-and-forget:
 *  a redeem that fails only means the code stays technically reusable — never
 *  block or fail an already-paid order over it. */
export async function redeemOsDiscount(rawCode: string, orderRef: string): Promise<void> {
  const code = rawCode.trim().toUpperCase();
  if (!TOKEN || !CODE_RE.test(code)) return;
  try {
    await fetch(`${OS_BASE}/api/zyvorah/discount/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-zyvorah-token": TOKEN },
      body: JSON.stringify({ code, orderRef }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (e) {
    console.error("discount redeem failed (code stays open):", e);
  }
}
