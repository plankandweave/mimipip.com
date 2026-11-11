import type {Env} from './checkout';
export type GiftDb=NonNullable<Env['DB']>;
export type GiftCard={id:string;code_hash:string;initial_minor:number;balance_minor:number;currency:'INR';status:'active'|'suspended';activated_at:number;expires_at:number|null};
export type GiftTender={order_id:string;gift_id:string;amount_minor:number;state:'reserved'|'redeemed';created_at:number};
const enc=new TextEncoder();
export const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
export const giftHash=async(v:string)=>hex(await crypto.subtle.digest('SHA-256',enc.encode(v)));
export async function giftCapability(secret:string,id:string,purpose:'code'|'view'){
 if(secret.length<32)throw new Error('Gift signing key unavailable');
 const k=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const value=hex(await crypto.subtle.sign('HMAC',k,enc.encode(`mimipip-gift-v1:${purpose}:${id}`)));
 return purpose==='view'?value:'MIMI-'+value.slice(0,24).toUpperCase().match(/.{6}/g)!.join('-');
}
export const normalizedGiftCode=(code:unknown)=>typeof code==='string'?code.trim().toUpperCase().replace(/[\s-]/g,''):'';
export async function cardForCode(db:GiftDb,code:unknown,now=Date.now()){
 const normalized=normalizedGiftCode(code);
 if(!/^MIMI[A-F0-9]{24}$/.test(normalized))return null;
 const row=await db.prepare("SELECT * FROM mimipip_gift_cards WHERE code_hash=? AND status='active'").bind(await giftHash(normalized)).first<GiftCard>();
 return row&&(!row.expires_at||row.expires_at>now)?row:null;
}
export async function tenderFor(db:GiftDb,orderId:string){return db.prepare('SELECT * FROM mimipip_gift_tenders WHERE order_id=?').bind(orderId).first<GiftTender>();}
/** One SQL statement plus triggers checks and debits atomically. No read-modify-write balance race. */
export async function reserveGift(db:GiftDb,orderId:string,giftId:string,minor:number,now=Date.now()){
 if(!Number.isSafeInteger(minor)||minor<=0)throw new Error('Invalid gift tender');
 await db.prepare('INSERT INTO mimipip_gift_tenders(order_id,gift_id,amount_minor,created_at) VALUES(?,?,?,?)').bind(orderId,giftId,minor,now).run();
}
/** A committed gift remains debited. Only an unpresented creating checkout may be removed/released. */
export async function abandonUnpresentedOrder(db:GiftDb,orderId:string){
 await db.prepare("DELETE FROM mimipip_orders WHERE id=? AND status='creating' AND razorpay_order_id IS NULL").bind(orderId).run();
}
export async function rateLimitGift(db:GiftDb,bucket:string,limit:number,windowMs:number,now=Date.now()){
 const window=Math.floor(now/windowMs);
 const row=await db.prepare('INSERT INTO mimipip_gift_limits(bucket,window,hits) VALUES(?,?,1) ON CONFLICT(bucket,window) DO UPDATE SET hits=hits+1 RETURNING hits').bind(bucket,window).first<{hits:number}>();
 return !!row&&row.hits<=limit;
}
/** Creating orders have never exposed a provider order to a browser. A conditional
 * delete races safely with publication: either pending wins and stays reserved,
 * or deletion wins and a late worker cannot publish its now-missing checkout. */
export async function recoverCreatingGiftOrders(db:GiftDb,now=Date.now()){
 await db.prepare("DELETE FROM mimipip_orders WHERE status='creating' AND razorpay_order_id IS NULL AND created_at<=? AND id IN (SELECT order_id FROM mimipip_gift_tenders WHERE state='reserved')").bind(now-5*60000).run();
}
