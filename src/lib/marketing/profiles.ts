// Plan ownership is explicit and shared by the desk and the execution boundary.
// Existing plans (including posts with no plan) remain Zyvorah's.
export const PERSONAL_PLAN_PREFIX = "personal-roheena-";
export const PERSONAL_PLAN_KEY = `${PERSONAL_PLAN_PREFIX}studio`;
export function isPersonalPlan(key: string | null | undefined): boolean {
  return typeof key === "string" && key.startsWith(PERSONAL_PLAN_PREFIX);
}
export function belongsToProfile(key: string | null | undefined, profile: "zyvorah" | "roheena"): boolean {
  return isPersonalPlan(key) === (profile === "roheena");
}
