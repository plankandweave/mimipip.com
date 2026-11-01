import { brand } from "@/brand/current";
export const APEX_HOST = new URL(brand.origin).hostname;
export const WWW_HOST = `www.${APEX_HOST}`;

/** www twins and the host each one redirects to. www.wraps.zyvorah.com was a
 * live address while the wraps range was on Vercel; it redirects to the
 * range's own host (founder, 6 October 2026) rather than 404ing anyone who
 * kept it. */
const CANONICAL_FOR: Record<string, string> = {
  [WWW_HOST]: APEX_HOST,
  [`www.wraps.${APEX_HOST}`]: `wraps.${APEX_HOST}`,
  "www.sister.mimi-pip.invalid": "sister.mimi-pip.invalid",
};

/** Return the canonical equivalent for a duplicate www host, preserving the
 * entire public path and query. Other hosts have separate routing rules. */
export function canonicalApexUrl(requestUrl: string, host: string | null | undefined): URL | null {
  const target = CANONICAL_FOR[host?.split(":")[0].toLowerCase() ?? ""];
  if (!target) return null;
  const url = new URL(requestUrl);
  url.hostname = target;
  url.port = "";
  return url;
}
