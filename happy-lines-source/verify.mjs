import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matches } from './collection.js';
const source = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(source,'../out');
const products = JSON.parse(fs.readFileSync(path.join(source,'products.json')));
assert.equal(products.length,11);
assert.equal(new Set(products.map(p=>p.slug)).size,11);
for(const p of products){
  assert.ok(p.ageMin>=0 && p.ageMax<=10);
  assert.ok(p.colors.length>0);
  assert.deepEqual(p.gender,['Boys','Girls','Gender-neutral']);
  assert.ok(fs.statSync(path.join(out,p.image)).size>1000);
  assert.ok(!/tween|breakfast|family snug|older child/i.test(p.ageLabel));
}
for(const [age,count] of [['nursery',3],['toddler',2],['4-6',3],['7-10',3]]) {
  assert.equal(products.filter(p=>matches(p,{age})).length,count);
}
assert.deepEqual(products.filter(p=>matches(p,{age:'nursery',color:'Pink',gender:'Girls'})).map(p=>p.slug),['sunbeam-check','ribbon-picnic']);
assert.equal(products.filter(p=>matches(p,{age:'7-10',color:'Pink',gender:'Boys'})).length,2);
assert.equal(products.filter(p=>matches(p,{age:'toddler',color:'Orange'})).length,1);
assert.equal(products.filter(p=>matches(p,{color:'Red'})).length,0);
const routes=['','collections','nursery','toddler','kids-wallpaper','kids-room-wallpaper','collections/happy-lines',...products.map(p=>'collections/happy-lines/'+p.slug)];
for(const route of routes){
  const html=fs.readFileSync(path.join(out,route,'index.html'),'utf8');
  assert.ok(html.includes('ORDERS ARE NOT OPEN'));
  assert.ok(html.includes('noindex,nofollow'));
  assert.ok(!html.includes('Add to cart'));
  for(const [,raw] of html.matchAll(/(?:href|src)="([^"#]+)"/g)){
    const link=raw.replaceAll('&amp;','&');
    if(!link.startsWith('/'))continue;
    const pathname=new URL(link,'https://mimipip.com').pathname;
    const local=path.join(out,pathname,pathname.endsWith('/')?'index.html':'');
    assert.ok(fs.existsSync(local),`Missing ${link} in ${route}`);
  }
}
assert.ok(fs.readFileSync(path.join(out,'checkout/index.html'),'utf8').includes('Orders are not open yet'));
console.log('PASS: 11 design records; 0–10 age range; all age, colour and gender combinations; 18 pages and their local links/assets; closed checkout preserved.');
