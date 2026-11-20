import {NextResponse} from 'next/server';
import {requireGatedUser} from '@/lib/auth-server';
import {supabaseAdmin} from '@/lib/supabase-admin';
import {ARTIST_CONSENT_VERSION,FILE_LIMITS,ALLOWED_TYPES,submissionError,earnedBadges,type ArtistFileKind} from '@/brand/artist-rules';
export const runtime='nodejs';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export async function GET(){
 const {user,blocked}=await requireGatedUser();if(blocked)return blocked;
 const db=supabaseAdmin();if(!db)return reply({error:'The studio is temporarily unavailable.'},503);
 const {data,error}=await db.from('artist_projects').select('id,kind,status,artist_name,created_at').eq('owner_id',user.id).order('created_at',{ascending:false}).limit(30);
 if(error)return reply({error:'We could not load your projects.'},503);
 return reply({projects:(data??[]).map(p=>({...p,badges:earnedBadges(p.kind,p.status)}))});
}
export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Invalid request origin.'},403);
 const {user,blocked}=await requireGatedUser();if(blocked)return blocked;
 const db=supabaseAdmin();if(!db)return reply({error:'The studio is temporarily unavailable. Your submission has not been sent.'},503);
 try{
 if(req.headers.get('content-type')?.startsWith('multipart/form-data')){
  if(Number(req.headers.get('content-length')??0)>31*1024*1024)return reply({error:'This file is too large.'},413);
  const form=await req.formData(),id=form.get('projectId'),kind=form.get('kind'),file=form.get('file');
  if(!uuid(id)||typeof kind!=='string'||!Object.hasOwn(FILE_LIMITS,kind)||!(file instanceof File))return reply({error:'Choose a valid file.'},400);
  const k=kind as ArtistFileKind;
  if(!file.size||file.size>FILE_LIMITS[k]||!ALLOWED_TYPES[k].includes(file.type))return reply({error:'Use one of the listed file formats and sizes.'},400);
  const {data:project}=await db.from('artist_projects').select('id,status').eq('id',id).eq('owner_id',user.id).maybeSingle();
  if(!project||project.status!=='draft')return reply({error:'This draft is not available for uploads.'},403);
  const {count,error:countError}=await db.from('artist_project_files').select('id',{count:'exact',head:true}).eq('project_id',id);
  if(countError||count===null)return reply({error:'Please retry the upload.'},503);
  if(count>=32)return reply({error:'A project can hold up to 30 sketches, one video and one audio recording.'},400);
  const bytes=await file.arrayBuffer();
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  const {data:duplicate}=await db.from('artist_project_files').select('id,kind,original_name').eq('project_id',id).eq('content_hash',hash).maybeSingle();
  if(duplicate)return reply({file:duplicate,duplicate:true});
  const fileId=crypto.randomUUID(),path='artist-projects/'+user.id+'/'+id+'/'+fileId;
  const bucket=db.storage.from('print-files');
  const {error:uploadError}=await bucket.upload(path,bytes,{contentType:file.type,upsert:false});
  if(uploadError)return reply({error:'The file could not be saved. Please retry.'},503);
  const record={id:fileId,project_id:id,kind:k,object_path:path,original_name:file.name.slice(0,160),mime_type:file.type,bytes:file.size,content_hash:hash};
  const {error}=await db.from('artist_project_files').insert(record);
  if(error){await bucket.remove([path]);return reply({error:'The file could not be confirmed. Please retry.'},503);}
  return reply({file:{id:fileId,kind:k,original_name:record.original_name}});
 }
 if(!req.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Unsupported request.'},415);
 const raw=await req.text();if(raw.length>16000)return reply({error:'Please shorten your story.'},413);
 const b=JSON.parse(raw);
 if(b.action==='create'){
  if(!['personal','artist'].includes(b.kind))return reply({error:'Choose a project type.'},400);
  const {count,error}=await db.from('artist_projects').select('id',{count:'exact',head:true}).eq('owner_id',user.id).gte('created_at',new Date(Date.now()-86400000).toISOString());
  if(error||count===null)return reply({error:'Please retry shortly.'},503);
  if(count>=5)return reply({error:'You have started five projects today. Please return tomorrow.'},429);
  const id=crypto.randomUUID();
  const result=await db.from('artist_projects').insert({id,owner_id:user.id,owner_email:user.email,kind:b.kind});
  return result.error?reply({error:'Your draft could not be saved.'},503):reply({id});
 }
 if(b.action==='submit'){
  if(!uuid(b.id)||b.consent!==true||b.consentVersion!==ARTIST_CONSENT_VERSION)return reply({error:'Please read and accept the submission permissions.'},400);
  const guardian=typeof b.guardianName==='string'?b.guardianName.trim():'';
  const name=typeof b.artistName==='string'?b.artistName.trim():'';
  if(!guardian||guardian.length>100||!name||name.length>80)return reply({error:'Enter your name and the artist’s first name or nickname.'},400);
  const {data:project}=await db.from('artist_projects').select('id,kind,status').eq('id',b.id).eq('owner_id',user.id).maybeSingle();
  if(!project)return reply({error:'Project not found.'},404);
  if(project.status==='submitted')return reply({ok:true,id:project.id,status:'submitted'});
  if(project.status!=='draft')return reply({error:'This project is already being reviewed.'},409);
  const story:Record<string,string>={};
  for(const key of ['why','love','spaces','notes'])story[key]=typeof b.story?.[key]==='string'?b.story[key].trim().slice(0,2000):'';
  const {data:files,error:fileError}=await db.from('artist_project_files').select('kind').eq('project_id',project.id);
  if(fileError)return reply({error:'We could not check your files. Please retry.'},503);
  const problem=submissionError(project.kind,files??[],story);if(problem)return reply({error:problem},400);
  const {data:updated,error}=await db.from('artist_projects').update({guardian_name:guardian,artist_name:name,story,consent_version:ARTIST_CONSENT_VERSION,submitted_at:new Date().toISOString(),status:'submitted'}).eq('id',project.id).eq('owner_id',user.id).eq('status','draft').select('id').maybeSingle();
  if(error||!updated)return reply({error:'Your submission could not be confirmed. Please retry.'},503);
  // The existing desk receives a pointer, never public media links.
  await db.from('contact_messages').insert({name:guardian,email:user.email,topic:project.kind==='artist'?'Mimi Pip artist application':'Drawing to wallpaper',message:'Private studio submission '+project.id+'. Review in mimipip.artist_projects. Media is private in mimipip-print-files. No publication permission has been granted.'});
  return reply({ok:true,id:project.id,status:'submitted'});
 }
 return reply({error:'Unknown action.'},400);
 }catch{return reply({error:'We could not complete that request. Please retry; your saved files are kept private.'},503);}
}
