"use client";

import { RoomPanel } from "./RoomPanel";
import { useState } from "react";
import Link from "next/link";
import Image from "@/components/SiteImage";
import type { ProductCardData } from "@/lib/types";
import { productBadges } from "@/lib/badges";
import { BadgeIcon } from "@/components/BadgeIcon";
import { WishlistButton } from "@/components/WishlistButton";
import { cardCopy, familyChip, cardPrice } from "@/lib/card-copy";
import { useCardMoney } from "@/lib/use-card-money";

/** `href` overrides the product link — a size landing page sends the shopper
 *  to the product with that size already chosen. */
export function ProductCard({ product, href }: { product: ProductCardData; href?: string }) {
  const format = useCardMoney();
  const numericPrice = cardPrice(product);
  // Every card says which family it is and prices it in that family's own unit:
  // wallpaper by area, a border by the linear metre, a canvas from its smallest
  // finished size. Resolved in one place so no surface can drift.
  const copy = cardCopy({
    measurementType: product.measurementType ?? "area",
    cardLabel: product.cardLabel,
    price: numericPrice,
    isReadySizeWallpaper: product.measurementType !== "fixed" && product.isReadySize,
    format,
  });
  const price = copy.price;
  // The flat artwork is fetched only when a mouse arrives, so visitors who
  // never hover do not download an extra image for every card.
  const [hoverWanted, setHoverWanted] = useState(false);
  const [hoverReady, setHoverReady] = useState(false);
  const flatHoverImage = product.flatHoverImage && product.flatHoverImage !== product.image ? product.flatHoverImage : null;
  const flatHover = flatHoverImage && hoverWanted ? (
    <Image
      src={flatHoverImage}
      alt=""
      fill
      sizes="(max-width:768px) 50vw, 25vw"
      onLoad={() => setHoverReady(true)}
      className={`card-hover-img object-cover ${hoverReady ? "is-ready" : ""}`}
    />
  ) : null;
  // Show the single highest-priority editorial badge (if any).
  const badge = productBadges({
    isAutograph: product.isAutograph,
    isSignature: product.isSignature,
    isLimited: product.isLimited,
    isNew: product.isNew,
    isShowroom: product.isShowroom,
  })[0];
  return (
    <Link
      href={href ?? `/products/${product.handle}`}
      className="group block"
      onPointerEnter={(e) => { if (e.pointerType === "mouse" && flatHoverImage) setHoverWanted(true); }}
      onFocus={() => { if (flatHoverImage) setHoverWanted(true); }}
    >
      {/* The card's FOOTPRINT stays square so every grid row lines up, but a
          piece with a fixed finished shape is framed at that shape inside it —
          matted, never cropped. A 24×36 canvas reads as the portrait it is,
          next to a square one, the way a gallery wall hangs. */}
      <div className="zoomer relative flex aspect-square items-center justify-center bg-wash">
        <WishlistButton handle={product.handle} />
        {product.image ? (
          product.roomPanel ? <RoomPanel src={product.image} alt={product.imageAlt} panel={product.roomPanel} card/> : product.cardImageCrop ? (
            <div className="absolute inset-0 overflow-hidden bg-wash">
              <div
                className="absolute"
                style={{
                  width: `${product.cardImageCrop.columns * 100}%`,
                  height: `${product.cardImageCrop.rows * 100}%`,
                  left: `${-product.cardImageCrop.x * 100}%`,
                  top: `${-product.cardImageCrop.y * 100}%`,
                }}
              >
                <Image
                  src={product.image}
                  alt={product.imageAlt}
                  fill
                  sizes="(max-width:768px) 50vw, 25vw"
                  className="object-cover"
                />
              </div>
            </div>
          ) : product.aspectRatio ? (
            <div className="relative h-full max-w-full" style={{ aspectRatio: product.aspectRatio }}>
              <Image
                src={product.image}
                alt={product.imageAlt}
                fill
                sizes="(max-width:768px) 50vw, 25vw"
                className="object-cover"
              />
              {flatHover}
            </div>
          ) : (
            <>
              <Image
                src={product.image}
                alt={product.imageAlt}
                fill
                sizes="(max-width:768px) 50vw, 25vw"
                className="object-cover"
              />
              {flatHover}
            </>
          )
        ) : (
          <div className="grid h-full place-items-center text-mist">No image</div>
        )}
        {flatHover && product.cardImageCrop ? flatHover : null}
        {badge ? (
          <span className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full max-w-[calc(100%-4.25rem)] px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.1em] backdrop-blur-sm ${badge.className}`}>
            <BadgeIcon badgeKey={badge.key} className="h-3 w-3 shrink-0" />
            {/* Short on a phone, where the heart button sits a hundred pixels
                to the right; the full label from sm up. */}
            <span className="truncate sm:hidden">{badge.short}</span>
            <span className="hidden truncate sm:inline">{badge.label}</span>
          </span>
        ) : (
          <span className="absolute left-3 top-3 rounded-full bg-surface/90 px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-slate opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
            {product.cardLabel?.startsWith("Design preview") ? "Design preview" : familyChip(product)}
          </span>
        )}
      </div>
      <div className="pt-3">
        <h3 className="font-display text-[0.95rem] font-semibold leading-snug">{product.title}</h3>
        <p className="mt-1 text-sm text-slate">
          {copy.promise}
          {price && <span className="mt-0.5 block text-mist">{price}</span>}
        </p>
      </div>
    </Link>
  );
}
