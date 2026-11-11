import {giftCapability} from './gift-ledger';
import {gatewayMode} from './gateway-mode';
import {giftPresentation,type GiftEnv,type GiftOrder} from './gift-card';
import {renderGiftCardHtml,formatGiftCardAmount} from './gift-card-presentation';
export async function giftEmailPayload(env:GiftEnv,o:GiftOrder){
 const data=await giftPresentation(env,o),key=await giftCapability(env.MIMIPIP_GIFT_SECRET!,o.id,'view');
 const query=`id=${o.id}&key=${key}`;
 const printUrl=`https://mimipip.com/api/gift-card/print?${query}`;
 return {from:'MimiPip <hello@mimipip.com>',to:[o.recipient_email],reply_to:'hello@mimipip.com',
  subject:`A MimiPip gift for ${data.recipientName.replace(/[\r\n]/g,' ')}, from ${data.senderName.replace(/[\r\n]/g,' ')}`,
  html:renderGiftCardHtml(data,{mode:'email',cardImageUrl:`https://mimipip.com/api/gift-card/image?${query}`,printUrl,walletEmail:o.recipient_email}),
  text:`You have received a MimiPip gift card from ${data.senderName}.\n\n${formatGiftCardAmount(data.amount,data.currency)} has been added to your MimiPip wallet. Sign in at https://mimipip.com/account with ${o.recipient_email} to see it and use it at checkout. No account yet? Create one with this email and your balance appears.\n\nFor: ${data.recipientName}\nOccasion: ${data.occasion}\nValue: ${formatGiftCardAmount(data.amount,data.currency)}\nCard reference: ${data.code}\n\n${data.message||''}\n\nNo expiry. Your balance is used when you are signed in with ${o.recipient_email}; anything you don't spend stays in your wallet.\nPrintable card: ${printUrl}\n\nNeed help? hello@mimipip.com`};
}
/** The buyer's copy: the recipient's email as it went, with one line saying whose copy it is. */
export async function giftCopyPayload(env:GiftEnv,o:GiftOrder,sentAt:number){
 const m=await giftEmailPayload(env,o);
 const when=new Intl.DateTimeFormat('en-IN',{dateStyle:'long',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(sentAt));
 const who=(JSON.parse(o.presentation)?.recipientName as string|undefined)?.replace(/[\r\n]/g,' ')||o.recipient_email;
 const esc=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 const note=`This is your copy of the MimiPip gift you sent to ${who} (${o.recipient_email}). We sent it to them from MimiPip on ${when} IST; the balance is in their wallet, not yours.`;
 return {...m,to:[o.purchaser_email],subject:`Your copy: ${m.subject}`,
  html:m.html.replace('<main class="gift-proof-wrap">',`<main class="gift-proof-wrap"><p style="margin:0 0 20px;padding:12px 16px;border:1px solid #ead9bd;border-radius:12px;font-size:14px;line-height:1.5">${esc(note)}</p>`),
  text:`${note}\n\n----\n\n${m.text}`};
}
/** Every accepted gift email is followed by the buyer's copy, once, with its own idempotency key. */
export async function queueGiftCopies(env:GiftEnv,send:typeof fetch=fetch,now=Date.now()){
 if(!env.DB||!env.RESEND_API_KEY||!env.MIMIPIP_GIFT_SECRET)return;
 if(await gatewayMode(env.STORE_PAY)!=='live')return;
 const db=env.DB;
 await db.prepare(`INSERT INTO mimipip_gift_copy(gift_id,to_email,next_attempt_at) SELECT e.gift_id,o.purchaser_email,? FROM mimipip_gift_email e JOIN mimipip_gift_orders o ON o.id=e.gift_id
  WHERE e.state='accepted' AND o.status='active' AND instr(o.purchaser_email,'@')>1 AND lower(trim(o.purchaser_email))<>lower(trim(o.recipient_email)) ON CONFLICT(gift_id) DO NOTHING`).bind(now).run();
 await db.prepare("UPDATE mimipip_gift_copy SET state='review',last_error='retry_window_expired' WHERE state='pending' AND first_attempt_at IS NOT NULL AND first_attempt_at<=?").bind(now-23*3600000).run();
 const rows=await db.prepare("SELECT c.gift_id,c.payload,c.attempts,e.accepted_at FROM mimipip_gift_copy c JOIN mimipip_gift_email e ON e.gift_id=c.gift_id WHERE c.state='pending' AND c.next_attempt_at<=? ORDER BY c.next_attempt_at LIMIT 10").bind(now).all<{gift_id:string;payload:string|null;attempts:number;accepted_at:number|null}>();
 for(const row of rows.results){
  const o=await db.prepare("SELECT * FROM mimipip_gift_orders WHERE id=? AND status='active'").bind(row.gift_id).first<GiftOrder>();if(!o)continue;
  const payload=row.payload??JSON.stringify(await giftCopyPayload(env,o,row.accepted_at??now));
  const claimed=await db.prepare("UPDATE mimipip_gift_copy SET attempts=attempts+1,next_attempt_at=?,first_attempt_at=COALESCE(first_attempt_at,?),payload=COALESCE(payload,?) WHERE gift_id=? AND state='pending' AND next_attempt_at<=? RETURNING gift_id").bind(now+300000,now,payload,o.id,now).first();if(!claimed)continue;
  try{
   const r=await send('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`mimipip-gift-copy-v1/${o.id}`},body:payload});
   const result=await r.json() as {id?:string;name?:string};
   if(r.ok&&result.id)await db.prepare("UPDATE mimipip_gift_copy SET state='accepted',provider_id=?,accepted_at=?,last_error=NULL,payload=NULL WHERE gift_id=?").bind(result.id,now,o.id).run();
   else{const retry=r.status===429||r.status>=500||(r.status===409&&result.name==='concurrent_idempotent_requests');await db.prepare('UPDATE mimipip_gift_copy SET state=?,last_error=?,next_attempt_at=? WHERE gift_id=?').bind(retry?'pending':'review',`provider_${r.status}`,now+Math.min(3600000,300000*2**Math.min(row.attempts,4)),o.id).run();}
  }catch{/* an ambiguous result is retried with the same payload and key, inside the provider window */}
 }
}
/** A durable immutable payload and a provider idempotency key cover crashes after provider acceptance. */
export async function queueGiftEmails(env:GiftEnv,send:typeof fetch=fetch,now=Date.now()){
 if(!env.DB||!env.RESEND_API_KEY||!env.MIMIPIP_GIFT_SECRET)return;
 // A second lock behind activation: no gift email leaves while the key is not live. Due mail waits (its retry window starts only when it is first tried).
 if(await gatewayMode(env.STORE_PAY)!=='live')return;
 const db=env.DB;
 await db.prepare("UPDATE mimipip_gift_email SET state='review',last_error='retry_window_expired' WHERE state='pending' AND first_attempt_at IS NOT NULL AND first_attempt_at<=?").bind(now-23*3600000).run();
 const rows=await db.prepare("SELECT e.gift_id,e.payload,e.attempts FROM mimipip_gift_email e JOIN mimipip_gift_orders o ON o.id=e.gift_id WHERE e.state='pending' AND o.status='active' AND e.next_attempt_at<=? ORDER BY e.next_attempt_at LIMIT 10").bind(now).all<{gift_id:string;payload:string|null;attempts:number}>();
 for(const row of rows.results){
  const o=await db.prepare("SELECT * FROM mimipip_gift_orders WHERE id=? AND status='active'").bind(row.gift_id).first<GiftOrder>();if(!o)continue;
  const payload=row.payload??JSON.stringify(await giftEmailPayload(env,o));
  const claimed=await db.prepare("UPDATE mimipip_gift_email SET attempts=attempts+1,next_attempt_at=?,first_attempt_at=COALESCE(first_attempt_at,?),payload=COALESCE(payload,?) WHERE gift_id=? AND state='pending' AND next_attempt_at<=? RETURNING gift_id").bind(now+300000,now,payload,o.id,now).first();if(!claimed)continue;
  try{
   const r=await send('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`mimipip-gift-v1/${o.id}`},body:payload});
   const result=await r.json() as {id?:string;name?:string};
   // Accepted: the payload (which carries the code and viewing key in clear) is not kept.
   if(r.ok&&result.id)await db.prepare("UPDATE mimipip_gift_email SET state='accepted',provider_id=?,accepted_at=?,last_error=NULL,payload=NULL WHERE gift_id=?").bind(result.id,now,o.id).run();
   else{const retry=r.status===429||r.status>=500||(r.status===409&&result.name==='concurrent_idempotent_requests');await db.prepare('UPDATE mimipip_gift_email SET state=?,last_error=?,next_attempt_at=? WHERE gift_id=?').bind(retry?'pending':'review',`provider_${r.status}`,now+Math.min(3600000,300000*2**Math.min(row.attempts,4)),o.id).run();}
  }catch{/* An ambiguous result is retried with the same payload/key, only inside the provider window. */}
 }
 await queueGiftCopies(env,send,now);
}
