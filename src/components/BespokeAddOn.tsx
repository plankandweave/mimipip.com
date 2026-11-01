"use client";

import { useState } from "react";
import { useCart } from "@/components/CartProvider";
import { BESPOKE_PRICE } from "@/lib/pricing";
import { useMarket } from "@/components/MarketProvider";

export const BESPOKE_HANDLE = "bespoke-customisation";

/**
 * The ₹1,000-per-design bespoke/customisation service. DESIGN WORK ONLY — it
 * never includes printing the wallpaper, which is ordered separately per sq ft.
 *
 * Two entry points, same SKU:
 *  • "addon" (default) — on a design's page: extend the mural to a second wall,
 *    add a panel, shift the palette. The note records which design it's for.
 *  • "standalone" — the /bespoke landing page: book original design work to a
 *    brief, choosing HOW MANY designs are needed (quantity × ₹1,000).
 */
export function BespokeAddOn({
  forHandle,
  forTitle,
  variant = "addon",
}: {
  forHandle: string;
  forTitle: string;
  variant?: "addon" | "standalone";
}) {
  const { add } = useCart();
  const { money } = useMarket();
  const standalone = variant === "standalone";
  const [open, setOpen] = useState(standalone); // the landing page has nothing to reveal
  const [note, setNote] = useState("");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy || note.trim().length < 3) {
      setError(note.trim().length < 3 ? "Tell us in a line what you'd like designed." : null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ok = await add({
        productHandle: BESPOKE_HANDLE,
        materialSlug: "smooth-matt", // required by the cart RPC; price is flat, not per-material
        widthCm: 0,
        heightCm: 0,
        areaSqft: 0,
        unitPrice: 0,
        quantity: qty,
        lineTotal: BESPOKE_PRICE * qty,
        crop: {
          imageUrl: "",
          wallWidthCm: 0,
          wallHeightCm: 0,
          offsetX: 0.5,
          offsetY: 0.5,
          zoom: 1,
          bespoke: { note: note.trim(), forHandle, forTitle },
        },
      });
      if (!ok) {
        setError("Couldn't add it just now — please try again.");
        return;
      }
      setAdded(true);
      setNote("");
      setQty(1);
    } catch {
      setError("Couldn't reach the store just now — please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[18px] border border-edge p-5">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="flex w-full items-start justify-between gap-3 text-left">
          <span>
            <span className="block text-sm font-semibold text-charcoal">
              Want this customised? <span className="font-normal text-slate">Design service · {money(BESPOKE_PRICE)} per design</span>
            </span>
            <span className="mt-0.5 block text-xs text-slate">
              Extend it to a second wall, add a panel, adjust a colour — our studio prepares it for
              this design. Same price whatever the wall size; the wallpaper itself is ordered above.
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-charcoal underline underline-offset-2">Add</span>
        </button>
      ) : added ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-charcoal">
            ✓ {standalone ? "Bespoke design service added" : "Customisation added"} — our studio will
            follow up on the details.
          </p>
          <button type="button" onClick={() => setAdded(false)} className="shrink-0 text-xs font-semibold text-slate underline underline-offset-2 hover:text-charcoal">
            Add another
          </button>
        </div>
      ) : (
        <div>
          <p className="text-sm font-semibold text-charcoal">
            {standalone ? "Book bespoke design" : "Customise this design"}{" "}
            <span className="font-normal text-slate">· {money(BESPOKE_PRICE)} per design</span>
          </p>
          <p className="mt-0.5 text-xs text-slate">
            {standalone
              ? "Tell us what you'd like designed — the space, the story, your palette."
              : `What would you like for “${forTitle}”?`}
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            rows={3}
            placeholder={
              standalone
                ? "e.g. a calm botanical mural for a 12 ft bedroom wall, greens and terracotta, something Indian but not traditional."
                : "e.g. add a matching panel to carry it onto the return wall; or shift the palette warmer."
            }
            className="mt-2 w-full rounded-[12px] border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-charcoal"
          />

          {/* How many designs — a service is bought by the number of designs,
              not by wall area. */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-slate">
              {standalone ? "How many designs?" : "Designs"}
            </span>
            <div className="flex h-10 items-center overflow-hidden rounded-full border border-edge bg-surface">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="grid h-full w-10 place-items-center text-slate hover:text-charcoal"
                aria-label="Fewer designs"
              >
                &minus;
              </button>
              <span className="w-8 text-center text-sm font-semibold tabular-nums">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(20, q + 1))}
                className="grid h-full w-10 place-items-center text-slate hover:text-charcoal"
                aria-label="More designs"
              >
                +
              </button>
            </div>
          </div>

          {error && <p className="mt-1.5 text-xs text-charcoal/80">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={submit} disabled={busy} className="btn h-10 flex-1 text-[0.8rem] disabled:opacity-50">
              {busy ? "Adding…" : `Add to cart · ${money(BESPOKE_PRICE * qty)}`}
            </button>
            {!standalone && (
              <button type="button" onClick={() => { setOpen(false); setError(null); }} className="btn btn-ghost h-10 px-4 text-[0.8rem]">
                Cancel
              </button>
            )}
          </div>
          <p className="mt-2.5 text-[0.68rem] leading-relaxed text-mist">
            Design work only — this does not include printing the wallpaper, which is ordered
            separately at its per-sq-ft price. If your artwork turns out to be unusually complicated,
            we&apos;ll tell you the charge before starting.
          </p>
        </div>
      )}
    </div>
  );
}
