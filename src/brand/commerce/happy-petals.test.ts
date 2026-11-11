import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import records from '../review/catalogue.json';
import printMap from './print-map.json';
import masters from './happy-petals-masters.json';
import { sellableAnywhere } from './sale';

const wallpaper = records.filter(r => r.type.includes('wallpaper'));
const floral = wallpaper.filter(r => r.collection.includes('happy-petals'));

test('every wallpaper has collection, colour, theme, age and room tags', () => {
  assert.equal(new Set(records.map(r => r.slug)).size, records.length);
  for (const r of wallpaper) for (const key of ['collection', 'color', 'concept', 'age', 'space'] as const)
    assert.ok(r[key].length, `${r.slug} missing ${key}`);
});

test('all Happy Petals use the exact flat artwork for print and are priced in both markets', () => {
  assert.equal(floral.length, 21);
  for (const r of floral) {
    const number = Number(r.id.split('-').at(-1));
    const manifest = (masters as Record<string, { source: string; url: string; sha256: string }>)[`happy-petals-${String(number).padStart(2, '0')}`];
    assert.ok(manifest, r.slug);
    const original = readFileSync(`public/review/happy-petals/flat-${String(number).padStart(2, '0')}.png`);
    const print = readFileSync(manifest.source);
    assert.equal(createHash('sha256').update(original).digest('hex'), manifest.sha256, r.slug);
    assert.equal(createHash('sha256').update(print).digest('hex'), manifest.sha256, r.slug);
    assert.equal((printMap as Record<string, { art: string }>)[r.slug]?.art, manifest.url, r.slug);
    assert.ok(r.concept.includes('pattern') && r.color.length && r.age.length, r.slug);
    assert.ok(sellableAnywhere(r.slug), r.slug);
  }
});

test('wallpapers without clean print artwork remain explicit in the audit', () => {
  const missing = wallpaper.filter(r => !sellableAnywhere(r.slug));
  assert.equal(missing.length, 11);
  assert.ok(missing.every(r => r.collection.includes('happy-lines')));
});
