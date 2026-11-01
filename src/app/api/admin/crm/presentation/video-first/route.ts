import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { staffKey } from '@/lib/staff-key';
const headers = { 'Cache-Control': 'private, no-store' };
async function authorized(req: Request) {
  const key = await staffKey(req);
  if (!key) return false;
  const {data,error}=await supabase.rpc('admin_key_ok',{p_key:key});
  return !error && data === true;
}
export async function GET(req: Request) {
  if (!await authorized(req)) return new Response('Not found',{status:404,headers});
  const sb=supabaseAdmin(); if (!sb) return new Response('Unavailable',{status:503,headers});
  const {data,error}=await sb.from('crm_presentations').select('id,title,format,lead_video_id,status').eq('company_id',new URL(req.url).searchParams.get('company_id') ?? '').neq('status','archived').order('created_at',{ascending:false});
  return error ? new Response('Unavailable',{status:503,headers}) : Response.json({presentations:data ?? []},{headers});
}
export async function POST(req: Request) {
  if (!await authorized(req)) return new Response('Not found',{status:404,headers});
  if (req.headers.get('origin') !== new URL(req.url).origin) return new Response('Forbidden',{status:403,headers});
  const sb=supabaseAdmin(); if (!sb) return new Response('Unavailable',{status:503,headers});
  const body=await req.json().catch(()=>null);
  if (!body?.presentation_id || !body.video_id || !Object.hasOwn(body,'expected_video_id')) return new Response('Missing fields',{status:400,headers});
  const {data:deck}=await sb.from('crm_presentations').select('company_id,format,lead_video_id').eq('id',body.presentation_id).neq('status','archived').maybeSingle();
  const {data:video}=await sb.from('crm_presentations').select('company_id,format').eq('id',body.video_id).neq('status','archived').maybeSingle();
  if (!deck || deck.format !== 'html' || !video || video.format !== 'video' || video.company_id !== deck.company_id) return new Response('Invalid presentation pairing',{status:400,headers});
  if (deck.lead_video_id === body.video_id) return Response.json({ok:true,unchanged:true},{headers});
  if (deck.lead_video_id !== body.expected_video_id) return new Response('Presentation changed. Refresh before updating.',{status:409,headers});
  let query=sb.from('crm_presentations').update({lead_video_id:body.video_id}).eq('id',body.presentation_id);
  query=body.expected_video_id === null ? query.is('lead_video_id',null) : query.eq('lead_video_id',body.expected_video_id);
  const {data,error}=await query.select('id');
  return error || !data?.length ? new Response('Update not confirmed. Refresh before trying again.',{status:409,headers}) : Response.json({ok:true},{headers});
}
