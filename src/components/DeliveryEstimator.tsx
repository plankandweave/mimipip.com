"use client";

import { useState } from "react";
import {
  estimateStandardDelivery,
  estimateExpressDelivery,
  formatShipDate,
  isValidPincode,
  STANDARD_SHIPPING,
  EXPRESS_SHIPPING,
} from "@/lib/shipping";
import { useMarket } from "@/components/MarketProvider";
import { internationalTransitWorkingDays } from "@/lib/markets";

type Estimate = { dispatch: string; from: string; to: string };

/**
 * "When will this reach me?" — the customer enters their pincode and gets an
 * honest, labelled estimate for both Standard (free) and Express (₹1,000 per
 * wallpaper + ₹500 per order). We compute both windows at click time from the
 * master shipping config, so they can never disagree with the shipping policy.
 * Express itself is chosen at checkout, not here — this is discovery only.
 */
export function DeliveryEstimator({ expressAvailable = true }: { expressAvailable?: boolean }) {
  const { market } = useMarket();
  const [pin, setPin] = useState("");
  const [standard, setStandard] = useState<Estimate | null>(null);
  const [express, setExpress] = useState<Estimate | null>(null);
  const [touched, setTouched] = useState(false);

  const check = () => {
    setTouched(true);
    if (!isValidPincode(pin)) {
      setStandard(null);
      setExpress(null);
      return;
    }
    const s = estimateStandardDelivery();
    setStandard({ dispatch: formatShipDate(s.dispatchBy), from: formatShipDate(s.deliveryFrom), to: formatShipDate(s.deliveryTo) });
    const e = estimateExpressDelivery();
    setExpress({ dispatch: formatShipDate(e.dispatchBy), from: formatShipDate(e.deliveryFrom), to: formatShipDate(e.deliveryTo) });
  };

  const invalid = touched && !isValidPincode(pin);

  if (market.countryCode !== "IN") {
    const transit = internationalTransitWorkingDays(market.countryCode);
    return (
      <div className="rounded-[18px] border border-edge bg-surface p-5">
        <p className="text-sm font-semibold">Delivery to {market.countryName}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate">
          Your country-adjusted USD price includes international delivery. Estimated transit is {transit.min}–{transit.max}{" "}
          working days after dispatch, subject to courier availability and customs clearance. Destination duties, local taxes
          and customs charges are excluded.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[18px] border border-edge bg-surface p-5">
      <p className="text-sm font-semibold">When will this reach me?</p>
      <p className="mt-1 text-xs text-slate">
        Enter your pincode to see your delivery date.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && check()}
          placeholder="6-digit pincode"
          className="h-11 min-w-0 flex-1 rounded-[12px] border border-edge bg-surface px-4 text-sm outline-none focus:border-charcoal"
          aria-label="Delivery pincode"
        />
        <button onClick={check} className="btn h-11 px-5 text-[0.78rem]">
          Check
        </button>
      </div>
      {invalid && (
        <p className="mt-2 text-xs text-charcoal/80">Please enter a valid 6-digit Indian pincode.</p>
      )}
      {standard && (
        <p className="mt-3 rounded-[12px] bg-sage/40 px-4 py-3 text-sm text-charcoal">
          <span className="font-semibold">Standard (free):</span> order today and it is delivered by{" "}
          <span className="font-semibold">{standard.to}</span>, within {STANDARD_SHIPPING.deliveryWorkingDays} working days.
        </p>
      )}
      {expressAvailable && express && (
        <p className="mt-2 rounded-[12px] bg-peach/40 px-4 py-3 text-sm text-charcoal">
          <span className="font-semibold">Express:</span>{" "}
          order today and it is delivered by <span className="font-semibold">{express.to}</span>, within{" "}
          {EXPRESS_SHIPPING.deliveryWorkingDays} working days. Choose Express at checkout.
        </p>
      )}
    </div>
  );
}
