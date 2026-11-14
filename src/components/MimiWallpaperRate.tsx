'use client';
import { useMarket } from './MarketProvider';
import { MIMIPIP_PRICING } from '@/brand/pricing-policy';
export function MimiWallpaperRate(){
 const {market}=useMarket();
 return <span data-mkt-price>{market.countryCode==='IN'
  ? `₹${(MIMIPIP_PRICING.sellingInrPerSqFt / (1 + (MIMIPIP_PRICING.gstRate ?? 0))).toFixed(2)} per sq ft + GST`
  : `$${MIMIPIP_PRICING.sellingUsdPerSqFt} per sq ft · shipping included`}</span>;
}
