"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CM_PER_FOOT, MIN_PRINT_WIDTH_FT, MIN_WALLPAPER_SQFT, billedSqFt } from "@/lib/pricing";
import { useMarket } from "@/components/MarketProvider";
import { MarketPricingNote } from "@/components/MarketMoney";

/**
 * What an office wall actually costs, before anyone has to ask.
 *
 * The single biggest reason a commercial buyer leaves a wallpaper site is that
 * every route to a number goes through a form. This puts the number on the
 * page. It prices through billedSqFt() — the same minimums the cart and
 * checkout apply — so the figure here can never be cheaper than the real one,
 * which is the only direction that would matter.
 *
 * It is an ESTIMATE surface, not a cart: it deliberately does not add anything.
 * Its job is to remove the price question so the buyer keeps browsing.
 */

/**
 * A finish the estimator can price. Resolved by the page from
 * getMaterialOffers() — the one place that knows what each finish actually sells
 * for — and never hardcoded here.
 */
export type EstimatorRate = { slug: string; label: string; rate: number; note?: string };

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};


export function OfficeCostEstimator({
  rates,
  initialWidthFt = 12,
  initialHeightFt = 9,
  wallLabel,
}: {
  rates: EstimatorRate[];
  initialWidthFt?: number;
  initialHeightFt?: number;
  /** e.g. "meeting room end wall" — names the example so it reads as this space's wall. */
  wallLabel?: string;
}) {
  // The estimator quotes in the reader's own currency — a commercial buyer
  // abroad comparing suppliers cannot use a rupee figure.
  const { money } = useMarket();
  const [w, setW] = useState(String(initialWidthFt));
  const [h, setH] = useState(String(initialHeightFt));
  const [walls, setWalls] = useState("1");
  const [rateSlug, setRateSlug] = useState<string>(rates[0]?.slug ?? "");

  const rate = rates.find((r) => r.slug === rateSlug) ?? rates[0];
  const perSqft = rate?.rate ?? 0;

  const calc = useMemo(() => {
    const wFt = num(w);
    const hFt = num(h);
    const qty = Math.max(1, Math.round(num(walls) || 1));
    if (!wFt || !hFt || !perSqft) return null;
    const measured = Math.round(wFt * hFt * 100) / 100;
    const billed = billedSqFt(wFt * CM_PER_FOOT, hFt * CM_PER_FOOT);
    return {
      qty,
      measured,
      billed,
      perWall: Math.round(billed * perSqft),
      total: Math.round(billed * perSqft * qty),
      // Why the billed figure can exceed the measured one, said plainly rather
      // than as a surprise at checkout.
      widthFloored: wFt < MIN_PRINT_WIDTH_FT,
      minFloored: billed > measured && wFt >= MIN_PRINT_WIDTH_FT,
    };
  }, [w, h, walls, perSqft]);

  const field =
    "h-12 w-full rounded-[14px] border border-edge bg-surface px-4 outline-none focus:border-charcoal";

  return (
    <div className="rounded-[22px] border border-edge bg-surface p-6 lg:p-8">
      <span className="caps text-slate">What it costs</span>
      <h3 className="mt-3 text-xl lg:text-2xl">
        Price the {wallLabel ?? "wall"} before you ask anyone.
      </h3>
      <p className="mt-3 max-w-lg text-sm text-slate">
        Wallpaper is priced by the square foot of your actual wall — there is no roll to
        buy whole and no wastage to pay for. Change the numbers to your own.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm text-slate">Wall width (ft)</span>
          <input
            className={`mt-1.5 ${field}`}
            inputMode="decimal"
            value={w}
            onChange={(e) => setW(e.target.value)}
            aria-label="Wall width in feet"
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate">Wall height (ft)</span>
          <input
            className={`mt-1.5 ${field}`}
            inputMode="decimal"
            value={h}
            onChange={(e) => setH(e.target.value)}
            aria-label="Wall height in feet"
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate">How many walls</span>
          <input
            className={`mt-1.5 ${field}`}
            inputMode="numeric"
            value={walls}
            onChange={(e) => setWalls(e.target.value)}
            aria-label="Number of walls"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {rates.map((r) => (
          <button
            key={r.slug}
            type="button"
            onClick={() => setRateSlug(r.slug)}
            aria-pressed={r.slug === rateSlug}
            className={`rounded-[14px] border px-4 py-2.5 text-left text-sm transition-colors ${
              r.slug === rateSlug
                ? "border-charcoal bg-charcoal text-surface"
                : "border-edge bg-surface hover:border-charcoal"
            }`}
          >
            <span className="font-semibold">{r.label}</span>
            <span className={r.slug === rateSlug ? "text-surface/70" : "text-slate"}>
              {" "}
              · {money(r.rate)}/sq ft
            </span>
          </button>
        ))}
      </div>
      {rate.note && <p className="mt-2 text-xs text-mist">{rate.note}</p>}

      {calc && (
        <div className="mt-6 rounded-[18px] bg-wash p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="text-sm text-slate">
                {calc.qty > 1 ? `${calc.qty} walls · ` : ""}
                {calc.billed} sq ft billed
                {calc.measured !== calc.billed && (
                  <span className="text-mist"> (measured {calc.measured} sq ft)</span>
                )}
              </p>
              <p className="mt-1 font-display text-3xl font-extrabold text-charcoal">
                {money(calc.total)}
              </p>
              {calc.qty > 1 && (
                <p className="mt-1 text-sm text-slate">{money(calc.perWall)} per wall</p>
              )}
            </div>
            <div className="text-right text-sm text-slate">
              <p><MarketPricingNote india="Inclusive of GST" international="International delivery included; duties and local taxes excluded" /></p>
              <p>Free shipping across India</p>
              <p>Dispatch 7–10 working days</p>
            </div>
          </div>

          {(calc.widthFloored || calc.minFloored) && (
            <p className="mt-4 border-t border-edge pt-4 text-xs text-slate">
              {calc.widthFloored
                ? `Printing runs on a roll about ${MIN_PRINT_WIDTH_FT} ft wide, so a narrower wall is still billed at ${MIN_PRINT_WIDTH_FT} ft of print width. `
                : ""}
              {calc.billed === MIN_WALLPAPER_SQFT
                ? `Orders are billed at a minimum of ${MIN_WALLPAPER_SQFT} sq ft. `
                : ""}
              The print itself is still made to your exact measurements.
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/samples" className="btn btn-ghost text-sm">
          Order samples first
        </Link>
        <Link href="/how-to-measure" className="btn btn-ghost text-sm">
          How to measure a wall →
        </Link>
      </div>
      <p className="mt-4 text-xs text-mist">
        An estimate for one flat wall. Doors, windows and openings are deducted when we
        quote from your elevation — that only ever brings the figure down.
      </p>
    </div>
  );
}
