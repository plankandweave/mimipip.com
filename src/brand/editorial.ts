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
// Only designs that can be bought lead the home page (catalogue is the sellable list).
const heroHandles = ['safari-celebration', 'balloon-dreams', 'treehouse-enchantment', 'cosmic-outpost'];
const heroProducts = heroHandles.map(handle => catalogue.find(product => product.slug === handle)).filter(product => product !== undefined);
export const homeCampaign: HomeCampaign = {
 enabled: true,
 handles: heroHandles,
 copy: Object.fromEntries(heroProducts.map(product => [product.slug, {
  title: product.name, kicker: 'Little spaces, big possibilities',
  description: product.description.split(/(?<=[.!?])\s/)[0],
  href: '/products/' + product.slug, cta: product.type.includes('wallpaper') ? 'Explore this wallpaper' : 'Explore this design',
 }])),
 overrides: heroProducts.map(product => ({ ...card(product), imageWidth: 1440, imageHeight: 960, imageIsFlat: false })),
 seasonal: [],
};
export function campaignInputs(campaign: HomeCampaign) {
  const seasonal = campaign.seasonal.filter(s=>s.enabled).flatMap(s=>s.cards);
  return { order:[...seasonal.map(c=>c.handle),...campaign.handles], cards:[...campaign.overrides,...seasonal] };
}
