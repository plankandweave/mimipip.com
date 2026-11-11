import {ImageResponse} from 'next/og';
import type {GiftEnv} from './gift-card';
import {formatGiftCardAmount,type GiftCardPresentationData} from './gift-card-presentation';
async function asset(env:GiftEnv,path:string){if(!env.ASSETS)throw new Error('Gift artwork binding unavailable');const r=await env.ASSETS.fetch(new Request('https://mimipip.com'+path));if(!r.ok)throw new Error('Gift artwork unavailable');return r.arrayBuffer();}
const uri=(bytes:ArrayBuffer,mime:string)=>{let s='';for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b);return `data:${mime};base64,${btoa(s)}`;};
export async function giftCardImage(d:GiftCardPresentationData,env:GiftEnv){
 // next/og's font parser cannot consume the variable-font tables. These are
 // static instances of the existing brand fonts, not substitute typefaces.
 const [bg,logo,display,body,dev]=await Promise.all([asset(env,`/brand/mimi-pip/gift-cards/${d.style}.jpg`),asset(env,'/brand/mimi-pip/gift-cards/mimipip-logo.png'),asset(env,'/fonts/Fredoka-600.ttf'),asset(env,'/fonts/Nunito-700.ttf'),asset(env,'/fonts/NotoDevanagari-700.ttf')]);
 const text={position:'absolute' as const,display:'flex',left:65,color:'#714414'};
 const sender=`From ${d.senderName}`;
 const senderLength=[...sender].reduce((total,c)=>total+(/[MW@#%]/.test(c)?1.7:/[ilI1.,' ]/.test(c)?0.5:1),0);
 const senderSize=Math.min(30,Math.max(14,1200/Math.max(40,senderLength)));
 const active=d.status==='active'&&Boolean(d.code?.trim());
 return new ImageResponse(<div style={{width:994,height:627,display:'flex',position:'relative',fontFamily:'Nunito,Devanagari',color:'#714414',background:'#fff9ed'}}>
  <img src={uri(bg,'image/jpeg')} width={994} height={627} style={{position:'absolute',top:0,left:0}} alt=""/>
  <img src={uri(logo,'image/png')} width={158} height={79} style={{position:'absolute',top:53,right:65}} alt="MimiPip"/>
  <div style={{...text,top:74,fontSize:25,width:620}}>{d.occasion}</div><div style={{...text,top:119,fontSize:18,letterSpacing:2}}>GIFT CARD</div>
  <div style={{...text,top:199,fontFamily:'Fredoka,Devanagari',fontSize:Math.min(66,Math.max(20,1120/Math.max(17,[...d.recipientName].length))),width:820}}>{d.recipientName}</div>
  <div style={{...text,top:282,fontFamily:'Fredoka,Devanagari',fontSize:senderSize,lineHeight:1.2,width:820}}>{sender}</div>
  <div style={{...text,top:342,fontSize:39}}>{formatGiftCardAmount(d.amount,d.currency)}</div>
  <div style={{...text,top:480,fontSize:18,color:'#65574d'}}>Card reference</div><div style={{...text,top:512,fontSize:23,width:760}}>{active?d.code:'Pending activation'}</div>
  <div style={{...text,top:574,fontSize:21}}>mimipip.com</div><div style={{position:'absolute',display:'flex',right:65,top:578,fontSize:16}}>{active?'No expiry · A little joy, just for you':'Preview · not activated'}</div>
 </div>,{width:994,height:627,fonts:[{name:'Fredoka',data:display,weight:600},{name:'Nunito',data:body,weight:700},{name:'Devanagari',data:dev,weight:700}],headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex','X-Content-Type-Options':'nosniff'}});
}
