import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleSampleOrder} from './sample-order';
import {priceSample,sampleDesigns} from './samples';
import {webOrderBody} from './order-payload';
const body={token:'a'.repeat(64),name:'QA buyer',email:'qa@example.test',phone:'+919000000000',countryCode:'IN',design:{handle:'almond-blossom'},finishes:['Smooth Self-Adhesive'],address:{line1:'Test address only',city:'Pune',state:'Maharashtra',pincode:'411008'}};
const call=(b:unknown,origin='https://mimipip.com')=>handleSampleOrder(new Request('https://mimipip.com/api/sample-order',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(b)}),{});
test('sample adapter rejects foreign origin, unsupported finish and lost business billing before payment',async()=>{
 assert.equal((await call(body,'https://other.test')).status,403);
 for(const b of [{...body,countryCode:'US'},{...body,finishes:['Canvas']},{...body,finishes:['Smooth Self-Adhesive','Smooth Self-Adhesive']},{...body,gstin:'27AAACR5055K1Z7'},{...body,billingName:'Example business'},{...body,design:{handle:'not-mimi'}}])assert.equal((await call(b)).status,400);
});
test('sample durable validation refuses changed size or price before OS delivery',()=>{
 const line=priceSample({slug:'almond-blossom',qty:1},'IN');assert.ok(!('refused' in line));assert.ok(sampleDesigns.length>0);
 const customer={name:'QA',email:'qa@example.test',phone:'9000000000',address:'Test only',city:'Pune',state:'Maharashtra',postcode:'411008',countryCode:'IN',country:'India'};
 for(const changed of [{...line,lineMinor:1},{...line,widthCm:300},{...line,crop:{} as any}])assert.throws(()=>webOrderBody({id:'MP-TEST',paymentId:'pay_test',amountInr:200,customer,lines:[changed]}));
});

test('sample readiness stays closed without a verified production release',async()=>{
 const response=await handleSampleOrder(new Request('https://mimipip.com/api/sample-order/readiness'),{});
 assert.deepEqual(await response.json(),{open:false});
});

test('payment policy supports a sample modal or client navigation from any storefront document',async()=>{
 const {withCheckoutBrowserPolicy,offlineContentSecurityPolicy}=await import('../network-policy');
 const policy=offlineContentSecurityPolicy.replace("script-src 'self'","script-src https://www.googletagmanager.com 'self'");
 const r=withCheckoutBrowserPolicy(new Response('html',{headers:{'Content-Security-Policy':policy,'X-Robots-Tag':'noindex, nofollow'}}));
 const c=r.headers.get('Content-Security-Policy')!;
 assert.match(c,/script-src[^;]*https:\/\/checkout\.razorpay\.com/);assert.match(c,/frame-src https:\/\/api\.razorpay\.com https:\/\/checkout\.razorpay\.com/);
 assert.match(c,/connect-src[^;]*https:\/\/\*\.razorpay\.com/);assert.match(c,/www\.googletagmanager\.com/);assert.equal(r.headers.get('X-Robots-Tag'),'noindex, nofollow');
 assert.doesNotMatch(c,/'unsafe-eval'/);
});
