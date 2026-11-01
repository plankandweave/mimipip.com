// Shared view-shaping helpers for the HomeLane-style private partner
// workspace (src/app/partners/[slug]/projects/workspace.tsx, fed by
// src/app/api/corporate/private-workspace/route.ts).
//
// Two rules live here so the API route and the client component agree on the
// same behaviour instead of duplicating it:
//
//   1. Purchase/cost pricing is for canPurchase (purchasing-authorized)
//      accounts only. A designer (canBuild without canPurchase) must never
//      see a ₹ figure, so the API strips `specification.price` before the
//      payload leaves the server — the browser never holds the number.
//   2. An option a designer does not finalize (decision "rejected" or
//      "superseded") moves out of the main working list into an archive
//      instead of vanishing, so nothing that happened is lost.

/** Decisions that park an option in the archive instead of active work. */
export const ARCHIVED_DECISIONS = ["rejected", "superseded"] as const;

export function isArchivedDecision(decision: string): boolean {
  return (ARCHIVED_DECISIONS as readonly string[]).includes(decision);
}

/**
 * Splits a project's options into the ones still in active play and the ones
 * that were rejected or superseded, using the latest decision for each
 * option (draft/accepted options, including released ones, stay active).
 */
export function splitOptionsByArchive<T extends { id: string }>(
  options: T[],
  decisionOf: (optionId: string) => string,
): { active: T[]; archived: T[] } {
  const active: T[] = [];
  const archived: T[] = [];
  for (const o of options) {
    if (isArchivedDecision(decisionOf(o.id))) archived.push(o);
    else active.push(o);
  }
  return { active, archived };
}

/**
 * Removes cost pricing from option specifications before they leave the
 * server, for any session without purchasing authority. Defense in depth:
 * the client also gates its price displays on `canPurchase`, but a
 * non-purchasing browser should never even receive the figure.
 */
export function stripPriceForNonPurchasing<
  T extends { specification?: Record<string, unknown> },
>(options: T[], canPurchase: boolean): T[] {
  if (canPurchase) return options;
  return options.map((o) => {
    if (!o.specification) return o;
    const { price: _price, ...rest } = o.specification;
    return { ...o, specification: rest };
  });
}
