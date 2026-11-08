"use client";

import { useState } from "react";
import Link from "next/link";
import { useMarket } from "@/components/MarketProvider";
import { MIN_WALLPAPER_SQFT } from "@/lib/pricing";
import { estimateWallpaper } from "@/brand/wall-price";
import { formatMarketMoney } from "@/lib/markets";


export function WallPriceEstimate() {
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const { market } = useMarket();
  const w = Number(width);
  const h = Number(height);
  const priced = estimateWallpaper(w,h,market.countryCode);
  const area=priced?.area??0,billed=priced?.billed??0;
  const money = (n: number) => formatMarketMoney(n, market.currency);

  return (
    <div className="rounded-[22px] border border-edge bg-wash p-5 sm:p-7">
      <h2 className="font-display text-xl font-semibold text-charcoal">Estimate your wall</h2>
      <p className="mt-2 text-sm text-slate">{market.currency === "INR" ? "Wallpaper is ₹200 per sq ft plus 18% GST, with standard India delivery included." : "Wallpaper is US$10 per sq ft, including delivery."}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-slate">Wall width (ft)
          <input type="number" min="0.1" max="60" step="0.5" inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} placeholder="e.g. 10" className="mt-1 block h-12 w-full rounded-[12px] border border-edge bg-surface px-3 text-base text-charcoal outline-none focus:border-charcoal" />
        </label>
        <label className="text-xs font-semibold text-slate">Wall height (ft)
          <input type="number" min="0.1" max="60" step="0.5" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="e.g. 8" className="mt-1 block h-12 w-full rounded-[12px] border border-edge bg-surface px-3 text-base text-charcoal outline-none focus:border-charcoal" />
        </label>
      </div>
      {priced ? (
        <div className="mt-5 border-t border-edge pt-4 text-sm text-charcoal" aria-live="polite">
          <p>{area.toFixed(1)} sq ft wall{billed > area + 0.01 ? ` · ${billed.toFixed(1)} sq ft billed` : ""}</p>

          <p className="mt-2 font-display text-2xl font-semibold">From {money(priced.totalMinor/100)}</p>
          <p className="mt-1 text-xs text-slate">{market.currency === "INR" ? "GST and standard India delivery included." : "Delivery included in this total; destination duties and taxes are extra."} Installation is separate.</p>
          {billed > area + 0.01 && <p className="mt-2 text-xs text-slate">Small walls are made to your dimensions, with a {MIN_WALLPAPER_SQFT} sq ft minimum billing.</p>}
        </div>
      ) : <p className="mt-4 text-xs text-slate">Enter both measurements for an indicative total.</p>}
      <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold">
        <Link href="/collections/wall-art" className="underline underline-offset-4">Choose a design for an exact quote →</Link>
        <Link href="/how-to-measure" className="text-slate underline underline-offset-4">How to measure</Link>
      </div>
    </div>
  );
}
