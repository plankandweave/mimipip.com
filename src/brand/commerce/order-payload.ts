/** The paid order as the OS takes it: POST /api/zyvorah/web-order, brand "lorange". */
import printMap from './print-map.json';

export type StoredLine = {
  slug: string; name: string; qty: number; lineMinor: number;
  widthCm: number | null; heightCm: number | null;
  ratePerSqft: number | null; billedSqft: number | null;
  placement?: { zoom: number; cropX: number; cropY: number; flipH?: boolean; flipV?: boolean };
};
export type StoredCustomer = {
  name: string; email: string; phone: string; address: string; city: string;
  state: string; postcode: string; countryCode: string; country: string;
};
type Art = { art: string; material: 'paste' | 'self_adhesive'; materialSlug?: string };

export const artFor = (slug: string) => (printMap as Record<string, Art>)[slug] ?? null;
export const SITE = 'https://mimipip.com';
const absolute = (u: string) => (u.startsWith('http') ? u : SITE + u);

/** Rupees for each line. Abroad the rupee total is Razorpay's own figure, shared by
 *  each line's part of the bill, and the shares add back to it exactly. */
export function linesInr(lines: Pick<StoredLine, 'lineMinor'>[], totalInr: number) {
  const total = lines.reduce((s, l) => s + l.lineMinor, 0);
  let left = totalInr;
  return lines.map((l, i) => {
    const part = i === lines.length - 1 ? left : Math.round((totalInr * l.lineMinor) / total * 100) / 100;
    left = Math.round((left - part) * 100) / 100;
    return part;
  });
}

export function webOrderBody(o: { id: string; paymentId: string; amountInr: number; lines: StoredLine[]; customer: StoredCustomer }) {
  const inr = linesInr(o.lines, o.amountInr);
  const c = o.customer;
  return {
    brand: 'lorange',
    orderRef: o.id,
    amountInr: o.amountInr,
    shippingInr: 0,
    customer: { name: c.name, phone: c.phone, email: c.email, address: c.address, city: c.city, pincode: c.postcode, state: c.state, country: c.country, countryCode: c.countryCode },
    payment: { razorpayPaymentId: o.paymentId, amountInr: o.amountInr },
    items: o.lines.map((l, i) => {
      const a = artFor(l.slug);
      if (!a) throw new Error('No print artwork for ' + l.slug);
      if (l.widthCm === null || l.heightCm === null) throw new Error('No size for ' + l.slug);
      return {
        lineRef: String(i + 1), brand: 'lorange',
        designUrl: absolute(a.art), designName: l.name, orderedTitle: l.name, productHandle: l.slug,
        widthMm: Math.round(l.widthCm * 10), heightMm: Math.round(l.heightCm * 10),
        material: a.material, ...(a.materialSlug ? { materialSlug: a.materialSlug } : {}),
        qty: l.qty, lineTotalInr: inr[i],
        ...(l.ratePerSqft !== null && c.countryCode === 'IN' ? { catalogueRatePerSqft: l.ratePerSqft } : {}),
        ...(l.billedSqft !== null ? { chargeableSqft: l.billedSqft } : {}),
        ...(l.placement ? { placement: l.placement } : {}),
      };
    }),
  };
}
