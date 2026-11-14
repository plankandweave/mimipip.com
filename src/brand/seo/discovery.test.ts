import test from 'node:test';
import assert from 'node:assert/strict';
import {discoveryResponse} from './discovery';
import {feedItems} from './feeds';
import {productJsonLd} from './head';
import {sellable,isWallpaper} from './site';
import {priceLine,refused} from '../commerce/prices';
test('all fixed size variants resolve to the exact checkout price and selected structured offer',()=>{
 for(const r of sellable.filter(isWallpaper)){
  const items=feedItems('IN').filter(i=>new URL(i.link).pathname==='/products/'+r.slug);
  assert.equal(items.length,4);
  for(const i of items){
   const u=new URL(i.link),fixed=u.searchParams.get('fixed')?.split('x').map(Number);
   const q=priceLine({slug:r.slug,qty:1,widthCm:Number(i.dimensions!.width)*30.48,heightCm:Number(i.dimensions!.height)*30.48,fixedSize:!!fixed},'IN');
   assert.ok(!refused(q));assert.equal(i.price,`${(q.unitMinor/100).toFixed(2)} INR`);
   const p=productJsonLd(r,u.searchParams)[0] as any;
   assert.equal(p.offers[0].price,i.price.split(' ')[0]);assert.equal(p.sku,i.id);
  }
 }
});
test('read-only discovery covers the sellable catalogue without private files or stale branding',async()=>{
 const r=discoveryResponse(new Request('https://mimipip.com/api/agent/catalogue'));const body=await r.json();
 assert.equal(body.count,sellable.length);
 for(const p of body.products){for(const k of ['collection','concept','color','space','age','type'])assert.ok(p.tags[k].length,p.slug+':'+k);assert.ok(p.offers.length);}
 assert.doesNotMatch(JSON.stringify(body),/supabase|print-masters|Child-Safe|Zyvorah/);
 assert.equal(discoveryResponse(new Request('https://mimipip.com/api/agent/order',{method:'POST'})).status,405);
 assert.equal(discoveryResponse(new Request('https://mimipip.com/api/agent/product/sage-meadow')).status,404);
 const searched=await discoveryResponse(new Request('https://mimipip.com/api/agent/search?q=woodland')).json();assert.ok(searched.count>0&&searched.count<body.count);
 for(const slug of ['wiggleway','jump-jamboree','fork-and-friends'])assert.doesNotMatch(feedItems('IN').find(i=>new URL(i.link).pathname.endsWith('/'+slug))!.description,/numbers 1 to 10/);
});
