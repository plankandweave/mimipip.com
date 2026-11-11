"use client";

// Collection card for the LENGTH family (Borders & Strips). A border is a
// horizontal repeat, so the card IS the product: the flat pattern tiled
// edge-to-edge as a full-width running band — never a square crop, which sells
// a different object than the strip that arrives. The band drifts slowly
// sideways (out and back, so the loop never jumps a seam) to show the repeat
// is seamless. Falls back to a plain cover image when no flat pattern exists.

import Link from "next/link";
import Image from "@/components/SiteImage";
import type { ProductCardData } from "@/lib/types";
import { useMarket } from "@/components/MarketProvider";
import { productBadges } from "@/lib/badges";
import { BadgeIcon } from "@/components/BadgeIcon";
import { WishlistButton } from "@/components/WishlistButton";
import { mediaRendition } from "@/lib/media-url";

// Mirrors BORDER_SET_METRES. Duplicated (like card-copy's family strings)
// because product-category imports the server Supabase client, which must not
// reach this client bundle.
const SET_METRES = 5;

export function BorderStripCard({ product }: { product: ProductCardData }) {
  const { money } = useMarket();
  const href = `/products/${product.handle}`;
  const badge = productBadges({
    isAutograph: product.isAutograph,
    isSignature: product.isSignature,
    isLimited: product.isLimited,
    isNew: product.isNew,
    isShowroom: product.isShowroom,
  })[0];
  const perMetre = product.pricePerMetre ?? null;
  const detail = [product.subtitle, product.borderHeightCm ? `${product.borderHeightCm} cm tall` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="group block">
      <div className="zoomer relative h-24 bg-wash sm:h-28">
        <Link href={href} aria-label={product.title} className="block h-full w-full">
          {product.flatImage ? (
            // The 1200px rendition, never the upload: a CSS background gets no
            // srcset, so this card fetched the studio's original PNG — four
            // strips, 17 MB, on the homepage of a phone (7 October 2026: the
            // page weighed 19 MB and took 6.5 s on a fast line). The band is
            // 96–112 CSS px tall; the rendition is ~50 KB and looks the same.
            <div
              role="img"
              aria-label={product.imageAlt}
              className="border-drift h-full w-full"
              style={{
                backgroundImage: `url(${mediaRendition(product.flatImage, 1200)})`,
                backgroundRepeat: "repeat-x",
                backgroundSize: "auto 100%",
              }}
            />
          ) : product.image ? (
            <Image src={product.image} alt={product.imageAlt} fill sizes="100vw" className="object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-mist">No image</div>
          )}
        </Link>

        <WishlistButton handle={product.handle} />

        {badge ? (
          <span className={`pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.1em] backdrop-blur-sm ${badge.className}`}>
            <BadgeIcon badgeKey={badge.key} className="h-3 w-3" />
            {badge.label}
          </span>
        ) : null}
      </div>

      <Link href={href} className="flex items-baseline justify-between gap-4 pt-3">
        <span className="min-w-0">
          <h3 className="font-display text-[0.95rem] font-semibold leading-snug">{product.title}</h3>
          {detail && <p className="mt-0.5 text-xs text-slate">{detail}</p>}
        </span>
        {perMetre != null && (
          <span className="shrink-0 text-right text-sm">
            <span className="font-semibold text-charcoal">
              {money(Math.round(perMetre * SET_METRES))} / {SET_METRES} m set
            </span>
            <span className="mt-0.5 block text-xs text-mist">{money(perMetre)} per linear metre</span>
          </span>
        )}
      </Link>
    </div>
  );
}
