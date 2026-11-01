import { formatINR, gstInvoice, type InvoiceLine } from "@/lib/pricing";

/**
 * A reusable GST mini-invoice. Line items are shown at their ex-GST (taxable)
 * value, then GST @ 18% and delivery, then the total — which always equals the
 * GST-inclusive price the customer was quoted. Used on the product configurator,
 * the printed-sample widget and checkout so every bill reads the same way.
 */
export function InvoiceBreakdown({
  lines,
  infoRows,
  deliveryFree = true,
  freightToPay = false,
  className = "",
}: {
  lines: InvoiceLine[];
  infoRows?: { label: string; value: string }[];
  deliveryFree?: boolean;
  /** Reseller / corporate buyer: we do not prepay their freight, so the bill
   *  must not read "Free" — the consignee settles it with the courier. */
  freightToPay?: boolean;
  className?: string;
}) {
  const { taxableLines, taxableSubtotal, gst, total } = gstInvoice(lines);

  return (
    <dl className={`space-y-1.5 text-sm ${className}`}>
      {infoRows?.map((r) => (
        <Row key={r.label} label={r.label} value={r.value} muted />
      ))}
      {infoRows && infoRows.length > 0 && <div className="my-1 border-t border-edge" />}

      {taxableLines.map((l, i) => (
        <Row key={`${l.label}-${i}`} label={l.label} value={formatINR(l.taxable)} />
      ))}

      <div className="mt-1 border-t border-edge pt-2">
        <Row label="Taxable value" value={formatINR(taxableSubtotal)} muted />
        <Row label="GST @ 18%" value={formatINR(gst)} muted />
        {freightToPay ? (
          <Row label="Delivery" value="To-pay · settled with the courier" muted />
        ) : (
          deliveryFree && <Row label="Delivery" value="Free · across India" muted />
        )}
      </div>

      <div className="mt-1 flex items-center justify-between border-t border-edge pt-2 font-semibold text-charcoal">
        <dt>Total (incl. GST)</dt>
        <dd>{formatINR(total)}</dd>
      </div>
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
