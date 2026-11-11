import type {Env as CheckoutEnv} from './checkout';
import {giftHash,giftCapability,normalizedGiftCode,rateLimitGift,cardForCode,type GiftDb} from './gift-ledger';
import {GIFT_POLICY} from './gift-policy';
import {GIFT_CARD_STYLES,GIFT_CARD_OCCASIONS,renderGiftCardHtml,type GiftCardPresentationData} from './gift-card-presentation';
import {queueGiftEmails} from './gift-email';
import {gatewayMode,NOT_LIVE} from './gateway-mode';
export type GiftEnv=CheckoutEnv&{MIMIPIP_GIFTS_ENABLED?:string;MIMIPIP_GIFT_SECRET?:string;RESEND_API_KEY?:string;ASSETS?:{fetch(r:Request):Promise<Response>};OPENAI_API_KEY?:string;SHOPPER_TOOLS?:{fetch(r:Request):Promise<Response>}};
export type GiftOrder={id:string;token_hash:string;fingerprint:string;status:string;amount:number;currency:'INR';presentation:string;purchaser_email:string;recipient_email:string;valid_days:number;provider_order_id:string|null;payment_id:string|null;created_at:number;activated_at:number|null;last_error:string|null};
export const giftJson=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex'}});
export async function giftReady(env:GiftEnv){
 if(env.MIMIPIP_GIFTS_ENABLED!=='1'||!env.DB||!env.STORE_PAY||!env.RESEND_API_KEY||!env.MIMIPIP_GIFT_SECRET||env.MIMIPIP_GIFT_SECRET.length<32)return false;
 try{return !!(await env.STORE_PAY.ready()&&await gatewayMode(env.STORE_PAY)==='live'&&env.STORE_PAY.giftReady&&await env.STORE_PAY.giftReady()&&await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mimipip_gift_tenders'").bind().first());}catch{return false;}
}
const short=(x:unknown,max:number,required=false)=>{if(typeof x!=='string'||x.length>max||(required&&!x.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x))throw new Error('Check your gift-card details.');return x.trim();};
const email=(v:unknown)=>{const s=short(v,254,true);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw new Error('Enter a valid email address.');return s;};
export function giftInput(b:any){
 if(b.currency!=='INR')throw new Error('Gift cards are currently available in INR only.');
 if(!GIFT_CARD_STYLES.some(x=>x.id===b.style)||!GIFT_CARD_OCCASIONS.includes(b.occasion)&&b.occasion!=='Baby shower / डोहाळजेवण')throw new Error('Choose an occasion and design.');
 const minor=Math.round(b.amount*100);
 if(typeof b.amount!=='number'||!Number.isSafeInteger(minor)||Math.abs(b.amount*100-minor)>0.00001||minor<GIFT_POLICY.minMinor||minor>GIFT_POLICY.maxMinor)throw new Error('Choose a gift value from ₹500 to ₹50,000, with no more than two decimal places.');
 const purchaser=email(b.purchaserEmail),recipient=email(b.recipientEmail||purchaser);
 const presentation:GiftCardPresentationData={style:b.style,occasion:b.occasion,amount:minor/100,currency:'INR',recipientName:short(b.recipientName,58,true),senderName:short(b.senderName,58,true),message:short(b.message??'',400),status:'pending'};
 return {minor,purchaser,recipient,presentation};
}
export async function giftPresentation(env:GiftEnv,o:GiftOrder):Promise<GiftCardPresentationData>{
 const p=JSON.parse(o.presentation) as GiftCardPresentationData;
 const card=await env.DB!.prepare('SELECT expires_at FROM mimipip_gift_cards WHERE id=?').bind(o.id).first<{expires_at:number|null}>();
 return {...p,status:o.status==='active'?'active':'pending',code:o.status==='active'?await giftCapability(env.MIMIPIP_GIFT_SECRET!,o.id,'code'):null,issuedAt:o.activated_at,expiresAt:card?.expires_at??null};
}
export async function activateGift(env:GiftEnv,o:GiftOrder,p:any){
 if(o.status==='active')return true;
 if(!env.DB||!env.STORE_PAY||!env.MIMIPIP_GIFT_SECRET)return false;
 if(p?.status!=='captured'||p.captured!==true||p.order_id!==o.provider_order_id||p.amount!==o.amount||p.currency!=='INR'||p.amount_refunded!==0||!/^pay_[A-Za-z0-9]+$/.test(p.id))return false;
 // No card from a test key's capture, ever: the gift is held for review and stays held if the key later turns live.
 const mode=await gatewayMode(env.STORE_PAY);
 if(mode==='test'){await env.DB.prepare("UPDATE mimipip_gift_orders SET status='review',last_error=? WHERE id=? AND status='pending'").bind(NOT_LIVE,o.id).run();return false;}
 if(mode!=='live')return false;
 const r=await env.STORE_PAY.razorpay('orders/'+o.provider_order_id);const ro=r.data;
 if(!r.ok||ro.status!=='paid'||ro.amount!==o.amount||ro.amount_paid!==o.amount||ro.currency!=='INR')return false;
 // The captured payment identity is unique. Concurrent verification and cron converge on one gift/card/outbox.
 await env.DB.prepare("UPDATE mimipip_gift_orders SET payment_id=? WHERE id=? AND status='pending' AND (payment_id IS NULL OR payment_id=?)").bind(p.id,o.id,p.id).run();
 await mintCard(env,o.id,p.id);
 return !!await env.DB.prepare("SELECT id FROM mimipip_gift_orders WHERE id=? AND status='active'").bind(o.id).first();
}
/** The one way a card comes into being: only for the funding that holds the gift's payment_id, once per gift id. */
async function mintCard(env:GiftEnv,id:string,paymentId:string){
 const now=Date.now(),code=await giftCapability(env.MIMIPIP_GIFT_SECRET!,id,'code');
 await env.DB!.prepare(`INSERT INTO mimipip_gift_cards(id,code_hash,initial_minor,balance_minor,currency,status,activated_at,expires_at)
 SELECT id,?,amount,amount,currency,'active',?,CASE WHEN valid_days=0 THEN NULL ELSE ?+valid_days*86400000 END FROM mimipip_gift_orders
 WHERE id=? AND status='pending' AND payment_id=? ON CONFLICT(id) DO NOTHING`).bind(await giftHash(normalizedGiftCode(code)),now,now,id,paymentId).run();
}
/** Who may fund a gift instead of a card payment. A director's gift is owed by that director in the books. */
export const GIFT_FUNDERS=['director:roheena'] as const;
export const fundedPaymentId=(by:string,id:string)=>`funded:${by}:${id}`;
type Issued={status:number;body:Record<string,unknown>};
const issueFail=(status:number,error:string):Issued=>({status,body:{error}});
/**
 * Issue a PENDING gift without a card payment, because a director funds it (owner, 11 November 2026:
 * "this is from me, so it doesn't need a real payment … show it as a receivable from Roheena").
 * Every detail must match the pending row; the Razorpay order must show no payment that is not failed,
 * so a card bought by card is never also funded; the card is minted by the same path as a paid gift.
 * Idempotent: the same gift funded again returns its state, never a second card or email.
 */
export async function issueFundedGift(env:GiftEnv,b:any,mailer:typeof fetch=fetch,now=Date.now()):Promise<Issued>{
 if(!env.DB||!env.STORE_PAY||!env.MIMIPIP_GIFT_SECRET)return issueFail(503,'unavailable');
 const id=b?.giftId,order=b?.providerOrderId,amount=b?.amountMinor,by=b?.fundedBy,ref=b?.reference;
 if(typeof id!=='string'||!/^MPG-[A-F0-9]{24}$/.test(id)||typeof order!=='string'||!/^order_[A-Za-z0-9]+$/.test(order)||!Number.isInteger(amount)||amount<=0
  ||!(GIFT_FUNDERS as readonly string[]).includes(by)||typeof ref!=='string'||ref.trim().length<3||ref.length>160)return issueFail(400,'invalid');
 const db=env.DB,paymentId=fundedPaymentId(by,id);
 const state=async():Promise<Issued>=>{
  const e=await db.prepare('SELECT state,provider_id FROM mimipip_gift_email WHERE gift_id=?').bind(id).first<{state:string;provider_id:string|null}>();
  return {status:200,body:{giftId:id,status:'active',fundedBy:by,email:e?.state??null,emailId:e?.provider_id??null}};
 };
 let o=await db.prepare('SELECT * FROM mimipip_gift_orders WHERE id=?').bind(id).first<GiftOrder>();
 if(!o||o.provider_order_id!==order||o.amount!==amount)return issueFail(409,'mismatch');
 if(o.status==='active'){if(o.payment_id!==paymentId)return issueFail(409,'already_paid_otherwise');await queueGiftEmails(env,mailer);return state();}
 if(o.status!=='pending'||(o.payment_id&&o.payment_id!==paymentId))return issueFail(409,'not_pending');
 if(await gatewayMode(env.STORE_PAY)!=='live')return issueFail(409,NOT_LIVE);
 const pays=await env.STORE_PAY.razorpay('orders/'+order+'/payments');
 if(!pays.ok||!Array.isArray(pays.data?.items))return issueFail(502,'razorpay_unreadable');
 if(pays.data.items.some((p:any)=>p?.status!=='failed'))return issueFail(409,'payment_exists');
 const ro=await env.STORE_PAY.razorpay('orders/'+order);
 if(!ro.ok||ro.data?.status==='paid'||ro.data?.amount_paid!==0)return issueFail(409,'payment_exists');
 // The claim, the funding record and the card are one transaction: an interruption leaves either a
 // funded active card or the untouched pending gift, never a claimed gift with no card (review of #58).
 if(!db.batch)return issueFail(503,'unavailable');
 const code=await giftCapability(env.MIMIPIP_GIFT_SECRET,id,'code'),hash=await giftHash(normalizedGiftCode(code));
 await db.batch([
  db.prepare("UPDATE mimipip_gift_orders SET payment_id=? WHERE id=? AND status='pending' AND (payment_id IS NULL OR payment_id=?)").bind(paymentId,id,paymentId),
  db.prepare("INSERT INTO mimipip_gift_funding(gift_id,funded_by,reference,amount_minor,provider_order_id,issued_at,checked_at) SELECT id,?,?,amount,provider_order_id,?,? FROM mimipip_gift_orders WHERE id=? AND status='pending' AND payment_id=? ON CONFLICT(gift_id) DO NOTHING").bind(by,ref.trim(),now,now,id,paymentId),
  db.prepare(`INSERT INTO mimipip_gift_cards(id,code_hash,initial_minor,balance_minor,currency,status,activated_at,expires_at)
 SELECT id,?,amount,amount,currency,'active',?,CASE WHEN valid_days=0 THEN NULL ELSE ?+valid_days*86400000 END FROM mimipip_gift_orders
 WHERE id=? AND status='pending' AND payment_id=? ON CONFLICT(id) DO NOTHING`).bind(hash,now,now,id,paymentId),
 ]);
 o=await db.prepare('SELECT * FROM mimipip_gift_orders WHERE id=?').bind(id).first<GiftOrder>();
 if(o?.status!=='active'||o.payment_id!==paymentId)return issueFail(409,'not_issued');
 await queueGiftEmails(env,mailer);
 return state();
}
/**
 * A funded gift's Razorpay order cannot be cancelled. If someone pays it after all, the gift is not
 * minted or emailed again (its card already exists): the payment is recorded against the funding,
 * where it settles the director's receivable, and shows on /operations. Nothing is refunded by itself.
 */
export const capturedFor=(p:any,order:string,amount:number)=>p?.status==='captured'&&p.captured===true&&p.order_id===order&&p.amount===amount&&p.currency==='INR'&&p.amount_refunded===0&&typeof p.id==='string'&&/^pay_[A-Za-z0-9]+$/.test(p.id);
export async function watchFundedOrders(env:GiftEnv,now=Date.now()){
 if(!env.DB||!env.STORE_PAY)return;
 const rows=await env.DB.prepare('SELECT gift_id,provider_order_id,amount_minor FROM mimipip_gift_funding WHERE late_payment_id IS NULL AND provider_order_id IS NOT NULL AND checked_at<=? ORDER BY checked_at LIMIT 5').bind(now-3600000).all<{gift_id:string;provider_order_id:string;amount_minor:number}>();
 for(const f of rows.results){
  await env.DB.prepare('UPDATE mimipip_gift_funding SET checked_at=? WHERE gift_id=?').bind(now,f.gift_id).run();
  const r=await env.STORE_PAY.razorpay('orders/'+f.provider_order_id+'/payments');if(!r.ok)continue;
  // An authorised payment can still be voided: only a verified, unrefunded capture of the exact order and amount settles.
  const paid=(r.data?.items??[]).find((p:any)=>capturedFor(p,f.provider_order_id,f.amount_minor));if(!paid)continue;
  const ro=await env.STORE_PAY.razorpay('orders/'+f.provider_order_id);
  if(!ro.ok||ro.data?.status!=='paid'||ro.data?.amount_paid!==f.amount_minor||ro.data?.currency!=='INR')continue;
  await env.DB.prepare('UPDATE mimipip_gift_funding SET late_payment_id=? WHERE gift_id=? AND late_payment_id IS NULL').bind(String(paid.id),f.gift_id).run();
  await env.DB.prepare('UPDATE mimipip_gift_orders SET last_error=? WHERE id=?').bind('settled_by_payment:'+String(paid.id),f.gift_id).run();
 }
}
/** A pending gift holding a funded claim has no card (the claim and card are one transaction now; an older
 *  interrupted run could leave one). Give the claim back so a real payment can activate the gift. */
export async function releaseStrandedFundedClaim(env:GiftEnv,o:GiftOrder):Promise<GiftOrder>{
 if(o.status!=='pending'||!o.payment_id?.startsWith('funded:'))return o;
 await env.DB!.prepare("UPDATE mimipip_gift_orders SET payment_id=NULL WHERE id=? AND status='pending' AND payment_id=? AND NOT EXISTS(SELECT 1 FROM mimipip_gift_cards WHERE id=?)").bind(o.id,o.payment_id,o.id).run();
 await env.DB!.prepare("DELETE FROM mimipip_gift_funding WHERE gift_id=? AND NOT EXISTS(SELECT 1 FROM mimipip_gift_cards WHERE id=?)").bind(o.id,o.id).run();
 return (await env.DB!.prepare('SELECT * FROM mimipip_gift_orders WHERE id=?').bind(o.id).first<GiftOrder>())!;
}
async function reconcile(env:GiftEnv,o:GiftOrder){
 if(o.status!=='pending'||!o.provider_order_id)return;
 o=await releaseStrandedFundedClaim(env,o);
 await env.DB!.prepare('UPDATE mimipip_gift_orders SET checked_at=? WHERE id=?').bind(Date.now(),o.id).run();
 const r=await env.STORE_PAY!.razorpay('orders/'+o.provider_order_id+'/payments');
 if(r.ok)for(const p of r.data?.items??[])if(await activateGift(env,o,p))break;
}
export async function authorizedGift(env:GiftEnv,id:unknown,key:unknown){
 if(typeof id!=='string'||!/^MPG-[A-F0-9]{24}$/.test(id)||typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key)||!env.DB||!env.MIMIPIP_GIFT_SECRET)return null;
 const expected=await giftCapability(env.MIMIPIP_GIFT_SECRET,id,'view');let diff=0;for(let i=0;i<64;i++)diff|=key.charCodeAt(i)^expected.charCodeAt(i);if(diff)return null;
 return env.DB.prepare("SELECT * FROM mimipip_gift_orders WHERE id=? AND status='active'").bind(id).first<GiftOrder>();
}
export async function handleGiftCard(request:Request,env:GiftEnv={}):Promise<Response>{
 const u=new URL(request.url),path=u.pathname.replace(/\/$/,'');
 if(path==='/api/gift-card/readiness'&&request.method==='GET'){const ready=await giftReady(env);return giftJson({open:ready,gateway:await gatewayMode(env.STORE_PAY),currencies:['INR'],policyText:GIFT_POLICY.text,minAmount:GIFT_POLICY.minMinor/100,maxAmount:GIFT_POLICY.maxMinor/100,message:ready?undefined:'Gift-card purchasing is temporarily unavailable. Your preview is still available.'});}
 if(path==='/api/gift-card/operations'&&request.method==='GET'){
  if(!env.DB||!env.STORE_PAY||!await env.STORE_PAY.osTokenMatches(request.headers.get('x-zyvorah-token')??''))return giftJson({error:'Not authorised'},401);
  const orders=await env.DB.prepare('SELECT o.id,o.status,o.amount,o.currency,o.payment_id,o.provider_order_id,o.created_at,o.activated_at,o.last_error,c.balance_minor,c.expires_at,e.state AS email_state,e.last_error AS email_error FROM mimipip_gift_orders o LEFT JOIN mimipip_gift_cards c ON c.id=o.id LEFT JOIN mimipip_gift_email e ON e.gift_id=o.id ORDER BY o.created_at DESC LIMIT 100').bind().all();
  const reservations=await env.DB.prepare("SELECT t.order_id,t.gift_id,t.amount_minor,t.state,t.created_at,o.status,o.razorpay_order_id FROM mimipip_gift_tenders t JOIN mimipip_orders o ON o.id=t.order_id WHERE t.state='reserved' ORDER BY t.created_at LIMIT 100").bind().all();
  const lateCaptures=await env.DB.prepare("SELECT id,amount,gift_minor,currency,razorpay_order_id,os_error,created_at,updated_at FROM mimipip_orders WHERE status='review' ORDER BY updated_at DESC LIMIT 100").bind().all();
  const funded=await env.DB.prepare('SELECT gift_id,funded_by,reference,amount_minor,provider_order_id,issued_at,late_payment_id FROM mimipip_gift_funding ORDER BY issued_at DESC LIMIT 100').bind().all();
  return giftJson({orders:orders.results,reservations:reservations.results,lateCaptures:lateCaptures.results,funded:funded.results});
 }
 if(path==='/api/gift-card/issue-funded'&&request.method==='POST'){
  if(!env.DB||!env.STORE_PAY||!await env.STORE_PAY.osTokenMatches(request.headers.get('x-zyvorah-token')??''))return giftJson({error:'Not authorised'},401);
  let b:any;try{b=await request.json();}catch{return giftJson({error:'invalid'},400);}
  const r=await issueFundedGift(env,b);return giftJson(r.body,r.status);
 }
 if(path==='/api/gift-card/image'||path==='/api/gift-card/print'){
  if(request.method!=='GET')return giftJson({error:'Method not allowed'},405);
  const o=await authorizedGift(env,u.searchParams.get('id'),u.searchParams.get('key'));if(!o)return giftJson({error:'Gift card not found'},404);
  const data=await giftPresentation(env,o);
  if(path.endsWith('/image')){const {giftCardImage}=await import('./gift-image');return giftCardImage(data,env);}
  const balance=await env.DB!.prepare('SELECT balance_minor FROM mimipip_gift_cards WHERE id=?').bind(o.id).first<{balance_minor:number}>();
  const html=renderGiftCardHtml(data,{mode:'print'}).replace('</main>',`<p style="font-size:13px">Available balance: ₹${((balance?.balance_minor??0)/100).toLocaleString('en-IN')}. No expiry. Reserved checkouts are excluded from this balance.</p></main>`);
  return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex','Content-Security-Policy':"default-src 'none'; img-src https://mimipip.com data:; font-src https://mimipip.com; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
 }
 if(!env.DB)return giftJson({error:'Gift-card service is temporarily unavailable.'},503);
 if(request.method!=='POST')return giftJson({error:'Method not allowed'},405);
 if(request.headers.get('origin')!==u.origin)return giftJson({error:'Invalid request origin'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return giftJson({error:'JSON required'},415);
 const raw=await request.text();if(raw.length>8192)return giftJson({error:'Payload too large'},413);
 let b:any;try{b=JSON.parse(raw);}catch{return giftJson({error:'Invalid request'},400);}
 const db=env.DB;
 const bucket=await giftHash('gift-request:'+(request.headers.get('CF-Connecting-IP')??'unknown'));
 if(!await rateLimitGift(db,bucket,60,60000))return giftJson({error:'Please wait a minute before trying again.'},429);
 if(path==='/api/gift-card/message'){const {giftMessage}=await import('./gift-message');return giftMessage(b,env,bucket);}
 if(path==='/api/gift-card/check'){
  const card=await cardForCode(db,b.code);if(!card)return giftJson({error:'Gift card not found, unavailable or expired.'},404);
  return giftJson({currency:card.currency,balance:card.balance_minor/100,expiresAt:card.expires_at});
 }
 if(!env.STORE_PAY||!env.MIMIPIP_GIFT_SECRET)return giftJson({error:'Gift-card service is temporarily unavailable.'},503);
 if(typeof b.token!=='string'||!/^[a-f0-9]{64}$/.test(b.token))return giftJson({error:'Invalid gift-card session'},400);
 const tokenHash=await giftHash(b.token);
 let o=await db.prepare('SELECT * FROM mimipip_gift_orders WHERE token_hash=?').bind(tokenHash).first<GiftOrder>();
 if(path==='/api/gift-card/create'){
  if(!await giftReady(env))return giftJson({error:'Gift-card purchasing is temporarily unavailable.'},503);
  let input;try{input=giftInput(b);}catch(e){return giftJson({error:(e as Error).message},400);}
  const fingerprint=await giftHash(JSON.stringify(input));
  if(o&&o.fingerprint!==fingerprint)return giftJson({error:'Gift details changed. Start a new gift-card session.',renew:true},409);
  if(!o){
   const id='MPG-'+crypto.randomUUID().replaceAll('-','').slice(0,24).toUpperCase();
   await db.prepare("INSERT INTO mimipip_gift_orders(id,token_hash,fingerprint,status,amount,currency,presentation,purchaser_email,recipient_email,valid_days,created_at) VALUES(?,?,?,'creating',?,'INR',?,?,?,?,?)").bind(id,tokenHash,fingerprint,input.minor,JSON.stringify(input.presentation),input.purchaser,input.recipient,GIFT_POLICY.validDays,Date.now()).run();
   try{
    const r=await env.STORE_PAY.razorpay('orders',{amount:input.minor,currency:'INR',receipt:id,notes:{brand:'MimiPip',kind:'gift_card',mimipip_gift_id:id}});
    if(!r.ok||!/^order_[A-Za-z0-9]+$/.test(r.data?.id)||r.data.amount!==input.minor||r.data.currency!=='INR')throw new Error('Provider order creation failed');
    await db.prepare("UPDATE mimipip_gift_orders SET provider_order_id=?,status='pending' WHERE id=? AND status='creating'").bind(r.data.id,id).run();
   }catch{await db.prepare("UPDATE mimipip_gift_orders SET status='review',last_error='provider_creation_uncertain' WHERE id=? AND status='creating'").bind(id).run();return giftJson({error:'This gift payment session needs checking. Please contact Mimi Pip before retrying.'},503);}
   o=await db.prepare('SELECT * FROM mimipip_gift_orders WHERE id=?').bind(id).first<GiftOrder>();
  }
  if(o!.status==='pending')return giftJson({keyId:await env.STORE_PAY.keyId(),orderId:o!.provider_order_id,amount:o!.amount,currency:o!.currency,giftId:o!.id});
  if(o!.status!=='active')return giftJson({error:'This gift-card session is being checked. Please contact Mimi Pip.'},409);
 }else if(path==='/api/gift-card/verify'){
  if(!o)return giftJson({error:'Gift card not found'},404);
  if(o.provider_order_id!==b.razorpay_order_id||!/^pay_[A-Za-z0-9]+$/.test(b.razorpay_payment_id??'')||!await env.STORE_PAY.verifySignature(o.provider_order_id+'|'+b.razorpay_payment_id,b.razorpay_signature??''))return giftJson({error:'Payment verification failed'},400);
  const p=await env.STORE_PAY.razorpay('payments/'+b.razorpay_payment_id);if(p.ok)await activateGift(env,o,p.data);
 }else if(path==='/api/gift-card/status'){if(o)await reconcile(env,o);}
 else return giftJson({error:'Not found'},404);
 if(!o)return giftJson({error:'Gift card not found'},404);
 o=(await db.prepare('SELECT * FROM mimipip_gift_orders WHERE id=?').bind(o.id).first<GiftOrder>())!;
 const presentation=await giftPresentation(env,o);
 return giftJson({status:o.status,code:presentation.code,issuedAt:presentation.issuedAt,expiresAt:presentation.expiresAt,giftId:o.id,printUrl:o.status==='active'?`https://mimipip.com/api/gift-card/print?id=${o.id}&key=${await giftCapability(env.MIMIPIP_GIFT_SECRET,o.id,'view')}`:undefined});
}
export async function sweepGifts(env:GiftEnv){
 if(!env.DB||!env.STORE_PAY||!env.MIMIPIP_GIFT_SECRET)return;
 const rows=await env.DB.prepare("SELECT * FROM mimipip_gift_orders WHERE status='pending' ORDER BY checked_at,created_at LIMIT 25").bind().all<GiftOrder>();
 for(const o of rows.results)try{await reconcile(env,o);}catch{ /* durable next pass */ }
 try{await watchFundedOrders(env);}catch{ /* next pass */ }
 await queueGiftEmails(env);
}
