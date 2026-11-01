import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  discountRefusalFor,
  redeemOsDiscount,
  validateOsDiscount,
  type DiscountReason as OsReason,
  type DiscountRefusal as OsRefusal,
} from "@/lib/os-discount";
import { collabRefusalFor, emailHint, CODE_RE, type CollabCodeRow, type CollabRefusal } from "@/lib/collab-codes";

/**
 * The ONE place a discount code is judged, for the cart preview, the checkout
 * and the /r/<code> landing alike.
 *
 * Two authorities answer, in order:
 *   1. This store — a creator collaboration code (`collaborations.code`),
 *      bound to an email and optionally to designs, up to 100%.
 *   2. The Magnitude OS — credit notes, error corrections and the install
 *      insert referral, capped at 50% (os-discount.ts).
 *
 * A code the store knows is never asked of the OS: the OS has never heard of
 * it, and a collaboration's own refusal (wrong email, wrong design) must be
 * what the buyer reads, not "unknown code".
 */

export type DiscountReason = OsReason | "creator_collab";
export type DiscountRefusal = OsRefusal | CollabRefusal;

export type DiscountDecision =
  | {
      valid: true;
      pct: number;
      issuedFor: DiscountReason;
      /** The most the RPC may take off, whatever pct says. */
      capPct: number;
      /** Rupee ceiling on the discount, or null. */
      maxValueInr: number | null;
      /** Waive the small-order courier — a gifted wall arrives with no bill. */
      freeShipping: boolean;
      /** Set for a personal code: whose it is, masked, so the cart can say
       *  "personal to p•••a@…" before the email is typed. */
      personalTo?: string;
      /** The designs the code covers, when limited. */
      allowedHandles?: string[] | null;
      collaborationId?: string;
    }
  | { valid: false; reason: DiscountRefusal; personalTo?: string };

export type BuyerContext = {
  email?: string | null;
  cartHandles?: string[] | null;
  isTradeAccount: boolean;
};

const COLLAB_COLUMNS =
  "id, slug, name, email, status, code, discount_pct, max_value_inr, allowed_handles, free_shipping, code_expires_at, order_id, redeemed_at";

export async function lookupCollabCode(rawCode: string): Promise<CollabCodeRow | null> {
  const code = rawCode.trim().toUpperCase();
  if (!CODE_RE.test(code)) return null;
  const db = supabaseAdmin();
  if (!db) return null;
  const { data, error } = await db.from("collaborations").select(COLLAB_COLUMNS).eq("code", code).maybeSingle();
  if (error) {
    console.error("collab code lookup failed:", error.message);
    return null;
  }
  return (data as CollabCodeRow | null) ?? null;
}

/** Judge a code for this buyer. Never throws; an unreachable authority is a refusal. */
export async function checkDiscount(rawCode: string, buyer: BuyerContext): Promise<DiscountDecision> {
  const code = rawCode.trim().toUpperCase();
  if (!CODE_RE.test(code)) return { valid: false, reason: "unknown_code" };

  const collab = await lookupCollabCode(code);
  if (collab) {
    // A creator is a retail customer. A trade account typing a collaboration
    // code is the same double-dip the referral rule refuses.
    if (buyer.isTradeAccount) return { valid: false, reason: "trade_account" };
    const refusal = collabRefusalFor(collab, { email: buyer.email, cartHandles: buyer.cartHandles });
    const personalTo = emailHint(collab.email);
    if (refusal) return { valid: false, reason: refusal, personalTo };
    return {
      valid: true,
      pct: collab.discount_pct,
      issuedFor: "creator_collab",
      capPct: 100,
      maxValueInr: collab.max_value_inr != null ? Number(collab.max_value_inr) : null,
      freeShipping: collab.free_shipping,
      personalTo,
      allowedHandles: collab.allowed_handles?.length ? collab.allowed_handles : null,
      collaborationId: collab.id,
    };
  }

  const os = await validateOsDiscount(code);
  const refusal = discountRefusalFor(os, { isTradeAccount: buyer.isTradeAccount });
  if (refusal || !os.valid) return { valid: false, reason: refusal ?? "unknown_code" };
  return { valid: true, pct: os.pct, issuedFor: os.issuedFor, capPct: 50, maxValueInr: null, freeShipping: false };
}

/**
 * The order is confirmed — spend the code. A collaboration code is marked on
 * its row (the order it bought, when); anything else is the OS's to burn.
 * Fire-and-forget like redeemOsDiscount: a redeem that fails leaves a code
 * technically open, never a confirmed order in doubt.
 */
export async function redeemDiscount(rawCode: string, order: { orderId: string; orderNumber: number }): Promise<void> {
  const code = rawCode.trim().toUpperCase();
  if (!CODE_RE.test(code)) return;
  const db = supabaseAdmin();
  if (db) {
    const { data, error } = await db
      .from("collaborations")
      .update({ order_id: order.orderId, redeemed_at: new Date().toISOString(), status: "ordered" })
      .eq("code", code)
      .is("order_id", null)
      .in("status", ["agreed"])
      .select("id");
    if (error) console.error("collab code redeem failed (code stays open):", error.message);
    else if ((data ?? []).length > 0) return;
    // Not a collaboration code (or already marked) — fall through to the OS,
    // which answers "unknown" harmlessly for a code it never minted.
    const { data: known } = await db.from("collaborations").select("id").eq("code", code).maybeSingle();
    if (known) return;
  }
  await redeemOsDiscount(code, `web-${order.orderNumber}`);
}
