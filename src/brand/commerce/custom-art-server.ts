import {artworkId,CUSTOM_WALLPAPER,type CustomArts} from './custom-services';
import {supabaseAdmin} from '../../lib/supabase-admin';
export async function cartOwnerHash(token:string){
 if(!/^[0-9a-f-]{36}$/i.test(token))throw new Error('Reopen your cart before uploading artwork.');
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),n=>n.toString(16).padStart(2,'0')).join('');
}
export function requestCartToken(request:Request){return /(?:^|;\s*)zyv_cart=([^;]+)/.exec(request.headers.get('cookie')??'')?.[1]??'';}
/** Resolve only this cart's validated uploads, never a URL supplied by a client. */
export async function customArtsFor(lines:unknown,token:string):Promise<CustomArts>{
 const custom=Array.isArray(lines)?lines.filter(l=>l?.slug===CUSTOM_WALLPAPER):[];
 if(!custom.length)return {};
 const ids=custom.map(l=>artworkId(l.crop));
 if(ids.some(id=>!id))throw new Error('Upload your artwork again before ordering.');
 const admin=supabaseAdmin();if(!admin)throw new Error('Artwork storage is temporarily unavailable.');
 const {data,error}=await admin.from('custom_artworks').select('id,image_ref,width,height').eq('cart_owner_hash',await cartOwnerHash(token)).in('id',ids as string[]);
 if(error||data?.length!==new Set(ids).size)throw new Error('This artwork does not belong to your cart. Please upload it again.');
 return Object.fromEntries(data.map((r:any)=>[r.id,{id:r.id,art:r.image_ref,width:r.width,height:r.height,material:'self_adhesive',materialSlug:'self-adhesive-vinyl'}]));
}

/** A durable, authenticated production source. The OS exchanges this for image
 * bytes on every attempt; expiring browser preview links never reach printing. */
export async function paidArtwork(request:Request,env:import('./checkout').Env){
 const fail=(status:number)=>Response.json({error:'Artwork unavailable'},{status,headers:{'Cache-Control':'no-store'}});
 if(!env.DB||!env.STORE_PAY||!await env.STORE_PAY.osTokenMatches(request.headers.get('x-zyvorah-token')??''))return fail(401);
 const url=new URL(request.url),order=url.searchParams.get('order')??'',index=Number(url.searchParams.get('line'))-1;
 if(!/^MP-[A-F0-9]{16}$/.test(order)||!Number.isInteger(index)||index<0||index>=50)return fail(400);
 const row=await env.DB.prepare("SELECT lines FROM mimipip_orders WHERE id=? AND status='paid'").bind(order).first<{lines:string}>();
 const line=row?(JSON.parse(row.lines) as import('./order-payload').StoredLine[])[index]:null;
 if(line?.slug!==CUSTOM_WALLPAPER||!line.fulfilmentArt?.art.startsWith('https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/mimipip-print-files/custom/'))return fail(404);
 const {readDoc}=await import('../../lib/private-doc');
 const bytes=await readDoc(line.fulfilmentArt.art);if(!bytes)return fail(503);
 const ext=/\.(png|jpg|webp)$/.exec(line.fulfilmentArt.art)?.[1]??'png';
 return new Response(new Uint8Array(bytes),{headers:{'Content-Type':ext==='jpg'?'image/jpeg':'image/'+ext,'Cache-Control':'no-store','X-Artwork-Filename':'mimipip-artwork.'+ext,'X-Content-Type-Options':'nosniff'}});
}

export async function enquiries(request:Request,env:import('./checkout').Env){
 if(request.method!=='GET')return Response.json({error:'Method not allowed'},{status:405});
 if(!env.STORE_PAY||!await env.STORE_PAY.osTokenMatches(request.headers.get('x-zyvorah-token')??''))return Response.json({error:'Not authorised'},{status:401});
 const db=supabaseAdmin();if(!db)return Response.json({error:'Unavailable'},{status:503});
 const {data,error}=await db.from('contact_messages').select('id,name,email,message,topic,created_at').order('created_at',{ascending:false}).limit(200);
 return Response.json(error?{error:'Unavailable'}:{enquiries:data},{status:error?503:200,headers:{'Cache-Control':'no-store'}});
}
