"use client";
import {useRef,useState} from 'react';
import {useAuthGate} from '@/components/AuthGate';
import {ARTIST_CONSENT_VERSION,FILE_LIMITS,ALLOWED_TYPES,type ArtistFileKind} from '@/brand/artist-rules';
type Saved={id:string;kind:string;original_name:string};
type Project={id:string;kind:string;status:string;artist_name:string;badges:string[]};
export default function StudioForm(){
 const [kind,setKind]=useState<'personal'|'artist'>('personal');
 const [files,setFiles]=useState<Saved[]>([]);
 const project=useRef<string|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[sent,setSent]=useState(false);
 const [projects,setProjects]=useState<Project[]>([]);
 const {gate,authModal,promptAuth}=useAuthGate();
 async function request(body:FormData|Record<string,unknown>){
  const res=await fetch('/api/artist-projects',{method:'POST',headers:body instanceof FormData?undefined:{'Content-Type':'application/json'},body:body instanceof FormData?body:JSON.stringify(body)});
  const json=await res.json();
  if(res.status===401)promptAuth('save your drawing privately');
  if(!res.ok)throw new Error(json.error||'Please try again.');
  return json;
 }
 async function upload(selected:File[],fileKind:ArtistFileKind){
  setBusy(true);setMessage('');
  try{
   for(const file of selected){
    if(!ALLOWED_TYPES[fileKind].includes(file.type)||file.size>FILE_LIMITS[fileKind]||!file.size)throw new Error(file.name+': please check the listed file format and size.');
   }
   if(fileKind==='sketch'&&files.filter(f=>f.kind==='sketch').length+selected.length>30)throw new Error('Please choose up to 30 sketches.');
   if(!project.current){const result=await request({action:'create',kind});project.current=result.id;}
   for(let i=0;i<selected.length;i++){
    setMessage('Saving '+(i+1)+' of '+selected.length+' privately…');
    const body=new FormData();body.set('projectId',project.current!);body.set('kind',fileKind);body.set('file',selected[i]);
    const result=await request(body);
    setFiles(current=>current.some(f=>f.id===result.file.id)?current:[...current,result.file]);
   }
   setMessage('Saved privately. Identical files count only once.');
  }catch(error){setMessage(error instanceof Error?error.message:'Please retry.');}
  finally{setBusy(false);}
 }
 function pick(input:HTMLInputElement,fileKind:ArtistFileKind){
  const chosen=Array.from(input.files??[]);input.value='';
  if(chosen.length)gate('save your drawing privately',()=>void upload(chosen,fileKind));
 }
 async function submit(form:HTMLFormElement){
  setBusy(true);setMessage('');
  try{
   if(!project.current)throw new Error('Add your drawing first.');
   const data=new FormData(form);
   const result=await request({action:'submit',id:project.current,guardianName:data.get('guardianName'),artistName:data.get('artistName'),consent:data.get('consent')==='on',consentVersion:ARTIST_CONSENT_VERSION,story:{why:data.get('why'),love:data.get('love'),spaces:data.get('spaces'),notes:data.get('notes')}});
   setSent(true);setMessage('Reference: '+result.id);
  }catch(error){setMessage(error instanceof Error?error.message:'Please retry.');}
  finally{setBusy(false);}
 }
 async function loadProjects(){
  setBusy(true);setMessage('');
  try{
   const res=await fetch('/api/artist-projects');const data=await res.json();
   if(!res.ok)throw new Error(data.error||'Please retry.');
   setProjects(data.projects);setMessage(data.projects.length?'Your privately saved projects are below.':'No projects saved yet.');
  }catch(error){setMessage(error instanceof Error?error.message:'Please retry.');}
  finally{setBusy(false);}
 }
 const sketches=files.filter(f=>f.kind==='sketch').length;
 return <section className="artist-form" id="start" aria-labelledby="start-title">
  <div className="studio-intro"><p className="studio-eyebrow">A little beginning</p><h2 id="start-title">What shall we make?</h2><p>A grown-up starts the project and stays involved throughout. Your files stay private while we review them.</p></div>
  {!project.current&&!sent&&<div className="journey-switch" aria-label="Choose your journey">
   <button type="button" aria-pressed={kind==='personal'} onClick={()=>setKind('personal')}>For my own space <small>Start with one drawing</small></button>
   <button type="button" aria-pressed={kind==='artist'} onClick={()=>setKind('artist')}>Apply as an artist <small>11 sketches and your story</small></button>
  </div>}
  {sent?<div className="studio-thanks" role="status"><p className="studio-eyebrow">Safely received</p><h3>{kind==='artist'?'Your story is with our studio.':'Your drawing’s next chapter starts here.'}</h3><p>{kind==='artist'?'We will review your application. Submitting does not mean you have been accepted, and no artist badge has been awarded yet.':'Our studio will review your drawing and the space you have in mind. A design, price and print proof must be agreed before anything is ordered.'}</p><p>Please keep your reference. You can check your status below.</p></div>:
  <form onSubmit={e=>{e.preventDefault();const form=e.currentTarget;if(form.reportValidity())gate('send your project to the studio',()=>void submit(form));}}>
   <fieldset disabled={busy}><legend>{kind==='artist'?'Your artist application':'Your personal wallpaper project'}</legend>
    <div className="studio-fields"><label>Your name (parent, guardian or adult artist)<input name="guardianName" autoComplete="name" required maxLength={100}/></label><label>Artist’s first name or nickname<input name="artistName" required maxLength={80}/></label></div>
    <div className="studio-upload"><span className="studio-eyebrow">The drawings</span><h3>{kind==='artist'?'Eleven little windows into your world.':'It starts with one much-loved drawing.'}</h3><p>{kind==='artist'?'Different subjects, colours and styles are welcome. They do not need to match.':'A doodle, a painting, a whole imaginary world. Photograph it straight on in daylight, with all four edges visible.'}</p>
     <label className="studio-file">Choose drawings<input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={e=>pick(e.currentTarget,'sketch')}/></label>
     <p className="studio-hint">JPG, PNG or WebP · up to 12 MB each · up to 30 sketches. No school names, addresses or other personal details in the image.</p>
     <p aria-live="polite">{sketches} {kind==='artist'?'/ 11 minimum':''} drawings saved</p>
     {!!files.length&&<ul className="file-list">{files.map(file=><li key={file.id}>{file.original_name} <span>Saved · {file.kind}</span></li>)}</ul>}
    </div>
    {kind==='artist'&&<><div className="studio-fields">
     <label>A little hello on video<input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={e=>pick(e.currentTarget,'video')}/><small>Introduce yourself and show us your favourite drawing. A short clip is lovely. MP4, MOV or WebM, up to 30 MB.</small></label>
     <label>Your voice, your story<input type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/webm,audio/ogg" onChange={e=>pick(e.currentTarget,'audio')}/><small>Tell us something about your art in your own words. MP3, M4A, WAV, WebM or OGG, up to 10 MB.</small></label>
    </div><label>Why do you draw?<textarea name="why" required minLength={2} maxLength={2000} placeholder="I draw because…"/></label><label>What do you love about it?<textarea name="love" required minLength={2} maxLength={2000} placeholder="My favourite part is…"/></label></>}
    <label>{kind==='artist'?'Where would you love your drawings to live?':'Tell us about the space you have in mind.'}<textarea name="spaces" required minLength={2} maxLength={2000} placeholder="A bedroom full of flowers, a reading corner, our living room…"/></label>
    <label>Anything else the studio should know? <span>(optional)</span><textarea name="notes" maxLength={2000} placeholder="Colours you love, wall measurements if you have them, or details you want us to keep."/></label>
    <label className="studio-consent"><input type="checkbox" name="consent" required/><span>I am an adult artist or the child’s parent/legal guardian, with permission to submit this original work and these recordings. I allow Mimi Pip to store and review them privately and contact me about this project. I understand the <a href="#rights">submission and selection terms</a>. This does not grant permission to publish or sell the work.</span></label>
    <button className="studio-button" disabled={busy} type="submit">{busy?'Saving…':kind==='artist'?'Send my artist application':'Send my drawing to the studio'} <span aria-hidden="true">↗</span></button>
    <p className="studio-hint">{kind==='artist'?'Every application is considered individually. Acceptance and publication are at Mimi Pip’s discretion.':'Studio-assisted design development. This form does not generate an instant wallpaper or take payment.'}</p>
   </fieldset>
  </form>}
  <p className="studio-message" role="status" aria-live="polite">{message}</p>
  <button className="studio-text-button" type="button" disabled={busy} onClick={()=>gate('check your private projects',()=>void loadProjects())}>Check my projects &amp; earned badges</button>
  {projects.map(p=><article className="project-status" key={p.id}><h3>{p.artist_name||'Untitled draft'}</h3><p>{p.kind==='artist'?'Artist application':'Personal project'} · {p.status.replaceAll('_',' ')}</p><small>Reference: {p.id}</small>{p.badges.length>0?<div className="earned-badges">{p.badges.map(b=><span key={b}>✦ {b}</span>)}</div>:<p className="studio-hint">No artist badges awarded yet.</p>}</article>)}
  {authModal}
 </section>;
}
