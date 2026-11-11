import {test} from 'node:test';
import assert from 'node:assert/strict';
import {priceCart} from './checkout';
const base={slug:'almond-blossom',qty:1,widthCm:300,heightCm:250};
const crop={imageUrl:'/review/hover-art/almond-blossom.webp',wallWidthCm:300,wallHeightCm:250,offsetX:.2,offsetY:.7,zoom:1.5,flipH:true,walls:[300],doors:[],divisions:[],sizeAssumed:null,approval:{approvedAt:'2026-11-08T10:00:00.000Z',panelArrangement:'Three panels'}};
test('plain-wall approval survives pricing; artwork remains authoritative',()=>{
 const r=priceCart([{...base,crop}], 'IN');assert.ok(!('refused'in r));
 assert.deepEqual(r.lines[0].crop?.doors,crop.doors);assert.deepEqual(r.lines[0].crop?.approval,crop.approval);assert.deepEqual(r.lines[0].crop?.walls,[300]);
 assert.notEqual(r.lines[0].crop?.imageUrl,crop.imageUrl);assert.deepEqual(r.lines[0].placement,{zoom:1.5,cropX:.2,cropY:.7,flipH:true,flipV:false});
});
test('mismatched geometry and unsupported fulfilment cannot silently enter checkout',()=>{
 for(const bad of [{...crop,imageUrl:'https://unapproved.invalid/upload.jpg'},{...crop,wallWidthCm:301},{...crop,walls:[200,200]},{...crop,doors:[{offsetCm:290,widthCm:80,heightCm:200}]},{...crop,installation:{ratePerSqft:0,total:0}},{...crop,openingsPlan:{excludedSqft:30}}])assert.ok('refused'in priceCart([{...base,crop:bad}],'IN'));
});

test('unverified production instructions are rejected instead of stripped at the OS handoff',()=>{
 for (const option of [{walls:[100,200]},{doors:[{offsetCm:20,widthCm:80,heightCm:200}]},{divisions:[100]},{concept:{slug:'room'}},{exclusivity:{years:1}},{rotation:90}]) {
  assert.ok('refused' in priceCart([{...base,crop:{...crop,...option}}],'IN'));
 }
 for (const placement of [{zoom:0,cropX:.5,cropY:.5},{zoom:1,cropX:2,cropY:.5}]) assert.ok('refused' in priceCart([{...base,placement}],'IN'));
});

test('native full-wall planning keeps multiple walls and marks without changing the billed area',async()=>{
 const {webOrderBody}=await import('./order-payload');
 const marked={...crop,planningMode:'full-wall',walls:[100,200],doors:[{offsetCm:20,widthCm:80,heightCm:200}],divisions:[100]};
 const q=priceCart([{...base,crop:marked}],'IN'),plain=priceCart([{...base,crop}],'IN');
 assert.ok(!('refused'in q));assert.ok(!('refused'in plain));assert.equal(q.totalMinor,plain.totalMinor);
 const b=webOrderBody({id:'MP-test',paymentId:'pay_test',amountInr:q.totalMinor/100,lines:q.lines,customer:{name:'QA',email:'qa@example.invalid',phone:'9999999999',address:'Test address',city:'Pune',state:'Maharashtra',postcode:'411001',countryCode:'IN',country:'India'}});
 assert.deepEqual(b.items[0].planningLayout,{mode:'full-wall',wallsCm:[100,200],marks:marked.doors,divisionsCm:[100]});assert.equal(b.items[0].widthMm,3000);
});
