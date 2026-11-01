// Case-study imagery lives in Cloudflare R2, served from a public bucket
// domain — not `public/`, which would put ~24 large frames into every git
// clone and every Vercel build.
//
// Only the PUBLIC read domain is needed here; uploads happen out of band
// (see scripts/upload-project-media.mjs), so no R2 credentials reach the app.
//
// The bucket's public custom domain is `media.zyvorah.com` (an R2 custom
// domain on the `zyvorah-media` bucket). NEXT_PUBLIC_R2_MEDIA_URL overrides it
// so a bucket rename needs no code change — but it defaults to the live domain
// rather than to "", because the deploy pipeline does not inject that var and
// a missing one silently rendered every case-study cover as a blank frame in
// production. next.config.ts hardcodes the same host in its image
// remotePatterns; keep the two in step.
import { toMediaUrl, R2_DOMAIN_BASE } from "./media-url";

const BASE = R2_DOMAIN_BASE;

/**
 * Resolve an R2 object key ("pulsegrid/reception-curated.jpg") to a URL.
 *
 * Returns "" only when the key is empty or the bucket domain has been
 * explicitly blanked; otherwise it resolves against the public R2 domain.
 */
export function mediaUrl(key: string): string {
  if (!key) return "";
  // Absolute URLs pass through — except a Supabase Storage URL of a migrated
  // bucket, which is mapped to its R2-served form. Shorelight's amenity
  // spreads reuse product images by their stored (Supabase) URL, and after
  // the product-images migration those objects only answer from /media.
  if (/^https?:\/\//.test(key)) return toMediaUrl(key);
  if (!BASE) return "";
  return `${BASE}/${key.replace(/^\/+/, "")}`;
}

export const mediaConfigured = Boolean(BASE);
