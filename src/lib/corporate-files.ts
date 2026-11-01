import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { caSignedUrl } from "@/lib/corporate-art-store";

/**
 * Documents in the PRIVATE `corporate-art` bucket — proposals, purchase orders,
 * partner artwork.
 *
 * The bucket is private, so `getPublicUrl()` returns a URL that looks right and
 * always 400s. Three routes stored one of those and one emailed it to the
 * partner's client (2026-07-27). Nothing leaked — the opposite: the links were
 * simply dead. Everything here signs instead.
 *
 * Two shapes, for two audiences:
 *   · the PARTNER has a session, so their links go through a gated route that
 *     mints a fresh signature on every click and can never rot;
 *   · their CLIENT has no session and never will, so the emailed proposal
 *     carries its own signature, long-lived enough to outlive the quote.
 */

/** The canonical `/object/public/...` form we store as a stable REFERENCE.
 *  It is never fetched by a browser — the OS parses the path back out of it
 *  and re-fetches with the service key (see zyvorah.ts design proxy), and the
 *  print engine signs it before handing it to the Mimaki.
 *
 *  The BYTES now live in R2, but this SPELLING is a stored opaque reference
 *  parsed by the OS and the print engine — it must keep the Supabase form
 *  forever, so it is derived from the env URL rather than the client. The
 *  `sb` arg is kept (and ignored) so the many call sites stay untouched. */
export function canonicalArtUrl(_sb: SupabaseClient, path: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/corporate-art/${path}`;
}

/** A URL that actually fetches. Null when signing fails — callers must treat
 *  that as "no link", never fall back to the public form. */
export async function signArt(
  _sb: SupabaseClient, // kept (ignored) so call sites stay untouched
  path: string,
  expiresInSeconds: number,
): Promise<string | null> {
  return await caSignedUrl(path, expiresInSeconds);
}

/** Same as signArt, but the signature carries a resize transform so the object
 *  comes back through Supabase's render CDN at `maxEdge` on its longest side.
 *
 *  This exists for the AI passes. allocateDesigns attaches EVERY wall photo to
 *  one Anthropic request; at full resolution 40 showroom photos is >100k image
 *  tokens, and every retry pays for it again. Its docstring claimed the photos
 *  were "downscaled by signed transform" while signArt passed no transform at
 *  all — so the claim was true of the intent and false of the code until
 *  2026-08-19.
 *
 *  Only for machine eyes. The approver's page keeps the full photo: they are
 *  judging whether artwork suits a real wall, and that needs the detail. */
export async function signArtRender(
  _sb: SupabaseClient, // kept (ignored) so call sites stay untouched
  path: string,
  expiresInSeconds: number,
  maxEdge = 1400,
): Promise<string | null> {
  return await caSignedUrl(path, expiresInSeconds, { maxEdge });
}

/** Storage path for an order's proposal PDF / attached PO. Deterministic from
 *  the account slug and order ref, so a link can always be re-signed without
 *  storing the URL anywhere. */
export const proposalPath = (slug: string, orderRef: string) => `proposals/${slug}/${orderRef}.pdf`;
export const poPath = (slug: string, orderRef: string, ext: string) =>
  `purchase-orders/${slug}/${orderRef}.${ext}`;

/** Pull the object path back out of any corporate-art URL (public form,
 *  signed, or a bare path). Used by the gated view routes, which store the
 *  path but must cope with either shape. */
export function artPathOf(stored: string | null | undefined): string | null {
  const s = (stored ?? "").trim();
  if (!s) return null;
  const m = s.match(/\/storage\/v1\/object\/(?:public\/|sign\/)?corporate-art\/([^?]+)/);
  if (m) return decodeURIComponent(m[1]!);
  return s.startsWith("http") ? null : s;
}

/** A day, in seconds — expiries below read as noise otherwise. */
export const DAY = 86_400;
