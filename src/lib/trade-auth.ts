import "server-only";

import { NextResponse } from "next/server";
import { requireGatedUser, type GatedUser } from "./auth-server";
import { supabaseAdmin } from "./supabase-admin";

// Guard for /api/trade/* route handlers, layered on top of the retail email
// gate (requireGatedUser). A trade partner is a normal site account plus an
// active trade_partners row — this resolves both and returns the 401/403 the
// caller should return, matching requireGatedUser's { blocked } shape.

export type TradePartner = {
  id: string;
  customer_id: string;
  status: string;
  entity_type: string;
  legal_name: string;
  commission_pct: number;
  markup_cap_pct: number;
  tds_pct: number;
};

/** Full guard: signed-in AND an active trade partner. Use for order/dashboard
 *  routes that require a live trade account. */
export async function requireTradePartner(): Promise<
  | { user: GatedUser; partner: TradePartner; blocked: null }
  | { user: null; partner: null; blocked: NextResponse }
> {
  const gated = await requireGatedUser();
  if (gated.blocked) return { user: null, partner: null, blocked: gated.blocked };

  const admin = supabaseAdmin();
  if (!admin) {
    return {
      user: null,
      partner: null,
      blocked: NextResponse.json({ error: "service_unavailable" }, { status: 503 }),
    };
  }

  const { data: customer } = await admin
    .from("customers")
    .select("id")
    .eq("auth_user_id", gated.user.id)
    .maybeSingle();
  if (!customer) {
    return {
      user: null,
      partner: null,
      blocked: NextResponse.json({ error: "not_a_trade_partner" }, { status: 403 }),
    };
  }

  const { data: partner } = await admin
    .from("trade_partners")
    .select(
      "id, customer_id, status, entity_type, legal_name, commission_pct, markup_cap_pct, tds_pct",
    )
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (!partner || partner.status !== "active") {
    return {
      user: null,
      partner: null,
      blocked: NextResponse.json(
        { error: "not_a_trade_partner", status: partner?.status ?? null },
        { status: 403 },
      ),
    };
  }

  return { user: gated.user, partner: partner as TradePartner, blocked: null };
}

/** Looser guard for the apply flow itself: signed-in is enough — the
 *  trade_partners row may not exist yet, or may be draft/verifying/rejected.
 *  Returns whatever row exists (or null) alongside the gated user. */
export async function requireGatedUserWithPartner(): Promise<
  | { user: GatedUser; partner: TradePartner | null; blocked: null }
  | { user: null; partner: null; blocked: NextResponse }
> {
  const gated = await requireGatedUser();
  if (gated.blocked) return { user: null, partner: null, blocked: gated.blocked };

  const admin = supabaseAdmin();
  if (!admin) {
    return {
      user: null,
      partner: null,
      blocked: NextResponse.json({ error: "service_unavailable" }, { status: 503 }),
    };
  }

  // link_auth_customer (RPC, run client-side by AuthProvider.ensureCustomerId)
  // is what normally creates the customers row; here we only read, and treat
  // a missing row as "no partner yet" rather than erroring, since a brand new
  // session may not have called it yet.
  const { data: customer } = await admin
    .from("customers")
    .select("id")
    .eq("auth_user_id", gated.user.id)
    .maybeSingle();
  if (!customer) return { user: gated.user, partner: null, blocked: null };

  const { data: partner } = await admin
    .from("trade_partners")
    .select(
      "id, customer_id, status, entity_type, legal_name, commission_pct, markup_cap_pct, tds_pct",
    )
    .eq("customer_id", customer.id)
    .maybeSingle();

  return { user: gated.user, partner: (partner as TradePartner) ?? null, blocked: null };
}

/** Is whoever is checking out a trade/dealer buyer rather than a retail one?
 *
 *  Used by the discount rule: a dealer's discount is their contract price on
 *  the account, so an install-insert referral code is refused for them (see
 *  RETAIL_ONLY_REASONS in os-discount.ts). Two ways to be a dealer here — an
 *  active trade_partners row against the signed-in site account, or a live
 *  corporate portal session (HomeLane and the like).
 *
 *  Never throws and never blocks: if we cannot tell, we answer "retail", which
 *  matches how checkout already treats an unresolvable discount — the code is
 *  honoured rather than the order broken. A wrongly-allowed 15% is a smaller
 *  failure than a retail customer being refused their own insert code.
 */
export async function currentBuyerIsTradeAccount(): Promise<boolean> {
  try {
    const { currentCorporateSession, isStaffSession } = await import("./corporate-auth");
    // Our own people sign in to a partner's portal to work on it; that cookie
    // must not turn their own shop checkout into a to-pay trade order (the OS
    // books freight from the order's email, which is not a partner's, so the
    // page would contradict the docket). Only a partner's own member counts.
    const session = await currentCorporateSession();
    if (session && !isStaffSession(session)) return true;
  } catch {
    /* corporate portal unreachable — fall through to the trade_partners check */
  }
  try {
    const gated = await requireGatedUser();
    if (gated.blocked) return false;
    const admin = supabaseAdmin();
    if (!admin) return false;
    const { data: customer } = await admin
      .from("customers")
      .select("id")
      .eq("auth_user_id", gated.user.id)
      .maybeSingle();
    if (!customer) return false;
    const { data: partner } = await admin
      .from("trade_partners")
      .select("status")
      .eq("customer_id", (customer as { id: string }).id)
      .maybeSingle();
    return (partner as { status?: string } | null)?.status === "active";
  } catch {
    return false;
  }
}

/** Same question as {@link currentBuyerIsTradeAccount}, asked of an EMAIL
 *  rather than of the live session.
 *
 *  The dispatch push to the OS happens after payment, from a webhook that has
 *  no cookie to read — so who-pays-freight cannot be resolved from a session
 *  there. It is resolved from the order's own email instead, which is the same
 *  identity the order was placed under and, unlike a cookie, still exists when
 *  Razorpay calls back. Matches an active trade_partners row or a corporate
 *  account (by member email, or by the account's email domain). */
export async function isTradeAccountByEmail(email: string | null | undefined): Promise<boolean> {
  const addr = (email ?? "").trim();
  if (!addr) return false;
  try {
    const { accountForEmail } = await import("./corporate-auth");
    if (await accountForEmail(addr)) return true;
  } catch {
    /* corporate lookup unavailable — fall through to trade_partners */
  }
  try {
    const admin = supabaseAdmin();
    if (!admin) return false;
    const { data: customer } = await admin
      .from("customers")
      .select("id")
      .ilike("email", addr)
      .maybeSingle();
    if (!customer) return false;
    const { data: partner } = await admin
      .from("trade_partners")
      .select("status")
      .eq("customer_id", (customer as { id: string }).id)
      .maybeSingle();
    return (partner as { status?: string } | null)?.status === "active";
  } catch {
    return false;
  }
}
