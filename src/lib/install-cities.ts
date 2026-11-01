/**
 * Where on-site installation can actually be ordered.
 *
 * Installation is fulfilled by our own city installers, so it may only be sold
 * into the cities where we have one: Bengaluru, Mumbai and Pune. This module is
 * the single source of truth for "can this address have installation?" and is
 * used by BOTH the product page (so the add-on can't even be ticked elsewhere)
 * and the checkout API (the authoritative gate — a client can be bypassed).
 *
 * Resolution rule — THE PINCODE DECIDES, always:
 *   • In a serviceable range → serviceable. Out of range (or not a valid
 *     pincode) → not serviceable, whatever the city field says.
 *   • The typed city name is never what authorises installation. Free text is
 *     easy to mistype or fake, and it contradicts the ranges at the edges:
 *     "Navi Mumbai" and "Thane" contain/neighbour Mumbai but sit outside the
 *     Mumbai installer's pincode catchment. One rule, no disagreement.
 *
 * Checkout already requires a pincode, so this costs the customer nothing; the
 * product page asks for it before offering the add-on.
 *
 * The MG OS re-checks the city and geotags the installer visit, so this is the
 * front gate, not the only one.
 */

export type InstallCity = "Bengaluru" | "Mumbai" | "Pune";

/** Serviceable cities, alphabetical — matches INSTALL_CITIES in pricing.ts. */
export const INSTALL_CITY_NAMES: readonly InstallCity[] = ["Bengaluru", "Mumbai", "Pune"] as const;

/**
 * Serviceable pincode ranges, inclusive. Kept as explicit numeric ranges so the
 * covered area is auditable and easy to extend when an installer's catchment
 * grows (e.g. adding Navi Mumbai/Thane, or Pune's outer belt).
 */
const PIN_RANGES: readonly { city: InstallCity; from: number; to: number }[] = [
  // Bengaluru (Bangalore Urban) — all 560xxx.
  { city: "Bengaluru", from: 560001, to: 560300 },
  // Greater Mumbai proper (island city + suburbs).
  { city: "Mumbai", from: 400001, to: 400104 },
  // Pune city + Pimpri-Chinchwad (one urban agglomeration, one catchment).
  { city: "Pune", from: 411001, to: 411062 },
];

/** A valid Indian pincode is exactly 6 digits and doesn't start with 0. */
function normalisePin(pincode: string | null | undefined): number | null {
  const raw = (pincode ?? "").replace(/\s+/g, "");
  if (!/^[1-9]\d{5}$/.test(raw)) return null;
  return Number(raw);
}

/** The serviceable city a pincode falls in, or null. */
export function installCityFromPincode(pincode: string | null | undefined): InstallCity | null {
  const pin = normalisePin(pincode);
  if (pin == null) return null;
  return PIN_RANGES.find((r) => pin >= r.from && pin <= r.to)?.city ?? null;
}

export type InstallEligibility = {
  /** true only when installation may be sold to this address. */
  serviceable: boolean;
  /** the resolved serviceable city, when there is one */
  city: InstallCity | null;
  /**
   * `ok` — installable. `out_of_area` — a real pincode we don't cover.
   * `unknown` — nothing usable entered yet; callers should treat this as
   * "not confirmed" (don't offer the add-on) rather than an outright refusal.
   */
  reason: "ok" | "out_of_area" | "unknown";
};

/**
 * Decide whether installation may be ordered for an address. The pincode is the
 * only authority — see the rule at the top of this file.
 */
export function resolveInstallEligibility(input: { pincode?: string | null }): InstallEligibility {
  const pin = normalisePin(input.pincode);
  if (pin == null) return { serviceable: false, city: null, reason: "unknown" };
  const city = installCityFromPincode(input.pincode);
  return city
    ? { serviceable: true, city, reason: "ok" }
    : { serviceable: false, city: null, reason: "out_of_area" };
}

/** Convenience boolean for call sites that only need a yes/no. */
export function isInstallServiceable(input: { pincode?: string | null }): boolean {
  return resolveInstallEligibility(input).serviceable;
}
