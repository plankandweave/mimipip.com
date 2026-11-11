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
 assert.equal(quoteMarketOrder({amountInr:14400,countryCode:'IN',areaSqFt:72}).total,14400);
});


test('the wall-price estimator matches checkout including India GST and the area minimum',async()=>{
 const {estimateWallpaper}=await import('./wall-price');
 for(const [w,h] of [[8,9],[2,3],[10.5,8.5]])for(const country of ['IN','US']){
  const estimate=estimateWallpaper(w,h,country);assert.ok(estimate);
  const line=priceLine({slug:'almond-blossom',qty:1,widthCm:w*30.48,heightCm:h*30.48},country==='IN'?'IN':'ABROAD');assert.ok(!refused(line));
  assert.equal(estimate.totalMinor,line.unitMinor);assert.equal(estimate.currency,line.currency);
 }
 assert.equal(estimateWallpaper(8,9,'IN')?.totalMinor,1440000);
 assert.equal(estimateWallpaper(8,9,'US')?.totalMinor,72000);
 for(const [w,h] of [[0,8],[NaN,8],[8,Infinity],[61,8]])assert.equal(estimateWallpaper(w,h,'IN'),null);
});

test('fractional wall prices stay exact from configurator to checkout in both markets',async()=>{
 const {formatMarketMoney}=await import('../lib/markets');
 const india=priceLine({slug:'almond-blossom',qty:1,widthCm:244,heightCm:274},'IN');assert.ok(!refused(india));
 for(const country of ['IN','US']){
  const line=priceLine({slug:'almond-blossom',qty:1,widthCm:244,heightCm:274},country==='IN'?'IN':'ABROAD');assert.ok(!refused(line));
  const q=quoteMarketOrder({amountInr:india.lineMinor/100,countryCode:country});assert.equal(q.total,line.lineMinor/100);
 }
 assert.equal(formatMarketMoney(14392.64,'INR'),'₹14,392.64');assert.equal(formatMarketMoney(1000,'INR'),'₹1,000');
});


test('only verified delivery destinations can be selected or quoted',async()=>{
 const {countryOptions,normalizeCountryCode}=await import('../lib/markets');
 const {priceCart}=await import('./commerce/checkout');
 assert.deepEqual(countryOptions().map(c=>c.code),['IN','US']);
 assert.equal(normalizeCountryCode('GB'),null);
 assert.ok('refused' in priceCart([{slug:'almond-blossom',qty:1,widthCm:243.84,heightCm:274.32}],'GB'));
});
