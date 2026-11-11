'use client';
import { useMarket } from './MarketProvider';
import { MIMIPIP_PRICING } from '@/brand/pricing-policy';
export function MimiWallpaperRate(){
 const {market}=useMarket();
 return <span data-mkt-price>{market.countryCode==='IN'
  ? `₹${MIMIPIP_PRICING.sellingInrPerSqFt} per sq ft including GST`
  : `$${MIMIPIP_PRICING.sellingUsdPerSqFt} per sq ft · shipping included`}</span>;
}
