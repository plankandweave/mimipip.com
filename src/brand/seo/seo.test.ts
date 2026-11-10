import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import records from '../review/catalogue.json';
import printMap from '../commerce/print-map.json';
import masters from '../commerce/print-masters.json';
import { priceCart } from '../commerce/checkout';
import { feedItems, feedProblems, googleMerchantXml, metaCatalogueXml, FEEDS } from './feeds';
import { headFor, indexablePaths, productJsonLd } from './head';
import { landings, unpublishedLandings } from './landing';
import { extraIndexable, hiddenDestination } from './routes';
import { sitemapXml } from './sitemap';
import { hidden, hiddenReason, sellable } from './site';
import { cleanCountry, istDay, looksAutomated, summarise, validEvent } from './funnel';

const paths = indexablePaths(extraIndexable);

test('what is on sale: every design has a price in both markets and a print file; nothing else is listed', () => {
  assert.equal(sellable.length + hidden.length, records.length);
  assert.ok(sellable.length > 0);
  for (const r of sellable) {
    assert.ok((printMap as Record<string, unknown>)[r.slug], r.slug + ' has no print file');
    for (const country of ['IN', 'US']) {
      const priced = priceCart([{ slug: r.slug, qty: 1, widthCm: 243.84, heightCm: 274.32 }], country);
      assert.ok(!('refused' in priced) && priced.totalMinor > 0, r.slug + ' cannot be bought in ' + country);
    }
  }
  for (const r of hidden) {
    assert.ok('refused' in priceCart([{ slug: r.slug, qty: 1, widthCm: 243.84, heightCm: 274.32 }], 'IN'), r.slug + ' is hidden but the checkout would take it');
    assert.match(hiddenReason(r), /no price|no print file/);
  }
});

test('a fixed piece on sale prints from a master on record, at the master\'s size', () => {
  for (const r of sellable.filter(r => !r.type.some(t => t.includes('wallpaper')))) {
    const art = (printMap as Record<string, { art: string; printWidthCm?: number; printHeightCm?: number }>)[r.slug];
    const master = (masters as Record<string, { url: string; printWidthCm: number; printHeightCm: number }>)[r.slug];
    assert.ok(master, r.slug + ' has no master');
    assert.equal(art.art, master.url);
    assert.equal(art.printWidthCm, master.printWidthCm);
    assert.equal(art.printHeightCm, master.printHeightCm);
  }
});

test('a hidden design is not shown anywhere: its address goes to the shop', () => {
  for (const r of hidden) {
    assert.equal(hiddenDestination('/products/' + r.slug), '/browse/collection');
    assert.ok(!paths.includes('/products/' + r.slug));
  }
  for (const r of sellable) assert.equal(hiddenDestination('/products/' + r.slug), null);
  assert.equal(hiddenDestination('/products/not-a-design'), null);
  const hiddenOnly = [...new Set(hidden.flatMap(r => r.collection))].filter(c => !sellable.some(r => r.collection.includes(c)));
  for (const c of hiddenOnly) assert.equal(hiddenDestination('/collections/' + c), '/browse/collection');
  for (const game of ['wiggleway', 'jump-jamboree', 'fork-and-friends']) {
    assert.equal(hiddenDestination('/floor-games/' + game), '/floor-games');
    assert.equal(hiddenDestination('/choose-floor/' + game), '/floor-games');
  }
  assert.equal(hiddenDestination('/floor-games/hopscotch-peach-pop'), null);
  for (const key of unpublishedLandings) assert.equal(hiddenDestination('/' + key), '/browse/collection');
});

test('every published page has its own title and description, a canonical address and a picture', () => {
  const titles = new Map<string, string>(), descriptions = new Map<string, string>();
  for (const path of paths) {
    const head = headFor(path);
    if (path.startsWith('/guides/') || path === '/in-real-homes') continue; // these keep the page's own head
    assert.ok(head, 'no head for ' + path);
    assert.equal(head.canonical, 'https://mimipip.com' + path);
    assert.ok(head.title.length >= 20 && head.title.length <= 75, `${path} title length ${head.title.length}: ${head.title}`);
    assert.ok(head.description.length >= 50 && head.description.length <= 160, `${path} description length ${head.description.length}`);
    assert.ok(!titles.has(head.title), `${path} shares its title with ${titles.get(head.title)}`);
    assert.ok(!descriptions.has(head.description), `${path} shares its description with ${descriptions.get(head.description)}`);
    titles.set(head.title, path); descriptions.set(head.description, path);
    assert.match(head.image, /^https:\/\/mimipip\.com\/feed-images\/[a-z0-9-]+\.jpg$/);
    assert.ok(existsSync('public' + new URL(head.image).pathname), path + ' picture is missing: ' + head.image);
    assert.doesNotMatch(JSON.stringify(head), /zyvorah|l'orange/i, path + ' names another brand');
  }
});

test('a product page carries Product and Offer with the price a shopper pays', () => {
  const wall = sellable.find(r => r.slug === 'almond-blossom')!;
  const [product] = productJsonLd(wall) as any[];
  assert.equal(product['@type'], 'Product');
  assert.deepEqual(product.offers.map((o: any) => [o.priceCurrency, o.price, o.availability]), [
    ['INR', '4720.00', 'https://schema.org/InStock'],   // 20 sq ft × ₹200 + 18% GST: the smallest order
    ['USD', '200.00', 'https://schema.org/InStock'],    // 20 sq ft × US$10
  ]);
  const [game] = productJsonLd(sellable.find(r => r.slug === 'hopscotch-peach-pop')!) as any[];
  const quote = priceCart([{ slug: 'hopscotch-peach-pop', qty: 1 }], 'IN');
  assert.ok(!('refused' in quote));
  assert.equal(game.offers[0].price, (quote.totalMinor / 100).toFixed(2));
  for (const r of sellable) for (const o of (productJsonLd(r)[0] as any).offers) {
    assert.match(o.price, /^\d+\.\d{2}$/); assert.ok(Number(o.price) > 0);
    assert.match(o.url, /^https:\/\/mimipip\.com\/products\//);
  }
});

test('the landing pages she named exist, sell something, and make no claim we cannot stand behind', () => {
  const keys = landings.map(l => l.key);
  for (const key of ['kids-wallpaper', 'kids-room-wallpaper', 'nursery-wallpaper', 'floor-game-stickers', 'hopscotch-floor-sticker', 'birthday-gifts-for-kids', 'return-gifts-for-kids'])
    assert.ok(keys.includes(key), key + ' is not published');
  // No wall sticker and no colour-in wallpaper can be bought today, so neither page is published.
  assert.deepEqual(unpublishedLandings.sort(), ['colourable-wallpaper', 'kids-wall-stickers']);
  for (const l of landings) {
    assert.ok(l.products.length > 0 && l.products.every(s => sellable.some(r => r.slug === s)), l.key);
    const words = [l.h1, l.metaTitle, l.description, l.intro, ...l.sections.flatMap(s => [s.heading, s.text])].join(' ');
    assert.doesNotMatch(words, /\b(safe|safety|non[- ]?toxic|certified|tested|eco|waterproof|washable|durable|vinyl|pvc|anti[- ]?slip|non[- ]?slip|hypoallergenic|bpa|removable|repositionable|best|guarantee)\b/i, l.key + ' makes a claim');
    assert.doesNotMatch(words, /zyvorah|l'orange|amazon|ikea|pepperfry/i, l.key + ' names another brand');
    assert.doesNotMatch(words, /undefined|null|NaN/, l.key);
  }
});

test('the sitemap lists exactly the published addresses, with no trailing slash to be redirected', () => {
  const xml = sitemapXml(extraIndexable);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).filter(u => !u.includes('/feed-images/'));
  assert.deepEqual(locs, paths.map(p => 'https://mimipip.com' + p));
  assert.equal(new Set(locs).size, locs.length);
  for (const u of locs) assert.ok(u === 'https://mimipip.com/' || !u.endsWith('/'), u);
  assert.equal(locs.filter(u => u.includes('/products/')).length, sellable.length);
});

test('shopping feeds: only designs on sale, sound against the feed rules, the price the checkout charges', () => {
  for (const market of ['IN', 'US'] as const) {
    const items = feedItems(market);
    assert.equal(items.length, sellable.length);
    assert.deepEqual(feedProblems(items), []);
    for (const i of items) {
      assert.ok(existsSync('public' + new URL(i.imageLink).pathname), i.id + ' picture missing');
      const slug = new URL(i.link).pathname.split('/').pop()!;
      const quote = priceCart([{ slug, qty: 1, widthCm: 243.84, heightCm: 274.32 }], market);
      assert.ok(!('refused' in quote));
      assert.equal(i.price, `${(quote.totalMinor / 100).toFixed(2)} ${quote.currency}`, i.id + ' feed price is not the checkout price');
    }
  }
  assert.equal(feedItems('IN').find(i => i.link.endsWith('/almond-blossom'))!.price, '16992.00 INR');
  assert.equal(feedItems('US').find(i => i.link.endsWith('/almond-blossom'))!.price, '720.00 USD');
  for (const make of Object.values(FEEDS)) {
    const xml = make();
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<rss version="2\.0" xmlns:g="http:\/\/base\.google\.com\/ns\/1\.0">/);
    assert.equal((xml.match(/<item>/g) ?? []).length, (xml.match(/<\/item>/g) ?? []).length);
    assert.doesNotMatch(xml, /&(?!amp;|lt;|gt;|quot;)/, 'an unescaped ampersand');
    assert.doesNotMatch(xml, /zyvorah/i);
  }
  assert.match(googleMerchantXml('IN'), /<g:availability>in_stock<\/g:availability>/);
  assert.match(metaCatalogueXml('IN'), /<g:availability>in stock<\/g:availability>/);
  assert.ok(feedProblems([{ ...feedItems('IN')[0], imageLink: '/review/a.webp', price: '0 INR' }]).length >= 2);
});

test('the funnel counts only the four events, on designs on sale, by IST day', () => {
  assert.ok(validEvent('product_view', 'almond-blossom'));
  assert.ok(!validEvent('product_view', 'sage-meadow'));   // hidden
  assert.ok(!validEvent('refund', 'almond-blossom'));
  assert.equal(istDay(Date.UTC(2026, 10, 10, 19, 0)), '2026-11-11');   // 00:30 IST the next day
  assert.equal(cleanCountry('IN'), 'IN'); assert.equal(cleanCountry('T1'), 'ZZ'); assert.equal(cleanCountry(undefined), 'ZZ');
  assert.ok(looksAutomated('Mozilla/5.0 (compatible; Googlebot/2.1)')); assert.ok(looksAutomated(null));
  assert.ok(!looksAutomated('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'));
  const s = summarise([
    { day: '2026-11-10', event: 'product_view', slug: 'almond-blossom', country: 'IN', n: 5 },
    { day: '2026-11-10', event: 'add_to_cart', slug: 'almond-blossom', country: 'IN', n: 2 },
    { day: '2026-11-11', event: 'paid', slug: 'almond-blossom', country: 'US', n: 1 },
  ]);
  assert.deepEqual(s.totals, { product_view: 5, add_to_cart: 2, checkout_started: 0, paid: 1 });
  assert.equal(s.byDay['2026-11-11'].paid, 1);
});

test('no page is left out of search by accident, and the public script is in place', () => {
  assert.ok(existsSync('public/mimipip-funnel.js'));
  assert.match(readFileSync('public/mimipip-funnel.js', 'utf8'), /sendBeacon\('\/api\/funnel'/);
  assert.ok(paths.includes('/') && paths.includes('/floor-games') && paths.includes('/browse/collection'));
});
