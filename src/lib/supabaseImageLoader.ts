// Custom Next.js image loader — routes optimization through Supabase Storage's
// image render/transform CDN instead of Vercel's image optimizer. Vercel's
// optimizer hit its plan quota (all /_next/image requests 402'd, breaking every
// <Image> on the site); Supabase transforms the same images for free from its
// own CDN, so images stay resized/compressed with no Vercel quota dependency.

import { toMediaUrl, isMediaUrl, mediaRendition, R2_DOMAIN_BASE } from "@/lib/media-url";

export default function supabaseImageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  // `quality` is accepted for next/image's signature; no branch below can act
  // on it (R2 renditions are pre-encoded, raw objects are served as stored).
  void quality;

  // R2-migrated buckets (product-images): stored URLs are still Supabase's
  // spelling, mapped here to /media and sized by picking the pre-generated
  // rendition — the render-CDN's `?width=` replacement. The /media route
  // falls back to the master when a rendition is missing, so this never
  // breaks an image.
  const mapped = toMediaUrl(src);
  if (isMediaUrl(mapped)) return mediaRendition(mapped, width);

  // Supabase Storage public objects that are NOT migrated (corporate-logos,
  // and any other small bucket) are served as the raw object, never through
  // Supabase's render/image transform endpoint. That endpoint is a paid
  // Supabase feature this project does not have: it answers every request
  // with 403 "FeatureNotEnabled", which on 28 September 2026 was every
  // partner logo on every partner page (Homelane's sign-in card showed alt
  // text where its brand mark belonged). These objects are logos rendered at
  // 36–44px, so there is nothing worth resizing anyway — and `q`/`width` are
  // deliberately ignored here. Do NOT reintroduce render/image without first
  // proving the tenant has the feature (curl the URL: 200 image/*, not 403).
  if (src.includes("/storage/v1/object/public/")) return src;

  // Cloudflare R2 (case-study imagery). R2 has no transform CDN of its own and
  // the r2.dev domain does not support Cloudflare's /cdn-cgi/image resizing, so
  // instead of transforming on the fly we pick between the two sizes that
  // scripts/upload-project-media.mjs already wrote for every frame. Without
  // this the loader would fall through to the pass-through below and ship a
  // 2400px master to a phone — which is also what makes Next warn that the
  // loader ignores `width`.
  // Defaults to the live bucket domain (see project-media.ts): the deploy
  // pipeline does not inject NEXT_PUBLIC_R2_MEDIA_URL, and without this default
  // the case-study check below never matched and every frame fell through to
  // the pass-through, shipping the 2400px master to phones.
  const r2 = R2_DOMAIN_BASE;
  if (r2 && mapped.startsWith(r2)) {
    return width <= 1200 ? mapped.replace(/\.jpg$/, "@1200.jpg") : mapped;
  }

  // Local/public assets, data URIs, or anything else — serve as-is.
  return mapped;
}
