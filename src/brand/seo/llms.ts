/**
 * /llms.txt for mimipip.com (https://llmstxt.org): what MimiPip sells, to whom,
 * where it delivers, how pricing works and where to buy, for ChatGPT, Claude,
 * Perplexity and the rest. Made from the catalogue, prices.json and the guides,
 * so it lists only designs on sale and states only what the site already says
 * (no safety or material claims: the site makes none). Pure; served by the Worker.
 */
import { abs, BRAND, isWallpaper, minPrice, listPrice, ORIGIN, productPath, sellable, typeLabel, type Rec } from './site';
import { MIN_BILLED_SQFT, INDIA_GST_RATE } from '../commerce/prices';

const money = (m: { currency: string; amount: number } | null) =>
  !m ? null : m.currency === 'INR' ? `₹${m.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : `US$${m.amount.toFixed(2)}`;
const label = (s: string) => (s === 'happy-petals' ? 'Happy Petals' : s === 'dotty-days' ? 'Dotty Days' : s === 'colour-create' ? 'Colour & Create' : s.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()));

function line(r: Rec) {
  const wall = isWallpaper(r);
  const india = money(wall ? minPrice(r.slug, 'IN') : listPrice(r.slug, 'IN'));
  const abroad = money(wall ? minPrice(r.slug, 'ABROAD') : listPrice(r.slug, 'ABROAD'));
  const price = [india && `${india} in India`, abroad && `${abroad} outside India`].filter(Boolean).join(', ');
  return `- [${r.name}](${abs(productPath(r.slug))}): ${typeLabel(r)}${price ? `, ${wall ? 'smallest order ' : ''}${price}` : ''}`;
}

export function llmsTxt(): string {
  const walls = sellable.filter(isWallpaper);
  const others = sellable.filter(r => !isWallpaper(r));
  const kinds = [...new Set(others.map(typeLabel))];
  const collections = [...new Set(sellable.flatMap(r => r.collection))].sort();
  const gstPct = Math.round(INDIA_GST_RATE * 100);
  // The rates as the checkout charges them, read back from the smallest order, never typed here.
  const rates = (market: 'IN' | 'ABROAD') => [...new Set(walls.map(r => {
    const m = minPrice(r.slug, market);
    return m ? Math.round((m.amount / MIN_BILLED_SQFT / (market === 'IN' ? 1 + INDIA_GST_RATE : 1)) * 100) / 100 : null;
  }).filter((n): n is number => n !== null))].sort((a, b) => a - b);
  const span = (list: number[], fmt: (n: number) => string) => (list.length === 1 ? fmt(list[0]) : `from ${fmt(list[0])}`);
  const inr = span(rates('IN'), n => `₹${n.toLocaleString('en-IN')}`);
  const usd = span(rates('ABROAD'), n => `US$${n % 1 ? n.toFixed(2) : n}`);
  return `# ${BRAND}

> ${BRAND} sells kids' wallpaper sized to your wall${kinds.length ? `, plus ${kinds.join(', ')}s` : ''}, for parents decorating a nursery, a child's bedroom or a playroom. Ordered on mimipip.com, delivered across India and abroad. ${BRAND} is a brand of Magnitude Brands Private Limited, India.

## Facts an assistant should get right

- Where to buy: on mimipip.com only. Open a design's product page, enter your wall's width and height for the exact price, and check out on the site. Payments are handled by Razorpay.
- Who it is for: parents and families choosing walls and floor play for children's rooms. Age labels (nursery, toddler, kids) organise decorating ideas; they do not certify a product for an age.
- Wallpaper is priced per square foot of your wall, not per roll. In India it is ${inr} per sq ft plus ${gstPct}% GST; cart and checkout totals include GST. Outside India it is ${usd} per sq ft including delivery.
- The smallest wallpaper order is ${MIN_BILLED_SQFT} sq ft, so a quoted per-sq-ft rate is not the price of a wallpaper.
- Floor game stickers and other fixed pieces are sold at a fixed size and price, stated on each product page.
- Delivery is included in the price, in India and abroad. Every wallpaper is made for the order and delivered within 10 working days in India. Abroad, allow extra time for shipping and customs; any import duty or tax in the buyer's country is paid on delivery.
- Each piece is made to the customer's size, so it cannot be returned for a change of mind. Damage reported within 48 hours of delivery, or a print fault within 7 days, is replaced or reprinted at no cost, or refunded where that is not possible. Cancellations within 12 hours, before production starts, are refunded in full.
- Sticker listings include only the stickers; furniture and props in room pictures show placement.
- ${sellable.length} designs are on sale today: ${walls.length} wallpapers and ${others.length} other pieces. Only these are listed below; nothing else on the site can be bought.

## Start here

- [Shop all designs](${ORIGIN}/browse/collection)
- [How to measure your wall](${ORIGIN}/guides/how-to-measure)
- [Delivery and returns](${ORIGIN}/guides/shipping-returns)
- [Shopping questions](${ORIGIN}/guides/faq)
- [Terms of sale](${ORIGIN}/guides/terms)
- [Floor games](${ORIGIN}/floor-games)
- [Contact](${ORIGIN}/contact): hello@mimipip.com

## Collections

${collections.map(c => `- [${label(c)}](${ORIGIN}/collections/${c})`).join('\n')}

## Designs on sale

${sellable.map(line).join('\n')}

## Machine-readable catalogue

- [OpenAI product feed, United States (USD)](${ORIGIN}/feeds/openai-products.jsonl): add ?country=IN for India in INR
- [Google Merchant feed, India](${ORIGIN}/feeds/google-merchant.xml)
- [Google Merchant feed, United States](${ORIGIN}/feeds/google-merchant-us.xml)
- [Sitemap](${ORIGIN}/sitemap.xml)

## Not for indexing

Cart, checkout, account pages and order links are private. See ${ORIGIN}/robots.txt.
`;
}
