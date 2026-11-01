import { autographBlockedForType } from "./account-types";

/** Capabilities change workflow only; commercial account terms remain separate. */
export type PartnerCapabilities = {
  catalogue: boolean;
  customSizing: boolean;
  artworkUpload: boolean;
  customLibrary: boolean;
  customerProjects: boolean;
  optionDecisions: boolean;
  purchaseApproval: boolean;
  poRequiredRelease: boolean;
  automatedRelease: boolean;
  /** Autograph, Saanjha and Atelier, for an account whose TYPE withholds
   *  them (online resellers). An explicit, per-account decision — HomeLane was
   *  given the whole website on 30 September 2026 — never a change to what
   *  the type means for everyone else. */
  exclusiveCollections: boolean;
  dispatchPromiseDays: number;
};
export const LEGACY_CAPABILITIES: PartnerCapabilities = {
  catalogue: true,
  customSizing: true,
  artworkUpload: true,
  customLibrary: true,
  customerProjects: false,
  optionDecisions: false,
  purchaseApproval: false,
  poRequiredRelease: false,
  automatedRelease: false,
  exclusiveCollections: false,
  dispatchPromiseDays: 7,
};
export const HOMELANE_CAPABILITIES: PartnerCapabilities = {
  ...LEGACY_CAPABILITIES,
  artworkUpload: false,
  customLibrary: false,
  customerProjects: true,
  optionDecisions: true,
  purchaseApproval: true,
  poRequiredRelease: true,
  automatedRelease: true,
  exclusiveCollections: true,
};
export function partnerCapabilities(account: {
  slug?: string;
  capabilities?: Partial<PartnerCapabilities> | null;
}): PartnerCapabilities {
  return {
    ...LEGACY_CAPABILITIES,
    ...(account.slug === "homelane" ? HOMELANE_CAPABILITIES : {}),
    ...account.capabilities,
    // Fail closed even in the schema-first deployment window.
    ...(account.slug === "homelane"
      ? {
          poRequiredRelease: true,
          artworkUpload: false,
          customLibrary: false,
          purchaseApproval: true,
          dispatchPromiseDays: 7,
        }
      : {}),
  };
}
export function validateCapabilities(value: unknown): PartnerCapabilities {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Choose partner features.");
  const v = value as Record<string, unknown>;
  for (const key of Object.keys(LEGACY_CAPABILITIES)) {
    if (key === "dispatchPromiseDays") continue;
    if (typeof v[key] !== "boolean") throw new Error(`Invalid feature: ${key}`);
  }
  if (
    !Number.isInteger(v.dispatchPromiseDays) ||
    Number(v.dispatchPromiseDays) < 1 ||
    Number(v.dispatchPromiseDays) > 90
  )
    throw new Error("Dispatch promise must be 1–90 calendar days.");
  if (
    v.poRequiredRelease &&
    !(
      v.customerProjects &&
      v.optionDecisions &&
      v.purchaseApproval &&
      v.automatedRelease
    )
  )
    throw new Error(
      "PO release requires projects, decisions, purchasing and automated release.",
    );
  if (v.customerProjects && !v.poRequiredRelease)
    throw new Error(
      "Customer projects require the private purchasing and PO release workflow.",
    );
  if (
    (v.optionDecisions || v.purchaseApproval || v.automatedRelease) &&
    !v.customerProjects
  )
    throw new Error(
      "Decisions, purchasing and automatic release require customer projects.",
    );
  return Object.fromEntries(
    Object.keys(LEGACY_CAPABILITIES).map((k) => [k, v[k]]),
  ) as PartnerCapabilities;
}
export function purchasingAllowed(session: {
  staff: boolean;
  member: { can_order: boolean; active: boolean } | null;
}): boolean {
  return !session.staff && !!session.member?.active && session.member.can_order;
}

/** Are the exclusive tiers withheld from this account? The account type says
 *  so by default; the `exclusiveCollections` feature overrides it for one
 *  account. Every catalogue, option and order check asks THIS, never the type
 *  alone, so a partner can never find a design it then cannot order. */
export function exclusivesBlocked(account: {
  slug?: string;
  account_type?: string | null;
  capabilities?: Partial<PartnerCapabilities> | null;
}): boolean {
  return autographBlockedForType(account.account_type) && !partnerCapabilities(account).exclusiveCollections;
}
