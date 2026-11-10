import test from 'node:test';
import assert from 'node:assert/strict';
import { isolatedStorage, mimiBucket } from './storage';
test('native bucket names resolve only inside MimiPip storage',()=>{
 const seen:string[]=[];const storage=isolatedStorage({from:(name:string)=>{seen.push(name);return name;}});
 assert.equal(storage.from('board-images'),'mimipip-board-images');
 assert.equal(storage.from('mimipip-order-previews'),'mimipip-order-previews');
 assert.throws(()=>storage.from('../order-copies'));
 assert.throws(()=>Reflect.get(storage,'listBuckets'));
 assert.deepEqual(seen,['mimipip-board-images','mimipip-order-previews']);
 assert.equal(mimiBucket('print-files'),'mimipip-print-files');
});
