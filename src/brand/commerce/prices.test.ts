import test from 'node:test';
import assert from 'node:assert/strict';
import { priceLine, refused, ratePerSqft } from './prices';
import { priceCart } from './checkout';
const wall = {slug:'almond-blossom',qty:1,widthCm:243.84,heightCm:274.32};
test('India 8 by 9 foot wall is ₹14,400 plus ₹2,592 GST, server calculated',()=>{
 assert.equal(ratePerSqft(wall.slug,'IN'),200);
 const quote=priceLine(wall,'IN');
 assert.ok(!refused(quote));
 assert.equal(quote.unitMinor,1699200);
 assert.equal(quote.billedSqft,72);
});
test('US 8 by 9 foot wall is $720 with shipping included',()=>{
 const quote=priceLine(wall,'ABROAD');
 assert.ok(!refused(quote));
 assert.equal(quote.unitMinor,72000);
 const cart=priceCart([{...wall,qty:2}], 'US');
 assert.ok(!('refused' in cart));
 assert.equal(cart.totalMinor,144000);
});
test('checkout ignores supplied prices and rejects invalid dimensions',()=>{
 const cart=priceCart([{...wall,unitMinor:1,lineMinor:1}], 'IN');
 assert.ok(!('refused' in cart));
 assert.equal(cart.totalMinor,1699200);
 assert.ok(refused(priceLine({...wall,widthCm:NaN},'IN')));
});
