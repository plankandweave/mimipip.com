import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layout = readFileSync('src/app/layout.tsx', 'utf8');
const worker = readFileSync('worker/index.ts', 'utf8');

test('no page fixes the market: an Indian visitor must never be sent dollars', () => {
  assert.ok(!/initialCountryCode=/.test(layout));
});
test('every page passes through the country cookie', () => {
  assert.match(worker, /withVisitorCountry\(request,await serve\(/);
});
