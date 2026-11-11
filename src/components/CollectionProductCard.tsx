"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "@/components/SiteImage";
import type { ProductCardData } from "@/lib/types";
import { cardCopy, cardPrice } from "@/lib/card-copy";
import { useCardMoney } from "@/lib/use-card-money";
import { productBadges } from "@/lib/badges";
import { BadgeIcon } from "@/components/BadgeIcon";
import { WishlistButton } from "@/components/WishlistButton";
import { SampleOrderModal } from "@/components/SampleOrderModal";
import { useMarket } from "@/components/MarketProvider";
import { formatMarketMoney } from "@/lib/markets";

// Collection-grid card: the shared product-card image behavior plus a derived
// descriptor line and hover quick-actions (See in room / Order sample / Customise + Save).
export function CollectionProductCard({ product, buyingActions = false }: { product: ProductCardData; buyingActions?: boolean }) {
  const [sampleOpen, setSampleOpen] = useState(false);
  const [hoverWanted, setHoverWanted] = useState(false);
  const [hoverReady, setHoverReady] = useState(false);
  const { market, quote } = useMarket();
  const href = `/products/${product.handle}`;
  const badge = productBadges({
    isAutograph: product.isAutograph,
    isSignature: product.isSignature,
    isLimited: product.isLimited,
    isNew: product.isNew,
    isShowroom: product.isShowroom,
  })[0];

  const family = product.measurementType ?? "area";
  // The quick actions are wallpaper actions. A border has no room visualiser,
  // no sample and nothing to customise; a canvas is a finished piece, not a
  // wall covering — offering "Customise" on either promises something the
  // product page cannot deliver.
  const showQuickActions = family === "area";
  // Samples are offered on one collection only (see SAMPLE_COLLECTION_TAGS).
  // Fails closed on a card whose tags weren't loaded — better a missing chip
  // than a chip opening a flow the API refuses.
  const sampleable = product.sampleable === true;
  const copy = cardCopy({
    measurementType: family,
    cardLabel: product.cardLabel,
    price: cardPrice(product),
    isReadySizeWallpaper: family === "area" && product.isReadySize,
    format: useCardMoney(),
  });
  const exampleTotal = family === "area" && !product.isReadySize && product.fromPricePerSqft
    ? quote(Math.round(80 * product.fromPricePerSqft), 80).total
    : null;

  return (
    <div className="group block">
      <div
        className="zoomer relative aspect-square bg-wash"
        onPointerEnter={(e) => { if (e.pointerType === "mouse" && product.flatHoverImage) setHoverWanted(true); }}
      >
        <Link
          href={href}
          aria-label={product.title}
          className="grid h-full w-full place-items-center"
          onFocus={() => { if (product.flatHoverImage) setHoverWanted(true); }}
        >
          {product.image ? (
            // A design sold AS a shape is shown whole inside the square tile
            // rather than cropped to it — same rule, and the same reasons, as
            // ProductCard: a 1:2.5 booth panel square-cropped shows a detail
            // nobody is buying, and a portrait canvas becomes a different
            // object. Designs with no declared shape (a repeat) still fill the
            // tile, which is what keeps a normal grid looking like a grid.
            product.aspectRatio ? (
              <div className="relative h-full max-w-full" style={{ aspectRatio: product.aspectRatio }}>
                <Image
                  src={product.image}
                  alt={product.imageAlt}
                  fill
                  sizes="(max-width:768px) 50vw, 25vw"
                  className="object-cover"
                />
              </div>
            ) : (
              <Image src={product.image} alt={product.imageAlt} fill sizes="(max-width:768px) 50vw, 25vw" className="object-cover" />
            )
          ) : (
            <div className="grid h-full place-items-center text-mist">No image</div>
          )}
        </Link>
        {product.flatHoverImage && product.flatHoverImage !== product.image && hoverWanted && (
          <Image
            src={product.flatHoverImage}
            alt=""
            fill
            sizes="(max-width:768px) 50vw, 25vw"
            onLoad={() => setHoverReady(true)}
            className={`card-hover-img pointer-events-none object-cover ${hoverReady ? "is-ready" : ""}`}
          />
        )}

        <WishlistButton handle={product.handle} />

        {badge ? (
          <span className={`pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full max-w-[calc(100%-4.25rem)] px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.1em] backdrop-blur-sm ${badge.className}`}>
            <BadgeIcon badgeKey={badge.key} className="h-3 w-3 shrink-0" />
            {/* Short on a phone, where the heart button sits a hundred pixels
                to the right; the full label from sm up. */}
            <span className="truncate sm:hidden">{badge.short}</span>
            <span className="hidden truncate sm:inline">{badge.label}</span>
          </span>
        ) : null}
      </div>

      <Link href={href} className="block pt-3">
        <h3 className="font-display text-[0.95rem] font-semibold leading-snug">{product.title}</h3>
        {product.subtitle && <p className="mt-0.5 text-xs text-slate">{product.subtitle}</p>}
        <p className="mt-1 text-sm text-slate">
          {copy.promise}
          {copy.price && <span className="mt-0.5 block text-mist">{copy.price}</span>}
          {exampleTotal != null && <span className="mt-1 block text-xs text-charcoal/80">Example 10 × 8 ft wall: {formatMarketMoney(exampleTotal, market.currency)}{market.currency === "USD" ? " incl. delivery" : " incl. GST"}</span>}
        </p>
      </Link>

      {buyingActions && showQuickActions && <div className="mt-3 flex flex-wrap gap-2">
        <Link href={href} className="btn min-h-11 px-4 text-xs">Size &amp; buy</Link>
        {sampleable && <button type="button" onClick={() => setSampleOpen(true)} className="btn btn-ghost min-h-11 px-4 text-xs">Order a sample</button>}
      </div>}

      <SampleOrderModal
        open={sampleOpen && sampleable}
        onClose={() => setSampleOpen(false)}
        productHandle={product.handle}
        productTitle={product.title}
      />
    </div>
  );
}
