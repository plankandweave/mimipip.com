import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogue,card} from '../review/data';
import {priceCart} from './checkout';
test('every published wallpaper preview is accepted through finished-size checkout',()=>{
 for(const p of catalogue.filter(p=>p.type.includes('wallpaper'))){
  const imageUrl=(p as typeof p & {flatImage?:string}).flatImage??card(p).flatHoverImage;
  assert.ok(imageUrl,p.slug);
  const q=priceCart([{slug:p.slug,qty:1,widthCm:60.96,heightCm:91.44,fixedSize:true,crop:{imageUrl,wallWidthCm:60.96,wallHeightCm:91.44,offsetX:.5,offsetY:.5,zoom:1}}],'IN');
  assert.ok(!('refused' in q),p.slug+': '+JSON.stringify(q));
  assert.equal(q.totalMinor,120000,p.slug);
 }
});
