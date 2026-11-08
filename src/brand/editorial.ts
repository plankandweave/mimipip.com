import { catalogue, card } from './review/data';
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
const heroHandles = ['cloud-parade', 'sage-meadow', 'buttercup-morning', 'little-rooftops'];
const heroProducts = heroHandles.map(handle => catalogue.find(product => product.slug === handle)).filter(product => product !== undefined);
export const homeCampaign: HomeCampaign = {
 enabled: true,
 handles: heroHandles,
 copy: Object.fromEntries(heroProducts.map(product => [product.slug, {
  title: product.name, kicker: 'Little spaces, big possibilities',
  description: product.description.split(/(?<=[.!?])\s/)[0],
  href: '/products/' + product.slug, cta: 'Explore this wallpaper',
 }])),
 overrides: heroProducts.map(product => ({ ...card(product), imageWidth: 1374, imageHeight: 1145, imageIsFlat: false })),
 seasonal: [],
};
export function campaignInputs(campaign: HomeCampaign) {
  const seasonal = campaign.seasonal.filter(s=>s.enabled).flatMap(s=>s.cards);
  return { order:[...seasonal.map(c=>c.handle),...campaign.handles], cards:[...campaign.overrides,...seasonal] };
}
