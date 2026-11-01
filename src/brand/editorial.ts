import type { ProductCardData } from '../lib/types';
export type CampaignCopy = { title: string; kicker: string; description: string; href: string; cta: string };
export type HomeCampaign = {
  enabled: boolean;
  handles: string[];
  copy: Record<string, CampaignCopy>;
  overrides: ProductCardData[];
  seasonal: {enabled: boolean; cards: ProductCardData[]}[];
};
/** Brand-owned merchandising inputs, separate from carousel/selection algorithms. */
export const homeCampaign: HomeCampaign = { enabled:false, handles:[], copy:{}, overrides:[], seasonal:[] };
export function campaignInputs(campaign: HomeCampaign) {
  const seasonal = campaign.seasonal.filter(s=>s.enabled).flatMap(s=>s.cards);
  return { order:[...seasonal.map(c=>c.handle),...campaign.handles], cards:[...campaign.overrides,...seasonal] };
}
