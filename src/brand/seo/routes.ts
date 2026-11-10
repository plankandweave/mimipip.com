/** Which addresses are shown, and where a hidden one goes. Pure. */
import records from '../review/catalogue.json';
import { guides } from '../review/guides';
import { allLandingKeys, landingOf } from './landing';
import { isSellable, recordOf, sellable } from './site';

const SHOP = '/browse/collection';
const knownCollections = new Set(records.flatMap(r => r.collection));
const liveCollections = new Set(sellable.flatMap(r => r.collection));
/** Floor games that have pages of their own (worker/floor-play.json, src/app/choose-floor). */
const FLOOR_GAMES = ['hopscotch-peach-pop', 'wiggleway', 'jump-jamboree', 'fork-and-friends'];

/**
 * Where a request for something that cannot be bought is sent, or null to serve the page.
 * A design with no price or no print file, a collection or search page with nothing on
 * sale in it, a floor game not yet made: each goes to the shop, never to a dead button.
 */
export function hiddenDestination(path: string): string | null {
  const product = /^\/(?:products|design)\/([^/]+)$/.exec(path);
  if (product) { const r = recordOf(decodeURIComponent(product[1])); return r && !isSellable(r.slug) ? SHOP : null; }
  const collection = /^\/collections\/([^/]+)(?:\/[^/]+)?$/.exec(path);
  if (collection && knownCollections.has(collection[1]) && !liveCollections.has(collection[1])) return SHOP;
  const floor = /^\/(?:floor-games|choose-floor)\/([^/]+)$/.exec(path);
  if (floor && FLOOR_GAMES.includes(floor[1]) && !isSellable(floor[1])) return '/floor-games';
  const key = path.slice(1);
  if (allLandingKeys.includes(key) && !landingOf(key)) return SHOP;
  return null;
}

/** Published pages beyond products, collections, browse and landing pages. */
export const extraIndexable: string[] = [
  '/floor-games', '/floor-games/hopscotch-peach-pop', '/play/hopscotch-peach-pop', '/in-real-homes',
  ...Object.keys(guides).map(key => '/guides/' + key),
].filter(path => { const game = /^\/(?:floor-games|play)\/([^/]+)$/.exec(path)?.[1]; return !game || isSellable(game); });
