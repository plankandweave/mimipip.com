import {supabaseServerAuth} from '@/lib/auth-server';
import {confirmedEmail,walletBalance,walletCards,walletCode} from '@/brand/commerce/gift-wallet';
import type {GiftEnv} from '@/brand/commerce/gift-card';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
async function verified(){
 const auth=await supabaseServerAuth();
 const {data,error}=await auth.auth.getUser();
 return error?null:confirmedEmail(data.user);
}
/** The signed-in customer's gift balance: cards addressed to their confirmed email. */
export async function GET(){
 try{
  const email=await verified();if(!email)return json({error:'Please sign in to see your gift balance.'},401);
  const {env}=await import(/* @vite-ignore */ 'cloudflare:workers') as {env:GiftEnv};
  if(!env.DB)return json({error:'Your gift balance is temporarily unavailable.'},503);
  const cards=await walletCards(env.DB,email);
  return json({balanceMinor:walletBalance(cards),currency:'INR',cards});
 }catch{return json({error:'Your gift balance could not be loaded. Please try again.'},503);}
}
/** Apply the wallet at checkout: the code of the customer's own card, for the existing gift-card path. */
export async function POST(request:Request){
 try{
  if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Invalid request origin'},403);
  const email=await verified();if(!email)return json({error:'Please sign in to use your gift balance.'},401);
  const {env}=await import(/* @vite-ignore */ 'cloudflare:workers') as {env:GiftEnv};
  if(!env.DB||!env.MIMIPIP_GIFT_SECRET)return json({error:'Your gift balance is temporarily unavailable.'},503);
  let b:any={};try{b=await request.json();}catch{/* oldest card */}
  const card=await walletCode(env.DB,env.MIMIPIP_GIFT_SECRET,email,b?.cardId);
  if(!card)return json({error:'There is no gift balance on this account.'},404);
  return json(card);
 }catch{return json({error:'Your gift balance could not be used. Please try again.'},503);}
}
