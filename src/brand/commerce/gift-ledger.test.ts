import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error SQLite is present in the test runtime.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {giftInput,activateGift,handleGiftCard,issueFundedGift,watchFundedOrders,fundedPaymentId,sweepGifts,releaseStrandedFundedClaim,type GiftOrder} from './gift-card';
import {giftCapability,giftHash,normalizedGiftCode,cardForCode,reserveGift,abandonUnpresentedOrder,recoverCreatingGiftOrders} from './gift-ledger';
import {queueGiftEmails} from './gift-email';
function harness(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const f of ['0000_volatile_phantom_reporter','0001_typical_sheva_callister','0002_cart_checkout','0006_gift_cards','0007_gift_funding'])db.exec(readFileSync(`drizzle/${f}.sql`,'utf8'));
 const DB:any={prepare(sql:string){return{bind(...v:any[]){const s=db.prepare(sql);return{sql,first:async()=>s.get(...v)||null,run:async()=>({meta:{changes:Number(s.run(...v).changes)}}),all:async()=>({results:s.all(...v)})};}}},
  failBatchAt:-1,
  async batch(stmts:any[]){db.exec('BEGIN');try{for(let i=0;i<stmts.length;i++){if(i===DB.failBatchAt)throw new Error('interrupted');await stmts[i].run();}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}};
 const id='MPG-'+'A'.repeat(24);const now=Date.now();
 db.prepare("INSERT INTO mimipip_gift_orders(id,token_hash,fingerprint,status,amount,currency,presentation,purchaser_email,recipient_email,valid_days,provider_order_id,created_at) VALUES(?,?,?,'pending',100100,'INR',?,?,?,0,'order_fixture',?)").run(id,'x','x',JSON.stringify({style:'blue-daisy',occasion:'Baby shower',recipientName:'Test Recipient',senderName:'Test Sender',amount:1001,currency:'INR',message:'A little love.'}),'buyer@example.test','recipient@example.test',now);
 const o=()=>db.prepare('SELECT * FROM mimipip_gift_orders WHERE id=?').get(id) as GiftOrder;
 const payment={id:'pay_fixture',status:'captured',captured:true,order_id:'order_fixture',amount:100100,currency:'INR',amount_refunded:0};
 const env:any={DB,MIMIPIP_GIFTS_ENABLED:'1',MIMIPIP_GIFT_SECRET:'test-only-secret-'.repeat(3),RESEND_API_KEY:'test-only-no-network',STORE_PAY:{ready:()=>true,keyId:()=>'rzp_live_fixture',giftReady:async()=>true,razorpay:async()=>({ok:true,data:{status:'paid',amount:100100,amount_paid:100100,currency:'INR'}})}};
 const order=(id:string,amount=100000,currency='INR')=>db.prepare("INSERT INTO mimipip_orders(id,token_hash,status,amount,currency,lines,customer,shipping,fulfilment,created_at,updated_at) VALUES(?,?,'creating',?,?,?, ?,0,'{}',?,?)").run(id,id,amount,currency,'[]','{}',now,now);
 return{db,env,id,o,payment,order,now};
}
test('gift values follow approved INR limits and reject unsupported currency',()=>{
 const b={currency:'INR',style:'blue-daisy',occasion:'Baby shower',amount:1001,purchaserEmail:'buyer@example.test',recipientName:'Recipient',senderName:'Sender'};
 for(const amount of [500,1001,2001,5001,10001,20001,50000])assert.equal(giftInput({...b,amount}).minor,amount*100);
 for(const amount of [499.99,50000.01,NaN,Infinity,1001.001])assert.throws(()=>giftInput({...b,amount}));
 assert.throws(()=>giftInput({...b,currency:'USD'}));
});
test('only independently confirmed exact captured payment activates; replay mints one balance and email',async()=>{
 const h=harness();for(const patch of [{amount:1},{currency:'USD'},{captured:false},{amount_refunded:1},{order_id:'order_other'},{status:'authorized'}])assert.equal(await activateGift(h.env,h.o(),{...h.payment,...patch}),false);
 assert.equal(h.db.prepare('SELECT count(*) n FROM mimipip_gift_cards').get().n,0);
 await Promise.all([activateGift(h.env,h.o(),h.payment),activateGift(h.env,h.o(),h.payment)]);
 assert.equal(h.db.prepare('SELECT count(*) n FROM mimipip_gift_cards').get().n,1);assert.equal(h.db.prepare('SELECT count(*) n FROM mimipip_gift_email').get().n,1);
 const c=h.db.prepare('SELECT * FROM mimipip_gift_cards').get();assert.equal(c.balance_minor,100100);assert.equal(c.expires_at,null);
 const code=await giftCapability(h.env.MIMIPIP_GIFT_SECRET,h.id,'code');assert.equal((await cardForCode(h.env.DB,code))?.id,h.id);assert.notEqual(c.code_hash,code);assert.equal(c.code_hash,await giftHash(normalizedGiftCode(code)));
});
test('competing reservations cannot overspend, completed use is immutable, remainder stays available',async()=>{
 const h=harness();await activateGift(h.env,h.o(),h.payment);h.order('first');h.order('second');
 const results=await Promise.allSettled([reserveGift(h.env.DB,'first',h.id,80000),reserveGift(h.env.DB,'second',h.id,80000)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(h.db.prepare('SELECT balance_minor FROM mimipip_gift_cards').get().balance_minor,20100);
 h.db.prepare("UPDATE mimipip_orders SET status='paid' WHERE id='first'").run();assert.equal(h.db.prepare("SELECT state FROM mimipip_gift_tenders WHERE order_id='first'").get().state,'redeemed');
 assert.throws(()=>h.db.prepare("DELETE FROM mimipip_orders WHERE id='first'").run());
 await reserveGift(h.env.DB,'second',h.id,20100);assert.equal(h.db.prepare('SELECT balance_minor FROM mimipip_gift_cards').get().balance_minor,0);
});
test('only an unpresented checkout releases reservation; pending provider order stays held',async()=>{
 const h=harness();await activateGift(h.env,h.o(),h.payment);h.order('first');await reserveGift(h.env.DB,'first',h.id,80000);await abandonUnpresentedOrder(h.env.DB,'first');assert.equal(h.db.prepare('SELECT balance_minor FROM mimipip_gift_cards').get().balance_minor,100100);
 h.order('second');await reserveGift(h.env.DB,'second',h.id,80000);h.db.prepare("UPDATE mimipip_orders SET status='pending',razorpay_order_id='order_second' WHERE id='second'").run();await abandonUnpresentedOrder(h.env.DB,'second');assert.equal(h.db.prepare('SELECT balance_minor FROM mimipip_gift_cards').get().balance_minor,20100);
});
test('USD, suspended and expired cards cannot reserve INR gift balance',async()=>{
 const h=harness();await activateGift(h.env,h.o(),h.payment);h.order('usd',80000,'USD');await assert.rejects(reserveGift(h.env.DB,'usd',h.id,50000));h.order('inr');h.db.exec("UPDATE mimipip_gift_cards SET status='suspended'");await assert.rejects(reserveGift(h.env.DB,'inr',h.id,50000));h.db.exec("UPDATE mimipip_gift_cards SET status='active',expires_at=1");await assert.rejects(reserveGift(h.env.DB,'inr',h.id,50000));
});
test('email lease prevents duplicate send; ambiguous retries preserve exact provider idempotency payload',async()=>{
 const h=harness();await activateGift(h.env,h.o(),h.payment);const sent:any[]=[];const send:any=async(_u:any,init:any)=>{sent.push(init);throw new Error('ambiguous network timeout');};
 await Promise.all([queueGiftEmails(h.env,send,h.now+1000),queueGiftEmails(h.env,send,h.now+1000)]);assert.equal(sent.length,1);
 await queueGiftEmails(h.env,async(_u,init)=>{sent.push(init);return Response.json({id:'email_fixture'});},h.now+301001);
 assert.equal(sent.length,2);assert.equal(sent[0].body,sent[1].body);assert.equal(sent[0].headers['Idempotency-Key'],sent[1].headers['Idempotency-Key']);assert.equal(h.db.prepare('SELECT state FROM mimipip_gift_email').get().state,'accepted');
 await queueGiftEmails(h.env,send,h.now+700000);assert.equal(sent.length,2);
});
test('an ambiguous email past the idempotency window holds for review instead of resending',async()=>{
 const h=harness();await activateGift(h.env,h.o(),h.payment);h.db.prepare('UPDATE mimipip_gift_email SET first_attempt_at=?').run(h.now-24*3600000);await queueGiftEmails(h.env,async()=>{throw new Error('must not send');},h.now);assert.equal(h.db.prepare('SELECT state FROM mimipip_gift_email').get().state,'review');
});
test('protected card rejects unknown viewing credentials and cross-origin mutation',async()=>{
 const h=harness();const r=await handleGiftCard(new Request('https://mimipip.com/api/gift-card/print?id='+h.id+'&key='+'a'.repeat(64)),h.env);assert.equal(r.status,404);
 const cross=await handleGiftCard(new Request('https://mimipip.com/api/gift-card/check',{method:'POST',headers:{origin:'https://other.example','content-type':'application/json'},body:'{}'}),h.env);assert.equal(cross.status,403);
});

test('full gift settlement is atomic with the debit even before the request continues',async()=>{const h=harness();await activateGift(h.env,h.o(),h.payment);h.order('atomic',80000);await reserveGift(h.env.DB,'atomic',h.id,80000);const o=h.db.prepare("SELECT status,amount_inr FROM mimipip_orders WHERE id='atomic'").get();assert.equal(o.status,'paid');assert.equal(o.amount_inr,800);assert.equal(h.db.prepare("SELECT state FROM mimipip_gift_tenders WHERE order_id='atomic'").get().state,'redeemed');});

test('an interrupted unpresented mixed checkout restores balance after grace, and late publication cannot revive it',async()=>{
 const h=harness();await activateGift(h.env,h.o(),h.payment);h.order('abandoned',200000);await reserveGift(h.env.DB,'abandoned',h.id,100100,h.now);
 await recoverCreatingGiftOrders(h.env.DB,h.now+299999);assert.equal(h.db.prepare('SELECT balance_minor FROM mimipip_gift_cards').get().balance_minor,0);
 await recoverCreatingGiftOrders(h.env.DB,h.now+300001);assert.equal(h.db.prepare('SELECT balance_minor FROM mimipip_gift_cards').get().balance_minor,100100);
 assert.equal(Number(h.db.prepare("UPDATE mimipip_orders SET status='pending',razorpay_order_id='order_late' WHERE id='abandoned' AND status='creating'").run().changes),0);
 assert.equal(h.db.prepare("SELECT * FROM mimipip_orders WHERE id='abandoned'").get(),undefined);
});
test('cleanup never releases a published provider checkout or a settled full-gift order',async()=>{
 const h=harness();await activateGift(h.env,h.o(),h.payment);h.order('presented',200000);await reserveGift(h.env.DB,'presented',h.id,100100,h.now);h.db.exec("UPDATE mimipip_orders SET status='pending',razorpay_order_id='order_presented' WHERE id='presented'");await recoverCreatingGiftOrders(h.env.DB,h.now+86400000);assert.equal(h.db.prepare('SELECT balance_minor FROM mimipip_gift_cards').get().balance_minor,0);assert.ok(h.db.prepare("SELECT id FROM mimipip_orders WHERE id='presented'").get());
});
test('an abandoned part-gift checkout returns its balance only when Razorpay shows no payment',async()=>{
 const {releaseUnpaidGiftOrder,releaseStaleGiftOrders,GIFT_RESERVATION_TTL_MS}=await import('./gift-ledger');
 const h=harness();await activateGift(h.env,h.o(),h.payment);
 const present=async(id:string,created=h.now)=>{h.order(id);h.db.prepare('UPDATE mimipip_orders SET created_at=? WHERE id=?').run(created,id);await reserveGift(h.env.DB,id,h.id,20000);h.db.prepare("UPDATE mimipip_orders SET status='pending',razorpay_order_id=? WHERE id=?").run('order_'+id,id);};
 const row=(id:string)=>h.db.prepare('SELECT * FROM mimipip_orders WHERE id=?').get(id);
 const balance=()=>h.db.prepare('SELECT balance_minor FROM mimipip_gift_cards').get().balance_minor;
 await present('inflight');assert.equal(balance(),80100);
 assert.equal(await releaseUnpaidGiftOrder(h.env.DB,async()=>({items:[{status:'created'}]}),row('inflight')),'paid');
 assert.equal(balance(),80100);assert.equal(row('inflight').status,'pending');
 await present('nobody');assert.equal(balance(),60100);
 assert.equal(await releaseUnpaidGiftOrder(h.env.DB,async()=>({items:[]}),row('nobody')),'released');
 assert.equal(balance(),80100);assert.equal(row('nobody').status,'expired');
 assert.equal(h.db.prepare("SELECT count(*) n FROM mimipip_gift_tenders WHERE order_id='nobody'").get().n,0);
 await present('fresh');await present('stale',h.now-GIFT_RESERVATION_TTL_MS-1000);assert.equal(balance(),40100);
 await releaseStaleGiftOrders(h.env.DB,async()=>({items:[]}),h.now);
 assert.equal(balance(),60100);assert.equal(row('fresh').status,'pending');assert.equal(row('stale').status,'expired');
 // A redeemed (paid) order is never released.
 h.db.prepare("UPDATE mimipip_orders SET status='paid' WHERE id='fresh'").run();
 assert.equal(await releaseUnpaidGiftOrder(h.env.DB,async()=>({items:[]}),row('fresh')),'kept');assert.equal(balance(),60100);
});
test('a payment captured on a test key never creates a spendable card or queues an email',async()=>{
 const h=harness();h.env.STORE_PAY={...h.env.STORE_PAY,keyId:()=>'rzp_test_fixture'};
 assert.equal(await activateGift(h.env,h.o(),h.payment),false);
 assert.equal(h.db.prepare('SELECT count(*) n FROM mimipip_gift_cards').get().n,0);
 assert.equal(h.db.prepare('SELECT count(*) n FROM mimipip_gift_email').get().n,0);
 const o=h.o();assert.equal(o.status,'review');assert.equal(o.last_error,'gateway_not_live');
 // Even if the key later turns live, a gift held for a test payment never activates.
 h.env.STORE_PAY={...h.env.STORE_PAY,keyId:()=>'rzp_live_fixture'};assert.equal(await activateGift(h.env,h.o(),h.payment),false);
 assert.equal(h.db.prepare('SELECT count(*) n FROM mimipip_gift_cards').get().n,0);
});
test('an unreadable key leaves the gift pending and unissued; a pending gift with no payment is untouched',async()=>{
 const h=harness();h.env.STORE_PAY={...h.env.STORE_PAY,keyId:()=>null};
 assert.equal(await activateGift(h.env,h.o(),h.payment),false);assert.equal(h.o().status,'pending');
 assert.equal(h.db.prepare('SELECT count(*) n FROM mimipip_gift_cards').get().n,0);
 const {sweepGifts}=await import('./gift-card');h.env.STORE_PAY={...h.env.STORE_PAY,keyId:()=>'rzp_test_fixture',razorpay:async()=>({ok:true,data:{items:[]}})};
 await sweepGifts(h.env);const o=h.o();assert.equal(o.status,'pending');assert.equal(o.last_error,null);
});
test('gift purchasing and email delivery stay closed unless the gateway is live',async()=>{
 const {giftReady}=await import('./gift-card');
 const h=harness();assert.equal(await giftReady(h.env),true);
 const r=await(await handleGiftCard(new Request('https://mimipip.com/api/gift-card/readiness'),h.env)).json();assert.equal(r.open,true);assert.equal(r.gateway,'live');
 h.env.STORE_PAY={...h.env.STORE_PAY,keyId:()=>'rzp_test_fixture'};assert.equal(await giftReady(h.env),false);
 const t=await(await handleGiftCard(new Request('https://mimipip.com/api/gift-card/readiness'),h.env)).json();assert.equal(t.open,false);assert.equal(t.gateway,'test');assert.ok(!JSON.stringify(t).includes('fixture'));
 // An active card whose email is due is not mailed while the key is not live.
 h.env.STORE_PAY={...h.env.STORE_PAY,keyId:()=>'rzp_live_fixture'};await activateGift(h.env,h.o(),h.payment);
 h.env.STORE_PAY={...h.env.STORE_PAY,keyId:()=>'rzp_test_fixture'};let sent=0;
 await queueGiftEmails(h.env,(async()=>{sent++;return Response.json({id:'x'});}) as any,h.now+1000);
 assert.equal(sent,0);assert.equal(h.db.prepare('SELECT state,first_attempt_at FROM mimipip_gift_email').get().state,'pending');
});

function fundedHarness(payments:any[]=[],order:any={status:'attempted',amount_paid:0}){
 const h=harness();const calls:string[]=[];
 h.env.STORE_PAY={...h.env.STORE_PAY,osTokenMatches:async(t:string)=>t==='os-token',razorpay:async(path:string)=>{calls.push(path);return path.endsWith('/payments')?{ok:true,data:{items:payments}}:{ok:true,data:{amount:100100,currency:'INR',...order}};}};
 const body={giftId:h.id,providerOrderId:'order_fixture',amountMinor:100100,fundedBy:'director:roheena',reference:'Receivable from Roheena Nagpal'};
 const mails:any[]=[];const mailer:any=async(_u:any,init:any)=>{mails.push(init);return Response.json({id:'email_fixture'});};
 const issue=(b:any=body)=>issueFundedGift(h.env,b,mailer);
 return {...h,calls,body,mails,issue};
}
const count=(h:any,t:string)=>h.db.prepare(`SELECT count(*) n FROM ${t}`).get().n;
test('a director-funded gift mints exactly one card and one email, and a repeat returns the same gift',async()=>{
 const h=fundedHarness();
 const [a,b]=await Promise.all([h.issue(),h.issue()]);
 assert.equal(a.status,200);assert.equal(b.status,200);
 assert.equal(count(h,'mimipip_gift_cards'),1);assert.equal(count(h,'mimipip_gift_email'),1);assert.equal(count(h,'mimipip_gift_funding'),1);
 assert.equal(h.o().status,'active');assert.equal(h.o().payment_id,fundedPaymentId('director:roheena',h.id));
 const code=await giftCapability(h.env.MIMIPIP_GIFT_SECRET,h.id,'code');assert.equal((await cardForCode(h.env.DB,code))?.balance_minor,100100);
 assert.equal((await h.issue()).status,200);assert.equal(count(h,'mimipip_gift_cards'),1);
 assert.equal(h.mails.length,1);assert.equal(h.db.prepare('SELECT state FROM mimipip_gift_email').get().state,'accepted');
 const m=JSON.parse(h.mails[0].body);assert.match(m.text,/Shopping code: /);assert.equal(m.to[0],'recipient@example.test');
});
test('a gift with any live payment attempt, or a paid order, is never also funded',async()=>{
 for(const status of ['created','authorized','captured','refunded']){const h=fundedHarness([{id:'pay_x',status}]);assert.equal((await h.issue()).status,409);assert.equal(count(h,'mimipip_gift_cards'),0);assert.equal(h.o().payment_id,null);}
 const paid=fundedHarness([],{status:'paid',amount_paid:100100});assert.equal((await paid.issue()).status,409);assert.equal(count(paid,'mimipip_gift_cards'),0);
 const failed=fundedHarness([{id:'pay_f',status:'failed'}]);assert.equal((await failed.issue()).status,200);
});
test('funding must match the pending gift exactly and come from a named director on a live key',async()=>{
 const h=fundedHarness();
 for(const patch of [{amountMinor:100000},{providerOrderId:'order_other'},{fundedBy:'staff:savita'},{giftId:'MPG-'+'B'.repeat(24)},{reference:''}]){const r=await h.issue({...h.body,...patch});assert.ok(r.status===400||r.status===409);}
 const test=fundedHarness();test.env.STORE_PAY.keyId=()=>'rzp_test_fixture';assert.equal((await test.issue()).status,409);
 assert.equal(count(h,'mimipip_gift_cards')+count(test,'mimipip_gift_cards'),0);
});
test('a payment that lands later on a funded gift mints nothing and is recorded against the funding',async()=>{
 const h=fundedHarness();await h.issue();
 assert.equal(await activateGift(h.env,h.o(),h.payment),true);assert.equal(count(h,'mimipip_gift_cards'),1);assert.equal(count(h,'mimipip_gift_email'),1);
 assert.equal(h.o().payment_id,fundedPaymentId('director:roheena',h.id));
 const capture={id:'pay_late',status:'captured',captured:true,order_id:'order_fixture',amount:100100,currency:'INR',amount_refunded:0};
 h.env.STORE_PAY.razorpay=async(path:string)=>path.endsWith('/payments')?{ok:true,data:{items:[capture]}}:{ok:true,data:{status:'paid',amount:100100,amount_paid:100100,currency:'INR'}};
 await watchFundedOrders(h.env,Date.now()+7_200_000);
 assert.equal(h.db.prepare('SELECT late_payment_id FROM mimipip_gift_funding').get().late_payment_id,'pay_late');assert.equal(h.o().last_error,'settled_by_payment:pay_late');
});
test('only the OS token may fund a gift',async()=>{
 const h=fundedHarness();delete h.env.RESEND_API_KEY; // no mail leaves a test: the queue waits without a key
 const call=(token?:string)=>handleGiftCard(new Request('https://mimipip.com/api/gift-card/issue-funded',{method:'POST',headers:{'content-type':'application/json',...(token?{'x-zyvorah-token':token}:{})},body:JSON.stringify(h.body)}),h.env);
 assert.equal((await call()).status,401);assert.equal((await call('wrong')).status,401);assert.equal(count(h,'mimipip_gift_cards'),0);
 const r=await call('os-token');assert.equal(r.status,200);assert.equal((await r.json()).status,'active');
});

test('review #58 (1): an authorised payment does not settle a funding, and the watch keeps watching until a verified capture',async()=>{
 const h=fundedHarness();await h.issue();
 let items:any[]=[{id:'pay_auth',status:'authorized',captured:false,order_id:'order_fixture',amount:100100,currency:'INR',amount_refunded:0}];let order:any={status:'attempted',amount_paid:0,currency:'INR'};
 h.env.STORE_PAY.razorpay=async(path:string)=>path.endsWith('/payments')?{ok:true,data:{items}}:{ok:true,data:order};
 const late=()=>h.db.prepare('SELECT late_payment_id FROM mimipip_gift_funding').get().late_payment_id;
 await watchFundedOrders(h.env,Date.now()+7_200_000);assert.equal(late(),null);assert.equal(h.o().last_error,null);
 // A capture of a different amount or order, or a refunded one, settles nothing either.
 for(const bad of [{order_id:'order_other'},{captured:false}]){items=[{id:'pay_bad',status:'captured',captured:true,order_id:'order_fixture',amount:100100,currency:'INR',amount_refunded:0,...bad}];order={status:'paid',amount_paid:100100,currency:'INR'};h.db.exec('UPDATE mimipip_gift_funding SET checked_at=0');await watchFundedOrders(h.env,Date.now()+7_200_000);assert.equal(late(),null);}
 // A capture whose order does not read paid is money taken that cannot settle: it is recorded for review, not ignored.
 items=[{id:'pay_ok',status:'captured',captured:true,order_id:'order_fixture',amount:100100,currency:'INR',amount_refunded:0}];order={status:'attempted',amount_paid:0,currency:'INR'};h.db.exec('UPDATE mimipip_gift_funding SET checked_at=0');await watchFundedOrders(h.env,Date.now()+7_200_000);
 assert.equal(late(),'pay_ok');assert.equal(h.o().last_error,'late_payment_review:pay_ok:100100:INR:refunded=0');assert.equal(count(h,'mimipip_gift_cards'),1);
});
test('review #58 (2): an interrupted funded issue leaves the gift untouched, and a later real payment still activates it once',async()=>{
 const h=fundedHarness();
 for(const at of [1,2]){h.env.DB.failBatchAt=at;await assert.rejects(h.issue());
  assert.equal(h.o().status,'pending');assert.equal(h.o().payment_id,null);assert.equal(count(h,'mimipip_gift_funding'),0);assert.equal(count(h,'mimipip_gift_cards'),0);}
 h.env.DB.failBatchAt=-1;
 h.env.STORE_PAY.razorpay=async(path:string)=>path.endsWith('/payments')?{ok:true,data:{items:[h.payment]}}:{ok:true,data:{status:'paid',amount:100100,amount_paid:100100,currency:'INR'}};
 assert.equal((await h.issue()).status,409);
 await sweepGifts({...h.env,RESEND_API_KEY:undefined});
 assert.equal(h.o().status,'active');assert.equal(h.o().payment_id,'pay_fixture');assert.equal(count(h,'mimipip_gift_cards'),1);assert.equal(count(h,'mimipip_gift_funding'),0);
});
test('review #58 (2): a funded claim stranded by an older build is given back, so the real payment activates the gift',async()=>{
 const h=fundedHarness();
 h.db.prepare('UPDATE mimipip_gift_orders SET payment_id=? WHERE id=?').run(fundedPaymentId('director:roheena',h.id),h.id);
 h.db.prepare("INSERT INTO mimipip_gift_funding(gift_id,funded_by,reference,amount_minor,provider_order_id,issued_at) VALUES(?,'director:roheena','x',100100,'order_fixture',1)").run(h.id);
 h.env.STORE_PAY.razorpay=async(path:string)=>path.endsWith('/payments')?{ok:true,data:{items:[h.payment]}}:{ok:true,data:{status:'paid',amount:100100,amount_paid:100100,currency:'INR'}};
 await sweepGifts({...h.env,RESEND_API_KEY:undefined});
 assert.equal(h.o().status,'active');assert.equal(h.o().payment_id,'pay_fixture');assert.equal(count(h,'mimipip_gift_cards'),1);assert.equal(count(h,'mimipip_gift_funding'),0);
});

test('a funded face value is written with the card in one step; until then a card payment of the original still activates it as bought',async()=>{
 const h=fundedHarness();const body={...h.body,faceMinor:90001};
 // Interrupted: the amount is unchanged and nothing is claimed.
 h.env.DB.failBatchAt=2;await assert.rejects(h.issue(body));h.env.DB.failBatchAt=-1;
 assert.equal(h.o().amount,100100);assert.equal(JSON.parse(h.o().presentation).amount,1001);assert.equal(h.o().payment_id,null);
 const r=await h.issue(body);assert.equal(r.status,200);
 assert.equal(h.o().amount,90001);assert.equal(JSON.parse(h.o().presentation).amount,900.01);
 assert.equal(h.db.prepare('SELECT balance_minor FROM mimipip_gift_cards').get().balance_minor,90001);
 assert.equal(h.db.prepare('SELECT amount_minor FROM mimipip_gift_funding').get().amount_minor,90001);
 assert.match(JSON.parse(h.mails[0].body).text,/Value: ₹900\.01/);
 assert.equal((await h.issue(body)).status,200);assert.equal(count(h,'mimipip_gift_cards'),1);
 assert.equal((await h.issue({...body,faceMinor:90002})).status,409);
 for(const faceMinor of [100,5_000_001,1.5])assert.equal((await fundedHarness().issue({...h.body,faceMinor})).status,400);
});
test('a capture of the original amount on a funded gift with a different face value is recorded for review, never ignored',async()=>{
 const h=fundedHarness();await h.issue({...h.body,faceMinor:90001});
 const capture={id:'pay_orig',status:'captured',captured:true,order_id:'order_fixture',amount:100100,currency:'INR',amount_refunded:0};
 h.env.STORE_PAY.razorpay=async(path:string)=>path.endsWith('/payments')?{ok:true,data:{items:[capture]}}:{ok:true,data:{status:'paid',amount:100100,amount_paid:100100,currency:'INR'}};
 await watchFundedOrders(h.env,Date.now()+7_200_000);
 assert.equal(h.db.prepare('SELECT late_payment_id FROM mimipip_gift_funding').get().late_payment_id,'pay_orig');
 assert.equal(h.o().last_error,'late_payment_review:pay_orig:100100:INR:refunded=0');
 assert.equal(count(h,'mimipip_gift_cards'),1);assert.equal(h.db.prepare('SELECT balance_minor FROM mimipip_gift_cards').get().balance_minor,90001);
});

test('two funded calls racing with different face values: exactly one succeeds, and only for the value the card holds',async()=>{
 const h=fundedHarness();
 const [a,b]=await Promise.all([h.issue({...h.body,faceMinor:90001}),h.issue({...h.body,faceMinor:80001})]);
 const ok=[a,b].filter(r=>r.status===200);assert.equal(ok.length,1);
 const held=h.db.prepare('SELECT balance_minor FROM mimipip_gift_cards').get().balance_minor;
 assert.equal(ok[0].body.faceMinor,held);assert.equal(h.o().amount,held);assert.equal(count(h,'mimipip_gift_cards'),1);
 const loser=[a,b].find(r=>r.status!==200)!;assert.equal(loser.status,409);
 // Sequential repeats agree too: the same value returns the gift, any other value is refused.
 assert.equal((await h.issue({...h.body,faceMinor:held})).status,200);assert.equal((await h.issue({...h.body,faceMinor:held===90001?80001:90001})).status,409);
});
test('the late payment and its review note are written together: an interruption leaves neither, and the next pass records both',async()=>{
 const h=fundedHarness();await h.issue({...h.body,faceMinor:90001});
 const capture={id:'pay_orig',status:'captured',captured:true,order_id:'order_fixture',amount:100100,currency:'INR',amount_refunded:0};
 h.env.STORE_PAY.razorpay=async(path:string)=>path.endsWith('/payments')?{ok:true,data:{items:[capture]}}:{ok:true,data:{status:'paid',amount:100100,amount_paid:100100,currency:'INR'}};
 h.env.DB.failBatchAt=1;await assert.rejects(watchFundedOrders(h.env,Date.now()+7_200_000));h.env.DB.failBatchAt=-1;
 assert.equal(h.db.prepare('SELECT late_payment_id FROM mimipip_gift_funding').get().late_payment_id,null);assert.equal(h.o().last_error,null);
 h.db.exec('UPDATE mimipip_gift_funding SET checked_at=0');await watchFundedOrders(h.env,Date.now()+7_200_000);
 assert.equal(h.db.prepare('SELECT late_payment_id FROM mimipip_gift_funding').get().late_payment_id,'pay_orig');assert.equal(h.o().last_error,'late_payment_review:pay_orig:100100:INR:refunded=0');
});
test('giving back a stranded funded claim is one transaction: interrupted, the claim and its funding row both stay for the next pass',async()=>{
 const h=fundedHarness();
 h.db.prepare('UPDATE mimipip_gift_orders SET payment_id=? WHERE id=?').run(fundedPaymentId('director:roheena',h.id),h.id);
 h.db.prepare("INSERT INTO mimipip_gift_funding(gift_id,funded_by,reference,amount_minor,provider_order_id,issued_at) VALUES(?,'director:roheena','x',100100,'order_fixture',1)").run(h.id);
 h.env.DB.failBatchAt=1;await assert.rejects(releaseStrandedFundedClaim(h.env,h.o()));h.env.DB.failBatchAt=-1;
 assert.equal(h.o().payment_id,fundedPaymentId('director:roheena',h.id));assert.equal(count(h,'mimipip_gift_funding'),1);
 await releaseStrandedFundedClaim(h.env,h.o());assert.equal(h.o().payment_id,null);assert.equal(count(h,'mimipip_gift_funding'),0);
});
