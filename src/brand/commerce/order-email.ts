import type { Env } from './checkout';
import { gatewayMode } from './gateway-mode';
import { privateOrderCustomer } from '../registry/service';
import type { StoredLine } from './order-payload';

type PaidOrder = {id:string;status:string;amount:number;shipping:number;currency:string;customer:string;lines:string;fulfilment?:string;gift_minor?:number};
type MailRow = {order_id:string;payload:string|null;attempts:number};
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const money=(n:number,currency:string)=>new Intl.NumberFormat(currency==='INR'?'en-IN':'en-US',{style:'currency',currency,minimumFractionDigits:n%100?2:0,maximumFractionDigits:2}).format(n/100);
export async function ensureOrderEmail(db:NonNullable<Env['DB']>){
 await db.prepare(`CREATE TABLE IF NOT EXISTS mimipip_order_email (
 order_id TEXT PRIMARY KEY,state TEXT NOT NULL DEFAULT 'pending',payload TEXT,provider_id TEXT,
 attempts INTEGER NOT NULL DEFAULT 0,first_attempt_at INTEGER,next_attempt_at INTEGER NOT NULL DEFAULT 0,
 accepted_at INTEGER,last_error TEXT)`).bind().run();
}
/** Called only on a verified paid order, before production handoff. No historical bulk backfill. */
export async function enqueueOrderEmail(db:NonNullable<Env['DB']>,o:PaidOrder){
 if(o.status!=='paid')return;
 await ensureOrderEmail(db);
 await db.prepare(`INSERT INTO mimipip_order_email(order_id) SELECT id FROM mimipip_orders WHERE id=? AND status='paid' ON CONFLICT(order_id) DO NOTHING`).bind(o.id).run();
}
export function orderEmailPayload(o:PaidOrder){
 if(o.status!=='paid')throw new Error('Only paid orders receive confirmations');
 // Registry gifts go to their purchaser, never expose the recipient's private address.
 const customer=privateOrderCustomer(o);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email||''))throw new Error('Invalid confirmation recipient');
 const lines=JSON.parse(o.lines) as StoredLine[];
 const list=lines.map(l=>`${l.name} × ${l.qty} — ${money(l.lineMinor,o.currency)}`).join('\n');
 const gift=o.gift_minor?`\nGift balance used: ${money(o.gift_minor,o.currency)}\nPayment received: ${money(o.amount-o.gift_minor,o.currency)}`:'';
 const text=`Hello ${customer.name},\n\nThank you for your order. Your MimiPip order is confirmed.\n\nOrder: ${o.id}\n${list}\n\nDelivery: ${o.shipping?money(o.shipping,o.currency):'Free'}\nTotal paid${o.currency==='INR'?' (including GST)':''}: ${money(o.amount,o.currency)}${gift}\n\nWe will share the dispatch details when your order ships. If you ordered a design service, we will contact you about the next steps.\n\nNeed help? Reply to this email at hello@mimipip.com.\n\nWarmly,\nMimiPip`;
 return {from:'MimiPip <hello@mimipip.com>',to:[customer.email],reply_to:'hello@mimipip.com',subject:`Your MimiPip order is confirmed — ${o.id}`,text,
 html:`<!doctype html><html><body style="margin:0;background:#fff9ed;color:#714414;font-family:Arial,sans-serif"><main style="max-width:600px;margin:auto;padding:32px 24px"><a href="https://mimipip.com" style="color:#ff4a22;font-size:28px;font-weight:bold;text-decoration:none">MimiPip</a><h1 style="font-size:26px">Your order is confirmed</h1><div style="font-size:16px;line-height:1.7;white-space:pre-line">${esc(text)}</div></main></body></html>`};
}
/** The frozen payload and stable provider key prevent duplicate mail after ambiguous responses. */
export async function sendOrderEmails(env:Env,send:typeof fetch=fetch,now=Date.now()){
 if(!env.DB||!env.RESEND_API_KEY||await gatewayMode(env.STORE_PAY)!=='live')return;
 const db=env.DB;await ensureOrderEmail(db);
 await db.prepare(`UPDATE mimipip_order_email SET state='review',last_error='retry_window_expired' WHERE state='pending' AND first_attempt_at IS NOT NULL AND first_attempt_at<=?`).bind(now-23*3600000).run();
 const rows=await db.prepare(`SELECT e.order_id,e.payload,e.attempts FROM mimipip_order_email e JOIN mimipip_orders o ON o.id=e.order_id WHERE e.state='pending' AND o.status='paid' AND e.next_attempt_at<=? ORDER BY e.next_attempt_at LIMIT 10`).bind(now).all<MailRow>();
 for(const row of rows.results){
  const o=await db.prepare("SELECT * FROM mimipip_orders WHERE id=? AND status='paid'").bind(row.order_id).first<PaidOrder>();if(!o)continue;
  let payload:string;try{payload=row.payload??JSON.stringify(orderEmailPayload(o));}catch{await db.prepare("UPDATE mimipip_order_email SET state='review',last_error='invalid_order' WHERE order_id=?").bind(o.id).run();continue;}
  const claimed=await db.prepare(`UPDATE mimipip_order_email SET attempts=attempts+1,next_attempt_at=?,first_attempt_at=COALESCE(first_attempt_at,?),payload=COALESCE(payload,?) WHERE order_id=? AND state='pending' AND next_attempt_at<=? RETURNING order_id`).bind(now+300000,now,payload,o.id,now).first();if(!claimed)continue;
  try{
   const r=await send('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`mimipip-order-confirmation-v1/${o.id}`},body:payload});
   const result=await r.json() as {id?:string;name?:string};
   if(r.ok&&result.id)await db.prepare("UPDATE mimipip_order_email SET state='accepted',provider_id=?,accepted_at=?,last_error=NULL,payload=NULL WHERE order_id=?").bind(result.id,now,o.id).run();
   else{const retry=r.status===429||r.status>=500||(r.status===409&&result.name==='concurrent_idempotent_requests');await db.prepare('UPDATE mimipip_order_email SET state=?,last_error=?,next_attempt_at=? WHERE order_id=?').bind(retry?'pending':'review',`provider_${r.status}`,now+Math.min(3600000,300000*2**Math.min(row.attempts,4)),o.id).run();}
  }catch{/* Retry the same payload/key within the provider's idempotency window. */}
 }
}
