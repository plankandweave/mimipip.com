import catalogue from '../review/catalogue.json';
import printMap from './print-map.json';
import type { Priced } from './prices';

/** One A4 sample of the same self-adhesive wallpaper offered on the website. */
import { SAMPLE_INR, SAMPLE_WIDTH_CM, SAMPLE_HEIGHT_CM } from './sample-policy';
export { SAMPLE_REFERENCE_CM } from './sample-policy';
export const sampleDesigns = catalogue.filter(r => {
  const art = (printMap as Record<string, {material: string; materialSlug?: string}>)[r.slug];
  return r.type.includes('wallpaper') && r.measurementType === 'made-to-measure' && art?.material === 'self_adhesive' && art.materialSlug === 'self-adhesive-vinyl';
}).map(r => ({handle:r.slug,title:r.name,image:(r as typeof r & {flatImage?:string}).flatImage ?? `/review/hover-art/${r.slug}.webp`}));
export const sampleDesign = (slug:string) => sampleDesigns.find(r=>r.handle===slug);

export function priceSample(raw: Record<string, unknown>, countryCode:string): (Priced & {kind:'sample'}) | {refused:string} {
  const design = sampleDesign(String(raw.slug ?? ''));
  if (countryCode !== 'IN') return {refused:'Design samples are available for delivery within India only.'};
  if (!design) return {refused:'A design sample is not available for this artwork and material.'};
  if (raw.qty !== 1 || (raw.widthCm != null && raw.widthCm !== SAMPLE_WIDTH_CM) || (raw.heightCm != null && raw.heightCm !== SAMPLE_HEIGHT_CM) || raw.crop != null || raw.placement != null)
    return {refused:'A sample is one A4 design sample; wall sizes and crop instructions cannot be applied to it.'};
  return {kind:'sample',slug:design.handle,name:`${design.title} — A4 self-adhesive sample`,qty:1,currency:'INR',unitMinor:SAMPLE_INR*100,lineMinor:SAMPLE_INR*100,widthCm:SAMPLE_WIDTH_CM,heightCm:SAMPLE_HEIGHT_CM,ratePerSqft:null,billedSqft:null};
}
