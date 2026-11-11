/**
 * The gift wallet (owner, 11 November 2026): "They create an account for his email ID. And whenever he logs
 * in with his email ID, it shows as a balance that he has … it's like a card which adds to his wallet."
 *
 * The wallet is a view, not a second ledger: it is the unspent balance of the issued cards addressed to the
 * signed-in customer's email. The email is only ever the server-verified, confirmed session email
 * (`confirmedEmail`), never a request field. A balance is spent ONLY this way (owner, 11 Nov 2026: "It must need
 * a login. There's no way you should give this without a login."): the signed-in route hands checkout a short-lived
 * ticket the shop signed for this card and this email, checkout re-checks both and the order's email, and the
 * one reserveGift path and its triggers keep any balance from being spent twice. The card's reference
 * (MIMI-XXXX-XXXX) only names a card; on its own it spends and reveals nothing.
 * The purchaser does not see a card they bought for someone else. Matching is lowercase and trim only.
 */
import {giftHmac,giftReference,cardForCode,hex,type GiftDb,type GiftCard} from './gift-ledger';

export type WalletCard={id:string;balanceMinor:number;initialMinor:number;from:string;occasion:string;issuedAt:number};
type Row={id:string;balance_minor:number;initial_minor:number;activated_at:number;presentation:string};

export const walletEmail=(e:unknown)=>typeof e==='string'?e.trim().toLowerCase():'';

/** The one gate: a signed-in user whose email the auth provider has confirmed. Anything else sees nothing. */
export function confirmedEmail(user:{email?:string|null;email_confirmed_at?:string|null}|null|undefined):string|null{
 const email=walletEmail(user?.email);
 return email.includes('@')&&typeof user?.email_confirmed_at==='string'&&user.email_confirmed_at.length>0?email:null;
}

/** Spendable cards for this verified email, oldest first. */
export async function walletCards(db:GiftDb,verifiedEmail:string,now=Date.now()):Promise<WalletCard[]>{
 const email=walletEmail(verifiedEmail);
 if(!email.includes('@'))throw new Error('Verified email required');
 const rows=await db.prepare(`SELECT c.id,c.balance_minor,c.initial_minor,c.activated_at,o.presentation FROM mimipip_gift_cards c JOIN mimipip_gift_orders o ON o.id=c.id
  WHERE o.status='active' AND c.status='active' AND c.currency='INR' AND c.balance_minor>0 AND (c.expires_at IS NULL OR c.expires_at>?)
  AND lower(trim(o.recipient_email))=? ORDER BY c.activated_at,c.id LIMIT 50`).bind(now,email).all<Row>();
 return rows.results.map(r=>{let p:any={};try{p=JSON.parse(r.presentation);}catch{/* the balance still shows */}
  return {id:r.id,balanceMinor:r.balance_minor,initialMinor:r.initial_minor,from:String(p.senderName??''),occasion:String(p.occasion??''),issuedAt:r.activated_at};});
}

export const walletBalance=(cards:WalletCard[])=>cards.reduce((n,c)=>n+c.balanceMinor,0);

const TICKET_TTL_MS=60*60_000;
const b64=(v:string)=>btoa(String.fromCharCode(...new TextEncoder().encode(v))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=(v:string)=>new TextDecoder().decode(Uint8Array.from(atob(v.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)));
/** A short-lived proof, signed by the shop, that this signed-in customer may spend this card of theirs. */
export async function walletTicket(secret:string,cardId:string,verifiedEmail:string,now=Date.now()){
 const payload=`${cardId}|${walletEmail(verifiedEmail)}|${now+TICKET_TTL_MS}`;
 return `${b64(payload)}.${hex((await giftHmac(secret,'mimipip-wallet-v1:'+payload)).buffer as ArrayBuffer)}`;
}
export async function readWalletTicket(secret:string,ticket:unknown,now=Date.now()):Promise<{cardId:string;email:string}|null>{
 if(typeof ticket!=='string'||ticket.length>600||!/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(ticket))return null;
 const [enc,sig]=ticket.split('.') as [string,string];
 let payload:string;try{payload=unb64(enc);}catch{return null;}
 const expected=hex((await giftHmac(secret,'mimipip-wallet-v1:'+payload)).buffer as ArrayBuffer);
 let diff=0;for(let i=0;i<64;i++)diff|=sig.charCodeAt(i)^expected.charCodeAt(i);if(diff)return null;
 const [cardId,email,exp]=payload.split('|');
 if(!cardId||!/^MPG-[A-F0-9]{24}$/.test(cardId)||!email?.includes('@')||!(Number(exp)>now))return null;
 return {cardId,email};
}
/** The card a ticket spends, only while it is still this customer's and still holds a balance. */
export async function cardForTicket(db:GiftDb,secret:string,ticket:unknown,now=Date.now()):Promise<{card:GiftCard;email:string}|null>{
 const t=await readWalletTicket(secret,ticket,now);if(!t)return null;
 if(!(await walletCards(db,t.email,now)).some(c=>c.id===t.cardId))return null;
 const card=await db.prepare("SELECT * FROM mimipip_gift_cards WHERE id=? AND status='active'").bind(t.cardId).first<GiftCard>();
 return card?{card,email:t.email}:null;
}
/** Spend from the wallet: the oldest card, or the one whose reference the customer typed. A reference that is
 *  not theirs gets the same answer as one that does not exist, so it cannot be used to test references. */
export async function walletSpend(db:GiftDb,secret:string,verifiedEmail:string,opts:{cardId?:unknown;reference?:unknown}={},now=Date.now()){
 const cards=await walletCards(db,verifiedEmail,now);
 let card=typeof opts.cardId==='string'?cards.find(c=>c.id===opts.cardId):cards[0];
 if(opts.reference!==undefined){const byRef=await cardForCode(db,opts.reference,now);card=byRef?cards.find(c=>c.id===byRef.id):undefined;}
 if(!card)return null;
 const n=(await db.prepare('SELECT code_n FROM mimipip_gift_cards WHERE id=?').bind(card.id).first<{code_n:number}>())?.code_n??0;
 return {cardId:card.id,balanceMinor:card.balanceMinor,reference:await giftReference(secret,card.id,n),ticket:await walletTicket(secret,card.id,verifiedEmail,now)};
}
