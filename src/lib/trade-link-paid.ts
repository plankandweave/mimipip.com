// The pure half of the trade payment-link settlement (webhook →
// mark_trade_order_paid → OS push). Kept import-free so the unit tests can
// exercise the parsing and the crop shape without dragging in "server-only"
// modules; the side-effectful half lives in trade-os.ts.

/** A payment_link.paid event that names one of OUR trade orders. */
export type TradeLinkPaid = {
  linkId: string;
  paymentId: string;
  orderNumber: number;
};

/** Pull a trade payment-link settlement out of a payment_link.paid payload, or
 *  null when the link is someone else's (reference_id not `trade-<n>` — those
 *  have their own flows and must stay untouched). */
export function tradeLinkPaidOf(event: { event: string; payload?: Record<string, unknown> }): TradeLinkPaid | null {
  if (event.event !== "payment_link.paid") return null;
  const payload = event.payload as {
    payment_link?: { entity?: { id?: string; reference_id?: string } };
    payment?: { entity?: { id?: string } };
  } | undefined;
  const linkId = payload?.payment_link?.entity?.id;
  const referenceId = payload?.payment_link?.entity?.reference_id;
  const paymentId = payload?.payment?.entity?.id;
  const orderNumberMatch = referenceId?.match(/^trade-(\d+)$/);
  if (!linkId || !paymentId || !orderNumberMatch) return null;
  return { linkId, paymentId, orderNumber: Number(orderNumberMatch[1]) };
}

/**
 * The cover-fit crop a trade line gets so the OS push can print it.
 *
 * trade_checkout stores only `{trade: {...}}` in crop_data — a billing
 * snapshot, not artwork — because the partner never frames the design the way
 * the retail configurator does. But os-sync's toWebItem() reads
 * cropData.imageUrl as THE design, and a line without one maps to null and is
 * silently dropped from the OS push. This mirrors what the ordering agent does
 * for the same situation (api/agent: no customer framing → centred cover fit),
 * and keeps the trade billing snapshot intact underneath.
 */
export function tradeLineCrop(
  existing: Record<string, unknown> | null,
  imageUrl: string,
  wallWidthCm: number,
  wallHeightCm: number,
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    imageUrl,
    wallWidthCm,
    wallHeightCm,
    offsetX: 0.5,
    offsetY: 0.5,
    zoom: 1,
  };
}
