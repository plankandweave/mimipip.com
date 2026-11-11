import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {requireGatedUser} from '@/lib/auth-server';
import {supabaseAdmin} from '@/lib/supabase-admin';
import {bakeRotationRemote} from '@/lib/media-client';
import {cartOwnerHash} from '@/brand/commerce/custom-art-server';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({error:'Invalid request origin'},{status:403});
 const {user,blocked}=await requireGatedUser();if(blocked)return blocked;
 const admin=supabaseAdmin();if(!admin)return NextResponse.json({error:'Artwork storage is temporarily unavailable.'},{status:503});
 if(Number(req.headers.get('content-length')??0)>13*1024*1024)return NextResponse.json({error:'Choose an image up to 12 MB.'},{status:413});
 const form=await req.formData().catch(()=>null),file=form?.get('image');
 // The shared image service accepts up to 12 MB; do not advertise a larger upload.
 if(!(file instanceof File)||!file.type.startsWith('image/')||file.size>12*1024*1024)return NextResponse.json({error:'Choose a JPG, PNG or WebP image up to 12 MB.'},{status:400});
 let baked;
 try {baked=await bakeRotationRemote(await file.arrayBuffer());}catch{return NextResponse.json({error:'We could not read that image.'},{status:400});}
 if('error' in baked||!baked.width||!baked.height)return NextResponse.json({error:'We could not read that image.'},{status:400});
 const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'} as Record<string,string>)[baked.contentType];
 if(!ext)return NextResponse.json({error:'Use JPG, PNG or WebP artwork.'},{status:400});
 const jar=await cookies(),token=jar.get('zyv_cart')?.value??crypto.randomUUID();
 const owner=await cartOwnerHash(token),id=crypto.randomUUID(),path=`custom/${owner}/${id}.${ext}`;
 const bucket=admin.storage.from('print-files');
 const {error}=await bucket.upload(path,baked.bytes,{contentType:baked.contentType,upsert:false});
 if(error)return NextResponse.json({error:'Artwork could not be saved. Please retry.'},{status:503});
 const imageRef=bucket.getPublicUrl(path).data.publicUrl;
 const saved=await admin.from('custom_artworks').insert({id,owner_user:user!.id,cart_owner_hash:owner,image_ref:imageRef,width:baked.width,height:baked.height});
 if(saved.error){await bucket.remove([path]);return NextResponse.json({error:'Artwork could not be confirmed. Please retry.'},{status:503});}
 const signed=await bucket.createSignedUrl(path,3600);
 if(!signed.data?.signedUrl)return NextResponse.json({error:'Preview could not be opened. Please retry.'},{status:503});
 const response=NextResponse.json({url:signed.data.signedUrl,customArtworkId:id,width:baked.width,height:baked.height,lowRes:Math.max(baked.width,baked.height)<1600});
 response.cookies.set('zyv_cart',token,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:60*60*24*60});
 response.headers.set('Cache-Control','no-store');return response;
}
