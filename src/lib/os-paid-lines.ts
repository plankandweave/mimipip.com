/** Snapshot the GST-inclusive amount actually sold on each website order line.
 * Checkout stores undiscounted line totals and one order-level goods discount.
 * Allocate that discount across all goods components in paise so the OS lines
 * add up exactly to the paid goods amount, including odd-rupee promotions. */
export type PaidLineSnapshot = {
  id: string;
  lineTotal: number | string;
  installationTotal?: number | string | null;
  personalisationTotal?: number | string | null;
  exclusivityTotal?: number | string | null;
};

export type PaidLineAmounts = {
  lineTotalInr: number;
  installationTotalInr: number;
  personalisationTotalInr: number;
  exclusivityTotalInr: number;
};

/** The OS endpoint accepts printable wallpaper only. A partial basket would
 * produce an invoice that omits goods the customer paid for. */
export function assertAllPrintableLines(savedLineIds: string[], printableLineIds: string[]): void {
  if (savedLineIds.length !== printableLineIds.length
    || new Set(savedLineIds).size !== savedLineIds.length
    || printableLineIds.some((id) => !savedLineIds.includes(id))) {
    throw new Error("Paid website order has lines this wallpaper handoff cannot account for");
  }
}

function paise(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0 || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001) {
    throw new Error("Invalid website order money snapshot");
  }
  return Math.round(n * 100);
}

export function paidLineAmounts(
  lines: PaidLineSnapshot[],
  order: { subtotal: number | string; discount: number | string; shipping: number | string; total: number | string },
): Map<string, PaidLineAmounts> {
  const subtotal = paise(order.subtotal);
  const discount = paise(order.discount);
  const shipping = paise(order.shipping);
  const total = paise(order.total);
  if (discount > subtotal || subtotal - discount + shipping !== total) {
    throw new Error("Website order totals do not reconcile");
  }

  const components = lines.flatMap((line) => {
    const gross = paise(line.lineTotal);
    const installation = paise(line.installationTotal);
    const personalisation = paise(line.personalisationTotal);
    const exclusivity = paise(line.exclusivityTotal);
    const wallpaper = gross - installation - personalisation - exclusivity;
    if (wallpaper < 0) throw new Error("Website line add-ons exceed its total");
    return [
      { id: line.id, kind: "wallpaper" as const, gross: wallpaper },
      { id: line.id, kind: "installation" as const, gross: installation },
      { id: line.id, kind: "personalisation" as const, gross: personalisation },
      { id: line.id, kind: "exclusivity" as const, gross: exclusivity },
    ];
  });
  if (components.reduce((sum, part) => sum + part.gross, 0) !== subtotal || new Set(lines.map((line) => line.id)).size !== lines.length) {
    throw new Error("Website order lines do not reconcile with its subtotal");
  }
  const net = subtotal - discount;
  const shares = components.map((part, index) => {
    const exact = subtotal ? part.gross * net / subtotal : 0;
    return { ...part, index, paid: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = net - shares.reduce((sum, part) => sum + part.paid, 0);
  for (const part of [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (remaining-- <= 0) break;
    part.paid += 1;
  }
  const amounts = new Map<string, PaidLineAmounts>();
  for (const line of lines) {
    const lineParts = shares.filter((part) => part.id === line.id);
    const part = (kind: (typeof shares)[number]["kind"]) => (lineParts.find((p) => p.kind === kind)?.paid ?? 0) / 100;
    amounts.set(line.id, {
      lineTotalInr: lineParts.reduce((sum, p) => sum + p.paid, 0) / 100,
      installationTotalInr: part("installation"),
      personalisationTotalInr: part("personalisation"),
      exclusivityTotalInr: part("exclusivity"),
    });
  }
  return amounts;
}
