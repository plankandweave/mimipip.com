import {checkedBillingIdentity,type BillingIdentity} from './billing-identity';
import {pricedLettering} from './lettering';
import {pricedInstallation,installationAddressAllowed} from './installation';
import { priceSample, sampleDesign, SAMPLE_REFERENCE_CM } from './samples';
import { approvedLayout } from './approved-layout';
/** The paid order as the OS takes it: POST /api/zyvorah/web-order, brand "lorange". */
import printMap from './print-map.json';
import legacyPrintMap from './legacy-print-map.json';
import type { CropData } from '@/lib/visualizer';

export type StoredLine = {
  kind?: 'sample'|'design-service';
  brief?: import('./custom-services').DesignBrief;
  fulfilmentArt?: Art;
  installationMinor?:number;
  personalisationMinor?:number;
  slug: string; name: string; qty: number; lineMinor: number;
  widthCm: number | null; heightCm: number | null;
  ratePerSqft: number | null; billedSqft: number | null;
  crop?: CropData;
  placement?: { zoom: number; cropX: number; cropY: number; flipH?: boolean; flipV?: boolean };
};
export type StoredCustomer = {
  billingIdentity?:BillingIdentity;
  name: string; email: string; phone: string; address: string; city: string;
  state: string; postcode: string; countryCode: string; country: string;
};
export type Art = { art: string; material: 'paste' | 'self_adhesive'; materialSlug?: string; printWidthCm?: number; printHeightCm?: number };

export const artFor = (slug: string) => (printMap as Record<string, Art>)[slug] ?? null;

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

export function webOrderBody(o: { createdAt?: number; id: string; paymentId: string|null; giftTender?:{giftId:string;redemptionRef:string;amountInr:number}; amountInr: number; lines: StoredLine[]; customer: StoredCustomer }) {
  const inr = linesInr(o.lines, o.amountInr);
  const c = o.customer;
  const physicalInr=Math.round(o.lines.reduce((sum,l,i)=>sum+(l.kind==='design-service'?0:inr[i]),0)*100)/100;
  const giftPhysical=o.giftTender?Math.min(o.giftTender.amountInr,physicalInr):0;
  const cashPhysical=Math.round((physicalInr-giftPhysical)*100)/100;
  if(cashPhysical>0&&!o.paymentId)throw new Error('Missing cash payment reference');
  const billingIdentity=checkedBillingIdentity(c.billingIdentity,c.countryCode);
  return {
    brand: 'lorange',
    ...(billingIdentity?{billingIdentity}:{}),
    orderRef: o.id,
    amountInr: physicalInr,
    shippingInr: 0,
    customer: { name: c.name, phone: c.phone, email: c.email, address: c.address, city: c.city, pincode: c.postcode, state: c.state, country: c.country, countryCode: c.countryCode },
    ...(o.paymentId?{payment:{razorpayPaymentId:o.paymentId,amountInr:cashPhysical}}:{}),
    ...(giftPhysical>0?{giftTender:{giftId:o.giftTender!.giftId,redemptionRef:o.giftTender!.redemptionRef,amountInr:giftPhysical,currency:'INR' as const}}:{}),
    items: o.lines.flatMap((l, i) => {
      if(l.kind==='design-service')return [];
      // Unversioned orders predate the stock change. Never reinterpret them using today's catalogue.
      if (!l.fulfilmentArt && o.createdAt && o.createdAt >= Date.parse('2026-11-11T01:18:22Z')) throw new Error('Unversioned material needs order review.');
      const a = l.fulfilmentArt ?? (legacyPrintMap as Record<string, Art>)[l.slug];
      if (!a) throw new Error('No print artwork for ' + l.slug);
      if (l.widthCm === null || l.heightCm === null) throw new Error('No size for ' + l.slug);
      if (l.kind === 'sample') {
        const checked = priceSample(l as unknown as Record<string,unknown>, c.countryCode);
        if ('refused' in checked || l.lineMinor !== checked.lineMinor) throw new Error('Invalid durable sample specification for '+l.slug);
        return {lineRef:String(i+1),brand:'lorange',designUrl:a.art,designName:sampleDesign(l.slug)!.title,orderedTitle:l.name,productHandle:l.slug,
          widthMm:210,heightMm:297,material:a.material,materialSlug:a.materialSlug,qty:1,lineTotalInr:inr[i],
          sample:{designHandle:l.slug,materialSlug:a.materialSlug,materialLabel:a.material==='self_adhesive'?'Smooth Self-Adhesive':'Soft Matte',muralWidthCm:SAMPLE_REFERENCE_CM,muralHeightCm:SAMPLE_REFERENCE_CM,sourceUrl:a.art}};
      }
      // Revalidate durable records too: an older pending order must not lose
      // unsupported instructions when a later payment reconciliation sends it.
      const crop=approvedLayout(l.crop,l.widthCm,l.heightCm,a.art,l.slug);
      const installation=crop?.installation?pricedInstallation(crop.installation,l.widthCm,l.heightCm,l.qty,c.countryCode):undefined;
      if(installation && (!installationAddressAllowed(c.countryCode,c.postcode) || installation.total*100!==l.installationMinor))throw new Error('Installation price or delivery coverage needs review.');
      const lettering=pricedLettering(crop,l.widthCm,l.heightCm,c.countryCode);
      if(lettering && lettering.fee*100!==l.personalisationMinor)throw new Error('Lettering price needs review.');
      const placement=crop?{zoom:crop.zoom,cropX:crop.offsetX,cropY:crop.offsetY,flipH:!!crop.flipH,flipV:!!crop.flipV}:l.placement;
      return {
        lineRef: String(i + 1), brand: 'lorange',
        designUrl: a.art, designName: l.name, orderedTitle: l.name, productHandle: l.slug,
        // A fixed piece prints at its master's size, which carries the white edge the cutter follows.
        widthMm: Math.round((a.printWidthCm ?? l.widthCm) * 10), heightMm: Math.round((a.printHeightCm ?? l.heightCm) * 10),
        material: a.material, ...(a.materialSlug ? { materialSlug: a.materialSlug } : {}),
        qty: l.qty, lineTotalInr: inr[i],
        ...(lettering?{textOverlay:lettering.overlay,...(lettering.personalisation?{personalisationTotalInr:lettering.fee}:{})}:{}),
        ...(installation?{installByUs:true,installationTotalInr:installation.total}:{}),
        ...(l.ratePerSqft !== null && c.countryCode === 'IN' ? { catalogueRatePerSqft: l.ratePerSqft } : {}),
        ...(l.billedSqft !== null ? { chargeableSqft: l.billedSqft } : {}),
        ...(placement ? { placement } : {}),
        ...(crop?.planningMode==='full-wall'?{planningLayout:{mode:'full-wall' as const,wallsCm:crop.walls??[l.widthCm],divisionsCm:crop.divisions??[],marks:crop.doors??[]}}:{}),
      };
    }),
  };
}
