import test from 'node:test';
import assert from 'node:assert/strict';
import { AMAZON_INDIA_LISTINGS, amazonIndiaLink, amazonListings, amazonProductUrl } from './amazon-india';
import records from '../review/catalogue.json';

test('nothing is shown when no listing is recorded', () => {
  assert.equal(amazonIndiaLink([]), null);
});

test('only a well-formed ASIN is shown, once', () => {
  const list = [
    { slug: 'a', name: 'A', asin: 'B0HRKMD283' },
    { slug: 'b', name: 'B', asin: 'B0HRKMD283' },
    { slug: 'c', name: 'C', asin: 'not-an-asin' },
    { slug: 'd', name: '  ', asin: 'B0HRKDH71S' },
  ];
  assert.deepEqual(amazonListings(list).map(l => l.slug), ['a']);
  assert.equal(amazonProductUrl('B0HRKMD283'), 'https://www.amazon.in/dp/B0HRKMD283');
});

test('every recorded listing names a MimiPip design the site sells', () => {
  const slugs = new Set((records as { slug: string }[]).map(r => r.slug));
  for (const l of AMAZON_INDIA_LISTINGS) assert.ok(slugs.has(l.slug), l.slug);
  assert.equal(amazonListings().length, AMAZON_INDIA_LISTINGS.length);
  assert.equal(amazonIndiaLink(), '/guides/amazon');
});
