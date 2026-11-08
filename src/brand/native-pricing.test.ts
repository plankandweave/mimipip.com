import test from 'node:test';
import assert from 'node:assert/strict';
import { marketGoodsFromInr, quoteMarketOrder } from '../lib/markets';
import { priceLine, refused } from './commerce/prices';
test('native configurator and authoritative checkout agree for an 8 by 9 foot wall',()=>{
 const line=priceLine({slug:'almond-blossom',qty:1,widthCm:243.84,heightCm:274.32},'IN');
 assert.ok(!refused(line));
 assert.equal(marketGoodsFromInr(line.unitMinor/100,'US'),720);
 const quote=quoteMarketOrder({amountInr:line.unitMinor/100,countryCode:'US',areaSqFt:72});
 assert.equal(quote.total,720);assert.equal(quote.delivery,0);
 assert.equal(quoteMarketOrder({amountInr:16992,countryCode:'IN',areaSqFt:72}).total,16992);
});


test('the wall-price estimator matches checkout including India GST and the area minimum',async()=>{
 const {estimateWallpaper}=await import('./wall-price');
 for(const [w,h] of [[8,9],[2,3],[10.5,8.5]])for(const country of ['IN','US']){
  const estimate=estimateWallpaper(w,h,country);assert.ok(estimate);
  const line=priceLine({slug:'almond-blossom',qty:1,widthCm:w*30.48,heightCm:h*30.48},country==='IN'?'IN':'ABROAD');assert.ok(!refused(line));
  assert.equal(estimate.totalMinor,line.unitMinor);assert.equal(estimate.currency,line.currency);
 }
 assert.equal(estimateWallpaper(8,9,'IN')?.totalMinor,1699200);
 assert.equal(estimateWallpaper(8,9,'US')?.totalMinor,72000);
 for(const [w,h] of [[0,8],[NaN,8],[8,Infinity],[61,8]])assert.equal(estimateWallpaper(w,h,'IN'),null);
});
