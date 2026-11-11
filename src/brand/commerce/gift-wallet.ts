/**
 * The gift wallet (owner, 11 November 2026): "They create an account for his email ID. And whenever he logs
 * in with his email ID, it shows as a balance that he has … it's like a card which adds to his wallet."
 *
 * The wallet is a view, not a second ledger: it is the unspent balance of the issued cards addressed to the
 * signed-in customer's email. The email is only ever the server-verified, confirmed session email
 * (`confirmedEmail`), never a request field. Spending hands the card's own code to checkout, so wallet and
 * code go through the one reserveGift path and its triggers: neither can spend a balance twice.
 * The purchaser does not see a card they bought for someone else. Matching is lowercase and trim only.
 */
import {giftCapability,type GiftDb} from './gift-ledger';

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

/** The code of a card in this customer's wallet (the oldest, or the one named), for checkout to apply. */
export async function walletCode(db:GiftDb,secret:string,verifiedEmail:string,cardId?:unknown,now=Date.now()){
 const cards=await walletCards(db,verifiedEmail,now);
 const card=typeof cardId==='string'?cards.find(c=>c.id===cardId):cards[0];
 if(!card)return null;
 return {cardId:card.id,balanceMinor:card.balanceMinor,code:await giftCapability(secret,card.id,'code')};
}
