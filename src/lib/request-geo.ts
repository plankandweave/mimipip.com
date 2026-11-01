import { geoCountry } from "@/lib/markets";

/**
 * Where a request comes from, as coarsely as Cloudflare knows it: country,
 * region (state) and city. Read from request.cf when the runtime carries it,
 * else from the headers the gateway always overwrites (src/edge/gate.ts), so
 * a client can never claim a town.
 *
 * Approximate by nature, and never an address or an IP: enough to say a
 * creator's reel brought visitors from Pune and Bengaluru, nothing more.
 */
export type RequestGeo = { country: string | null; region: string | null; city: string | null };

const clean = (v: unknown): string | null => {
  if (typeof v !== "string" || !v.trim()) return null;
  let s = v.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    /* already plain */
  }
  // Letters (any script), spaces and the punctuation town names use.
  s = s.replace(/[^\p{L}\p{M}\p{N} .,'()-]/gu, "").trim().slice(0, 80);
  return s || null;
};

export function requestGeo(req: { cf?: unknown; headers: { get(name: string): string | null } }): RequestGeo {
  const cf = (req as { cf?: { region?: unknown; city?: unknown } }).cf;
  return {
    country: geoCountry(req),
    region: clean(cf?.region) ?? clean(req.headers.get("x-zyv-geo-region")),
    city: clean(cf?.city) ?? clean(req.headers.get("x-zyv-geo-city")),
  };
}

/** "instagram.com" from a referrer URL; null for none, an app, or garbage. */
export function referrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
    return host.slice(0, 80) || null;
  } catch {
    return null;
  }
}
