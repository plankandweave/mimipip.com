import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node test runner supports SQLite.
import {DatabaseSync} from 'node:sqlite';
import {enqueueOrderEmail,sendOrderEmails,orderEmailPayload} from './order-email';
const order={id:'MP-TEST',status:'paid',amount:490000,shipping:0,currency:'INR',customer:JSON.stringify({name:'Buyer',email:'buyer@example.test',address:'Private address'}),lines:JSON.stringify([{name:'Peach Pop',qty:1,lineMinor:490000}]),fulfilment:'{}'};
function harness(){
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE mimipip_orders(id TEXT PRIMARY KEY,status TEXT,amount INTEGER,shipping INTEGER,currency TEXT,customer TEXT,lines TEXT,fulfilment TEXT)');
 db.prepare('INSERT INTO mimipip_orders VALUES (?,?,?,?,?,?,?,?)').run(order.id,order.status,order.amount,order.shipping,order.currency,order.customer,order.lines,order.fulfilment);
 const DB={prepare(sql:string){return{bind(...v:any[]){return{run:async()=>({meta:{changes:Number(db.prepare(sql).run(...v).changes)}}),first:async()=>db.prepare(sql).get(...v)||null,all:async()=>({results:db.prepare(sql).all(...v)})}}}}};
 const env:any={DB,RESEND_API_KEY:'fake-key',STORE_PAY:{keyId:()=> 'rzp_live_fixture'}};return{db,env};
}
test('inclusive receipt is addressed to buyer; registry gift hides recipient details',()=>{
 const m=orderEmailPayload(order);assert.deepEqual(m.to,['buyer@example.test']);assert.match(m.text,/₹4,900/);assert.match(m.text,/Delivery: Free/);assert.doesNotMatch(m.text,/4,152|747|Private address/);
 const gift=orderEmailPayload({...order,fulfilment:JSON.stringify({registry:{name:'Gift buyer',email:'giver@example.test'}})});assert.deepEqual(gift.to,['giver@example.test']);assert.doesNotMatch(gift.text,/Private address|buyer@example.test/);
 assert.throws(()=>orderEmailPayload({...order,status:'pending'}));
});
test('one durable confirmation despite concurrent sweeps and repeated enqueue',async()=>{
 const {db,env}=harness();await enqueueOrderEmail(env.DB,order);await enqueueOrderEmail(env.DB,order);
 const sent:any[]=[];const send=async(_u:any,i:any)=>{sent.push(i);return Response.json({id:'email-ok'})};
 await Promise.all([sendOrderEmails(env,send as any,1000),sendOrderEmails(env,send as any,1000)]);await sendOrderEmails(env,send as any,400000);
 assert.equal(sent.length,1);assert.equal(db.prepare('SELECT state FROM mimipip_order_email').get().state,'accepted');
});
test('ambiguous send retries frozen payload and same key; stops before idempotency expiry',async()=>{
 const {db,env}=harness();await enqueueOrderEmail(env.DB,order);const sent:any[]=[];
 const send=async(_u:any,i:any)=>{sent.push(i);throw new Error('connection dropped')};
 await sendOrderEmails(env,send as any,1000);db.prepare("UPDATE mimipip_orders SET customer=?").run(JSON.stringify({name:'Changed',email:'different@example.test'}));
 await sendOrderEmails(env,send as any,301001);assert.equal(sent.length,2);assert.equal(sent[0].body,sent[1].body);assert.equal(sent[0].headers['Idempotency-Key'],sent[1].headers['Idempotency-Key']);
 await sendOrderEmails(env,send as any,24*3600000);assert.equal(sent.length,2);assert.equal(db.prepare('SELECT state FROM mimipip_order_email').get().state,'review');
});
test('no historical bulk send, no unpaid or test-mode mail; rejection held for review',async()=>{
 const {db,env}=harness();let sent=0;const send=async()=>{sent++;return Response.json({message:'rejected'},{status:422})};
 await sendOrderEmails(env,send as any,1000);assert.equal(sent,0);
 await enqueueOrderEmail(env.DB,{...order,status:'pending'});assert.equal(db.prepare('SELECT count(*) n FROM mimipip_order_email').get().n,0);
 await enqueueOrderEmail(env.DB,order);env.STORE_PAY.keyId=()=> 'rzp_test_fixture';await sendOrderEmails(env,send as any,1000);assert.equal(sent,0);
 env.STORE_PAY.keyId=()=> 'rzp_live_fixture';await sendOrderEmails(env,send as any,1000);await sendOrderEmails(env,send as any,400000);assert.equal(sent,1);assert.equal(db.prepare('SELECT state FROM mimipip_order_email').get().state,'review');
});
