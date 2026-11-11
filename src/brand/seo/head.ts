/**
 * What a search engine reads in the head of each page: one title, one
 * description, one canonical address, one preview picture, and for a design on
 * sale its Product and Offer with the price a shopper pays. Pure: the Worker
 * writes this into the page (worker/public-page.ts), so the inherited pages
 * cannot disagree with prices.json.
 */
import { landingOf, landings } from './landing';
import { abs, BRAND, feedImage, isWallpaper, listPrice, minPrice, ORIGIN, productPath, recordOf, isSellable, sellable, typeLabel, type Rec } from './site';

export type Head = { title: string; description: string; canonical: string; image: string; imageAlt: string; type: 'website' | 'product'; jsonLd: unknown[] };

const DEFAULT_IMAGE = feedImage('safari-celebration');
const clip = (text: string, max: number) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 30)).replace(/[\s,;:.—-]+$/, '') + '…';
};
const label = (s: string) => (s === 'happy-petals' ? 'Happy Petals' : s === 'dotty-days' ? 'Dotty Days' : s === 'colour-create' ? 'Colour & Create' : s.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()));

export function productTitle(r: Rec) {
  if (isWallpaper(r)) {
    const full = `${r.name} kids' wallpaper, made to measure | ${BRAND}`;
    return full.length <= 70 ? full : `${r.name} kids' wallpaper | ${BRAND}`;
  }
  const name = r.name.replace(/^Connected Hopscotch — /, 'Hopscotch floor sticker, ');
  return `${name}${name === r.name ? ' ' + typeLabel(r) : ''} | ${BRAND}`;
}
export function productDescription(r: Rec) {
  if (r.collection.includes('hopscotch')) return `Hopscotch floor game sticker in the ${r.name.replace(/^.*— /, '')} colourway: one connected number trail from 1 to 10, ${r.widthCm} × ${r.heightCm} cm.`;
  const tail = isWallpaper(r) ? ' Made to your wall’s measurements.' : r.widthCm && r.heightCm ? ` ${r.widthCm} × ${r.heightCm} cm.` : '';
  return clip(r.description, 155 - tail.length) + tail;
}

const offer = (r: Rec, market: 'IN' | 'ABROAD') => {
  const wall = isWallpaper(r);
  const price = wall ? minPrice(r.slug, market) : listPrice(r.slug, market);
  if (!price) return null;
  return {
    '@type': 'Offer',
    url: abs(productPath(r.slug)),
    priceCurrency: price.currency,
    price: price.amount.toFixed(2),
    availability: 'https://schema.org/InStock',
    itemCondition: 'https://schema.org/NewCondition',
    seller: { '@id': ORIGIN + '/#organization' },
    ...(market === 'IN' ? { eligibleRegion: { '@type': 'Country', name: 'IN' } } : { ineligibleRegion: { '@type': 'Country', name: 'IN' } }),
    ...(wall ? { description: 'Smallest order, 20 sq ft. The price follows the size of your wall.' } : {}),
    shippingDetails: {
      '@type': 'OfferShippingDetails',
      shippingRate: { '@type': 'MonetaryAmount', value: '0', currency: price.currency },
      ...(market === 'IN' ? { shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'IN' } } : {}),
    },
  };
};

export function productJsonLd(r: Rec) {
  const offers = [offer(r, 'IN'), offer(r, 'ABROAD')].filter(Boolean);
  const collection = r.collection[0];
  return [{
    '@context': 'https://schema.org', '@type': 'Product',
    '@id': abs(productPath(r.slug)) + '#product',
    name: r.name, description: r.description, sku: r.id,
    image: [abs(feedImage(r.slug)), abs(r.image)],
    brand: { '@type': 'Brand', name: BRAND },
    category: typeLabel(r),
    ...(r.widthCm && r.heightCm && !isWallpaper(r) ? { width: { '@type': 'QuantitativeValue', value: r.widthCm, unitCode: 'CMT' }, height: { '@type': 'QuantitativeValue', value: r.heightCm, unitCode: 'CMT' } } : {}),
    offers,
  }, {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
      { '@type': 'ListItem', position: 2, name: label(collection), item: ORIGIN + '/collections/' + collection },
      { '@type': 'ListItem', position: 3, name: r.name, item: abs(productPath(r.slug)) },
    ],
  }];
}

const itemList = (name: string, slugs: string[]) => ({
  '@context': 'https://schema.org', '@type': 'ItemList', name,
  itemListElement: slugs.slice(0, 30).map((slug, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(productPath(slug)), name: recordOf(slug)?.name })),
});

const axisTitles: Record<string, [string, string]> = {
  collection: ["Shop kids' wallpaper and floor games by collection", "Every MimiPip design on sale, by collection: made-to-measure kids' wallpaper and hopscotch floor game stickers."],
  color: ["Kids' wallpaper by colour", "Choose kids' wallpaper by colour: blues, greens, pinks, yellows and more, each made to your wall's measurements."],
  concept: ["Kids' wallpaper by theme", "Choose kids' wallpaper by the story it tells: florals, animals, skies, transport, space, ocean and more."],
  age: ["Kids' wallpaper and floor games by age", "Designs for babies, toddlers, preschoolers and school-age children."],
  size: ["Shop by size: made to measure or fixed size", "Made-to-measure wallpaper for any wall, and fixed-size floor game stickers."],
  space: ["Kids' wallpaper by room: bedroom, nursery and playroom", "Wallpaper and floor games for a child's bedroom, nursery or playroom."],
};
const floorGames: Record<string, [string, string]> = {
  '/floor-games': ['Floor games for kids: hopscotch floor sticker | MimiPip', 'Floor game stickers for a child’s room. A hopscotch number trail from 1 to 10, with four ways to play.'],
  '/floor-games/hopscotch-peach-pop': ['Peach Pop hopscotch floor game | MimiPip', 'Peach Pop hopscotch: one connected floor sticker, 75 × 260 cm. Follow the numbers from one to ten, one little hop at a time.'],
  '/play/hopscotch-peach-pop': ['Four ways to play hopscotch | MimiPip', 'The play guide for the MimiPip hopscotch floor game: four ways to play on one number trail.'],
};

/** The head for a published path (no trailing slash, "/" for home), or null to leave the page as it is. */
export function headFor(path: string, value?: string | null): Head | null {
  const base = (title: string, description: string, extra: Partial<Head> = {}): Head =>
    ({ title, description, canonical: ORIGIN + (path === '/' ? '/' : path), image: abs(DEFAULT_IMAGE), imageAlt: "MimiPip kids' wallpaper shown in a child's room", type: 'website', jsonLd: [], ...extra });
  if (path === '/') return base(`${BRAND}: kids' wallpaper and floor games, making time for childhood`,
    "Kids' wallpaper made to measure for your wall, and hopscotch floor game stickers for indoor play. Delivered across India and abroad.",
    { jsonLd: [itemList("MimiPip designs", sellable.map(r => r.slug))] });
  const product = /^\/products\/([a-z0-9-]+)$/.exec(path);
  if (product) {
    const r = recordOf(product[1]);
    if (!r || !isSellable(r.slug)) return null;
    return base(productTitle(r), productDescription(r), { image: abs(feedImage(r.slug)), imageAlt: r.collection.includes('playroom-stories') || r.collection.includes('shape-street') ? `${r.name} flat wallpaper artwork` : `${r.name} ${typeLabel(r)} shown in a child's room`, type: 'product', jsonLd: productJsonLd(r) });
  }
  const landing = landingOf(path.slice(1));
  if (landing) return base(landing.metaTitle, landing.description, {
    image: abs(feedImage(landing.products[0])), imageAlt: landing.h1,
    jsonLd: [itemList(landing.h1, landing.products), { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' }, { '@type': 'ListItem', position: 2, name: landing.h1, item: ORIGIN + path }] }],
  });
  const browse = /^\/browse\/([a-z]+)$/.exec(path);
  if (browse && axisTitles[browse[1]]) {
    const [title, description] = axisTitles[browse[1]];
    // A filtered view is the same page for search: one canonical, the axis itself.
    return base(value ? `${label(value)}: ${title} | ${BRAND}` : `${title} | ${BRAND}`, description);
  }
  const collection = /^\/collections\/([a-z0-9-]+)$/.exec(path);
  if (collection) {
    const items = sellable.filter(r => r.collection.includes(collection[1]));
    if (!items.length) return null;
    const name = label(collection[1]);
    const wall = isWallpaper(items[0]);
    if (collection[1] === 'happy-petals') return base(`${name}: floral wallpaper for kids | ${BRAND}`, `Explore Happy Petals floral wallpaper designs for nurseries, bedrooms and playrooms. Choose a design and enter your wall measurements to see your price.`, { image: abs(feedImage(items[0].slug)), imageAlt: `${name} floral wallpaper in a styled room`, jsonLd: [itemList(name, items.map(r => r.slug))] });
    return base(`${name}: ${wall ? "kids' wallpaper collection" : 'floor game stickers'} | ${BRAND}`,
      wall ? collection[1] === 'shape-street' ? `Explore eleven Shape Street wallpaper stories: trams, markets, gardens, the harbour and more. Each design is made to your wall's measurements.` : `${items.length} ${name} kids' wallpaper designs from MimiPip, each made to your wall's measurements.`
        : collection[1] === 'hopscotch' ? `Hopscotch floor game stickers from MimiPip: ${items.length} colourways of one connected number trail, 75 × 260 cm.`
        : `${items.length} ${name} designs from MimiPip for a child's room, in fixed sizes.`,
      { image: abs(feedImage(items[0].slug)), jsonLd: [itemList(name, items.map(r => r.slug))] });
  }
  if (floorGames[path]) return base(floorGames[path][0], floorGames[path][1], { image: abs(feedImage('hopscotch-peach-pop')), imageAlt: 'Hopscotch floor game sticker in a playroom' });
  return null;
}

/**
 * The shop itself, on every page MimiPip writes the head for: the Offers point
 * at it (seller @id), and the inherited block it replaces belonged to another
 * shop's template. Only what the guides say: Magnitude Brands, made to size, no
 * change-of-mind returns.
 */
export const organizationJsonLd = {
  '@context': 'https://schema.org', '@type': 'OnlineStore', '@id': ORIGIN + '/#organization',
  name: BRAND, url: ORIGIN + '/', logo: ORIGIN + '/brand/mimi-pip/half-sun-512.png', email: 'hello@mimipip.com',
  description: "Kids' wallpaper sized to your wall, and floor game stickers, for nurseries, children's bedrooms and playrooms.",
  parentOrganization: { '@type': 'Organization', name: 'Magnitude Brands Private Limited' },
  contactPoint: { '@type': 'ContactPoint', email: 'hello@mimipip.com', contactType: 'customer support' },
  hasMerchantReturnPolicy: {
    '@type': 'MerchantReturnPolicy', returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
    merchantReturnLink: ORIGIN + '/guides/shipping-returns',
  },
};

/** Every address search may list: what the sitemap holds and what is marked index, follow. */
export const indexablePaths = (extra: string[]): string[] => [
  '/', ...landings.map(l => '/' + l.key), ...extra,
  ...['collection', 'color', 'concept', 'age', 'size', 'space'].map(a => '/browse/' + a),
  ...[...new Set(sellable.flatMap(r => r.collection))].map(c => '/collections/' + c),
  ...sellable.map(r => productPath(r.slug)),
];
