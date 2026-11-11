import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import sources from './pastel-stripes-sources.json';
import records from '../review/catalogue.json';
import { artFor } from './order-payload';
import { priceCart } from './checkout';
import { card } from '../review/data';

test('eight owner stripe originals remain exact and drive the ordered artwork',()=>{
 assert.equal(sources.length,8);
 assert.equal(new Set(sources.map(s=>s.sha256)).size,8);
 for(const source of sources){
  const record=records.find(r=>r.slug===source.slug)!;
  assert.ok(record);
  assert.equal(createHash('sha256').update(readFileSync('public'+source.flat)).digest('hex'),source.sha256);
  assert.equal(artFor(source.slug)?.art,'https://mimipip.com'+source.flat);
  assert.equal(card(record).flatHoverImage,source.flat);
  assert.ok(existsSync('public'+source.room));
  assert.ok(existsSync('public/feed-images/'+source.slug+'.jpg'));
  for(const market of ['IN','US'])assert.ok(!('refused' in priceCart([{slug:source.slug,qty:1,widthCm:243.84,heightCm:274.32}],market)));
 }
});
