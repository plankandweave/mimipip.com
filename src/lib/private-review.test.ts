import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REVIEW_CSP, reviewPath } from './private-review';
test('private reviews never resolve outside staff storage', () => {
  const company = '3691615c-0cc8-459a-9564-4b4aa04a829b', hash = 'a'.repeat(64);
  assert.equal(reviewPath(company, hash, 'deck.html'), `staff-reviews/${company}/${hash}/deck.html`);
  for (const asset of ['../deck.html', 'complete.json/../deck.html', 'https://example.com', 'deck.html?token=x']) assert.throws(() => reviewPath(company, hash, asset));
  assert.throws(() => reviewPath('../other', hash, 'deck.html'));
  assert.throws(() => reviewPath(company, '../other', 'deck.html'));
});
test('active content has an opaque origin and no network or form access', () => {
  assert.match(REVIEW_CSP, /sandbox allow-scripts;/);
  assert.doesNotMatch(REVIEW_CSP, /allow-same-origin|allow-popups|allow-forms|https:/);
  for (const directive of ["connect-src 'none'", "form-action 'none'", "base-uri 'none'", "frame-src 'none'", "default-src 'none'"]) assert.ok(REVIEW_CSP.includes(directive));
});
