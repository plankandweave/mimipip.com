import test from 'node:test';
import assert from 'node:assert/strict';
import {discoveryResponse} from './discovery';
import {feedItems,googleMerchantXml} from './feeds';
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

test('Google market feeds cannot overwrite offers when an existing account shares a feed label',()=>{
 const ids=(m:'IN'|'US')=>[...googleMerchantXml(m).matchAll(/<g:id>([^<]+)<\/g:id>/g)].map(x=>x[1]);
 const india=new Set(ids('IN'));assert.ok(ids('US').every(id=>!india.has(id)));assert.equal(new Set(ids('US')).size,ids('US').length);
});

test('Pinterest uses only reviewed room images while retaining current offer IDs and prices', async()=>{
 const {pinterestCatalogueXml,FEEDS}=await import('./feeds');
 const images=(await import('./pinterest-room-images.json')).default;
 for(const [market,count] of [['IN',702],['US',180]] as const){
  const xml=pinterestCatalogueXml(market);
  const items=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m=>m[1]);
  assert.equal(items.length,count);
  const all=googleMerchantXml(market);
  for(const item of items){
   const id=item.match(/<g:id>([^<]+)<\/g:id>/)![1];
   const price=item.match(/<g:price>([^<]+)<\/g:price>/)![1];
   const image=item.match(/<g:image_link>([^<]+)<\/g:image_link>/)![1];
   assert.ok(Object.values(images).includes(image));
   assert.ok(all.includes(`<g:id>${id}</g:id>`));
   assert.ok(all.includes(`<g:price>${price}</g:price>`));
   assert.ok(item.includes('<g:availability>in stock</g:availability>'));
  }
 }
 assert.ok(FEEDS['/feeds/pinterest-catalogue.xml']);
 assert.ok(FEEDS['/feeds/pinterest-catalogue-us.xml']);
});
