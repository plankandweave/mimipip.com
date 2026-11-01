"use client";

import { useState } from "react";
import Link from "next/link";
import { useMarket } from "@/components/MarketProvider";
import { areaSqFt, billedSqFt, CM_PER_FOOT, MIN_PRINT_WIDTH_FT, MIN_WALLPAPER_SQFT } from "@/lib/pricing";
import { formatMarketMoney } from "@/lib/markets";
import { MarketMoney } from "@/components/MarketMoney";

export function WallPriceEstimate() {
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const { market, quote } = useMarket();
  const w = Number(width);
  const h = Number(height);
  const valid = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 && w <= 60 && h <= 60;
  const area = valid ? areaSqFt(w * CM_PER_FOOT, h * CM_PER_FOOT) : 0;
  const billed = valid ? billedSqFt(w * CM_PER_FOOT, h * CM_PER_FOOT) : 0;
  // Entry-level noncollection rate. The selected design sets the exact quote
  // on its product page; delivery uses the same market calculator.
  const priced = valid ? quote(Math.round(billed * 200), billed) : null;
  const money = (n: number) => formatMarketMoney(n, market.currency);

  return (
    <div className="rounded-[22px] border border-edge bg-wash p-5 sm:p-7">
      <h2 className="font-display text-xl font-semibold text-charcoal">Estimate your wall</h2>
      <p className="mt-2 text-sm text-slate">A guide using the <MarketMoney inr={200} />/sq ft rate for designs outside collections before destination delivery. Collection designs have their own rates, shown on each design page.</p>
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
          {market.currency === "USD" && <p className="mt-1 text-slate">Wallpaper {money(priced.goods)} + delivery {money(priced.delivery)}</p>}
          <p className="mt-2 font-display text-2xl font-semibold">From {money(priced.total)}</p>
          <p className="mt-1 text-xs text-slate">{market.currency === "INR" ? "GST and standard India delivery included." : "Delivery included in this total; destination duties and taxes are extra."} Installation is separate.</p>
          {billed > area + 0.01 && <p className="mt-2 text-xs text-slate">Small walls are made to your dimensions, with a {MIN_PRINT_WIDTH_FT} ft minimum chargeable width and {MIN_WALLPAPER_SQFT} sq ft minimum billing.</p>}
        </div>
      ) : <p className="mt-4 text-xs text-slate">Enter both measurements for an indicative total.</p>}
      <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold">
        <Link href="/collections/wall-art" className="underline underline-offset-4">Choose a design for an exact quote →</Link>
        <Link href="/how-to-measure" className="text-slate underline underline-offset-4">How to measure</Link>
      </div>
    </div>
  );
}
