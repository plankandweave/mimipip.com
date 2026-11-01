import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {guardCapture} from "@/lib/portfolio-capture";
import {proposalRoomSchema} from "@/lib/proposal-room";
import {caUpload,caRemove} from "@/lib/corporate-art-store";
import {normalizePhotoRemote} from "@/lib/media-client";
import {recordAudit} from "@/lib/corporate-auth";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function POST(req:Request){
 const form=await req.formData().catch(()=>null);
 let settings:unknown; try { settings=JSON.parse(String(form?.get("settings")??"null")); } catch { settings=null; }
 const parsed=proposalRoomSchema.safeParse(settings);
 if(!parsed.success)return NextResponse.json({ok:false,error:"Check the wall corners and dimensions."},{status:400});
 const b=parsed.data,g=await guardCapture(b.areaId);
 if(!g.ok)return NextResponse.json({ok:false,error:g.error},{status:g.status});
 const {sb,session}=g.ctx;
 const {data:s}=await sb.from("corporate_wall_studies").select("id,wall_id,revision").eq("id",b.studyId).eq("account_id",session.account.id).maybeSingle();
 const {data:w}=s?await sb.from("corporate_site_batch_walls").select("batch_id").eq("id",s.wall_id).maybeSingle():{data:null};
 const {data:batch}=w?await sb.from("corporate_site_batches").select("id").eq("id",w.batch_id).eq("area_id",b.areaId).eq("status","collecting").maybeSingle():{data:null};
 if(!s||!batch)return NextResponse.json({ok:false,error:"Proposal not found"},{status:404});
 if(s.revision!==b.revision)return NextResponse.json({ok:false,error:"This proposal changed. Reload it before saving."},{status:409});
 const files=[form?.get("photo"),form?.get("preview")];
 if(files.some(f=>!(f instanceof File)||f.size===0||f.size>15*1024*1024))return NextResponse.json({ok:false,error:"Choose a room photo and preview under 15 MB each."},{status:400});
 const paths:string[]=[];
 let committed=false;
 try{
  for(let i=0;i<files.length;i++){
   const f=files[i] as File;
   const normal=await normalizePhotoRemote(await f.arrayBuffer());
   if("error" in normal)throw new Error("The room image could not be read.");
   const path=`studies/${session.account.slug}/${s.id}-${randomUUID()}-${i===0?"room":"preview"}.jpg`;
   const up=await caUpload(path,Buffer.from(normal.jpeg),{contentType:"image/jpeg",upsert:false});
   if(up.error)throw new Error("The image could not be saved."); paths.push(path);
  }
  const {data:saved,error}=await sb.from("corporate_wall_studies").update({configuration:b.configuration,quad_json:b.corners,room_mids:b.mids??null,
   room_photo_path:paths[0],render_path:paths[1],render_error:null,revision:s.revision+1,status:"draft",approved_at:null,approved_by_email:null,updated_at:new Date().toISOString()})
   .eq("id",s.id).eq("account_id",session.account.id).eq("revision",s.revision).select("id").maybeSingle();
  if(error||!saved)throw new Error("The proposal changed or is already in checkout. Reload before saving.");
  committed=true;
  await recordAudit(session,"proposal.room_saved",{type:"area",id:b.areaId},{studyId:s.id,revision:s.revision+1});
  return NextResponse.json({ok:true});
 }catch(e){if(!committed)await caRemove(paths).catch(()=>{});return NextResponse.json({ok:false,error:e instanceof Error?e.message:"Could not save the room."},{status:409});}
}
