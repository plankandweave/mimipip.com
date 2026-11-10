import assert from 'node:assert/strict';
import test from 'node:test';
import { feedItems } from './feeds';
import { llmsTxt } from './llms';
import { openAiFeed, openAiRowProblems, toOpenAiRow, OPENAI_REQUIRED } from './openai-feed';
import { sellable } from './site';
import { headFor, organizationJsonLd } from './head';

test('the OpenAI feed lists every design on sale, and only those, in each market', () => {
  for (const market of ['US', 'IN'] as const) {
    const feed = openAiFeed(market);
    assert.deepEqual(feed.refused, [], market);
    assert.equal(feed.rows.length, feedItems(market).length);
    assert.ok(feed.rows.length > 0 && feed.rows.length <= sellable.length);
    const currency = market === 'US' ? 'USD' : 'INR';
    for (const row of feed.rows) {
      for (const f of OPENAI_REQUIRED) assert.ok(row[f], `${row.item_id} ${f}`);
      assert.ok(row.price.endsWith(' ' + currency), row.item_id);
      assert.equal(row.is_eligible_checkout, false);
      assert.equal(row.brand, 'MimiPip');
    }
  }
  const us = openAiFeed('US').rows[0];
  assert.deepEqual(us.target_countries, ['US']);
  assert.match(us.description, /import duty or tax in your country is paid on delivery/);
});

test('the feed check refuses a missing or untrue field instead of sending it', () => {
  const row = toOpenAiRow(feedItems('US')[0], 'US');
  assert.deepEqual(openAiRowProblems(row, 'US'), []);
  assert.ok(openAiRowProblems({ ...row, title: '' }, 'US').includes('title missing'));
  assert.ok(openAiRowProblems({ ...row, price: row.price.replace('USD', 'INR') }, 'US').some(p => p.includes('in USD')));
  assert.ok(openAiRowProblems({ ...row, price: '0.00 USD' }, 'US').some(p => p.includes('above zero')));
  assert.ok(openAiRowProblems({ ...row, url: 'https://zyvorah.com/products/x' }, 'US').includes('url is not a mimipip.com product page'));
  assert.ok(openAiRowProblems({ ...row, image_url: 'https://mimipip.com/x.webp' }, 'US').includes('image is not a JPEG or PNG on mimipip.com'));
  assert.ok(openAiRowProblems({ ...row, availability: 'made_to_order' as never }, 'US').some(p => p.startsWith('availability')));
  assert.ok(openAiRowProblems({ ...row, is_eligible_checkout: true }, 'US').includes('checkout is not offered in ChatGPT'));
  const bad = feedItems('US')[0];
  const feed = openAiFeed('US', [bad, { ...bad }, { ...bad, id: 'MP-X', price: '0.00 USD' }]);
  assert.equal(feed.rows.length, 1);
  assert.equal(feed.refused.length, 2);
});

test('llms.txt names MimiPip, its prices and policies, every design on sale and nothing of another brand', () => {
  const text = llmsTxt();
  assert.match(text, /^# MimiPip\n\n> /);
  assert.match(text, /on mimipip\.com only/);
  assert.match(text, /₹200 per sq ft plus 18% GST/);
  assert.match(text, /US\$10 per sq ft including delivery/);
  assert.match(text, /smallest wallpaper order is 20 sq ft/);
  assert.match(text, /\/feeds\/openai-products\.jsonl/);
  assert.doesNotMatch(text, /zyvorah/i);
  // No safety or material claim the site does not make.
  assert.doesNotMatch(text, /\b(non-toxic|safe for|pvc-free|greenguard|eco|certified)\b/i);
  for (const r of sellable) assert.ok(text.includes(`/products/${r.slug})`), r.slug);
});

test('a product page carries MimiPip\'s own store and one Product, with absolute pictures', () => {
  const r = sellable[0];
  const head = headFor('/products/' + r.slug);
  assert.ok(head);
  const products = head!.jsonLd.filter(x => (x as { '@type': string })['@type'] === 'Product') as { image: string[]; offers: { seller: { '@id': string } }[] }[];
  assert.equal(products.length, 1);
  for (const img of products[0].image) assert.match(img, /^https:\/\/mimipip\.com\//);
  assert.equal(products[0].offers[0].seller['@id'], organizationJsonLd['@id']);
});
