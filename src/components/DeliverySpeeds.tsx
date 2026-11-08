"use client";

import { useEffect, useState } from "react";
import {
  EXPRESS_SHIPPING,
  STANDARD_SHIPPING,
  estimateExpressDelivery,
  estimateStandardDelivery,
  formatShipDate,
} from "@/lib/shipping";
import { MarketMoney } from "@/components/MarketMoney";

/**
 * The two India delivery promises side by side, for the cart — Standard
 * within 10 working days, Express within 4 — so the difference is plain
 * before checkout asks the customer to choose. Dates are computed on mount
 * (not in the cached render), from the same clock checkout reads.
 */
export function DeliverySpeeds({ freightToPay = false, showExpress = true }: { freightToPay?: boolean; showExpress?: boolean }) {
  const [dates, setDates] = useState<{ standard: string; express: string } | null>(null);

  useEffect(() => {
    setDates({
      standard: formatShipDate(estimateStandardDelivery().deliveryTo),
      express: formatShipDate(estimateExpressDelivery().deliveryTo),
    });
  }, []);

  if (!dates) return null;

  return (
    <div className="mt-4 border-t border-edge pt-4 text-[0.78rem] text-slate">
      <p className="caps mb-2 text-slate">Delivery</p>
      <p>
        <span className="font-semibold text-charcoal">Standard{freightToPay ? "" : " · free"}:</span>{" "}
        delivered by {dates.standard} · within {STANDARD_SHIPPING.deliveryWorkingDays} working days
      </p>
      {showExpress && <><p className="mt-1">
        <span className="font-semibold text-charcoal">
          Express · <MarketMoney inr={EXPRESS_SHIPPING.perWallpaperCharge} />/wallpaper +{" "}
          <MarketMoney inr={EXPRESS_SHIPPING.perOrderCharge} />/order:
        </span>{" "}
        delivered by {dates.express} · within {EXPRESS_SHIPPING.deliveryWorkingDays} working days
      </p>
      <p className="mt-2 text-[0.7rem] text-mist">Choose your speed at checkout.</p></>}
    </div>
  );
}
