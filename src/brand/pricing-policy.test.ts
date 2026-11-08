import test from 'node:test';
import assert from 'node:assert/strict';
import { productionCostPerSqFt, quoteMimiPipOrder } from './pricing-policy';
const wall = (areaSqFt: number, quantity = 1) => ({ id: 'wall', areaSqFt, quantity, route: 'custom-wallpaper' as const });
test('8 × 9 ft uses the owner’s per-square-foot cost and pre-tax selling basis', () => {
  const q = quoteMimiPipOrder([wall(72)], 'IN');
  assert.equal(productionCostPerSqFt(), 56);
  assert.equal(q.costInr, 4032);
  assert.equal(q.beforeTax, 14400);
  assert.equal(q.tax, 2592);
  assert.equal(q.total, 16992);
});
test('US wallpaper is $10 per square foot including shipping, with freight cost counted once', () => {
  const q = quoteMimiPipOrder([wall(25, 2), {...wall(50), id:'second'}], 'US', {inrPerUsd:100});
  assert.equal(q.freightInr, 7500);
  assert.equal(q.freightInrPerWallpaperSqFt, 75);
  assert.equal(q.beforeTax, 1000);
});
test('US stock has no per-order international air freight and never silently free fulfilment', () => {
  const line = {...wall(2), route:'stocked-item' as const};
  const pending = quoteMimiPipOrder([line], 'US');
  assert.equal(pending.freightInr, 0);
  assert.equal(pending.beforeTax, null);
  const q = quoteMimiPipOrder([line], 'US', {inrPerUsd:100,stockFulfilment:{domesticPostageUsd:8,bulkInboundInr:50,fulfilmentInr:100}});
  assert.equal(q.beforeTax, 13.5);
});
test('confirmed tax is added to the base rather than extracted from it', () => {
  const q = quoteMimiPipOrder([wall(1)], 'IN', {gstRate:0.18});
  assert.equal(q.beforeTax, 200);
  assert.equal(q.tax, 36);
  assert.equal(q.total, 236);
});
test('invalid dimensions, quantities and conversion cannot produce a quote', () => {
  for (const line of [wall(0),wall(NaN),wall(-1),wall(2,1.5)]) assert.throws(()=>quoteMimiPipOrder([line],'IN'));
  assert.throws(()=>quoteMimiPipOrder([wall(1)],'US',{inrPerUsd:0}));
});
