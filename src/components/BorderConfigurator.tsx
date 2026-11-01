"use client";

// Configurator for the LENGTH family (Borders & Strips). A border is not a wall
// to be measured: it has a fixed height and a fixed supply length, sold by the
// linear metre in 5 m sets. So the only question is how many sets.
//
// The set card always says what the customer is getting in the hand ("5 × 1
// metre strips" is a different thing from "1 continuous 5 metre strip"),
// because that is not obvious from "5 m".

import { useState } from "react";
import { useCart } from "@/components/CartProvider";
import { useMarket } from "@/components/MarketProvider";
import { BORDER_LENGTH_OPTIONS_M, BORDER_MATERIAL_SLUG } from "@/lib/product-category";
import { supplyLabel } from "@/lib/product-facts";
import { BorderReach } from "@/components/BorderReach";

export function BorderConfigurator({
  productHandle,
  pricePerMetre,
  minMetres,
  supplyFormat,
  segmentLengthM,
  heightCm,
  initialLengthM,
}: {
  productHandle: string;
  pricePerMetre: number;
  /** The category's minimum metres per line. */
  minMetres: number;
  /** How this border arrives: one unbroken strip, or pieces. */
  supplyFormat: "continuous" | "segmented" | null;
  /** Length of one piece when segmented. */
  segmentLengthM: number | null;
  /** The border's fixed height. */
  heightCm: number | null;
  /** Deep-linked length advertised by a shopping feed. */
  initialLengthM?: number | null;
}) {
  // Only offer lengths the minimum actually allows, and default to the largest
  // (the 5 m set is the standard purchase).
  const options = BORDER_LENGTH_OPTIONS_M.filter((m) => m >= minMetres);
  const lengths = options.length ? options : [minMetres];
  const [lengthM, setLengthM] = useState(
    initialLengthM && lengths.includes(initialLengthM) ? initialLengthM : lengths[lengths.length - 1],
  );
  const [packs, setPacks] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { add } = useCart();
  const { market, money, quote } = useMarket();

  const metres = lengthM * packs;
  const total = Math.round(metres * pricePerMetre);
  const marketTotal = quote(total);

  const addToCart = async () => {
    if (adding || metres < minMetres) return;
    setAdding(true);
    setError(null);
    try {
      const ok = await add({
        productHandle,
        materialSlug: BORDER_MATERIAL_SLUG,
        // Quantity carries the metres — the cart RPCs price a length line as
        // metres × rate. No priced area: this family is never charged per sq ft,
        // and area 0 keeps it out of the installation and women-entrepreneurs
        // contribution paths, both of which are per chargeable square foot.
        widthCm: metres * 100,
        heightCm: heightCm ?? 0,
        areaSqft: 0,
        unitPrice: pricePerMetre,
        quantity: metres,
        lineTotal: total,
      });
      if (!ok) {
        setError("Couldn't add to cart — please try again.");
        return;
      }
      setAdded(true);
    } catch {
      setError("Couldn't reach the store just now — please try again.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="rounded-[22px] border border-step-edge bg-step p-6">
      <p className="caps text-slate">{lengths.length > 1 ? "1 · Choose your length" : "1 · Your set"}</p>
      <div className="mt-3 grid gap-2">
        {lengths.map((m) => {
          const selected = m === lengthM;
          return (
            <button
              key={m}
              onClick={() => { setLengthM(m); setPacks(1); setAdded(false); }}
              className={`flex items-center justify-between gap-3 rounded-[14px] border-2 px-4 py-3.5 text-left transition-all ${
                selected ? "border-charcoal bg-surface shadow-sm" : "border-edge bg-surface hover:border-slate"
              }`}
            >
              <span>
                <span className="block font-semibold">{m} metre{m === 1 ? "" : "s"}</span>
                <span className="block text-xs text-slate">{supplyLabel(m, supplyFormat, segmentLengthM)}</span>
              </span>
              <span className="shrink-0 font-display text-base font-bold">
                {money(Math.round(m * pricePerMetre))}
              </span>
            </button>
          );
        })}
      </div>

      <p className="caps mt-6 text-slate">{lengths.length > 1 ? "2 · How many?" : "2 · How many sets?"}</p>
      <div className="mt-3 flex items-center justify-between gap-4">
        <div className="flex h-11 items-center overflow-hidden rounded-full border border-edge bg-surface">
          <button
            onClick={() => setPacks((n) => Math.max(1, n - 1))}
            disabled={packs <= 1}
            className="grid h-full w-11 place-items-center text-slate hover:text-charcoal disabled:opacity-40"
            aria-label="Decrease quantity"
          >
            &minus;
          </button>
          <span className="w-14 text-center text-sm font-semibold tabular-nums">× {packs}</span>
          <button
            onClick={() => setPacks((n) => n + 1)}
            className="grid h-full w-11 place-items-center text-slate hover:text-charcoal"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
        <p className="text-sm text-slate">
          <span className="font-semibold text-charcoal">
            {market.countryCode === "IN" ? money(total) : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(marketTotal.total)}
          </span>
          <span className="block text-xs text-mist">{money(pricePerMetre)} per linear metre</span>
        </p>
      </div>

      <p className="mt-3 text-xs text-mist">
        {metres} m in total — {supplyLabel(metres, supplyFormat, segmentLengthM)}
        {heightCm ? ` · ${heightCm} cm tall` : ""} · {market.countryCode === "IN" ? "GST included · free India delivery" : `international delivery included in checkout total (${quote(total).currency}) · customs excluded`}
      </p>

      {/* What that length actually reaches — sits with the quantity question,
          because "how many?" is the question it answers. */}
      <BorderReach metres={metres} setMetres={lengthM} />

      <button
        onClick={addToCart}
        disabled={adding}
        className="btn mt-5 flex h-12 w-full items-center justify-center text-[0.82rem] disabled:opacity-60"
      >
        {adding ? "Adding…" : added ? "Added — add more?" : "Add to cart"}
      </button>
      {error && <p className="mt-2 text-xs text-charcoal/80">{error}</p>}
    </div>
  );
}
