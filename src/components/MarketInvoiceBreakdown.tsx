"use client";

import { InvoiceBreakdown } from "@/components/InvoiceBreakdown";
import { useMarket } from "@/components/MarketProvider";
import { formatMarketMoney, marketGoodsFromInr } from "@/lib/markets";
import type { InvoiceLine } from "@/lib/pricing";

export function MarketInvoiceBreakdown({
  lines,
  infoRows,
  areaSqFt = 0,
  tubeCount = 1,
  freightToPay = false,
  deliveryFree = true,
  className = "",
}: {
  lines: InvoiceLine[];
  infoRows?: { label: string; value: string }[];
  areaSqFt?: number;
  tubeCount?: number;
  freightToPay?: boolean;
  /** False when delivery is charged on its own lines (Express, small-order
   *  courier) — the bill must not also read "Free". */
  deliveryFree?: boolean;
  className?: string;
}) {
  const { market, quote } = useMarket();
  if (market.currency === "INR") {
    return <InvoiceBreakdown lines={lines} infoRows={infoRows} freightToPay={freightToPay} deliveryFree={deliveryFree} className={className} />;
  }

  const goodsInr = lines.reduce((sum, line) => sum + line.incl, 0);
  const priced = quote(goodsInr, areaSqFt, tubeCount);
  const money = (amount: number) => formatMarketMoney(amount, "USD");

  return (
    <dl className={`space-y-1.5 text-sm ${className}`}>
      {infoRows?.map((row) => (
        <Row key={row.label} label={row.label} value={row.value} muted />
      ))}
      {infoRows && infoRows.length > 0 && <div className="my-1 border-t border-edge" />}
      {lines.map((line, index) => (
        <Row
          key={`${line.label}-${index}`}
          label={line.label}
          value={money(marketGoodsFromInr(line.incl, market.countryCode))}
        />
      ))}
      <div className="mt-1 border-t border-edge pt-2">
        <Row label="Goods" value={money(priced.goods)} muted />
        <Row label="International delivery" value={priced.delivery === 0 ? "Included" : money(priced.delivery)} muted />
        <Row label="Duties & customs" value="Not included · payable locally if charged" muted />
      </div>
      <div className="mt-1 flex items-center justify-between border-t border-edge pt-2 font-semibold text-charcoal">
        <dt>Total</dt>
        <dd>{money(priced.total)}</dd>
      </div>
      <div className="text-xs text-slate">Wallpaper is $10 per square foot including shipping. No additional shipping charge is added at payment.</div>
    </dl>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate">{label}</dt>
      <dd className={muted ? "text-mist" : "text-charcoal"}>{value}</dd>
    </div>
  );
}
