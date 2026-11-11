import {giftJson,type GiftEnv} from './gift-card';
import {rateLimitGift} from './gift-ledger';
import {GIFT_CARD_OCCASIONS} from './gift-card-presentation';
export async function giftMessage(b:any,env:GiftEnv,bucket:string){
 if(!env.DB||!env.SHOPPER_TOOLS)return giftJson({error:'Message suggestions are unavailable. You can still write your own.'},503);
 if(!GIFT_CARD_OCCASIONS.includes(b.occasion)&&b.occasion!=='Baby shower / डोहाळजेवण')return giftJson({error:'Choose an occasion first.'},400);
 for(const [key,max] of [['recipientName',58],['senderName',58],['message',400]] as const)if(typeof b[key]!=='string'||b[key].length>max)return giftJson({error:'Check your names and message.'},400);
 if(!await rateLimitGift(env.DB,'message:'+bucket,10,3600000)||!await rateLimitGift(env.DB,'message:daily',200,86400000))return giftJson({error:'Message suggestions have reached their limit for now. Please write your own little note.'},429);
 try{
  const r=await env.SHOPPER_TOOLS.fetch(new Request('https://mimipip-tools/openai/gift-message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({occasion:b.occasion,recipientName:b.recipientName,senderName:b.senderName,message:b.message})}));
  const d=await r.json() as {messages?:unknown};
  if(!r.ok||!Array.isArray(d.messages)||d.messages.length!==3||d.messages.some(m=>typeof m!=='string'||!m.trim()||m.length>400))throw new Error('No usable suggestions');
  return giftJson({messages:d.messages});
 }catch{return giftJson({error:'We could not write suggestions just now. Your own message is saved.'},503);}
}
