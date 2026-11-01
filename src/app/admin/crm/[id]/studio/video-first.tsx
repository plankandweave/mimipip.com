'use client';
import {useEffect,useState} from 'react';
type Presentation={id:string;title:string;format:string;lead_video_id:string|null};
export function VideoFirst({companyId}:{companyId:string}) {
 const [items,setItems]=useState<Presentation[]>([]),[deck,setDeck]=useState(''),[video,setVideo]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false);
 const url=`/api/admin/crm/presentation/video-first?company_id=${companyId}`;
 useEffect(()=>{void fetch(url).then(r=>r.ok?r.json():null).then(b=>{if(b)setItems(b.presentations);});},[url]);
 const selected=items.find(p=>p.id===deck);
 return <section className="my-6 rounded-xl border p-5"><h2 className="font-display text-lg font-bold">Video first, original slides below</h2>
 <p className="my-2 text-sm text-slate">Choose the verified film after the personal presentation and call. This keeps the slides and existing access unchanged. No email or invitation is sent.</p>
 <label className="block text-sm">Original presentation <select aria-label="Original presentation" value={deck} onChange={e=>setDeck(e.target.value)} disabled={busy}><option value="">Choose slides</option>{items.filter(p=>p.format==='html').map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
 <label className="my-3 block text-sm">Verified presentation film <select aria-label="Verified presentation film" value={video} onChange={e=>setVideo(e.target.value)} disabled={busy}><option value="">Choose film</option>{items.filter(p=>p.format==='video').map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
 <button className="rounded border px-4 py-2 text-sm" disabled={busy||!selected||!video} onClick={async()=>{setBusy(true);try{const res=await fetch('/api/admin/crm/presentation/video-first',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({presentation_id:deck,video_id:video,expected_video_id:selected?.lead_video_id??null})});if(!res.ok)throw new Error(await res.text());setNote('Video first saved. Slides and access preserved.');const refreshed=await fetch(url);if(refreshed.ok)setItems((await refreshed.json()).presentations);}catch(e){setNote(e instanceof Error?e.message:'Update not confirmed. Refresh before retrying.');}finally{setBusy(false);}}}>Save video first</button><p role="status" className="mt-3 text-sm">{note}</p></section>;
}
