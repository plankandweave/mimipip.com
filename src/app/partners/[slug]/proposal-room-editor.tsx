"use client";
import {useRef,useState} from "react";
import {RoomVisualizer,type Corners} from "@/components/RoomVisualizer";
import type {EdgeMids} from "@/lib/coons";
import type {CropData} from "@/lib/visualizer";
import type {ProposalConfiguration} from "@/lib/proposal-configuration";
export default function ProposalRoomEditor({areaId,studyId,revision,artUrl,photoUrl,corners,mids,configuration,disabled}:{areaId:string;studyId:string;revision:number;artUrl:string;photoUrl:string|null;corners:Corners|null;mids:EdgeMids|null;configuration:ProposalConfiguration;disabled:boolean}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const room=useRef<{photo:string;corners:Corners;mids?:EdgeMids}|null>(null);
 const p=configuration.placement;
 async function save(crop:CropData,composite?:string){
  setOpen(false);setError("");if(!room.current||!composite){setError("The room preview could not be captured. Open the editor and try again.");return;}
  setBusy(true);
  try{
   const [photo,preview]=await Promise.all([fetch(room.current.photo).then(r=>r.blob()),fetch(composite).then(r=>r.blob())]);
   const form=new FormData();form.set("photo",photo,"room.jpg");form.set("preview",preview,"preview.jpg");
   form.set("settings",JSON.stringify({areaId,studyId,revision,corners:room.current.corners,mids:room.current.mids,configuration:{...configuration,placement:{zoom:crop.zoom,cropX:crop.offsetX,cropY:crop.offsetY,flipH:crop.flipH??false,flipV:crop.flipV??false}}}));
   const r=await fetch("/api/corporate/studies/room",{method:"POST",body:form});const j=await r.json();if(!r.ok)throw new Error(j.error);
   window.location.reload();
  }catch(e){setError(e instanceof Error?e.message:"Could not save the room.");setBusy(false);}
 }
 return <div className="mt-3">
  <button type="button" className="min-h-10 rounded-lg border border-edge px-4 text-sm disabled:opacity-50" disabled={disabled||busy} onClick={()=>setOpen(true)}>{busy?"Saving room preview…":"View & save in your room"}</button>
  <p className="mt-2 text-xs text-slate">Use your photo and align the four corners to the measured wall. The design follows your wall dimensions; perspective and colour remain a visual guide. Furniture detection helps keep the bed and other objects in front.</p>
  {error&&<p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
  {open&&<RoomVisualizer open onClose={()=>setOpen(false)} imageUrl={artUrl} imageAlt="Proposed botanical wallpaper" wallWidthCm={configuration.widthMm/10} wallHeightCm={configuration.heightMm/10} wallLabel="Measured wall" initialPhoto={photoUrl} initialCorners={corners} initialMids={mids} initial={{imageUrl:artUrl,wallWidthCm:configuration.widthMm/10,wallHeightCm:configuration.heightMm/10,zoom:p.zoom,offsetX:p.cropX,offsetY:p.cropY,flipH:p.flipH,flipV:p.flipV}} onRoomCapture={(photo,corners,mids)=>{room.current={photo,corners,mids};}} onApply={(crop,composite)=>void save(crop,composite)}/>}
 </div>;
}
