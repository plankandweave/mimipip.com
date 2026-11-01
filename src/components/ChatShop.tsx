"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { areaSqFt, billedSqFt, billedPriceFor, fixedSizePrice, isCanvasProduct, CM_PER_INCH, MIN_PRINT_WIDTH_FT, MIN_WALLPAPER_SQFT } from "@/lib/pricing";
import { panelArrangementLabel, rollCmFromMm, type CropData } from "@/lib/visualizer";
import { useCart } from "@/components/CartProvider";
import { CartContactCapture } from "@/components/CartContactCapture";
import { useAuthGate } from "@/components/AuthGate";
import { RoomVisualizer } from "@/components/RoomVisualizer";
import { SaveToBoard } from "@/components/SaveToBoard";
import { useMarket } from "@/components/MarketProvider";
import { formatMarketMoney } from "@/lib/markets";

type MaterialOpt = { slug: string; name: string; pricePerSqFt: number; rollWidthMm: number | null; textureUrl: string | null };

type Detail = {
  flatUrl: string | null;
  flatAlt: string;
  materials: MaterialOpt[];
  /** Fixed [widthIn, heightIn] options — set for ready-size (peel & stick) designs. */
  readySizes: [number, number][] | null;
};

/**
 * Shop-in-chat: size, price and order a design without leaving the concierge.
 * Same rules as the product page — feet+inches sizing, the default centred
 * crop shown at the wall's true aspect ratio, and the mandatory composition
 * approval before Add to Cart (crop preview IS what prints).
 */
export function ChatShop({
  handle,
  title,
  fallbackImage,
  initialWidthFt,
  initialHeightFt,
  onClose,
  onAdded,
}: {
  handle: string;
  title: string;
  fallbackImage: string | null;
  /** Wall size (decimal feet) already given to the concierge in conversation
   *  — pre-fills sizing so the customer isn't asked to repeat themselves. */
  initialWidthFt?: number;
  initialHeightFt?: number;
  onClose: () => void;
  /** Reports a successful add-to-cart back to the conversation, so the
   *  concierge transcript stays a single continuous thread of what happened. */
  onAdded?: (info: { title: string; sizeLabel: string; materialName: string; total: number }) => void;
}) {
  const { market, money, quote } = useMarket();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [materialSlug, setMaterialSlug] = useState<string | null>(null);
  // Feet + inches, matching the product configurator's convention. Seeded from
  // whatever size the customer already told the concierge, else a sane default.
  const initW = initialWidthFt && initialWidthFt > 0 ? initialWidthFt : 10;
  const initH = initialHeightFt && initialHeightFt > 0 ? initialHeightFt : 10;
  const [widthFeet, setWidthFeet] = useState(Math.floor(initW));
  const [widthInches, setWidthInches] = useState(Math.round((initW - Math.floor(initW)) * 12));
  const [heightFeet, setHeightFeet] = useState(Math.floor(initH));
  const [heightInches, setHeightInches] = useState(Math.round((initH - Math.floor(initH)) * 12));
  const [imgMeta, setImgMeta] = useState<{ aspect: number; sourceW: number; sourceH: number } | null>(null);
  // The design image is frequently already cached by the time this mounts (it
  // was likely just shown elsewhere on the page), so onLoad alone can miss it
  // and leave imgMeta null — silently dropping aspect/sourceW/sourceH from the
  // agent tool calls below. Measure on mount too, not just on load.
  const flatImgRef = useRef<HTMLImageElement | null>(null);
  const flatImgMeasuredFor = useRef<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "See it in my room" — same offsets/composite the full product page uses,
  // seeded to a centred default until the customer places it on their own photo.
  const [visualizerOpen, setVisualizerOpen] = useState(false);
  const [offsetX, setOffsetX] = useState(0.5);
  const [offsetY, setOffsetY] = useState(0.5);
  const [zoom, setZoom] = useState(1);
  const [roomComposite, setRoomComposite] = useState<string | null>(null);
  const [saveBoardOpen, setSaveBoardOpen] = useState(false);
  const { add } = useCart();
  const { gate, authModal } = useAuthGate();
  const openVisualizer = () => gate("see this on your own wall", () => setVisualizerOpen(true));

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabaseBrowser
        .from("products")
        .select(
          "handle, title, ready_sizes, product_images ( url, alt, position, is_featured, is_flat ), product_materials ( price_per_sqft, available, materials ( slug, name, coming_soon, roll_width_mm, texture_url ) )",
        )
        .eq("handle", handle)
        .eq("status", "active").eq("is_service", false)
        .maybeSingle();
      if (!alive) return;
      if (!data) {
        setLoadErr(true);
        return;
      }
      type Row = {
        ready_sizes: [number, number][] | null;
        product_images: { url: string; alt: string | null; position: number; is_featured: boolean; is_flat: boolean }[];
        product_materials: {
          price_per_sqft: number;
          available: boolean;
          materials: { slug: string; name: string; coming_soon: boolean; roll_width_mm: number | null; texture_url: string | null } | null;
        }[];
      };
      const row = data as unknown as Row;
      const flat =
        row.product_images.find((i) => i.is_flat) ??
        [...row.product_images].sort(
          (a, b) => Number(b.is_featured) - Number(a.is_featured) || a.position - b.position,
        )[0];
      const materials = row.product_materials
        .filter((m) => m.available && m.materials && !m.materials.coming_soon)
        .map((m) => ({
          slug: m.materials!.slug,
          name: m.materials!.name,
          pricePerSqFt: Number(m.price_per_sqft),
          rollWidthMm: m.materials!.roll_width_mm ?? null,
          textureUrl: m.materials!.texture_url ?? null,
        }))
        .sort((a, b) => a.pricePerSqFt - b.pricePerSqFt);
      const readySizes = row.ready_sizes && row.ready_sizes.length ? row.ready_sizes : null;
      setDetail({ flatUrl: flat?.url ?? fallbackImage, flatAlt: flat?.alt || title, materials, readySizes });
      setMaterialSlug(materials[0]?.slug ?? null);
      // Ready-size designs snap to their middle size option — never a free size.
      if (readySizes) {
        const [wIn, hIn] = readySizes[Math.floor((readySizes.length - 1) / 2)];
        setWidthFeet(Math.floor(wIn / 12));
        setWidthInches(wIn % 12);
        setHeightFeet(Math.floor(hIn / 12));
        setHeightInches(hIn % 12);
      }
    })();
    return () => {
      alive = false;
    };
  }, [handle, fallbackImage, title]);

  const material = detail?.materials.find((m) => m.slug === materialSlug) ?? detail?.materials[0];
  // Fixed-size (canvas/wall-art) pieces price at a clean retail figure and
  // hide their per-sq-ft rate; a ready-size WALLPAPER prices at its exact
  // area and shows the rate genuinely — same distinction as the product page.
  const isFixedSize = !!(detail?.readySizes && isCanvasProduct(detail.materials.map((m) => m.slug)));
  const widthCm = (widthFeet * 12 + widthInches) * CM_PER_INCH;
  const heightCm = (heightFeet * 12 + heightInches) * CM_PER_INCH;
  const sqft = areaSqFt(widthCm, heightCm);
  // Custom wallpaper bills on the small-order minimums (min 4 ft print width,
  // min 20 sq ft billing) — same basis as the product configurator.
  const billed = isFixedSize ? sqft : billedSqFt(widthCm, heightCm);
  const minimumsApplied = !isFixedSize && sqft > 0 && billed > sqft + 0.0005;
  const total = material
    ? isFixedSize
      ? fixedSizePrice(widthCm, heightCm, material.pricePerSqFt)
      : billedPriceFor(widthCm, heightCm, material.pricePerSqFt)
    : 0;
  const marketTotal = quote(total, billed, 1);
  const marketTotalLabel = formatMarketMoney(marketTotal.total, marketTotal.currency);

  // Any change to size or material invalidates a prior approval, and a room
  // composite rendered at the old size/framing — same policy as the product page.
  useEffect(() => {
    setApproved(false);
    setOffsetX(0.5);
    setOffsetY(0.5);
    setZoom(1);
    setRoomComposite(null);
  }, [widthCm, heightCm, materialSlug]);

  useEffect(() => {
    const url = detail?.flatUrl;
    if (!url || flatImgMeasuredFor.current === url) return;
    const el = flatImgRef.current;
    if (!el?.complete || !el.naturalWidth || !el.naturalHeight) return;
    flatImgMeasuredFor.current = url;
    setImgMeta({ aspect: el.naturalWidth / el.naturalHeight, sourceW: el.naturalWidth, sourceH: el.naturalHeight });
  });

  const addToCart = async () => {
    if (!detail?.flatUrl || !material || total <= 0 || !approved || adding) return;
    setAdding(true);
    setError(null);
    try {
      const panelCm = rollCmFromMm(material.rollWidthMm);
      const crop: CropData = {
        imageUrl: detail.flatUrl,
        wallWidthCm: widthCm,
        wallHeightCm: heightCm,
        // Centred by default, or the framing the customer chose in "See it in my room".
        offsetX,
        offsetY,
        zoom,
        imageAspect: imgMeta?.aspect,
        sourceW: imgMeta?.sourceW,
        sourceH: imgMeta?.sourceH,
        installation: null,
        approval: { approvedAt: new Date().toISOString(), panelArrangement: panelArrangementLabel(widthCm, panelCm) },
      };
      const ok = await add({
        productHandle: handle,
        materialSlug: material.slug,
        widthCm,
        heightCm,
        // Billed area, so area × rate reconciles downstream (cart, invoice);
        // the print still uses widthCm/heightCm — the real measurements.
        areaSqft: billed,
        unitPrice: material.pricePerSqFt,
        quantity: 1,
        lineTotal: total,
        crop,
        roomComposite,
      });
      if (!ok) {
        setError("Couldn't add to cart — please try again.");
        return;
      }
      setAdded(true);
      onAdded?.({
        title,
        sizeLabel: `${widthFeet}′${widthInches}″ × ${heightFeet}′${heightInches}″`,
        materialName: material.name,
        total,
      });
    } catch {
      setError("Couldn't reach the store just now — please try again.");
    } finally {
      setAdding(false);
    }
  };

  const numField =
    "h-10 w-full rounded-[10px] border border-edge bg-surface px-2 text-center text-sm outline-none focus:border-charcoal";

  return (
    <div className="absolute inset-0 z-10 flex flex-col overflow-hidden bg-cloud">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-edge bg-surface px-4 py-3">
        <button
          onClick={onClose}
          aria-label="Back to chat"
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-wash px-3 text-[0.72rem] font-semibold text-charcoal transition-colors hover:bg-edge"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5m0 0 6 6m-6-6 6-6" /></svg>
          Back to chat
        </button>
        <p className="min-w-0 flex-1 truncate font-display text-sm font-bold">{title}</p>
        <Link href={`/products/${handle}`} className="shrink-0 text-[0.68rem] font-semibold text-slate underline underline-offset-2 hover:text-charcoal">
          Full page
        </Link>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {loadErr ? (
          <p className="text-sm text-slate">Couldn&apos;t load this design — please try its full page.</p>
        ) : !detail ? (
          <div className="grid h-40 place-items-center text-sm text-mist">Loading…</div>
        ) : added ? (
          <div className="rounded-[16px] bg-sage/40 p-5">
            <p className="font-display text-base font-bold">Added to your cart ✓</p>
            <p className="mt-1 text-sm text-slate">
              {title} · {widthFeet}′{widthInches}″ × {heightFeet}′{heightInches}″ · {material?.name} · {marketTotalLabel}
            </p>
            <CartContactCapture active />
            <div className="mt-4 flex gap-2">
              <Link href="/checkout" className="btn h-10 flex-1 justify-center text-[0.75rem]">Checkout</Link>
              <Link href="/cart" className="btn btn-ghost h-10 flex-1 justify-center text-[0.75rem]">View cart</Link>
            </div>
            <button onClick={onClose} className="mt-3 text-xs font-semibold text-slate underline underline-offset-2 hover:text-charcoal">
              Keep browsing
            </button>
          </div>
        ) : (
          <>
            {/* crop preview at the wall's true aspect — this IS what prints, or the
                actual room composite once the customer has placed it on their own photo */}
            {detail.flatUrl && (
              <div>
                <div
                  className="relative mx-auto max-h-56 overflow-hidden rounded-[14px] bg-wash"
                  style={{ aspectRatio: `${Math.max(widthCm, 1)} / ${Math.max(heightCm, 1)}`, maxWidth: "100%" }}
                >
                  {roomComposite ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={roomComposite} alt={`${title} placed in your room`} className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <Image
                      ref={flatImgRef}
                      src={detail.flatUrl}
                      alt={detail.flatAlt}
                      fill
                      sizes="360px"
                      loading="eager"
                      className="object-cover"
                      onLoad={(e) => {
                        const im = e.currentTarget;
                        if (im.naturalWidth && im.naturalHeight) {
                          flatImgMeasuredFor.current = detail.flatUrl;
                          setImgMeta({ aspect: im.naturalWidth / im.naturalHeight, sourceW: im.naturalWidth, sourceH: im.naturalHeight });
                        }
                      }}
                    />
                  )}
                </div>
                <p className="mt-1.5 text-center text-[0.66rem] text-mist">
                  {roomComposite
                    ? "Your room, this design — this exact placement prints."
                    : "Shown at your wall's shape — this centred framing is what prints."}
                </p>
              </div>
            )}

            <button
              onClick={openVisualizer}
              disabled={!detail.flatUrl || total <= 0}
              className="btn btn-ghost h-10 w-full gap-1.5 text-[0.72rem] disabled:opacity-40"
            >
              {roomComposite ? "Edit room placement" : "See it in my room →"}
            </button>

            {roomComposite && (
              <button
                onClick={() => setSaveBoardOpen(true)}
                className="h-9 w-full rounded-full bg-charcoal px-4 text-[0.72rem] font-semibold text-surface hover:bg-charcoal/90"
              >
                Save to your account →
              </button>
            )}

            {/* size — ready-size designs pick from their fixed ladder */}
            {detail.readySizes ? (
              <div className="grid gap-2">
                {detail.readySizes.map(([wIn, hIn]) => {
                  const selected = widthFeet * 12 + widthInches === wIn && heightFeet * 12 + heightInches === hIn;
                  return (
                    <button
                      key={`${wIn}x${hIn}`}
                      onClick={() => {
                        setWidthFeet(Math.floor(wIn / 12));
                        setWidthInches(wIn % 12);
                        setHeightFeet(Math.floor(hIn / 12));
                        setHeightInches(hIn % 12);
                      }}
                      className={`flex items-center justify-between rounded-[12px] border-2 px-3 py-2.5 text-left text-sm transition-colors ${
                        selected ? "border-charcoal bg-surface" : "border-edge text-slate hover:border-charcoal"
                      }`}
                    >
                      <span className="font-semibold">{wIn}″ × {hIn}″</span>
                      {material && (
                        <span className="font-semibold">
                          {formatMarketMoney(
                            quote(
                              isFixedSize
                                ? fixedSizePrice(wIn * CM_PER_INCH, hIn * CM_PER_INCH, material.pricePerSqFt)
                                : billedPriceFor(wIn * CM_PER_INCH, hIn * CM_PER_INCH, material.pricePerSqFt),
                              isFixedSize ? 0 : billedSqFt(wIn * CM_PER_INCH, hIn * CM_PER_INCH),
                            ).total,
                            market.currency,
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
                <p className="text-center text-[0.64rem] text-mist">Ready sizes · peel &amp; stick — shown as the complete artwork.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["Width", widthFeet, setWidthFeet, widthInches, setWidthInches],
                    ["Height", heightFeet, setHeightFeet, heightInches, setHeightInches],
                  ] as const
                ).map(([label, ft, setFt, inch, setInch]) => (
                  <div key={label}>
                    <span className="mb-1 block text-[0.68rem] font-medium text-mist">{label}</span>
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1">
                        <input type="number" min={0} value={ft} onChange={(e) => setFt(Math.max(0, parseInt(e.target.value) || 0))} className={numField} />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[0.62rem] text-mist">ft</span>
                      </div>
                      <div className="relative flex-1">
                        <input type="number" min={0} max={11} value={inch} onChange={(e) => setInch(Math.min(11, Math.max(0, parseInt(e.target.value) || 0)))} className={numField} />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[0.62rem] text-mist">in</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* material — a fixed-size piece shows only the finished per-size
                price; its per-sq-ft make rate is internal and never displayed */}
            <div className="flex flex-wrap gap-2">
              {detail.materials.map((m) => (
                <button
                  key={m.slug}
                  onClick={() => setMaterialSlug(m.slug)}
                  className={`rounded-full border-2 px-3 py-1.5 text-[0.72rem] font-semibold transition-colors ${
                    m.slug === materialSlug ? "border-charcoal bg-charcoal text-surface" : "border-edge text-slate hover:border-charcoal"
                  }`}
                >
                  {detail.readySizes ? m.name : `${m.name} · ${money(m.pricePerSqFt)}/sq ft`}
                </button>
              ))}
            </div>

            {/* price */}
            <div className="flex items-end justify-between rounded-[14px] bg-wash px-4 py-3">
              <div>
                <p className="text-[0.66rem] font-semibold uppercase tracking-wide text-mist">Your price</p>
                <p className="font-display text-2xl font-extrabold">{marketTotalLabel}</p>
                {market.currency === "USD" && <p className="mt-0.5 text-[0.64rem] text-mist">Delivery included · customs excluded</p>}
              </div>
              <p className="text-right text-[0.68rem] text-slate">
                {detail.readySizes
                  ? `${widthFeet * 12 + widthInches}″ × ${heightFeet * 12 + heightInches}″`
                  : sqft > 0
                    ? minimumsApplied
                      ? `${billed.toFixed(1)} sq ft billed (min ${MIN_WALLPAPER_SQFT} sq ft, ${MIN_PRINT_WIDTH_FT} ft width)`
                      : `${sqft.toFixed(1)} sq ft`
                    : "—"}
                <br />
                <span className="text-mist">GST included · Free delivery</span>
              </p>
            </div>

            {/* approval + add */}
            <label className="flex cursor-pointer items-start gap-2 text-[0.72rem] leading-snug text-charcoal">
              <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} className="mt-0.5 accent-charcoal" />
              I&apos;ve reviewed the framing shown above at my wall size — this exact composition prints.
            </label>
            {error && <p className="rounded-[10px] bg-blush/50 px-3 py-2 text-xs text-charcoal">{error}</p>}
            <button
              onClick={addToCart}
              disabled={!approved || total <= 0 || adding}
              className="btn h-11 w-full text-[0.78rem] disabled:opacity-40"
            >
              {adding ? "Adding…" : `Add to cart · ${marketTotalLabel}`}
            </button>
          </>
        )}
      </div>

      {detail?.flatUrl && (
        <RoomVisualizer
          open={visualizerOpen}
          onClose={() => setVisualizerOpen(false)}
          imageUrl={detail.flatUrl}
          imageAlt={detail.flatAlt}
          productHandle={handle}
          wallWidthCm={widthCm}
          wallHeightCm={heightCm}
          wallLabel={title}
          initial={{
            imageUrl: detail.flatUrl,
            wallWidthCm: widthCm,
            wallHeightCm: heightCm,
            offsetX,
            offsetY,
            zoom,
            imageAspect: imgMeta?.aspect,
            sourceW: imgMeta?.sourceW,
            sourceH: imgMeta?.sourceH,
            installation: null,
          }}
          textureUrl={material?.textureUrl ?? null}
          onApply={(c, composite) => {
            setOffsetX(c.offsetX);
            setOffsetY(c.offsetY);
            setZoom(c.zoom);
            setRoomComposite(composite ?? null);
            setApproved(false);
          }}
        />
      )}

      {authModal}

      {detail?.flatUrl && roomComposite && (
        <SaveToBoard
          open={saveBoardOpen}
          onClose={() => setSaveBoardOpen(false)}
          productId={null}
          productHandle={handle}
          imageDataUrl={roomComposite}
          crop={{
            imageUrl: detail.flatUrl,
            wallWidthCm: widthCm,
            wallHeightCm: heightCm,
            offsetX,
            offsetY,
            zoom,
            imageAspect: imgMeta?.aspect,
            sourceW: imgMeta?.sourceW,
            sourceH: imgMeta?.sourceH,
            installation: null,
          }}
        />
      )}
    </div>
  );
}
