import { campaignFor } from "@/lib/collab-codes";

/** A same-site path, or null: "/products/x" yes; "//evil.com", "https://…" no. */
export function safePath(p: string | null | undefined): string | null {
  if (!p) return null;
  const t = p.trim();
  if (!t.startsWith("/") || t.startsWith("//") || t.startsWith("/\\")) return null;
  try {
    const u = new URL(t, "https://zyvorah.com");
    if (u.origin !== "https://zyvorah.com") return null;
    return u.pathname + u.search;
  } catch {
    return null;
  }
}

/**
 * Where /c/<slug> sends a visitor: `to` when it is a same-site path, else the
 * collaboration's own landing, tagged so the session beacon attributes the
 * visit (utm_campaign = collab-<slug>). Existing utm_* on the path are
 * replaced — the creator's link is the source, whatever it was pasted with.
 */
export function collabLandingUrl(origin: string, slug: string, landingPath: string, to?: string | null): string {
  const path = safePath(to) ?? safePath(landingPath) ?? "/";
  const u = new URL(path, origin);
  u.searchParams.set("utm_source", slug);
  u.searchParams.set("utm_medium", "influencer");
  u.searchParams.set("utm_campaign", campaignFor(slug));
  return u.toString();
}
