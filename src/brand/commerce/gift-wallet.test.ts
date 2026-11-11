import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error SQLite is present in the test runtime.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {activateGift,type GiftOrder} from './gift-card';
import {reserveGift,cardForCode} from './gift-ledger';
import {confirmedEmail,walletCards,walletBalance,walletSpend,walletTicket,readWalletTicket,cardForTicket} from './gift-wallet';

function harness(recipient='Shardul.Test@Example.test',purchaser='buyer@example.test'){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const f of ['0000_volatile_phantom_reporter','0001_typical_sheva_callister','0002_cart_checkout','0006_gift_cards','0007_gift_funding','0008_gift_card_reference'])db.exec(readFileSync(`drizzle/${f}.sql`,'utf8'));
 const DB={prepare(sql:string){return{bind(...v:any[]){const s=db.prepare(sql);return{first:async()=>s.get(...v)||null,run:async()=>({meta:{changes:Number(s.run(...v).changes)}}),all:async()=>({results:s.all(...v)})};}}}};
 const env:any={DB,MIMIPIP_GIFT_SECRET:'test-only-secret-'.repeat(3),STORE_PAY:{ready:()=>true,keyId:()=>'rzp_live_fixture',razorpay:async()=>({ok:true,data:{status:'paid',amount:100100,amount_paid:100100,currency:'INR'}})}};
 const now=Date.now();
 const add=async(id:string,orderId:string,to=recipient,amount=100100)=>{
  db.prepare("INSERT INTO mimipip_gift_orders(id,token_hash,fingerprint,status,amount,currency,presentation,purchaser_email,recipient_email,valid_days,provider_order_id,created_at) VALUES(?,?,?,'pending',?,'INR',?,?,?,0,?,?)").run(id,id,'x',amount,JSON.stringify({style:'little-sunshine',occasion:'Baby shower',recipientName:'R',senderName:'Roheena & Samir',amount:amount/100,currency:'INR'}),purchaser,to,orderId,now);
  const o=db.prepare('SELECT * FROM mimipip_gift_orders WHERE id=?').get(id) as GiftOrder;
  env.STORE_PAY.razorpay=async()=>({ok:true,data:{status:'paid',amount,amount_paid:amount,currency:'INR'}});
  assert.equal(await activateGift(env,o,{id:'pay_'+orderId.slice(6),status:'captured',captured:true,order_id:orderId,amount,currency:'INR',amount_refunded:0}),true);
 };
 const order=(id:string,amount=50000)=>db.prepare("INSERT INTO mimipip_orders(id,token_hash,status,amount,currency,lines,customer,shipping,fulfilment,created_at,updated_at) VALUES(?,?,'creating',?,'INR','[]','{}',0,'{}',?,?)").run(id,id,amount,now,now);
 return {db,env,add,order};
}
const A='MPG-'+'A'.repeat(24),B='MPG-'+'B'.repeat(24);

test('only a confirmed, signed-in email opens a wallet',()=>{
 assert.equal(confirmedEmail(null),null);
 assert.equal(confirmedEmail({email:'shardul@example.test'}),null);
 assert.equal(confirmedEmail({email:'shardul@example.test',email_confirmed_at:null}),null);
 assert.equal(confirmedEmail({email:'shardul@example.test',email_confirmed_at:''}),null);
 assert.equal(confirmedEmail({email:'not-an-email',email_confirmed_at:'2026-11-11T00:00:00Z'}),null);
 assert.equal(confirmedEmail({email:' Shardul@Example.test ',email_confirmed_at:'2026-11-11T00:00:00Z'}),'shardul@example.test');
});
test('the wallet holds the cards sent to that email, oldest first; another person and the purchaser see nothing',async()=>{
 const h=harness();await h.add(A,'order_aaaa');await h.add(B,'order_bbbb','someone.else@example.test');
 const mine=await walletCards(h.env.DB,'shardul.test@example.test');
 assert.deepEqual(mine.map(c=>c.id),[A]);assert.equal(walletBalance(mine),100100);assert.equal(mine[0].from,'Roheena & Samir');assert.equal(mine[0].occasion,'Baby shower');
 assert.equal((await walletCards(h.env.DB,'buyer@example.test')).length,0);
 assert.equal((await walletCards(h.env.DB,'shardul.test+1@example.test')).length,0);
 await assert.rejects(walletCards(h.env.DB,''));
 assert.equal(await walletSpend(h.env.DB,h.env.MIMIPIP_GIFT_SECRET,'someone.else@example.test',{cardId:A}),null);
});
test('spending from the wallet is the card itself: partial use leaves the rest, and wallet and code cannot both take the same balance',async()=>{
 const h=harness();await h.add(A,'order_aaaa');
 const w=await walletSpend(h.env.DB,h.env.MIMIPIP_GIFT_SECRET,'shardul.test@example.test');assert.ok(w);
 assert.equal((await cardForCode(h.env.DB,w!.reference))?.id,A);assert.equal((await cardForTicket(h.env.DB,h.env.MIMIPIP_GIFT_SECRET,w!.ticket))?.card.id,A);assert.equal((w as any).code,undefined);
 h.order('one',60000);await reserveGift(h.env.DB,'one',A,60000);
 assert.equal(walletBalance(await walletCards(h.env.DB,'shardul.test@example.test')),40100);
 h.order('two',40100);h.order('three',40100);
 const raced=await Promise.allSettled([reserveGift(h.env.DB,'two',A,40100),reserveGift(h.env.DB,'three',A,40100)]);
 assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await walletCards(h.env.DB,'shardul.test@example.test')).length,0);
 assert.equal(await walletSpend(h.env.DB,h.env.MIMIPIP_GIFT_SECRET,'shardul.test@example.test'),null);
});

test('a wallet ticket is signed, short-lived and bound to the card and the email; a reference that is not yours gets nothing',async()=>{
 const h=harness();await h.add(A,'order_aaaa');await h.add(B,'order_bbbb','someone.else@example.test');
 const S=h.env.MIMIPIP_GIFT_SECRET,now=Date.now();
 const t=await walletTicket(S,A,'shardul.test@example.test',now);
 assert.deepEqual(await readWalletTicket(S,t,now),{cardId:A,email:'shardul.test@example.test'});
 assert.equal(await readWalletTicket(S,t,now+61*60_000),null);
 assert.equal(await readWalletTicket('another-key-value-'.repeat(4),t,now),null);
 assert.equal(await readWalletTicket(S,t.slice(0,-1)+(t.endsWith('a')?'b':'a'),now),null);
 assert.equal(await readWalletTicket(S,'not-a-ticket',now),null);
 const {giftReference}=await import('./gift-ledger');
 assert.equal(await walletSpend(h.env.DB,S,'shardul.test@example.test',{cardId:B}),null);
 assert.equal(await walletSpend(h.env.DB,S,'shardul.test@example.test',{reference:await giftReference(S,B,0)}),null);
 assert.equal(await walletSpend(h.env.DB,S,'shardul.test@example.test',{reference:'MIMI-0000-0000'}),null);
 assert.equal((await walletSpend(h.env.DB,S,'shardul.test@example.test',{reference:(await giftReference(S,A,0)).toLowerCase()}))?.cardId,A);
 assert.equal(await cardForTicket(h.env.DB,S,await walletTicket(S,B,'shardul.test@example.test',now),now),null);
});
