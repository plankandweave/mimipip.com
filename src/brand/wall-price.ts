import {MIMIPIP_PRICING} from './pricing-policy';
/** Indicative plain-wall price using the same area minimum and retail rates as checkout. */
export function estimateWallpaper(widthFt:number,heightFt:number,countryCode:string){
 if(!Number.isFinite(widthFt)||!Number.isFinite(heightFt)||widthFt<=0||heightFt<=0||widthFt>60||heightFt>60)return null;
 const area=widthFt*heightFt,billed=Math.max(20,area),india=countryCode==='IN';
 const rate=india?MIMIPIP_PRICING.sellingInrPerSqFt*(1+(MIMIPIP_PRICING.gstRate??0.18)):MIMIPIP_PRICING.sellingUsdPerSqFt;
 return {area,billed,currency:india?'INR' as const:'USD' as const,totalMinor:Math.round(billed*rate*100)};
}
