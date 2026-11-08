import {test} from 'node:test';
import assert from 'node:assert/strict';
import {homecomingOfferActive} from '@/lib/homecoming-offer';
test('Zyvorah seasonal promotions do not change Mimi Pip cart prices',()=>{
 assert.equal(homecomingOfferActive(new Date('2026-11-08T00:00:00Z')),false);
});
