import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Test runner is Node 25; application retains Node 20 type declarations.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {handleCommerce,tubeDimensions,fulfilment} from './checkout';
const customer={name:'Test Buyer',email:'buyer@example.test',phone:'9000000000',address:'Test address only',city:'Pune',state:'Maharashtra',pin:'411008'};
const stock={stock:1,qcReleased:true,weightKg:1,pickupPin:'411045',warehouse:'TEST ONLY',batch:'TEST',quote:{destinationPin:'411008',shippingPaise:10000,reference:'TEST ONLY',expiresAt:Date.now()+3600000,carrier:'Delhivery'}};
function harness(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync('drizzle/0000_volatile_phantom_reporter.sql','utf8'));
 const DB={prepare(sql:string){
  return {bind(...values:any[]){
   const s=db.prepare(sql);
   return {first:async()=>s.get(...values)||null,run:async()=>({meta:{changes:Number(s.run(...values).changes)}})};
  }};
 }};
 let captured=false,calls=0;const total=409900;
 const transport=async(input:any,init:any)=>{calls++;const path=new URL(input).pathname;let data;
  if(init.method==='POST'){const b=JSON.parse(init.body);assert.equal(b.amount,total);data={id:'order_test',amount:total,currency:'INR'};}
  else if(path.endsWith('/payments'))data={items:[{id:'pay_test',status:captured?'captured':'authorized',captured,amount:total,currency:'INR',amount_refunded:0,order_id:'order_test'}]};
  else if(path.includes('/payments/'))data={id:'pay_test',status:captured?'captured':'authorized',captured,amount:total,currency:'INR',amount_refunded:0,order_id:'order_test'};
  else data={status:captured?'paid':'attempted',amount:total,amount_paid:captured?total:0,currency:'INR'};
  return Response.json(data);
 };
 const env:any={DB,MIMIPIP_INDIA_CHECKOUT_ENABLED:'1',RAZORPAY_KEY_ID:'test',RAZORPAY_KEY_SECRET:'test-secret',RAZORPAY_WEBHOOK_SECRET:'webhook-test',PEACH_POP_FULFILMENT_JSON:JSON.stringify(stock)};
 const call=(action:string,data:any={},origin='https://mimipip.com')=>handleCommerce(new Request('https://mimipip.com/api/india-checkout/'+action,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({token:'a'.repeat(64),...data})}),env,transport as any);
 return {db,env,call,setCaptured:()=>{captured=true;},calls:()=>calls};
}
test('owner tube rule and missing fulfilment fail closed',()=>{assert.deepEqual(tubeDimensions(75,260),{lengthCm:77,widthCm:8.3,heightCm:8.3});assert.deepEqual(tubeDimensions(200,100),{lengthCm:102,widthCm:8.3,heightCm:8.3});assert.equal(fulfilment(undefined),null);assert.equal(fulfilment(JSON.stringify({...stock,weightKg:0})),null);assert.equal(fulfilment(JSON.stringify({...stock,quote:{...stock.quote,expiresAt:0}})),null);});
test('unknown stock creates no payment or order',async()=>{const h=harness();delete h.env.PEACH_POP_FULFILMENT_JSON;assert.equal((await h.call('create',{slug:'hopscotch-peach-pop',quantity:1,customer})).status,409);assert.equal(h.calls(),0);assert.equal(h.db.prepare('select count(*) as n from mimipip_orders').get()!.n,0);});
test('origin, PIN and quantity tampering rejected',async()=>{const h=harness();assert.equal((await h.call('create',{},'https://evil.test')).status,403);for(const data of [{quantity:2,customer},{quantity:1,customer:{...customer,pin:'411001'}}])assert.equal((await h.call('create',{slug:'hopscotch-peach-pop',...data})).status,400);assert.equal(h.calls(),0);});
test('server price, idempotency, stock reservation and captured-only confirmation',async()=>{const h=harness();const body={slug:'hopscotch-peach-pop',quantity:1,customer,amount:1};let r=await h.call('create',body);assert.equal(r.status,200);const first=await r.json();assert.equal(first.amount,409900);r=await h.call('create',body);assert.equal((await r.json()).orderId,first.orderId);assert.equal(h.calls(),1);assert.equal((await h.call('create',{...body,token:'b'.repeat(64)})).status,409);
 assert.equal((await (await h.call('status')).json()).paid,false);
 assert.equal((await h.call('verify',{razorpay_order_id:'order_test',razorpay_payment_id:'pay_test',razorpay_signature:'0'.repeat(64)})).status,400);
 h.setCaptured();const sig=createHmac('sha256','test-secret').update('order_test|pay_test').digest('hex');
 r=await h.call('verify',{razorpay_order_id:'order_test',razorpay_payment_id:'pay_test',razorpay_signature:sig});assert.equal(r.status,200);assert.equal((await r.json()).paid,true);assert.equal(h.db.prepare('select status from mimipip_orders').get()!.status,'paid');
 assert.equal((await (await h.call('status')).json()).paid,true);assert.equal((await h.call('status',{token:'c'.repeat(64)})).status,404);
});
test('reload recovery reconciles captured payment without browser callback',async()=>{const h=harness();await h.call('create',{slug:'hopscotch-peach-pop',quantity:1,customer});h.setCaptured();assert.equal((await (await h.call('status')).json()).paid,true);});
test('webhook validates raw signature and confirms only an owned captured payment',async()=>{const h=harness();h.env.RAZORPAY_WEBHOOK_SECRET='webhook-test';await h.call('create',{slug:'hopscotch-peach-pop',quantity:1,customer});h.setCaptured();const body=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:'pay_test',order_id:'order_test',captured:true,status:'captured',amount:409900,amount_refunded:0,currency:'INR'}}}});const req=(sig:string)=>new Request('https://mimipip.com/api/india-checkout/webhook',{method:'POST',body,headers:{'x-razorpay-signature':sig}});const provider=async()=>Response.json({status:'paid',amount:409900,amount_paid:409900,currency:'INR'});assert.equal((await handleCommerce(req('bad'),h.env,provider as any)).status,401);const sig=createHmac('sha256','webhook-test').update(body).digest('hex');assert.equal((await handleCommerce(req(sig),h.env,provider as any)).status,200);assert.equal(h.db.prepare('select status from mimipip_orders').get()!.status,'paid');assert.equal((await handleCommerce(req(sig),h.env,provider as any)).status,200);});
test('owner-authorized stock-or-JIT mode does not invent a finite stock count or QC release',()=>{const {stock:count,qcReleased,...other}=stock;const f=fulfilment(JSON.stringify({...other,availability:'stock_or_jit'}));assert.equal(f?.availability,'stock_or_jit');assert.equal(f?.stock,undefined);assert.equal(f?.qcReleased,undefined);});
