import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { designs101, design101ByHandle, product101Path, launch101Card, COLLECTION_101 } from './catalogue';
import { createVarietyTracker } from '@/lib/homepage-variety';

test('every Bagh design maps to a priced shop product with reviewed rooms and original art', () => {
  assert.equal(designs101.length, 101);
  assert.equal(new Set(designs101.map(d => d.name)).size, 101);
  assert.equal(design101ByHandle.size, 101);
  assert.equal(COLLECTION_101, '/collections/bagh');
  for (const [i, d] of designs101.entries()) {
    assert.equal(d.number, i + 1);
    assert.equal(d.availability, 'active');
    assert.match(product101Path(d), /^\/products\/bagh-[a-z0-9-]+$/);
    assert.equal(d.rooms.length, 3, d.name);
    for (const room of d.rooms) assert.match(room.src, /^(https:\/\/media\.zyvorah\.com\/bagh\/rooms\/|\/101-designs\/)/);
    for (const asset of [d.flat, ...(d.room && ['champa', 'amaltas'].includes(d.handle) ? [d.room] : [])]) {
      const p = resolve('public', asset.slice(1));
      assert.ok(existsSync(p), p);
      const bytes = readFileSync(p);
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    }
  }
});

test('Bagh launches with a priced room image claimed by homepage variety', () => {
  const tracker = createVarietyTracker([{ handle: 'bagh', tags: ['Bagh'] }]);
  assert.equal(launch101Card.imageIsFlat, false);
  assert.equal(launch101Card.fromPricePerSqft, 200);
  assert.ok(tracker.pickDesignForFrame(1.5, [launch101Card]));
  assert.equal(tracker.pickDesign([launch101Card]), null);
});

test('Bagh uses the normal shopping route and preserves legacy incoming links', () => {
  const product = readFileSync('src/app/products/[handle]/page.tsx', 'utf8');
  assert.doesNotMatch(product, /Product101|Enquire for your wall/);
  assert.match(product, /<ProductConfigurator/);
  const config = readFileSync('next.config.ts','utf8');
  assert.match(config, /source: "\/products\/101-designs-:slug", destination: "\/products\/bagh-:slug"/);
  assert.match(config, /source: "\/collections\/101-designs", destination: "\/collections\/bagh"/);
});
