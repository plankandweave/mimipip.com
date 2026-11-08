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
