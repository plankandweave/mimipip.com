/**
 * OpenAI product feed (ChatGPT shopping), one JSON object per line:
 *   /feeds/openai-products.jsonl              United States, USD (the only market ChatGPT shopping serves today)
 *   /feeds/openai-products.jsonl?country=IN   India, INR
 * Spec read 10 November 2026: https://developers.openai.com/commerce/specs/file-upload/products
 *
 * Made from feedItems(), the same offers as the Google and Meta feeds, so only
 * designs on sale (a price AND a print file) are here, at the price on the page.
 * Every row is checked; a row that fails is refused and named, never patched.
 * Pure: the Worker serves it (worker/index.ts).
 */
import { feedItems, feedProblems, type FeedItem, type FeedMarket } from './feeds';
import { BRAND, ORIGIN } from './site';

export const OPENAI_AVAILABILITY = ['in_stock', 'out_of_stock', 'pre_order', 'backorder', 'unknown'] as const;
export const OPENAI_REQUIRED = ['item_id', 'title', 'description', 'url', 'brand', 'seller_name', 'image_url', 'availability', 'price'] as const;

export type OpenAiRow = {
  item_id: string; title: string; description: string; url: string; brand: string; seller_name: string;
  image_url: string; availability: (typeof OPENAI_AVAILABILITY)[number]; price: string; seller_url: string;
  group_id?: string; listing_has_variations?: boolean; variant_dict?: Record<string, string>;
  condition: 'new'; product_category?: string; color?: string; size?: string; shipping_price: string;
  accepts_returns: boolean; return_policy: string; seller_privacy_policy: string; seller_tos: string;
  is_eligible_search: boolean; is_eligible_checkout: boolean; target_countries?: string[];
};

/** What the delivery and returns guide (/guides/shipping-returns) says, for the market. */
const marketNote = (market: FeedMarket) =>
  market === 'US'
    ? 'Delivery to the United States is included in the price; any import duty or tax in your country is paid on delivery.'
    : 'Delivery across India is included in the price.';

export function toOpenAiRow(i: FeedItem, market: FeedMarket): OpenAiRow {
  return {
    item_id: i.id,
    title: i.title,
    description: `${i.description} ${marketNote(market)}`.replace(/\s+/g, ' ').trim().slice(0, 5000),
    url: i.link,
    brand: i.brand,
    seller_name: BRAND,
    seller_url: ORIGIN,
    image_url: i.imageLink,
    availability: i.availability,
    price: i.price,
    ...(i.itemGroupId && i.color
      ? { group_id: i.itemGroupId, listing_has_variations: true, variant_dict: { colour: i.color } }
      : {}),
    condition: i.condition,
    ...(i.googleCategory ? { product_category: i.googleCategory } : {}),
    ...(i.color ? { color: i.color } : {}),
    ...(i.size ? { size: i.size } : {}),
    shipping_price: i.shipPrice,
    // Made to your size: no returns for a change of mind (damage and faults are replaced; see the guide).
    accepts_returns: false,
    return_policy: `${ORIGIN}/guides/shipping-returns`,
    seller_privacy_policy: `${ORIGIN}/guides/privacy`,
    seller_tos: `${ORIGIN}/guides/terms`,
    is_eligible_search: true,
    // Orders are placed on mimipip.com; there is no ChatGPT checkout.
    is_eligible_checkout: false,
    ...(market === 'US' ? { target_countries: ['US'] } : {}),
  };
}

/** Why a row may not be sent, in words; empty means it may. */
export function openAiRowProblems(row: Partial<OpenAiRow>, market: FeedMarket): string[] {
  const out: string[] = [];
  const currency = market === 'US' ? 'USD' : 'INR';
  for (const f of OPENAI_REQUIRED) if (typeof row[f] !== 'string' || !(row[f] as string).trim()) out.push(`${f} missing`);
  if (row.availability && !OPENAI_AVAILABILITY.includes(row.availability)) out.push(`availability "${row.availability}" not allowed`);
  if (row.brand && row.brand !== BRAND) out.push(`brand is not ${BRAND}`);
  if (row.title && row.title.length > 150) out.push('title over 150 characters');
  if (row.description && row.description.length > 5000) out.push('description over 5000 characters');
  const m = row.price?.match(/^(\d+\.\d{2}) ([A-Z]{3})$/);
  if (row.price && !m) out.push(`price "${row.price}" not "0.00 CUR"`);
  else if (m && (!(Number(m[1]) > 0) || m[2] !== currency)) out.push(`price must be above zero in ${currency}`);
  if (row.shipping_price && !row.shipping_price.endsWith(' ' + currency)) out.push('shipping price in another currency');
  if (row.url && !/^https:\/\/mimipip\.com\/products\/[a-z0-9-]+$/.test(row.url)) out.push('url is not a mimipip.com product page');
  if (row.image_url && !/^https:\/\/mimipip\.com\/\S+\.(jpe?g|png)$/.test(row.image_url)) out.push('image is not a JPEG or PNG on mimipip.com');
  if (row.listing_has_variations && (!row.group_id || row.group_id === row.item_id || !row.variant_dict || !Object.values(row.variant_dict).every(Boolean)))
    out.push('variant without a distinct group_id and options');
  if (row.is_eligible_checkout) out.push('checkout is not offered in ChatGPT');
  if (/zyvorah|l'orange|lorange/i.test(`${row.title} ${row.description} ${row.url} ${row.image_url}`)) out.push('names another brand');
  return out;
}

export type OpenAiFeed = { rows: OpenAiRow[]; refused: { item_id: string; problems: string[] }[] };

export function openAiFeed(market: FeedMarket, items: FeedItem[] = feedItems(market)): OpenAiFeed {
  const rows: OpenAiRow[] = [], refused: OpenAiFeed['refused'] = [], seen = new Set<string>();
  for (const item of items) {
    const row = toOpenAiRow(item, market);
    // The Google feed's own checks on this one item, then OpenAI's; a repeat id is refused, the first kept.
    const own = feedProblems([item]).map(p => p.slice(p.indexOf(': ') + 2));
    const problems = [...own, ...openAiRowProblems(row, market)];
    if (seen.has(row.item_id)) problems.push('duplicate id');
    if (problems.length) refused.push({ item_id: row.item_id, problems });
    else { seen.add(row.item_id); rows.push(row); }
  }
  return { rows, refused };
}

/** The HTTP answer for /feeds/openai-products.jsonl. */
export function openAiFeedResponse(url: URL, method: string): Response {
  const market: FeedMarket = url.searchParams.get('country')?.toUpperCase() === 'IN' ? 'IN' : 'US';
  const feed = openAiFeed(market);
  if (url.searchParams.get('report') === '1')
    return Response.json({ country: market, rows: feed.rows.length, refused: feed.refused.length, refusals: feed.refused }, { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  if (!feed.rows.length) return new Response(`feed error: 0 valid rows (${feed.refused.length} refused)`, { status: 500 });
  return new Response(method === 'HEAD' ? null : feed.rows.map(r => JSON.stringify(r)).join('\n') + '\n', {
    headers: {
      'Content-Type': 'application/jsonl; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Robots-Tag': 'noindex',
      'X-Feed-Rows': String(feed.rows.length), 'X-Feed-Refused': String(feed.refused.length),
    },
  });
}
