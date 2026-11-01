"use client";

import { forwardRef, type CSSProperties } from "react";
import NextImage, { type ImageProps } from "next/image";
import siteImageLoader from "@/lib/supabaseImageLoader";

// Every storefront <Image> goes through here, never `next/image` directly.
//
// Why: next.config's `images.loaderFile` is a Next.js feature that vinext does
// NOT implement — its next/image shim never reads it. So from the Cloudflare
// cutover until 26 September 2026 the loader in supabaseImageLoader.ts was dead
// code, and every product card shipped the full-size master (2–3.5 MB PNG)
// where a 20–55 KB @480.webp rendition was already sitting next to it in R2.
// A 24-card room page downloaded ~65 MB and painted its pictures in strips.
//
// This component applies the loader itself and emits a real srcset, so the
// browser picks the rendition that fits the slot. Anything the loader does not
// know how to resize (local /public assets, SVGs, data URIs, `unoptimized`)
// is handed to next/image unchanged.

// Candidate widths. For /media URLs these land on @480, @1200 and the master;
// other loaders map them to whatever they can serve, and duplicates collapse.
const CANDIDATE_WIDTHS = [480, 1200, 2400];

type Props = ImageProps;

const SiteImage = forwardRef<HTMLImageElement, Props>(function SiteImage(props, ref) {
  const {
    src,
    alt,
    width,
    height,
    fill,
    priority,
    preload,
    quality,
    sizes,
    style,
    loading,
    unoptimized,
    loader,
    placeholder: _placeholder,
    blurDataURL: _blurDataURL,
    overrideSrc: _overrideSrc,
    onLoadingComplete: _onLoadingComplete,
    ...rest
  } = props;

  if (typeof src !== "string" || unoptimized || loader || /\.svg(\?|$)/i.test(src)) {
    return <NextImage ref={ref} {...props} />;
  }

  const q = typeof quality === "string" ? Number(quality) : quality;
  // Largest descriptor wins when two widths resolve to the same file (e.g. a
  // bucket with only a 1200 rendition), so the browser never undersizes it.
  const byUrl = new Map<string, number>();
  for (const w of CANDIDATE_WIDTHS) byUrl.set(siteImageLoader({ src, width: w, quality: q }), w);
  if (byUrl.size === 1 && byUrl.has(src)) {
    // The loader deliberately serves this URL as-is, so the image must be
    // rendered as-is too: `unoptimized`. Without it, vinext's next/image hands
    // remote URLs to @unpic, which recognises Supabase Storage and rewrites
    // them to Supabase's render/image transform endpoint. That endpoint is a
    // paid feature this project lacks (403 FeatureNotEnabled), so on 28
    // September 2026, after the loader stopped using it, every partner logo
    // was STILL broken through this branch. The loader is the one place that
    // decides how a URL is sized; nothing downstream may re-decide it.
    return <NextImage ref={ref} {...props} unoptimized />;
  }

  const srcSet = [...byUrl].map(([u, w]) => `${u} ${w}w`).join(", ");
  const eager = priority || preload;
  const fillStyle: CSSProperties | undefined = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style }
    : style;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    // src FIRST: the deploy check proves pictures rendered by matching
    // `<img src="https://zyvorah.com/media/product-images/` — a className
    // ahead of it failed that check on a perfectly healthy site.
    <img
      src={siteImageLoader({ src, width: 1200, quality: q })}
      ref={ref}
      {...rest}
      srcSet={srcSet}
      sizes={sizes ?? (fill ? "100vw" : width ? `${width}px` : "100vw")}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      loading={loading ?? (eager ? "eager" : "lazy")}
      fetchPriority={eager ? "high" : rest.fetchPriority}
      decoding="async"
      data-nimg={fill ? "fill" : "1"}
      style={fillStyle}
    />
  );
});

export default SiteImage;
