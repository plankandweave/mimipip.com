import {giftCapability} from './gift-ledger';
import {giftPresentation,type GiftEnv,type GiftOrder} from './gift-card';
import {renderGiftCardHtml,formatGiftCardAmount} from './gift-card-presentation';
export async function giftEmailPayload(env:GiftEnv,o:GiftOrder){
 const data=await giftPresentation(env,o),key=await giftCapability(env.MIMIPIP_GIFT_SECRET!,o.id,'view');
 const query=`id=${o.id}&key=${key}`;
 const printUrl=`https://mimipip.com/api/gift-card/print?${query}`;
 return {from:'MimiPip <hello@mimipip.com>',to:[o.recipient_email],reply_to:'hello@mimipip.com',
  subject:`A MimiPip gift for ${data.recipientName.replace(/[\r\n]/g,' ')}, from ${data.senderName.replace(/[\r\n]/g,' ')}`,
  html:renderGiftCardHtml(data,{mode:'email',cardImageUrl:`https://mimipip.com/api/gift-card/image?${query}`,printUrl}),
  text:`You have received a MimiPip gift card from ${data.senderName}.\n\nFor: ${data.recipientName}\nOccasion: ${data.occasion}\nValue: ${formatGiftCardAmount(data.amount,data.currency)}\nShopping code: ${data.code}\n\n${data.message||''}\n\nNo expiry. Use all or part of the balance at mimipip.com; any remaining balance stays on your card.\nPrintable card: ${printUrl}\n\nKeep this card and code safe. Need help? hello@mimipip.com`};
}
/** A durable immutable payload and a provider idempotency key cover crashes after provider acceptance. */
export async function queueGiftEmails(env:GiftEnv,send:typeof fetch=fetch,now=Date.now()){
 if(!env.DB||!env.RESEND_API_KEY||!env.MIMIPIP_GIFT_SECRET)return;
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
   if(r.ok&&result.id)await db.prepare("UPDATE mimipip_gift_email SET state='accepted',provider_id=?,accepted_at=?,last_error=NULL WHERE gift_id=?").bind(result.id,now,o.id).run();
   else{const retry=r.status===429||r.status>=500||(r.status===409&&result.name==='concurrent_idempotent_requests');await db.prepare('UPDATE mimipip_gift_email SET state=?,last_error=?,next_attempt_at=? WHERE gift_id=?').bind(retry?'pending':'review',`provider_${r.status}`,now+Math.min(3600000,300000*2**Math.min(row.attempts,4)),o.id).run();}
  }catch{/* An ambiguous result is retried with the same payload/key, only inside the provider window. */}
 }
}
