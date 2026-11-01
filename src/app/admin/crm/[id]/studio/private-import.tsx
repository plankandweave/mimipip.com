'use client';
import { useEffect, useRef, useState } from 'react';
export function PrivateImport({ companyId }: { companyId: string }) {
  const [reviews, setReviews] = useState<{ digest: string; title: string; template?: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [note, setNote] = useState('');
  const controller = useRef<AbortController | null>(null);
  const endpoint = `/api/admin/crm/studio/import?company_id=${companyId}`;
  const refresh = async () => {
    const res = await fetch(endpoint);
    if (res.ok) setReviews((await res.json()).reviews);
  };
  useEffect(() => { void fetch(endpoint).then(r => r.ok ? r.json() : null).then(b => { if (b) setReviews(b.reviews); }); return () => controller.current?.abort(); }, [endpoint]);
  return <section className="my-6 rounded-xl border p-5">
    <h2 className="font-display text-lg font-bold">Private finished review</h2>
    <p className="my-2 text-sm text-slate">Import the finished interactive HTML with its MP4 and PDF. Only staff can open these files. Client release is a separate step.</p>
    <form onSubmit={async event => {
      event.preventDefault(); if (busy) return;
      const data = new FormData(event.currentTarget); data.set('company_id', companyId);
      const abort = new AbortController(); controller.current = abort; setBusy(true); setNote('Importing…');
      try {
        const res = await fetch('/api/admin/crm/studio/import', { method: 'POST', body: data, signal: abort.signal });
        if (!res.ok) throw new Error(await res.text());
        const result = await res.json(); setSelected(result.digest);
        setNote(result.duplicate ? 'This review was already imported.' : 'Private review imported.'); await refresh();
      } catch (error) { setNote(abort.signal.aborted ? 'Stopped waiting. Refresh the list before retrying; the import may have completed.' : error instanceof Error ? error.message : 'Import failed.'); }
      finally { setBusy(false); controller.current = null; }
    }} className="space-y-3">
      <label className="block text-sm">Interactive HTML <input name="html" type="file" accept=".html,text/html" required disabled={busy} /></label>
      <label className="block text-sm">Film MP4 <input name="film" type="file" accept=".mp4,video/mp4" required disabled={busy} /></label>
      <label className="block text-sm">Booklet PDF <input name="booklet" type="file" accept=".pdf,application/pdf" required disabled={busy} /></label>
      <button disabled={busy} className="rounded border px-4 py-2 text-sm">{busy ? 'Importing…' : 'Import privately'}</button>
      {busy && <button type="button" onClick={() => controller.current?.abort()} className="ml-3 text-sm underline">Cancel</button>}
      <button type="button" disabled={busy} onClick={() => void refresh()} className="ml-3 text-sm underline">Refresh reviews</button>
    </form>
    <p role="status" className="my-3 text-sm">{note}</p>
    {reviews.map(review => <button key={review.digest} onClick={() => setSelected(review.digest)} className="mr-4 block text-sm underline">{review.title}</button>)}
    {selected && <div className="mt-4">
      <form className="mb-4" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);const data=new FormData(e.currentTarget);data.set('company_id',companyId);data.set('digest',selected);try{const res=await fetch('/api/admin/crm/studio/import/template',{method:'POST',body:data});if(!res.ok)throw new Error(await res.text());setNote('Template version saved privately. Original and media preserved.');await refresh();}catch(error){setNote(error instanceof Error?error.message:'Update not confirmed. Refresh before retrying.');}finally{setBusy(false);}}}>
        <label className="block text-sm">LTM template HTML <input type="file" name="html" accept=".html" required disabled={busy}/></label><button disabled={busy} className="rounded border px-4 py-2 text-sm">Add template version privately</button>
      </form>
      <p className="mb-3 text-sm"><a className="underline" href={`${endpoint}&digest=${selected}&asset=film.mp4`}>Download film</a> · <a className="underline" href={`${endpoint}&digest=${selected}&asset=booklet.pdf`}>Download booklet</a></p>
      <iframe title="Private interactive review" sandbox="allow-scripts" referrerPolicy="no-referrer" src={`${endpoint}&digest=${selected}${reviews.find(r=>r.digest===selected)?.template ? `&asset=${reviews.find(r=>r.digest===selected)?.template}` : ""}`} className="h-[80vh] w-full border" />
    </div>}
  </section>;
}
