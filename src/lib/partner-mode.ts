import "server-only";

import { NextResponse } from "next/server";
import { currentCorporateSession, partnerHome, type CorporateSession } from "./corporate-auth";
import { purchasingAllowed } from "./partner-capabilities";

// A partner's person on the STOREFRONT.
//
// HomeLane's designers sign in once, through the HomeLane portal, and then
// browse zyvorah.com like anyone else — every collection, room, configurator
// and design tool. What changes is what a click commits to: a designer never
// buys. "Add to cart" files the wall into the partner's own customer project,
// where the account's purchasing member (procurement) releases it. The cart,
// checkout and sample order are the retail customer's, and refuse a partner
// session outright below — a hidden button is not a rule.
//
// Deliberately small: the storefront needs to know WHO is here and what they
// may commit to, never the account's commercial terms. Rates, discount,
// credit and PO policy stay inside the portal, and only for purchasing.

export type PartnerRole = "designer" | "purchaser" | "staff";

export type PartnerMode = {
  slug: string;
  name: string;
  email: string;
  role: PartnerRole;
  /** The portal this person came in through. */
  home: string;
  /** May file walls into customer projects (can_build, or our own staff). */
  canBuild: boolean;
};

export function partnerModeOf(s: CorporateSession): PartnerMode {
  const role: PartnerRole = s.staff ? "staff" : purchasingAllowed(s) ? "purchaser" : "designer";
  return {
    slug: s.account.slug,
    name: s.account.name,
    email: s.email,
    role,
    home: partnerHome(s.account),
    canBuild: s.staff || !!s.member?.can_build || !s.member,
  };
}

/** Storefront partner mode; staff shop as retail customers outside the portal. */
export async function currentPartnerMode(): Promise<PartnerMode | null> {
  const s = await currentCorporateSession({ allowVaultUploadOnly: true });
  // Staff portal access must not turn their personal storefront visit into
  // partner procurement. Actual partner members keep their project workflow.
  return s && !s.staff ? partnerModeOf(s) : null;
}

/** Stable body for a retail purchase path refusing a partner session. The
 *  client reads `code` and explains where the wall goes instead. */
export const PARTNER_NO_PURCHASE_BODY = {
  error: "Partner designers don't buy here — save the wall to a customer project and procurement will release it.",
  code: "partner_no_purchase",
} as const;

/** Guard for the retail purchase routes (cart, checkout, sample order): the
 *  403 to return when a partner session is trying to buy, else null. Every
 *  external partner role is refused — purchasing happens in the portal, at the
 *  account's contracted terms, never through the retail till. */
export async function refusePartnerPurchase(): Promise<NextResponse | null> {
  const mode = await currentPartnerMode();
  if (!mode) return null;
  return NextResponse.json(PARTNER_NO_PURCHASE_BODY, { status: 403 });
}
