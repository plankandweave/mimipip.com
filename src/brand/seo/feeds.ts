/**
 * Shopping feeds, made from the catalogue and prices.json: only designs on sale.
 *   /feeds/google-merchant.xml      Google Merchant Center, India (INR)
 *   /feeds/google-merchant-us.xml   Google Merchant Center, United States (USD)
 *   /feeds/meta-catalogue.xml       Meta (Facebook and Instagram) catalogue, India
 *   /feeds/meta-catalogue-us.xml    Meta catalogue, United States
 * A wallpaper is listed at the wall the product page opens on (8 × 9 ft, 72 sq ft),
 * with its unit price per sq ft, so the feed price is the price on the page.
 */
import { WALLPAPER_FIXED_SIZES, priceLine, refused } from '../commerce/prices';
import { abs, BRAND, feedImage, isWallpaper, listPrice, ORIGIN, productPath, sellable, STANDARD_WALL_SQFT, typeLabel, type Rec } from './site';

export type FeedMarket = 'IN' | 'US';
export type FeedItem = {
  id: string; title: string; description: string; link: string; imageLink: string; additionalImageLink: string | null;
  price: string; availability: 'in_stock'; condition: 'new'; brand: string; productType: string; googleCategory: string | null;
  itemGroupId: string | null; color: string | null; size: string | null; unitMeasure: string | null; shipCountry: string; shipPrice: string; material: string | null; dimensions: { width: string; height: string; unit: 'ft' | 'cm' } | null; variantOptions: Record<string,string> | null;
};
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cap = (s: string) => s.replace(/^./, c => c.toUpperCase());

export function feedItems(market: FeedMarket): FeedItem[] {
  const m = market === 'IN' ? 'IN' : 'ABROAD';
  return sellable.flatMap((r: Rec) => {
    const price = listPrice(r.slug, m);
    if (!price) return [];
    const wall = isWallpaper(r);
    const hop = r.collection.includes('hopscotch');
    const colourway = hop ? r.name.replace(/^.*— /, '') : null;
    const base: FeedItem = {
      id: (r.id.startsWith('MP-') ? r.id : 'MP-' + r.slug).toUpperCase().slice(0, 50),
      title: wall ? `${r.name} Kids' Wallpaper, 8 × 9 ft wall` : hop ? `Hopscotch Floor Game Sticker for Kids, ${colourway}, 75 × 260 cm` : `${r.name} ${cap(typeLabel(r))}`,
      description: wall
        ? `${r.description} Smooth self-adhesive peel-and-stick wallpaper. Made to the measurements of your wall; this price is for a wall of 8 × 9 ft (72 sq ft).`
        : `${r.description} One connected contour-cut floor sticker, ${r.widthCm} × ${r.heightCm} cm. ${hop ? 'With the numbers 1 to 10. ' : ''}Stickers only: furniture and room accessories are not included.`,
      link: abs(productPath(r.slug)) + `?market=${market}` + (wall ? '&w=8&h=9&configure=1' : ''),
      imageLink: abs(feedImage(r.slug)),
      additionalImageLink: null,
      price: `${price.amount.toFixed(2)} ${price.currency}`,
      availability: 'in_stock', condition: 'new', brand: BRAND,
      productType: wall ? `Kids' Wallpaper > ${cap((r.concept[0] ?? 'designs').replace(/-/g, ' '))}` : hop ? 'Floor Game Stickers > Hopscotch' : 'Floor Game Stickers',
      googleCategory: wall ? 'Home & Garden > Decor > Wallpaper' : null,
      itemGroupId: wall && market === 'IN' ? ('MP-GROUP-' + r.slug).toUpperCase().slice(0,50) : hop ? 'MP-HOPSCOTCH' : null,
      color: colourway ?? (r.color.length ? r.color.map(cap).join('/') : null),
      size: wall ? '8 ft x 9 ft' : `${r.widthCm} x ${r.heightCm} cm`,
      unitMeasure: wall ? `${STANDARD_WALL_SQFT} sqft` : null,
      shipCountry: market, shipPrice: `0.00 ${price.currency}`,
      material: wall ? 'Self-adhesive vinyl' : null,
      dimensions: wall ? {width:'8',height:'9',unit:'ft'} : r.widthCm && r.heightCm ? {width:String(r.widthCm),height:String(r.heightCm),unit:'cm'} : null,
      variantOptions: wall && market === 'IN' ? {size:'8 ft x 9 ft'} : hop ? {color:colourway!} : null,
    };
    if (!wall || market !== 'IN') return [base];
    const fixed = WALLPAPER_FIXED_SIZES.map(([w,h]) => {
      const quote = priceLine({slug:r.slug,qty:1,widthCm:w*30.48,heightCm:h*30.48,fixedSize:true},'IN');
      if (refused(quote)) throw new Error(`${r.slug}: ${quote.refused}`);
      const size = `${w} ft x ${h} ft`;
      return {...base,
        id: `${base.id.slice(0,38)}-F${w}X${h}`,
        title: `${r.name} Peel-and-Stick Kids' Wallpaper, ${w} × ${h} ft`,
        description: `${r.description} Smooth self-adhesive peel-and-stick wallpaper. One finished wallpaper design measuring ${w} × ${h} ft (${w*h} sq ft); wallpaper only, furniture and accessories are not included.`,
        link: abs(productPath(r.slug)) + `?market=IN&fixed=${w}x${h}`,
        price: `${(quote.unitMinor/100).toFixed(2)} INR`, size,
        unitMeasure: `${w*h} sqft`, dimensions: {width:String(w),height:String(h),unit:'ft' as const},
        variantOptions: {size},
      };
    });
    return [...fixed,base];
  });
}

const tag = (name: string, value: string | null) => (value === null ? '' : `<g:${name}>${xml(value)}</g:${name}>\n`);
function rss(title: string, description: string, items: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n<channel>\n<title>${xml(title)}</title>\n<link>${ORIGIN}</link>\n<description>${xml(description)}</description>\n${items.join('')}</channel>\n</rss>\n`;
}

export function googleMerchantXml(market: FeedMarket) {
  return rss(`${BRAND} (${market})`, "MimiPip kids' wallpaper and floor game stickers.", feedItems(market).map(i =>
    '<item>\n' + tag('id', market === 'US' ? i.id.slice(0,47) + '-US' : i.id) + tag('title', i.title) + tag('description', i.description) + tag('link', i.link) + tag('image_link', i.imageLink) +
    tag('availability', i.availability) + tag('price', i.price) + tag('condition', i.condition) + tag('brand', i.brand) + tag('identifier_exists', 'no') +
    tag('google_product_category', i.googleCategory) + tag('product_type', i.productType) + tag('item_group_id', i.itemGroupId) + tag('color', i.color) + tag('size', i.size) + tag('material', i.material) +
    (i.unitMeasure ? tag('unit_pricing_measure', i.unitMeasure) + tag('unit_pricing_base_measure', '1 sqft') : '') +
    `<g:shipping><g:country>${i.shipCountry}</g:country><g:service>Standard</g:service><g:price>${i.shipPrice}</g:price></g:shipping>\n</item>\n`));
}

/** Meta's catalogue reads the same RSS shape; its availability is spelled with a space. */
export function metaCatalogueXml(market: FeedMarket) {
  return rss(`${BRAND} catalogue (${market})`, "MimiPip kids' wallpaper and floor game stickers.", feedItems(market).map(i =>
    '<item>\n' + tag('id', market === 'US' ? i.id.slice(0,47) + '-US' : i.id) + tag('title', i.title) + tag('description', i.description) + tag('availability', 'in stock') + tag('condition', i.condition) +
    tag('price', i.price) + tag('link', i.link) + tag('image_link', i.imageLink) + tag('brand', i.brand) +
    tag('google_product_category', i.googleCategory) + tag('product_type', i.productType) + tag('item_group_id', i.itemGroupId) + tag('color', i.color) + tag('size', i.size) + tag('material', i.material) + '</item>\n'));
}

export const FEEDS: Record<string, () => string> = {
  '/feeds/google-merchant.xml': () => googleMerchantXml('IN'),
  '/feeds/google-merchant-in.xml': () => googleMerchantXml('IN'),
  '/feeds/google-merchant-us.xml': () => googleMerchantXml('US'),
  '/feeds/meta-catalogue.xml': () => metaCatalogueXml('IN'),
  '/feeds/meta-catalogue-in.xml': () => metaCatalogueXml('IN'),
  '/feeds/meta-catalogue-us.xml': () => metaCatalogueXml('US'),
};

/** The checks the feed specifications state, as problems in words. Empty means the feed is sound. */
export function feedProblems(items: FeedItem[]): string[] {
  const out: string[] = [], ids = new Set<string>();
  for (const i of items) {
    const say = (why: string) => out.push(`${i.id}: ${why}`);
    if (!i.id || i.id.length > 50) say('id missing or over 50 characters');
    if (ids.has(i.id)) say('duplicate id'); ids.add(i.id);
    if (!i.title || i.title.length > 150) say('title missing or over 150 characters');
    if (!i.description || i.description.length > 5000) say('description missing or over 5000 characters');
    if (i.title === i.title.toUpperCase()) say('title is all capitals');
    for (const [name, url] of [['link', i.link], ['image_link', i.imageLink]] as const) if (!/^https:\/\/mimipip\.com\/\S+$/.test(url)) say(`${name} is not an https address on mimipip.com`);
    if (!/\.(jpe?g|png)$/.test(i.imageLink)) say('image is not a JPEG or PNG');
    if (!/^\d+\.\d{2} (INR|USD)$/.test(i.price) || parseFloat(i.price) <= 0) say('price is not "0.00 CUR" above zero');
    if (!/^0\.00 (INR|USD)$/.test(i.shipPrice) || i.shipPrice.slice(-3) !== i.price.slice(-3)) say('shipping price or currency is wrong');
    if (/zyvorah|l'orange|lorange/i.test([i.title, i.description, i.link, i.imageLink].join(' '))) say('names another brand');
  }
  return out;
}
