"use client";

import {completedGifts,finishGiftSession,type CompletedGift} from '@/brand/commerce/gift-session';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GIFT_CARD_INR_PRESETS, GIFT_CARD_OCCASIONS, GIFT_CARD_STYLES, formatGiftCardAmount, renderGiftCardHtml, type GiftCardPresentationData, type GiftCardStyle } from '@/brand/commerce/gift-card-presentation';

type Readiness = { minAmount?:number; maxAmount?:number; open: boolean; currencies?: string[]; message?: string; policyText?: string };
type Receipt = { printUrl?:string; status: string; code?: string; issuedAt?: string | number; expiresAt?: string | number };
type ProviderResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type PaymentConstructor = new (options: Record<string, unknown>) => { open(): void };

function loadPaymentWindow(): Promise<PaymentConstructor> {
  const get = () => (window as unknown as { Razorpay?: PaymentConstructor }).Razorpay;
  if (get()) return Promise.resolve(get()!);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => get() ? resolve(get()!) : reject(new Error('The payment window did not load. Please try again.'));
    script.onerror = () => reject(new Error('The payment window could not load. Please try again.'));
    document.body.appendChild(script);
  });
}

function GiftCardPreview({ data, origin }: { data: GiftCardPresentationData; origin: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  const html = useMemo(() => renderGiftCardHtml(data, { mode: 'card', assetBaseUrl: origin }), [data, origin]);
  return <div className="mp-gift-preview-frame" ref={frame}><iframe title="Personalized MimiPip gift-card preview" srcDoc={html} sandbox="allow-same-origin" style={{ width: 994, height: 627, border: 0, display: 'block', transform: `scale(${width / 994})`, transformOrigin: 'top left' }} /></div>;
}

export default function GiftCardPage() {
  const [style, setStyle] = useState<GiftCardStyle>('blue-daisy');
  const [occasion, setOccasion] = useState<string>('Baby shower');
  const [amount, setAmount] = useState<number>(2001);
  const [custom, setCustom] = useState('');
  const [fields, setFields] = useState({ recipientName: '', senderName: '', purchaserEmail: '', recipientEmail: '', message: '' });
  const [origin, setOrigin] = useState('https://mimipip.com');
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [suggestions,setSuggestions]=useState<string[]>([]);
  const [writing,setWriting]=useState(false);
  const suggest=async()=>{setWriting(true);setError('');try{const r=await fetch('/api/gift-card/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({occasion,...fields})});const d=await r.json();if(!r.ok)throw new Error(d.error);setSuggestions(d.messages);}catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setWriting(false);}};
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [history,setHistory]=useState<CompletedGift[]>([]);
  const attempt = useRef<{ token: string; fingerprint: string } | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    setHistory(completedGifts(sessionStorage));
    try{const saved=JSON.parse(sessionStorage.getItem('mimipip-gift-session')||'null');if(saved?.token&&saved?.fingerprint){const d=JSON.parse(saved.fingerprint);attempt.current=saved;setStyle(d.style);setOccasion(d.occasion);setCustom(String(d.amount));setFields({recipientName:d.recipientName,senderName:d.senderName,purchaserEmail:d.purchaserEmail,recipientEmail:d.recipientEmail,message:d.message});setReceipt({status:'pending'});fetch('/api/gift-card/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:saved.token})}).then(async r=>{if(r.ok)setReceipt(await r.json());}).catch(()=>{});}}catch{/* A broken saved preview cannot affect issuance. */}
    const controller = new AbortController();
    fetch('/api/gift-card/readiness', { cache: 'no-store', signal: controller.signal })
      .then(async response => response.ok ? response.json() : { open: false })
      .then(data => setReadiness(data && typeof data.open === 'boolean' ? data : { open: false }))
      .catch(() => { if (!controller.signal.aborted) setReadiness({ open: false }); });
    return () => controller.abort();
  }, []);

  const value = custom.trim() ? Number(custom) : amount;
  const validAmount = Number.isFinite(value) && value >= (readiness?.minAmount??500) && value <= (readiness?.maxAmount??50000) && Math.abs(value * 100 - Math.round(value * 100)) < 0.00001;
  const salesOpen = readiness?.open === true && (readiness.currencies ?? ['INR']).includes('INR');
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validPurchase = validAmount && !!fields.recipientName.trim() && !!fields.senderName.trim() && email.test(fields.purchaserEmail.trim()) && (!fields.recipientEmail.trim() || email.test(fields.recipientEmail.trim()));
  const data = useMemo<GiftCardPresentationData>(() => ({ style, occasion, amount: validAmount ? value : 0, currency: 'INR', recipientName: fields.recipientName, senderName: fields.senderName, message: fields.message, status: receipt?.status === 'active' && receipt.code ? 'active' : receipt ? 'pending' : 'preview', code: receipt?.status === 'active' ? receipt.code : undefined, issuedAt: receipt?.issuedAt, expiresAt: receipt?.expiresAt }), [style, occasion, value, validAmount, fields, receipt]);
  const setField = (key: keyof typeof fields, next: string) => { setFields(current => ({ ...current, [key]: next })); setError(''); };
  const download = () => {
    if(receipt?.status==='active'&&receipt.printUrl){window.open(receipt.printUrl,'_blank','noopener,noreferrer');return;}
    const url = URL.createObjectURL(new Blob([renderGiftCardHtml(data, { mode: 'print', assetBaseUrl: origin })], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `mimipip-${data.status === 'active' ? 'gift-card' : 'gift-preview'}.html`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const anotherGift=()=>{
    try{if(receipt?.status!=='active'||!receipt.printUrl)return;setHistory(finishGiftSession(sessionStorage,{recipientName:fields.recipientName,amount:value,printUrl:receipt.printUrl},receipt.status));attempt.current=null;setReceipt(null);setFields({recipientName:'',senderName:'',purchaserEmail:'',recipientEmail:'',message:''});setAmount(2001);setCustom('');setError('');setSuggestions([]);}catch(e){setError(e instanceof Error?e.message:'Save your card before starting another gift.');}
  };
  const checkStatus = async () => {
    if (!attempt.current || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/gift-card/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: attempt.current.token }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'We could not check this gift card just now.');
      setReceipt(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Please try again.'); }
    finally { setBusy(false); }
  };
  const buy = async () => {
    if (!salesOpen || !validPurchase || busy || receipt?.status==='active') return;
    setBusy(true); setError('');
    const details = { style, occasion, amount: value, currency: 'INR', ...fields, recipientName: fields.recipientName.trim(), senderName: fields.senderName.trim(), purchaserEmail: fields.purchaserEmail.trim(), recipientEmail: fields.recipientEmail.trim() || fields.purchaserEmail.trim() };
    const fingerprint = JSON.stringify(details);
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) attempt.current = { token: Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join(''), fingerprint };
    sessionStorage.setItem('mimipip-gift-session',JSON.stringify(attempt.current));
    const currentToken = attempt.current.token;
    try {
      const response = await fetch('/api/gift-card/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...details, token: currentToken }) });
      const order = await response.json();
      if (!response.ok) throw new Error(order.error || 'Gift-card purchasing is not available just now.');
      if(order.status==='active'){setReceipt(order);setBusy(false);return;}
      setReceipt({status:'pending'});
      if (!order.keyId || !order.orderId || !Number.isSafeInteger(order.amount) || order.currency !== 'INR') throw new Error('The payment details could not be confirmed. Please try again.');
      const Razorpay = await loadPaymentWindow();
      new Razorpay({ key: order.keyId, order_id: order.orderId, amount: order.amount, currency: order.currency, name: 'MimiPip', description: `Gift card · ${formatGiftCardAmount(value, 'INR')}`, prefill: { name: fields.senderName, email: fields.purchaserEmail }, theme: { color: '#ff542b' },
        handler: async (result: ProviderResult) => {
          try {
            const verified = await fetch('/api/gift-card/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: currentToken, ...result }) });
            const status = await verified.json();
            if (!verified.ok) throw new Error(status.error || 'Payment confirmation is still pending. Please check the status before trying again.');
            setReceipt(status);
          } catch (reason) { setReceipt({ status: 'pending' }); setError(reason instanceof Error ? reason.message : 'Payment confirmation is pending.'); }
          finally { setBusy(false); }
        }, modal: { ondismiss: () => { setBusy(false); setError('The payment window was closed. You can check its status before trying again.'); } },
      }).open();
    } catch (reason) { setBusy(false); setError(reason instanceof Error ? reason.message : 'We could not connect. Please try again.'); }
  };

  return <main className="mp-gifts">
    <style>{`
      .mp-gifts{background:#fff9ed;color:#714414;font-family:MimiText,Arial,sans-serif;padding:36px 24px 72px}.mp-gifts *{box-sizing:border-box}.mp-gift-header{max-width:1240px;margin:0 auto 34px;text-align:center}.mp-gift-eyebrow{font-weight:800;font-size:12px;letter-spacing:2px;text-transform:uppercase}.mp-gift-header h1{font-family:MimiDisplay,Arial,sans-serif;font-weight:500;font-size:clamp(32px,5vw,54px);line-height:1.1;margin:12px 0}.mp-gift-header p{max-width:570px;margin:0 auto;font-size:17px;line-height:1.6}.mp-gift-layout{max-width:1240px;display:grid;grid-template-columns:minmax(0,1.08fr) minmax(340px,.92fr);gap:40px;margin:auto;align-items:start}.mp-gift-preview{position:sticky;top:100px}.mp-gift-preview-frame{aspect-ratio:994/627;position:relative;width:100%;overflow:hidden;border-radius:22px;box-shadow:0 12px 40px #71441412}.mp-gift-preview-caption{font-size:13px;line-height:1.6;margin:16px 0 0;text-align:center;color:#806345}.mp-gift-form{background:#fffdf8;border:1px solid #ead9bd;border-radius:24px;padding:28px}.mp-gifts fieldset{padding:0;border:0;margin:0 0 26px;min-width:0}.mp-gifts legend{font-family:MimiDisplay,Arial,sans-serif;font-size:23px;font-weight:500;margin-bottom:13px}.mp-gift-styles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.mp-gift-style{padding:0;border:2px solid transparent;overflow:hidden;border-radius:14px;background:#fff9ed;color:#714414;cursor:pointer;min-width:0}.mp-gift-style[aria-pressed=true]{border-color:#ff542b;box-shadow:0 0 0 2px #ff542b18}.mp-gift-style img{display:block;width:100%;aspect-ratio:994/627;object-fit:contain}.mp-gift-style span{display:block;padding:9px 3px;font-size:12px;font-weight:800}.mp-gift-field{display:grid;gap:7px;font-size:13px;font-weight:800;margin-bottom:14px}.mp-gift-field input,.mp-gift-field select,.mp-gift-field textarea{width:100%;min-height:46px;border:1px solid #d7c5a7;border-radius:12px;background:#fff;color:#714414;padding:11px 13px;font:400 15px MimiText,Arial,sans-serif}.mp-gift-field textarea{resize:vertical}.mp-gifts input:focus,.mp-gifts select:focus,.mp-gifts textarea:focus,.mp-gifts button:focus-visible{outline:3px solid #49b9ec;outline-offset:3px}.mp-gift-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mp-gift-presets{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:13px}.mp-gift-presets button{border:1px solid #d7c5a7;padding:9px 10px;border-radius:99px;background:#fff;color:#714414;font:800 13px MimiText,Arial,sans-serif;cursor:pointer}.mp-gift-presets button[aria-pressed=true]{background:#ff542b;border-color:#ff542b;color:#fff}.mp-gift-note{font-size:12px;line-height:1.55;margin:6px 0 14px;color:#806345}.mp-gift-button{border:0;background:#ff542b;color:#fff;border-radius:99px;padding:14px 22px;font:800 15px MimiText,Arial,sans-serif;cursor:pointer;width:100%}.mp-gift-button:disabled{opacity:.5;cursor:not-allowed}.mp-gift-secondary{background:transparent;color:#714414;border:1px solid #d7c5a7;margin-top:10px}.mp-gift-error{background:#fff0e8;border:1px solid #f4b493;padding:13px;border-radius:12px;font-size:14px;line-height:1.5}.mp-gift-state{border:1px solid #d7c5a7;border-radius:16px;padding:18px;margin-bottom:20px;background:#fff9ed}.mp-gift-state h2{font:500 26px MimiDisplay,Arial,sans-serif;margin:0 0 8px}.mp-gift-code{font:700 22px MimiText,Arial,sans-serif;overflow-wrap:anywhere}.mp-gift-state p{font-size:14px;line-height:1.6;margin:8px 0}@media(max-width:900px){.mp-gift-layout{grid-template-columns:1fr;max-width:680px;gap:24px}.mp-gift-preview{position:static}.mp-gift-header{margin-bottom:24px}}@media(max-width:480px){.mp-gifts{padding:26px 16px 48px}.mp-gift-form{padding:20px}.mp-gift-two{grid-template-columns:1fr;gap:0}.mp-gift-preview-frame{border-radius:14px}.mp-gift-header p{font-size:15px}.mp-gift-styles{gap:6px}.mp-gift-style span{font-size:11px}}
    `}</style>
    <header className="mp-gift-header"><span className="mp-gift-eyebrow">Little gifts. Lovely moments.</span><h1>A little joy, chosen by you.</h1><p>Pick a MimiPip card, add your names, and make their special moment a little brighter.</p></header>
    <div className="mp-gift-layout">
      <section className="mp-gift-preview" aria-label="Live gift-card preview"><GiftCardPreview data={data} origin={origin} /><p className="mp-gift-preview-caption">{data.status === 'active' ? 'Your activated MimiPip gift card.' : 'Your live preview. The shopping code appears only after activation.'}</p><button type="button" className="mp-gift-button mp-gift-secondary" onClick={download}>Download printable {data.status === 'active' ? 'gift card' : 'preview'}</button><p className="mp-gift-note" style={{ textAlign: 'center' }}>Open the downloaded file to print it or save it as a PDF.</p></section>
      <form className="mp-gift-form" onSubmit={event => { event.preventDefault(); if (salesOpen) void buy(); else download(); }}>
        {receipt && <section className="mp-gift-state" aria-live="polite"><h2>{data.status === 'active' ? 'Your gift is ready.' : 'Confirmation is pending.'}</h2><p>{data.status === 'active' ? 'Your shopping code is ready, and your gift email is queued for delivery. Keep this page or your printable card safe.' : 'Please check the status before making another payment. No active shopping code is shown yet.'}</p>{data.status === 'active' && <p className="mp-gift-code">{receipt.code}</p>}<button type="button" className="mp-gift-button mp-gift-secondary" onClick={checkStatus} disabled={busy}>Check status</button>{receipt.status==='active'&&<button type="button" className="mp-gift-button mp-gift-secondary" onClick={anotherGift} disabled={busy}>Send another gift</button>}</section>}
        <fieldset disabled={busy || !!receipt}><legend>Choose your card</legend><div className="mp-gift-styles">{GIFT_CARD_STYLES.map(item => <button key={item.id} className="mp-gift-style" type="button" aria-pressed={style === item.id} onClick={() => setStyle(item.id)}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/brand/mimi-pip/gift-cards/${item.id}.jpg`} alt={item.description} /><span>{item.label}</span></button>)}</div></fieldset>
        <fieldset disabled={busy || !!receipt}><legend>Make it personal</legend><label className="mp-gift-field">Occasion<select value={occasion} onChange={event => setOccasion(event.target.value)}>{[...GIFT_CARD_OCCASIONS,'Baby shower / डोहाळजेवण'].map(item => <option key={item} value={item}>{item}</option>)}</select></label><div className="mp-gift-two"><label className="mp-gift-field">To<input name="recipientName" autoComplete="off" maxLength={58} value={fields.recipientName} placeholder="Recipient name" onChange={event => setField('recipientName', event.target.value)} required={salesOpen} /></label><label className="mp-gift-field">From<input name="senderName" autoComplete="name" maxLength={58} value={fields.senderName} placeholder="Your name" onChange={event => setField('senderName', event.target.value)} required={salesOpen} /></label></div><label className="mp-gift-field">A little message (optional)<textarea name="message" rows={3} maxLength={400} value={fields.message} placeholder="Something lovely you'd like to say…" onChange={event => setField('message', event.target.value)} /></label><button type="button" className="mp-gift-button mp-gift-secondary" onClick={()=>void suggest()} disabled={writing}>{writing?'Writing a little love…':'Help me write something sweet'}</button><p className="mp-gift-note">AI suggestions use the occasion, names and your note. Pick one and make it yours.</p><div aria-live="polite">{suggestions.map((text,i)=><button type="button" key={i} className="mp-gift-button mp-gift-secondary" style={{borderRadius:12,textAlign:'left',fontWeight:400,lineHeight:1.5}} onClick={()=>{setField('message',text);setSuggestions([]);}}>{text}</button>)}</div></fieldset>
        <fieldset disabled={busy || !!receipt}><legend>Choose the amount</legend><div className="mp-gift-presets">{GIFT_CARD_INR_PRESETS.map(preset => <button type="button" key={preset} aria-pressed={!custom && amount === preset} onClick={() => { setAmount(preset); setCustom(''); }}>{formatGiftCardAmount(preset, 'INR')}</button>)}</div><label className="mp-gift-field">Custom amount (₹)<input name="amount" type="number" inputMode="decimal" min="500" max="50000" step="0.01" value={custom} placeholder="Enter another amount in rupees" onChange={event => setCustom(event.target.value)} /></label>{!validAmount && <p className="mp-gift-error" role="alert">Enter ₹500–₹50,000 with no more than two decimal places.</p>}</fieldset>
        {salesOpen && !receipt && <fieldset disabled={busy}><legend>Delivery details</legend><label className="mp-gift-field">Your email<input type="email" name="purchaserEmail" autoComplete="email" value={fields.purchaserEmail} onChange={event => setField('purchaserEmail', event.target.value)} required /></label><label className="mp-gift-field">Recipient email (optional)<input type="email" name="recipientEmail" autoComplete="off" value={fields.recipientEmail} onChange={event => setField('recipientEmail', event.target.value)} /></label><p className="mp-gift-note">Leave the recipient email blank to receive the gift card yourself.</p></fieldset>}
        {readiness?.policyText && <p className="mp-gift-note">{readiness.policyText}</p>}
        {!salesOpen && <p className="mp-gift-note" role="status">{readiness?.message || 'Personalize and download a preview now. Online gift-card purchasing is coming soon.'}</p>}
        {error && <p className="mp-gift-error" role="alert">{error}</p>}
        {receipt?.status!=='active' && <button className="mp-gift-button" type="submit" disabled={busy || !validAmount || (salesOpen && !validPurchase)}>{busy ? 'One little moment…' : salesOpen ? (receipt?'Resume payment':'Continue to payment') : 'Download printable preview'}</button>}
        {attempt.current && !receipt && <button className="mp-gift-button mp-gift-secondary" type="button" onClick={checkStatus} disabled={busy}>Check payment status</button>}
      </form>
      {history.length>0&&<section className="mp-gift-state" aria-label="Recent completed gifts"><h2>Your recent gifts</h2>{history.map(g=><p key={g.printUrl}><a href={g.printUrl} target="_blank" rel="noopener noreferrer">{g.recipientName} · {formatGiftCardAmount(g.amount,'INR')} · View printable card</a></p>)}</section>}
    </div>
  </main>;
}
