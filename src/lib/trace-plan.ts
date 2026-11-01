export const MAX_TRACE_PLAN_BYTES = 20 * 1024 * 1024;
/** Initial rollout is only the explicitly approved restricted hospital tenant. */
export function tracePlansEnabled(account: { slug: string; email_domain?: string }): boolean {
  return account.slug === "dr-mehtas-hospitals" && account.email_domain === "dr-mehtas-hospitals.trace.invalid";
}
