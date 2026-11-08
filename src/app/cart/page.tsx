"use client";

import { DesignCart } from "@/components/DesignCart";
import { linePayload, type Line, readLines } from "@/components/design-cart-store";
import { PendingOrderRecovery } from "@/components/PendingOrderRecovery";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { useCart } from "@/components/CartProvider";
import { trackPurchaseProgress } from "@/lib/track-purchase-progress";
import { gaViewCart } from "@/lib/ga";
import { discountAmount as discountOff, refusalCopy, waivesCourier, appliedLabel, type DiscountPreview } from "@/lib/discount-display";
import { smallOrderCourierFee, areaSqFt, MIN_WALLPAPER_SQFT, CM_PER_FOOT, type InvoiceLine } from "@/lib/pricing";
import { useAuth } from "@/components/AuthProvider";
import { AuthModal } from "@/components/AuthModal";
import { artworkSizeLabel, supplyLabel } from "@/lib/product-facts";
import { MarketInvoiceBreakdown } from "@/components/MarketInvoiceBreakdown";
import { useMarket } from "@/components/MarketProvider";
import { formatMarketMoney } from "@/lib/markets";
import { readSavedDiscount } from "@/components/DiscountKeeper";
import { useFreightToPay } from "@/components/FreightBasis";
import { DeliverySpeeds } from "@/components/DeliverySpeeds";
import {
  HOMECOMING_DISCOUNT,
  HOMECOMING_DISCOUNT_CODE,
  HOMECOMING_EXPRESS_CODE,
  homecomingOfferActive,
} from "@/lib/homecoming-offer";

export default function CartPage(){
 const cart=useCart();
 const [legacy,setLegacy]=useState<Line[]>([]);
 useEffect(()=>{const update=()=>{try{setLegacy(readLines());}catch{}};update();window.addEventListener('mimipip-cart',update);window.addEventListener('storage',update);return()=>{window.removeEventListener('mimipip-cart',update);window.removeEventListener('storage',update);};},[]);
 const mixed=cart.items.length>0&&legacy.length>0;
 if(!cart.loading && !cart.readError && !cart.items.length && legacy.length)return <DesignCart/>;
 return <><ConnectedCartPage mixed={mixed}/>{legacy.length>0 && <DesignCart embedded/>}{mixed&&<CombinedCartTotal legacy={legacy}/>}</>;
}
function CombinedCartTotal({legacy}:{legacy:Line[]}) {
 const cart=useCart();const {market}=useMarket();
 const requestKey=JSON.stringify({countryCode:market.countryCode,lines:[...cart.items.map(item=>({slug:item.handle,qty:item.quantity,widthCm:item.width_cm,heightCm:item.height_cm,crop:item.crop_data})),...legacy.map(linePayload)]});
 const [result,setResult]=useState<{key:string;totalMinor?:number;currency?:string;error?:string}|null>(null);
 useEffect(()=>{let active=true;setResult(null);fetch('/api/checkout/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:requestKey}).then(async r=>({ok:r.ok,data:await r.json()})).then(({ok,data})=>{if(active)setResult({key:requestKey,...(ok?data:{error:data.error||'Please check your cart.'})});}).catch(()=>{if(active)setResult({key:requestKey,error:'We could not check your total. Please reload.'});});return()=>{active=false;};},[requestKey]);
 const ready=result?.key===requestKey&&result.totalMinor!=null&&!cart.loading&&!cart.readError&&!cart.mutating;
 return <section className="container-x pb-12" aria-label="Combined order total"><div className="rounded-2xl border border-edge bg-surface p-6"><h2 className="text-2xl">Your complete order</h2>{ready?<><p className="my-4 text-xl font-semibold">{new Intl.NumberFormat('en-IN',{style:'currency',currency:result.currency!}).format(result.totalMinor!/100)}</p><p>Delivery included{market.countryCode==='IN'?' · including GST':''}</p><Link className="btn mt-4" href="/checkout">Checkout</Link></>:<p role="status" className="mt-4">{cart.readError?'Reload your cart before checkout.':result?.error||'Checking your complete total…'}</p>}</div></section>;
}
function ConnectedCartPage({mixed=false}:{mixed?:boolean}) {
  const campaignActive = homecomingOfferActive();
  const checkoutSupportsDiscounts = false;
  const { items, subtotal, loading, readError, mutationError, mutating, refresh, updateQty, remove } = useCart();
  const { market, money, quote } = useMarket();
  const stalePrices = items.filter((item) => item.price_changed);
  // GA view_cart: once per visit to the page, after the cart has loaded.
  const viewedCart = useRef(false);
  useEffect(() => {
    if (loading || viewedCart.current || !items.length) return;
    viewedCart.current = true;
    void trackPurchaseProgress("cart_opened");
    gaViewCart({ items, countryCode: market.countryCode, currency: market.currency });
  }, [loading, items, market.countryCode, market.currency]);
  // A reseller or corporate buyer pays the courier on delivery — the cart must
  // not tell them shipping is free (see FreightBasis.tsx).
  const freightToPay = useFreightToPay();
  // Discount code (the 15% QR from the install insert). Validating here saves
  // it for checkout, where the price actually adjusts — so the code the
  // customer scanned or typed is never asked for twice.
  const [code, setCode] = useState(campaignActive ? HOMECOMING_DISCOUNT_CODE : "");
  const [check, setCheck] = useState<DiscountPreview | null>(campaignActive ? HOMECOMING_DISCOUNT : null);
  const [busy, setBusy] = useState(false);
  // The discount field starts collapsed behind "Have a code?" — most visitors
  // have no code, and an open field with an install-sheet-only placeholder
  // reads as something everyone is missing out on. It auto-expands the moment
  // a code is already applied (e.g. restored from localStorage on mount).
  const [discountOpen, setDiscountOpen] = useState(false);

  const applyCode = async (codeArg?: string) => {
    const c = (codeArg ?? code).trim().toUpperCase();
    if (!c || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/discount/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c }),
      });
      const d = await res.json();
      setCheck({ ...d, valid: !!d.valid });
      if (d.valid) {
        try { localStorage.setItem("zyv_discount_code", c); } catch { /* private mode */ }
      }
    } catch {
      setCheck({ valid: false, reason: "unreachable" });
    } finally {
      setBusy(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  useEffect(() => {
    if (!checkoutSupportsDiscounts || campaignActive) return;
    const saved = readSavedDiscount();
    if (saved) { setCode(saved); setDiscountOpen(true); void applyCode(saved); }
  }, [campaignActive]);

  // Mirrors checkout_cart_v2: 50% cap for an OS code, 100% for a creator
  // collaboration, under the offer's own rupee ceiling (lib/discount-display.ts).
  // Newly25 is deliberately limited to wallpaper, even when a cart also
  // contains an add-on or a book. Keep this preview identical to the checkout
  // function's v_wallpaper_subtotal calculation.
  const wallpaperGoodsTotal = items.reduce(
    (sum, item) => ((item.category ?? "wallpaper") === "wallpaper" ? sum + item.line_total : sum),
    0,
  );
  const discountAmount = discountOff(campaignActive ? wallpaperGoodsTotal : subtotal, check);

  // The same itemised GST bill the customer saw on the product page and will see
  // at checkout: each design's wallpaper portion, its installation as its own
  // line when present, then the discount as a negative line so the tax breakup
  // and total read the discounted price. (Shipping is free in the cart; express
  // dispatch is chosen later, at checkout.)
  const invoiceLines: InvoiceLine[] = items.flatMap((it) => {
    if (it.handle === "bespoke-customisation") {
      return [{ label: "Bespoke customisation", incl: it.line_total }];
    }
    const install = it.installation ?? 0;
    const naming = it.personalisation ?? 0;
    const exclusivity = it.exclusivity_fee ?? 0;
    // A length line's quantity IS metres — "Border × 5 m", never "× 5".
    const qtyLabel =
      it.measurement_type === "length" || it.pricing_unit === "metre"
        ? ` × ${it.quantity} m`
        : it.quantity > 1
          ? ` × ${it.quantity}`
          : "";
    const sizeLabel = it.measurement_type === "fixed" ? ` · ${artworkSizeLabel(it.width_cm, it.height_cm)}` : "";
    const rows: InvoiceLine[] = [
      { label: `${it.room_label ? `${it.room_label} · ` : ""}${it.title}${sizeLabel}${qtyLabel}`, incl: it.line_total - install - naming - exclusivity },
    ];
    if (exclusivity > 0) rows.push({label: `Future-sales exclusivity · ${it.title} · ${it.exclusive_project}`, incl:exclusivity});
    if (naming > 0) rows.push({ label: `Child's name${it.child_name ? ` · “${it.child_name}”` : ""}`, incl: naming });
    if (install > 0) rows.push({ label: `Installation · ${it.title}`, incl: install });
    return rows;
  });
  // Small-order courier — WAIVED once the 20 sq ft minimum is billed, so on
  // any normally-priced cart this is ₹0 (every wallpaper line bills ≥ 20 sq
  // ft). It keys off the BILLED area to mirror checkout_cart's safety net
  // against an under-billed line, keeping the cart total equal to checkout's.
  const wallpaperBilledSqFt = items.reduce(
    (s, it) => ((it.category ?? "wallpaper") === "wallpaper" ? s + it.area_sqft * it.quantity : s),
    0,
  );
  const wallpaperQty = items.reduce(
    (sum, item) => ((item.category ?? "wallpaper") === "wallpaper" ? sum + item.quantity : sum),
    0,
  );
  // A collaboration that includes delivery waives it, as checkout does.
  const courierCharge = market.countryCode === "IN" && !waivesCourier(check) ? smallOrderCourierFee(wallpaperBilledSqFt) : 0;
  if (courierCharge > 0) {
    invoiceLines.push({ label: `Courier (wallpaper order under ${MIN_WALLPAPER_SQFT} sq ft)`, incl: courierCharge });
  }
  if (discountAmount > 0) {
    invoiceLines.push({ label: check ? appliedLabel(check, money) : "Discount", incl: -discountAmount });
  }

  // Same total the order summary shows, so the sticky checkout bar never
  // quotes a different number than the box above it.
  const totalInr = invoiceLines.reduce((s, l) => s + l.incl, 0);
  const cartTotalLabel =
    market.currency === "INR"
      ? money(totalInr)
      : formatMarketMoney(quote(totalInr, wallpaperBilledSqFt, Math.max(1, wallpaperQty)).total, "USD");

  // Publishes its own height to --sticky-cta-h (the same variable the product
  // configurator's sticky Add-to-cart bar sets) so anything anchored off the
  // bottom of the viewport — e.g. the concierge panel dropping down from the
  // header — knows to stop short of it instead of ending up underneath it.
  const stickyBarRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = stickyBarRef.current;
    const root = document.documentElement;
    if (!el) {
      root.style.removeProperty("--sticky-cta-h");
      return;
    }
    const apply = () => root.style.setProperty("--sticky-cta-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--sticky-cta-h");
    };
  }, [items.length, loading]);

  return (
    <div className="container-x py-10 pb-[calc(env(safe-area-inset-bottom)+88px)] lg:pb-10">
      <h1 className="font-display text-2xl font-bold">Your cart</h1>
      {stalePrices.length > 0 && <div role="alert" className="mt-4 rounded-xl border border-edge p-4 text-sm">
        <p>An item’s price or material has changed. Remove the affected item and add it again to review its current price before checkout.</p>
        <ul className="mt-2 space-y-1">{stalePrices.map((item) => <li key={item.item_id}><Link className="underline" href={`/products/${item.handle}`}>{item.title} — review current price</Link></li>)}</ul>
      </div>}
      {(mutationError || (readError && items.length > 0)) && <div role="alert" className="mt-4 rounded-xl border border-edge p-4 text-sm">
        <p>{mutationError || "We couldn’t refresh your cart. Reload before checkout."}</p>
        <button className="btn btn-ghost mt-2 min-h-11" disabled={mutating} onClick={() => void refresh()}>Reload cart</button>
      </div>}

      {loading ? (
        <div className="mt-8 space-y-5" aria-busy="true" aria-label="Loading your cart">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-4 rounded-[18px] bg-wash p-4">
              <div className="h-24 w-24 shrink-0 animate-pulse rounded-[12px] bg-edge" />
              <div className="flex flex-1 flex-col gap-2 py-1">
                <div className="h-4 w-2/3 animate-pulse rounded-full bg-edge" />
                <div className="h-3 w-1/3 animate-pulse rounded-full bg-edge" />
                <div className="mt-auto h-8 w-24 animate-pulse rounded-full bg-edge" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center">
          {readError ? <div role="alert"><p className="text-sm text-slate">We couldn’t load your saved cart. Please try again.</p><button onClick={() => void refresh()} className="btn mt-4 min-h-11 px-6">Reload cart</button></div> : <PendingOrderRecovery />}
          <Link href="/collections" className="btn mt-5 inline-flex h-11 px-6 text-[0.8rem]">
            Browse designs
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-5">
            {items.map((it) => {
              const wFt = it.width_cm / CM_PER_FOOT;
              const hFt = it.height_cm / CM_PER_FOOT;
              const isBespoke = it.handle === "bespoke-customisation";
              const isBook = it.category === "book";
              const itemHref = isBook
                ? "/mati#book"
                : it.concept_slug
                  ? `/concepts/${it.concept_slug}`
                  : `/products/${it.handle}`;
              // A length line carries quantity = metres and no priced area, and
              // a fixed-size line is a finished piece — neither is ft × ft
              // wallpaper, so neither may be described as one.
              const isPerMetre = it.measurement_type === "length" || it.pricing_unit === "metre";
              const isFixedSize = it.measurement_type === "fixed";
              // The category's minimum is enforced in the DB, so the stepper
              // must stop there rather than firing an update that fails.
              const minQty = Math.max(1, it.min_order_qty ?? 1);
              return (
                <div key={it.item_id} className="flex gap-4 rounded-[18px] bg-wash p-4">
                  <Link href={itemHref} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[12px] bg-surface">
                    {it.image && <Image src={it.image} alt={it.title} fill sizes="96px" className="object-cover" />}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <div>
                        <Link href={itemHref} className="font-display text-sm font-semibold hover:underline">
                          {it.title}
                        </Link>
                        {it.exclusive_project&&<p className="mt-2 text-xs font-semibold">Exclusive for {it.exclusive_project} · {money(it.exclusivity_fee||0)} included. Confirmed after payment; previous purchases remain unaffected.</p>}
                        {it.room_label && <p className="mt-1 text-xs font-semibold text-[#176856]">{it.room_label}</p>}
                        {it.requires_preparation && <p className="mt-1 text-xs text-slate">Room reference · artwork preparation and final proof before printing</p>}
                        {isBook ? (
                          <p className="mt-0.5 text-xs text-slate">
                            First edition pre-order · {it.quantity} {it.quantity === 1 ? "copy" : "copies"}
                          </p>
                        ) : isBespoke ? (
                          <p className="mt-0.5 max-w-[22rem] text-xs text-slate">
                            Bespoke customisation{it.bespoke_note ? ` — ${it.bespoke_note}` : ""}
                          </p>
                        ) : isPerMetre ? (
                          <p className="mt-0.5 text-xs text-slate">
                            {it.quantity} m · {supplyLabel(it.quantity, it.supply_format ?? null, it.segment_length_m ?? null)}
                            {it.border_height_cm ? ` · ${it.border_height_cm} cm tall` : ""}
                          </p>
                        ) : isFixedSize ? (
                          // A finished piece: its size in the feet the customer
                          // chose, not a wall measurement in decimal feet.
                          <>
                            <p className="mt-0.5 text-xs text-slate">{it.material_name}</p>
                            <p className="mt-0.5 text-xs text-slate">
                              {artworkSizeLabel(it.width_cm, it.height_cm)} · fixed finished size
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="mt-0.5 text-xs text-slate">{it.material_name}</p>
                            <p className="mt-0.5 text-xs text-slate">
                              {wFt.toFixed(1)} × {hFt.toFixed(1)} ft · {it.area_sqft.toFixed(2)} sq ft
                              {/* Without this the line reads "2.0 × 3.0 ft · 20.00 sq ft" and looks broken. */}
                              {it.area_sqft > areaSqFt(it.width_cm, it.height_cm) + 0.005
                                ? ` billed (our ${MIN_WALLPAPER_SQFT} sq ft minimum)`
                                : ""}
                            </p>
                          </>
                        )}
                        {(it.installation ?? 0) > 0 && (
                          <p className="mt-0.5 text-xs text-mist">
                            Incl. professional installation · {money(it.installation!)}
                          </p>
                        )}
                        {it.text_overlay && <p className="mt-1 whitespace-pre-line text-sm text-charcoal">
                          {it.text_overlay.kind === "cloud" ? "Name cloud" : "Your quote"}: “{it.text_overlay.text}”
                          <span className="mt-1 block text-xs text-slate">Approved position: {Math.round(it.text_overlay.x*it.width_cm)} cm from left, {Math.round(it.text_overlay.y*it.height_cm)} cm from top.</span>
                          {it.text_overlay.companion && <span className="mt-2 block">Your quote: “{it.text_overlay.companion.text}”<span className="mt-1 block text-xs text-slate">Approved position: {Math.round(it.text_overlay.companion.x*it.width_cm)} cm from left, {Math.round(it.text_overlay.companion.y*it.height_cm)} cm from top.</span></span>}
                        </p>}
                        {(it.personalisation ?? 0) > 0 && (
                          <p className="mt-0.5 text-xs text-mist">
                            Incl. child&apos;s name{it.child_name ? ` · “${it.child_name}”` : ""} · {money(it.personalisation!)}
                          </p>
                        )}
                      </div>
                      <p className="shrink-0 text-sm font-semibold">{money(it.line_total)}</p>
                    </div>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
                      <div className="flex h-11 shrink-0 items-center overflow-hidden rounded-full border border-edge bg-surface">
                        <button
                          onClick={() => updateQty(it.item_id, it.quantity - 1)}
                          disabled={mutating || it.quantity <= minQty}
                          className="grid h-full w-11 place-items-center text-slate hover:text-charcoal disabled:opacity-40"
                          aria-label="Decrease"
                        >
                          &minus;
                        </button>
                        <span className="w-9 text-center text-xs font-semibold tabular-nums">
                          {isPerMetre ? `${it.quantity} m` : it.quantity}
                        </span>
                        <button disabled={mutating} onClick={() => updateQty(it.item_id, it.quantity + 1)} className="grid h-full w-11 place-items-center text-slate hover:text-charcoal" aria-label="Increase">+</button>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        {!isBespoke && !isBook && !isPerMetre && !isFixedSize && !it.concept_slug && !it.text_overlay && !(it.installation ?? 0) && !(it.personalisation ?? 0) && !it.crop_data?.doors?.length && !it.crop_data?.divisions?.length && !(it.crop_data?.walls && it.crop_data.walls.length > 1) && <Link href={`/products/${it.handle}?w=${wFt.toFixed(4)}&h=${hFt.toFixed(4)}&material=${encodeURIComponent(it.material_slug)}&size=${Math.round(wFt * 12)}x${Math.round(hFt * 12)}&edit=${encodeURIComponent(it.item_id)}`} className="inline-flex min-h-11 items-center text-xs font-semibold text-slate underline underline-offset-2 hover:text-charcoal">Edit size, finish or crop</Link>}
                        <button disabled={mutating} onClick={() => remove(it.item_id)} className="inline-flex min-h-11 items-center text-xs font-semibold text-slate underline underline-offset-2 hover:text-charcoal">Remove</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="h-fit rounded-[22px] bg-wash p-6 lg:sticky lg:top-32">
            <p className="caps mb-3 text-slate">{mixed ? "Wallpaper subtotal" : "Order summary"}</p>
            <MarketInvoiceBreakdown
              lines={invoiceLines}
              freightToPay={freightToPay}
              areaSqFt={wallpaperBilledSqFt}
              tubeCount={Math.max(1, wallpaperQty)}
            />
            <p className="mt-3 text-[0.7rem] text-mist">
              {market.countryCode === "IN"
                ? "All prices are GST-inclusive · this bill shows the tax breakup."
                : "Country-adjusted USD pricing includes international delivery. Duties, customs and destination taxes are not included."}
            </p>
            {market.countryCode === "IN" && wallpaperQty > 0 && <DeliverySpeeds freightToPay={freightToPay} showExpress={false} />}

            <div className="mt-4 border-t border-edge pt-4" hidden={!checkoutSupportsDiscounts}>
              {campaignActive ? (
                <div className="rounded-[14px] bg-[#134f57] px-4 py-3 text-[#fff9ef]">
                  <p className="text-sm font-bold">Homecoming offers applied automatically</p>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#d8e3df]">
                    <span><strong className="text-[#fff9ef]">{HOMECOMING_DISCOUNT_CODE}</strong> · 25% off wallpapers</span>
                    <span><strong className="text-[#fff9ef]">{HOMECOMING_EXPRESS_CODE}</strong> · free express delivery</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span>Wallpaper discount</span><span>−{money(discountAmount)}</span>
                  </div>
                </div>
              ) : discountOpen ? (
                <>
                  <label className="text-[0.72rem] font-semibold uppercase tracking-wide text-slate">Discount code</label>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={code}
                      onChange={(e) => { setCode(e.target.value.toUpperCase()); setCheck(null); }}
                      placeholder="Discount code"
                      autoFocus
                      className="h-10 min-w-0 flex-1 rounded-[12px] border border-edge bg-surface px-3 text-sm outline-none focus:border-charcoal"
                    />
                    <button onClick={() => void applyCode()} disabled={!code.trim() || busy} className="btn btn-ghost h-10 shrink-0 px-4 text-[0.72rem] disabled:opacity-40">
                      {busy ? "…" : "Apply"}
                    </button>
                  </div>
                  {check && !check.valid && (
                    <p className="mt-1.5 text-xs text-charcoal/80">{refusalCopy(check)}</p>
                  )}
                  {check?.valid && (
                    <div className="mt-2 flex items-center justify-between text-sm text-slate">
                      <span>{appliedLabel(check, money)}</span>
                      <span>−{money(discountAmount)}</span>
                    </div>
                  )}
                  {check?.valid && check.personalTo && (
                    <p className="mt-1 text-xs text-mist">Personal to {check.personalTo} — check out with that email address.</p>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setDiscountOpen(true)}
                  className="text-[0.78rem] font-semibold text-slate underline underline-offset-2 hover:text-charcoal"
                >
                  Have a code?
                </button>
              )}
            </div>

            {!mixed && !readError && !mutating && stalePrices.length === 0 && <Link href="/checkout" className="btn mt-5 hidden h-12 w-full items-center justify-center text-[0.82rem] lg:flex">
              Checkout
            </Link>}
            <p className="mt-3 text-center text-xs text-mist">
              {freightToPay
                ? "Freight to-pay · prepared for your order"
                : market.countryCode === "IN"
                  ? "Free shipping across India · prepared for your order"
                  : `Shipping globally to ${market.countryName} · delivery included`}
            </p>
          </div>
        </div>
      )}

      {/* Mobile/tablet only: the desktop order-summary card already keeps its
          own Checkout button in view (it's lg:sticky). Below 1024px that card
          scrolls with the page and the button can end up below the fold, so a
          fixed bar repeats it with the running total, clear of the home
          indicator / gesture area via env(safe-area-inset-bottom). */}
      {!mixed && !readError && !mutating && !loading && items.length > 0 && stalePrices.length === 0 && (
        <div
          ref={stickyBarRef}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-cloud/95 px-4 pt-3 backdrop-blur-md lg:hidden"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
        >
          <Link href="/checkout" className="btn flex h-12 w-full items-center justify-center text-[0.82rem]">
            Checkout · {cartTotalLabel}
          </Link>
        </div>
      )}
    </div>
  );
}
