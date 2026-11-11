import {test} from 'node:test';
import assert from 'node:assert/strict';
import {designHandles,designSequenceViolations,assertDesignSequence,type DesignSlot} from './design-sequence';
const slot=(x:Partial<DesignSlot>={}):DesignSlot=>({id:'first',day_key:'2026-10-11',seq:1000,channel:'instagram',kind:'reel',status:'idea',handle:'mayur',...x});
test('Mayur on 11 and 13 October clashes despite different film and image URLs',()=>{
 const v=designSequenceViolations([slot({art:{video_url:'a.mp4'}}),slot({id:'second',day_key:'2026-10-13',art:{video_url:'b.mp4'}})]);
 assert.equal(v.length,1);assert.equal(v[0].slot,'second');
});
test('Story repeats across days and uncomposed ideas are counted',()=>{
 const rows=[slot({kind:'story'}),slot({id:'later',kind:'story',day_key:'2026-10-20',status:'planned'})];
 assert.throws(()=>assertDesignSequence(rows,new Set(['later'])),/repeats mayur/);
});
test('identity survives review-only metadata and catalogue source paths',()=>{
 assert.deepEqual(designHandles({art:{product_url:'https://zyvorah.com/products/mayur'}}),['mayur']);
 assert.deepEqual(designHandles({art:{source_image:'https://zyvorah.com/media/product-images/taash/taash-bahi/scene-02.jpg'}}),['taash-bahi']);
 assert.deepEqual(designHandles({art:{source_image:'https://zyvorah.com/media/product-images/mayur/scene-bedroom.png'}}),['mayur']);
});
test('removed unpublished and unselected reference ideas do not occupy the sequence',()=>{
 assert.equal(designSequenceViolations([slot({status:'removed'}),slot({id:'new'})]).length,0);
 assert.equal(designSequenceViolations([slot({art:{selected:false}}),slot({id:'new'})]).length,0);
});
test('published receipts win even when removed or a new slot backdates itself',()=>{
 const rows=[slot({status:'removed',published:true}),slot({id:'new',day_key:'2026-10-01'})];
 assert.equal(designSequenceViolations(rows)[0].slot,'new');
});
test('all designs in a collection Reel count, and repeated internal scenes are one use',()=>{
 const rows=[slot({handle:null,art:{design_handles:['mayur','milan','mayur']}}),slot({id:'new',handle:'milan'})];
 assert.equal(designSequenceViolations(rows).length,1);
});
test('feed and carousel share a format; campaign companion formats are distinct',()=>{
 assert.equal(designSequenceViolations([slot({kind:'feed'}),slot({id:'new',kind:'carousel'})]).length,1);
 assert.equal(designSequenceViolations([slot(),slot({id:'story',kind:'story'}),slot({id:'feed',kind:'feed'})]).length,0);
});
test('other accounts/channels and unrelated old violations do not block a new design',()=>{
 const rows=[slot(),slot({id:'other',channel:'linkedin'}),slot({id:'repeat'}),slot({id:'new',handle:'sakhi'})];
 assert.equal(designSequenceViolations(rows).length,1);
 assert.doesNotThrow(()=>assertDesignSequence(rows,new Set(['new'])));
});
