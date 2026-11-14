import test from 'node:test';
import assert from 'node:assert/strict';
import { AMAZON_INDIA, amazonIndiaLink } from './amazon-india';

test('nothing is shown while MimiPip has no live Amazon India listing', () => {
  assert.equal(amazonIndiaLink({ storeUrl: null }), null);
  assert.equal(amazonIndiaLink({ storeUrl: '  ' }), null);
});

test('only an https amazon.in address is ever shown', () => {
  assert.equal(amazonIndiaLink({ storeUrl: 'https://www.amazon.in/stores/MimiPip/page/ABC' }), 'https://www.amazon.in/stores/MimiPip/page/ABC');
  assert.equal(amazonIndiaLink({ storeUrl: 'http://www.amazon.in/stores/MimiPip' }), null);
  assert.equal(amazonIndiaLink({ storeUrl: 'https://www.amazon.com/stores/MimiPip' }), null);
  assert.equal(amazonIndiaLink({ storeUrl: 'https://amazon.in.example.com/x' }), null);
  assert.equal(amazonIndiaLink({ storeUrl: 'not a url' }), null);
});

test('the shipped setting is a valid state', () => {
  const link = amazonIndiaLink(AMAZON_INDIA);
  assert.ok(link === null || link.startsWith('https://www.amazon.in/') || link.startsWith('https://amazon.in/'));
});
