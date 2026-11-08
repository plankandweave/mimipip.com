import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWallFt } from './wall-default';
test('Mimi Pip starts with the approved 8 by 9 foot preview wall',()=>assert.deepEqual(initialWallFt(null),{w:8,h:9}));
test('customer dimensions and fixed-size selections override the preview',()=>{
 assert.deepEqual(initialWallFt(null,12,10),{w:12,h:10});
 assert.deepEqual(initialWallFt([24,36],12,10),{w:2,h:3});
 assert.deepEqual(initialWallFt(null,0,NaN),{w:8,h:9});
});
