import { supabase } from '@/lib/supabase';
import { staffKey } from '@/lib/staff-key';
import { presDownload, presUpload, presExists } from '@/lib/presentation-store';
import { REVIEW_LIMIT, reviewPath } from '@/lib/private-review';
const headers = { 'Cache-Control': 'private, no-store' };
export async function POST(req: Request) {
 const key=await staffKey(req);
 if(!key) return new Response('Not found',{status:404,headers});
 const {data:ok,error:authError}=await supabase.rpc('admin_key_ok',{p_key:key});
 if(authError||ok!==true) return new Response('Not found',{status:404,headers});
 if(req.headers.get('origin')!==new URL(req.url).origin)return new Response('Forbidden',{status:403,headers});
 try {
  if(Number(req.headers.get('content-length'))>REVIEW_LIMIT)return new Response('Too large',{status:413,headers});
  const form=await req.formData(),company=String(form.get('company_id')??''),digest=String(form.get('digest')??''),file=form.get('html');
  if(!(file instanceof File)||file.size>REVIEW_LIMIT)return new Response('Provide HTML under 40 MB',{status:400,headers});
  if(!await presExists(reviewPath(company,digest,'complete.json')))return new Response('Completed review not found',{status:404,headers});
  const bytes=await file.arrayBuffer(),html=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(!/<html[\s>]/i.test(html))return new Response('Invalid HTML',{status:415,headers});
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const asset=`ltm-${hash}.html`,path=reviewPath(company,digest,asset);
  const {data:prior,error}=await presDownload(path);
  if(error&&!/object not found|not found/i.test(error.message))throw error;
  if(prior)return Response.json({asset,duplicate:true},{headers});
  const {error:uploadError}=await presUpload(path,bytes,{contentType:'text/html',upsert:false});
  if(uploadError)throw uploadError;
  return Response.json({asset},{headers});
 }catch{return new Response('Update not confirmed. Refresh before trying again.',{status:500,headers});}
}
