import type { Env } from './checkout';
import { gatewayMode } from './gateway-mode';
import { privateOrderCustomer } from '../registry/service';
import type { StoredLine } from './order-payload';
import catalogue from '../review/catalogue.json';

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
 const size=(l:StoredLine)=>l.widthCm&&l.heightCm?`${l.widthCm} × ${l.heightCm} cm`:'';
 const list=lines.map(l=>`${l.name} × ${l.qty}${size(l)?` · ${size(l)}`:''} — ${money(l.lineMinor,o.currency)}`).join('\n');
 const gift=o.gift_minor?`\nGift balance used: ${money(o.gift_minor,o.currency)}\nPayment received: ${money(o.amount-o.gift_minor,o.currency)}`:'';
 const firstName=customer.name?.trim().split(/\s+/)[0]||'there';
 const isPlay=lines.every(l=>!l.kind&&catalogue.find(p=>p.slug===l.slug)?.type.includes('floor-sticker'));
 const note=isPlay?'One hop, two hops, a little victory dance. Your new design has a happy little job ahead: turning an everyday patch of floor into a place to play.':'A little colour. A little imagination. Something lovely for their world. Thank you for making MimiPip part of your next little adventure.';
 const next=lines.some(l=>l.kind==='design-service')?'We will contact you about the next steps for your design service. For any physical items, we will share dispatch details when they ship.':'We will share dispatch details when your order ships. Until then, there is nothing more you need to do.';
 const text=`Hello ${firstName},\n\nYour order is confirmed!\n\n${note}\n\nThank you for choosing us. We hope it makes room for plenty of smiles, stories and happy little moments.\n\nOrder: ${o.id}\n${list}\n\nDelivery: ${o.shipping?money(o.shipping,o.currency):'Free'}\nTotal paid${o.currency==='INR'?' (including GST)':''}: ${money(o.amount,o.currency)}${gift}\n\n${next}\n\nNeed a hand? Reply to this email at hello@mimipip.com.\n\nWith a little sunshine,\nThe MimiPip team`;
 const cards=lines.map(l=>{
  const product=catalogue.find(p=>p.slug===l.slug);
  const src=product?(l.slug==='hopscotch-peach-pop'?'/floor-play-images/hopscotch-peach-pop/product.png':`/feed-images/${encodeURIComponent(l.slug)}.jpg`):null;
  return `<tr><td style="padding:24px 0;border-top:1px solid #e8dacb">${src?`<a href="https://mimipip.com/design/${encodeURIComponent(l.slug)}/"><img src="https://mimipip.com${src}" width="520" alt="${esc(l.name)} — design preview" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:16px"></a><p style="font-size:12px;color:#786d61;margin:8px 0 20px">${l.slug==='hopscotch-peach-pop'?'Your Peach Pop design':'Design illustration; your ordered details are below.'}</p>`:''}<h3 style="font-size:20px;line-height:1.4;margin:0 0 8px">${esc(l.name)}</h3><p style="margin:0;line-height:1.7">Quantity ${l.qty}${size(l)?` &nbsp;·&nbsp; ${esc(size(l))}`:''}${l.fulfilmentArt?.material?`<br>${l.fulfilmentArt.material==='self_adhesive'?'Self-adhesive':'Paste application'}`:''}</p></td></tr>`;
 }).join('');
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your MimiPip order is confirmed</title></head><body style="margin:0;padding:0;background:#f4efe7;color:#714414;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden">A little sunshine is coming your way. Your MimiPip order is confirmed.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fffaf0;border-radius:24px;overflow:hidden"><tr><td style="height:8px;background:#ffc34d"></td></tr><tr><td align="center" style="padding:32px 24px 20px"><a href="https://mimipip.com"><img src="https://mimipip.com/brand/mimi-pip/full-logo.png" width="180" alt="MimiPip" style="width:180px;max-width:100%;height:auto;border:0"></a><p style="font-size:12px;letter-spacing:2px;margin:24px 0 12px">LITTLE SPACES. BIG LITTLE WORLDS.</p><h1 style="font-family:Georgia,serif;font-size:36px;line-height:1.15;margin:0 0 16px">Oh, happy little day!</h1><p style="font-size:18px;margin:0">Your order is confirmed.</p></td></tr><tr><td style="padding:12px 28px 28px;font-size:16px;line-height:1.8"><p>Hello ${esc(firstName)},</p><p>${note}</p><p>Thank you for choosing us. We hope it makes room for plenty of smiles, stories and happy little moments.</p><p style="margin-bottom:0">With a little sunshine,<br><strong>The MimiPip team</strong></p></td></tr><tr><td style="padding:24px 28px;background:#edf2e9"><p style="font-size:12px;letter-spacing:1px;margin:0 0 8px">YOUR HAPPY LITTLE ORDER</p><p style="font-size:13px;overflow-wrap:anywhere;margin:0">${esc(o.id)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px">${cards}</table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #d3ddcd;font-size:16px"><tr><td style="padding-top:20px">Delivery</td><td align="right" style="padding-top:20px">${o.shipping?money(o.shipping,o.currency):'Free'}</td></tr><tr><td style="padding-top:12px"><strong>Total paid</strong>${o.currency==='INR'?'<br><span style="font-size:12px">Including GST</span>':''}</td><td align="right" style="padding-top:12px;font-size:24px"><strong>${money(o.amount,o.currency)}</strong></td></tr></table>${gift?`<p style="font-size:13px;white-space:pre-line">${esc(gift)}</p>`:''}</td></tr><tr><td style="padding:28px;font-size:16px;line-height:1.8"><h2 style="font-family:Georgia,serif;font-size:24px;margin:0 0 10px">What happens next?</h2><p style="margin:0 0 24px">${next}</p><p style="margin:0">Need a hand? Just reply. We’re here at <a href="mailto:hello@mimipip.com" style="color:#714414">hello@mimipip.com</a>.</p></td></tr><tr><td align="center" style="padding:24px;background:#fce5d9;font-size:13px;line-height:1.7">Made for little spaces and big imaginations.<br><a href="https://mimipip.com" style="color:#714414">Visit MimiPip</a></td></tr></table></td></tr></table></body></html>`;
 return {from:'MimiPip <hello@mimipip.com>',to:[customer.email],reply_to:'hello@mimipip.com',subject:`Your MimiPip order is confirmed — ${o.id}`,text,html};
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
