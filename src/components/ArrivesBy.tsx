"use client";

import { useEffect, useState } from "react";
import { estimateStandardDelivery, formatShipDate } from "@/lib/shipping";
import { useMarket } from "@/components/MarketProvider";

/**
 * "Arrives by <date> · free delivery" — the same promise the checkout
 * page's dispatch-speed step makes (src/lib/shipping.ts's
 * estimateStandardDelivery/formatShipDate is the one master clock both read),
 * surfaced near the price so a first-time buyer doesn't have to reach
 * checkout to learn there is even a delivery date. Computed on mount rather
 * than read from the page's cached render, so the window is always today's —
 * not whatever day the edge cache last rendered this page.
 *
 * Only rendered by the caller for products that actually ship on standard
 * dispatch (see the eligibility check in products/[handle]/page.tsx) — a
 * pre-order (TAASH) or a bespoke custom-print SKU has no such promise to
 * make, and this component doesn't try to guess one.
 */
export function ArrivesBy({ expressAvailable = true }: { expressAvailable?: boolean }) {
  const { market } = useMarket();
  const [range, setRange] = useState<{ to: string } | null>(null);

  useEffect(() => {
    const est = estimateStandardDelivery();
    setRange({ to: formatShipDate(est.deliveryTo) });
  }, []);

  // International delivery is bundled into the country-adjusted price, not
  // "free" in the domestic sense — that distinction lives on the shipping
  // policy page, so we don't make the claim here at all.
  if (market.countryCode !== "IN" || !range) return null;

  return (
    <p className="mt-2 text-sm text-slate">
      Arrives by <span className="font-semibold text-charcoal">{range.to}</span> · free delivery{expressAvailable ? " · Express in 4 working days" : ""}
    </p>
  );
}
