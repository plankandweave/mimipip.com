import { brand } from "../brand/current";
// Where the storefront's public media lives after the R2 migration.
//
// Historically every product image was a Supabase Storage public URL
// (`…supabase.co/storage/v1/object/public/product-images/<key>`), and those
// URLs are burned into database columns (products.image_url, product_images,
// order_items.custom_image_url…) and content files. Rewriting millions of
// characters of stored URLs is how you strand an order row; translating at
// the edge of rendering is reversible. So the stored form stays Supabase's,
// and everything that RENDERS or FETCHES a product image maps it through
// here first.
//
// The mapped form is served by /media/[...path] (same Worker, R2 binding) —
// see that route for why it is not the bare media.zyvorah.com R2 domain.
//
// ONLY `product-images` is migrated by this module. The document buckets
// (order-copies, print-files, …) are small and stay on Supabase Storage;
// their URLs must keep round-tripping untouched through private-doc's
// docRef/signDoc, so the mapping is deliberately bucket-scoped.

/** Buckets whose objects now live in the `zyvorah-media` R2 bucket under
 *  `<bucket>/<key>`. Extend this list only after the bytes are copied. */
// fridge-scenes: the appliance-wrap hero photographs (/fridge-wraps, /wraps).
// Six files, 6 MB, copied to R2 on 9 Oct 2026 after a day of wrap traffic
// pulled 45 MB of them straight out of Supabase Storage (6 Oct 2026).
const MIGRATED_PUBLIC_BUCKETS = ["product-images", "fridge-scenes"] as const;

/** Absolute base for the mapped URLs. Absolute, not relative: the mapped form
 *  lands in og:image tags, emails and DB rows written by new uploads, all of
 *  which need a full origin. */
export const MEDIA_BASE = `${brand.origin}/media`;

/** The bucket's bare R2 custom domain — the keys it serves are the same keys
 *  the binding reads, with no bucket prefix. */
export const R2_DOMAIN_BASE = `https://media.${brand.id}.invalid`;

const OBJECT_RE = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/(?:object|render\/image)\/public\/([^?]+)(?:\?.*)?$/;

/**
 * Map a Supabase public-object (or render/image transform) URL of a migrated
 * bucket to its R2-served form. Anything else — other buckets, media URLs
 * already in the new form, local assets, data URIs — passes through unchanged.
 */
export function toMediaUrl(url: string): string {
  const m = OBJECT_RE.exec(url);
  if (!m) {
    try {
      const legacy = new URL(url);
      if (legacy.hostname === 'media.zyvorah.com') return `${R2_DOMAIN_BASE}${legacy.pathname}${legacy.search}${legacy.hash}`;
      if (legacy.hostname === 'zyvorah.com' || legacy.hostname.endsWith('.zyvorah.com')) return `${brand.origin}${legacy.pathname}${legacy.search}${legacy.hash}`;
    } catch { /* relative paths and data URIs retain their existing semantics */ }
    return url;
  }
  const bucketAndKey = m[1];
  const bucket = bucketAndKey.split("/", 1)[0];
  if (!(MIGRATED_PUBLIC_BUCKETS as readonly string[]).includes(bucket)) return url;
  return `${MEDIA_BASE}/${bucketAndKey}`;
}

/** True for URLs the /media route serves (either origin's spelling). */
export function isMediaUrl(url: string): boolean {
  return url.startsWith(`${MEDIA_BASE}/`) || url.startsWith("/media/");
}

/** The `<bucket>/<key>` behind a media URL in either form, or null. */
export function mediaKeyFromUrl(url: string): string | null {
  const mapped = toMediaUrl(url);
  if (mapped.startsWith(`${MEDIA_BASE}/`)) return decodeURI(mapped.slice(MEDIA_BASE.length + 1));
  if (mapped.startsWith("/media/")) return decodeURI(mapped.slice("/media/".length));
  // The bare R2 custom domain of the same bucket (case-study frames, the
  // commissioned-project flats in studio-projects.ts). Same zone as the
  // Worker, so it must be read through the binding as well.
  if (mapped.startsWith(`${R2_DOMAIN_BASE}/`)) return decodeURI(mapped.slice(R2_DOMAIN_BASE.length + 1));
  return null;
}

/** Widths that exist as pre-generated renditions next to every migrated
 *  object (`<key>@480.webp`, `<key>@1200.webp`) and that new uploads write
 *  through the media container. The /media route falls back to the original
 *  bytes when a rendition is missing, so requesting one is always safe. */
export const RENDITION_WIDTHS = [480, 1200] as const;

/**
 * The URL to actually fetch for a display width — the Supabase render-CDN
 * `?width=` replacement. Only meaningful on media URLs; other URLs return
 * unchanged. Wider than every rendition → the original object.
 */
export function mediaRendition(url: string, width: number): string {
  if (!isMediaUrl(url)) return url;
  const w = RENDITION_WIDTHS.find((r) => width <= r);
  return w ? `${url}@${w}.webp` : url;
}
