import test from 'node:test';
import assert from 'node:assert/strict';
import {priceCart} from './checkout';
import {webOrderBody} from './order-payload';
import {designBriefRows} from './design-briefs';
const id='12345678-1234-4234-8234-123456789abc';
const art='https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/mimipip-print-files/custom/'+ 'a'.repeat(64)+'/'+id+'.png';
const assets={[id]:{id,art,width:3000,height:3000,material:'self_adhesive' as const,materialSlug:'self-adhesive-vinyl' as const}};
const upload={slug:'custom-wallpaper',qty:1,widthCm:243.84,heightCm:274.32,crop:{imageUrl:art.replace('/public/','/sign/')+'?token=short-lived',customArtworkId:id,wallWidthCm:243.84,wallHeightCm:274.32,offsetX:.5,offsetY:.5,zoom:1}};
test('uploaded artwork requires a server-resolved owned asset and uses approved rates',()=>{
 assert.ok('refused' in priceCart([upload],'IN'));
 const q=priceCart([upload],'IN',assets);assert.ok(!('refused' in q));assert.equal(q.totalMinor,1440000);assert.equal(q.lines[0].crop?.imageUrl,art);
 const us=priceCart([upload],'US',assets);assert.ok(!('refused' in us));assert.equal(us.totalMinor,72000);
 assert.ok('refused' in priceCart([{...upload,crop:{...upload.crop,imageUrl:'https://example.invalid/art.png'}}],'IN',assets));
});
test('bespoke prices and briefs are server-owned and appear in the paid service queue',()=>{
 const q=priceCart([{slug:'bespoke-customisation',qty:2,amount:1,crop:{bespoke:{note:'Warm woodland design',forTitle:'Nursery'}}}],'IN');
 assert.ok(!('refused' in q));assert.equal(q.totalMinor,200000);assert.equal(q.lines[0].kind,'design-service');
 const customer={name:'QA',email:'qa@example.invalid',phone:'9999999999',address:'Synthetic fixture',city:'Pune',state:'Maharashtra',postcode:'411001',countryCode:'IN',country:'India'};
 const row={id:'MP-0000000000000001',lines:JSON.stringify(q.lines),customer:JSON.stringify(customer),amount_inr:2000,fulfilment:'{}',created_at:1};
 const brief=designBriefRows(row)[0];assert.equal(brief.quantity,2);assert.equal(brief.amountInr,2000);assert.equal(brief.brief,'Warm woodland design');assert.equal(brief.status,'new');
 assert.equal(webOrderBody({id:row.id,paymentId:'pay_test',amountInr:2000,lines:q.lines,customer}).items.length,0);
 assert.ok('refused' in priceCart([{slug:'bespoke-customisation',qty:1,crop:{bespoke:{note:'x'}}}],'IN'));
});
test('mixed baskets allocate the captured payment between design work and printing without duplication',()=>{
 const q=priceCart([upload,{slug:'bespoke-customisation',qty:1,crop:{bespoke:{note:'Woodland palette'}}}],'IN',assets);assert.ok(!('refused'in q));
 const customer={name:'QA',email:'qa@example.invalid',phone:'9999999999',address:'Synthetic fixture',city:'Pune',state:'Maharashtra',postcode:'411001',countryCode:'IN',country:'India'};
 const body=webOrderBody({id:'MP-0000000000000001',paymentId:'pay_test',amountInr:15400,lines:q.lines,customer});
 assert.equal(body.items.length,1);assert.equal(body.items[0].lineRef,'1');assert.equal(body.amountInr,14400);assert.equal(body.payment.amountInr,14400);
 const briefs=designBriefRows({id:body.orderRef,lines:JSON.stringify(q.lines),customer:JSON.stringify(customer),amount_inr:15400,fulfilment:'{}',created_at:1});
 assert.equal(briefs[0].amountInr,1000);assert.equal(briefs[0].lineRef,'2');assert.equal(body.amountInr+briefs[0].amountInr,15400);
});
test('design queue refuses missing authentication and detects concurrent status updates',async()=>{
 const {handleDesignBriefs}=await import('./design-briefs');
 const req=new Request('https://mimipip.com/api/checkout/design-briefs');
 assert.equal((await handleDesignBriefs(req,{})).status,401);
 const row={id:'MP-0000000000000001',lines:JSON.stringify([{kind:'design-service',qty:1,lineMinor:100000,brief:{note:'Woodland'}}]),customer:'{}',amount_inr:1000,fulfilment:'{}',created_at:1};
 const queries:string[]=[];
 const env:any={STORE_PAY:{osTokenMatches:async(t:string)=>t==='fixture'},DB:{prepare:(sql:string)=>{queries.push(sql);return {bind(){return this;},first:async()=>row,all:async()=>({results:[row]}),run:async()=>({meta:{changes:0}})};}}};
 const get=await handleDesignBriefs(new Request(req,{headers:{'x-zyvorah-token':'fixture'}}),env);assert.equal(get.status,200);assert.equal((await get.json()).briefs.length,1);assert.match(queries[0],/status='paid'/);
 const update=await handleDesignBriefs(new Request(req,{method:'POST',headers:{'x-zyvorah-token':'fixture'},body:JSON.stringify({orderRef:row.id,lineRef:'1',status:'designing'})}),env);assert.equal(update.status,409);assert.match(queries.at(-1)!,/AND fulfilment=\?/);
});
