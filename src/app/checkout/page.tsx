'use client';
import {checkedBillingIdentity} from '@/brand/commerce/billing-identity';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useCart } from '@/components/CartProvider';
import Link from 'next/link';
import { InvoiceBreakdown } from '@/components/InvoiceBreakdown';
import { loadRazorpay } from '@/lib/load-razorpay';
import { countryOptions } from '@/lib/markets';
import { useMarket } from '@/components/MarketProvider';
import { saveLines, linePayload as payload, readLines, type Line } from '@/components/design-cart-store';

type Quote = { requestKey: string; currency: 'INR' | 'USD'; totalMinor: number; giftMinor?:number; payableMinor?:number; lines: { slug: string; name: string; qty: number; lineMinor: number; billedSqft: number | null; installationMinor?:number; personalisationMinor?:number }[] };
type Paid = { paid: boolean; orderNumber: string; amount: number; currency: 'INR' | 'USD'; lines: { name: string; qty: number; lineMinor: number }[]; customer: { name: string; email: string }; message: string };

const SESSION_KEY = 'mimipip-checkout-session';
const money = (currency: string, minor: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(minor / 100);
const newSession = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
function session() {
  let s = sessionStorage.getItem(SESSION_KEY);
  if (!s) { s = newSession(); sessionStorage.setItem(SESSION_KEY, s); }
  return s;
}
async function post(action: string, body: object) {
  const r = await fetch('/api/checkout/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw Object.assign(new Error(d.error || 'Please try again.'), { renew: !!d.renew });
  return d;
}

export default function Checkout() {
  const { market, setCountry } = useMarket();
  const nativeCart = useCart();
  const checkoutItemIds = useRef<{item_id:string;quantity:number;crop_data:unknown}[]>([]);
  const legacySnapshot = useRef<Line[]>([]);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [giftDraft,setGiftDraft]=useState('');
  const [giftCode,setGiftCode]=useState('');
  const [giftsOpen,setGiftsOpen]=useState(false);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<boolean | null>(null);
  const [paid, setPaid] = useState<Paid | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', city: '', state: '', postcode: '', gstin:'',billingName:'' });
  const countries = useMemo(() => countryOptions(), []);
  const countryCode = market.countryCode;
  const india = countryCode === 'IN';
  const quoteKey = JSON.stringify({lines: lines?.map(payload) ?? [], countryCode,giftCode});
  const quoteReady = !!quote && quote.requestKey === quoteKey && !nativeCart.loading && !nativeCart.readError;

  const check = useCallback(async () => {
    try {
      const d = await post('status', { token: session() });
      if (d.paid) {
        setPaid(d);sessionStorage.removeItem('mimipip-checkout-gift');
        // Clear only the selections captured when this payment began. A resumed
        // payment must never erase items added to the cart afterwards.
        try {
          const saved = JSON.parse(sessionStorage.getItem('mimipip-checkout-selection') || 'null');
          if (saved?.token === session()) {
            const current = await fetch('/api/cart').then(r => r.ok ? r.json() : null);
            for (const bought of saved.native ?? []) {
              const item = current?.items?.find((i: any) => i.item_id === bought.item_id);
              if (item && item.quantity === bought.quantity && JSON.stringify(item.crop_data) === JSON.stringify(bought.crop_data))
                await fetch('/api/cart', {method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemId:bought.item_id})});
            }
            const remaining = readLines();
            for (const bought of saved.legacy ?? []) {
              const index = remaining.findIndex(item => JSON.stringify(item) === JSON.stringify(bought));
              if (index >= 0) remaining.splice(index, 1);
            }
            saveLines(remaining);
          }
        } catch { /* A confirmed payment stays confirmed if local cleanup fails. */ }
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem('mimipip-checkout-started');
        sessionStorage.removeItem('mimipip-checkout-selection');
      }
      else setProblem(d.message);
    } catch (e) { setProblem((e as Error).message); }
  }, []);

  useEffect(() => {
    const savedGift=sessionStorage.getItem('mimipip-checkout-gift')||'';setGiftCode(savedGift);setGiftDraft(savedGift);
    fetch('/api/gift-card/readiness').then(r=>r.json()).then(d=>setGiftsOpen(d.open===true)).catch(()=>{});
    // Existing browser selections are retained when no native cart is present.
    fetch('/api/checkout/readiness').then(r => r.json()).then(d => setOpen(!!d.open)).catch(() => setOpen(false));
    if (sessionStorage.getItem('mimipip-checkout-started')) void check();
  }, [check]);

  useEffect(() => {
    if(nativeCart.loading)return;
    if(nativeCart.readError){setLines(null);setQuote(null);setProblem('Your cart could not be read. Please reload before checking out.');return;}
    if(nativeCart.items.some(item=>item.price_changed)){setLines(null);setQuote(null);setProblem('A saved wallpaper selection has changed. Return to your cart and edit its size, finish or crop before checkout.');return;}
    checkoutItemIds.current=nativeCart.items.map(({item_id,quantity,crop_data})=>({item_id,quantity,crop_data}));
    try {
      legacySnapshot.current=readLines();
      const nativeLines:Line[]=nativeCart.items.map(item=>({materialSlug:item.material_slug,slug:item.handle,name:item.title,size:`${item.width_cm} × ${item.height_cm} cm`,qty:item.quantity,currency:'INR',amount:item.line_total/item.quantity,dimensions:{width:item.width_cm,height:item.height_cm},crop:item.crop_data??undefined,wallpaper:item.category==='wallpaper'}));
      setLines([...nativeLines,...legacySnapshot.current]);
    } catch { setLines(null);setProblem('Your saved cart could not be read.'); }

  },[nativeCart.items,nativeCart.loading,nativeCart.readError]);

  useEffect(() => {
    if (!lines?.length) { setQuote(null); return; }
    let live = true;
    setQuote(null);
    post('quote', { lines: lines.map(payload), countryCode,giftCode,token:session() })
      .then(q => { if (live) { setQuote({...q, requestKey: quoteKey}); setProblem(''); } })
      .catch(e => { if (!live) return; setQuote(null);
        // A code the quote refuses must never block the checkout: it is dropped, and the quote runs again without it.
        if (giftCode) { setGiftCode(''); setGiftDraft(''); sessionStorage.removeItem('mimipip-checkout-gift'); setProblem((e as Error).message + ' The gift card was removed from this checkout.'); }
        else setProblem((e as Error).message); });
    return () => { live = false; };
  }, [lines, countryCode, quoteKey]);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !lines || !quoteReady || open !== true) return;
    setBusy(true); setProblem('');
    const selection = {native:checkoutItemIds.current,legacy:legacySnapshot.current};
    try {
      const billingIdentity=checkedBillingIdentity(form.gstin.trim()||form.billingName.trim()?{gstin:form.gstin,legalName:form.billingName}:undefined,countryCode);
      const {gstin,billingName,...contact}=form;
      const customer = { ...contact, countryCode, phone: form.phone.replace(india ? /\D/g : /^$/, ''),...(billingIdentity?{billingIdentity}:{}) };
      let d;
      try { d = await post('create', { token: session(), lines: lines.map(payload), customer,giftCode }); }
      catch (err) {
        if (!(err as { renew?: boolean }).renew) throw err;
        sessionStorage.setItem(SESSION_KEY, newSession());
        d = await post('create', { token: session(), lines: lines.map(payload), customer,giftCode });
      }
      sessionStorage.setItem('mimipip-checkout-selection', JSON.stringify({token:session(),...selection}));
      sessionStorage.setItem('mimipip-checkout-started', '1');
      if(d.paid){await check();setBusy(false);return;}
      if (!await loadRazorpay()) throw new Error('The payment window could not load. Please try again.');
      const widget = new (window as any).Razorpay({
        key: d.keyId, order_id: d.orderId, amount: d.amount, currency: d.currency, name: 'MimiPip', description: 'Your MimiPip order',
        prefill: { name: d.customer.name, email: d.customer.email, contact: india ? '+91' + d.customer.phone : d.customer.phone },
        theme: { color: '#714414' },
        modal: { ondismiss: () => setBusy(false) },
        handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try { await post('verify', { token: session(), ...r }); } catch { /* the status check below still reads the payment */ }
          await check();
          setBusy(false);
        },
      });
      widget.on('payment.failed', () => { setProblem('The payment was not confirmed. If your bank shows a debit, check this order before trying again.'); setBusy(false); });
      widget.open();
    } catch (err) { setProblem((err as Error).message); setBusy(false); }
  }

  if (paid) return (
    <main className="container-x max-w-3xl py-10">
      <h1 className="text-3xl">Thank you, {paid.customer.name}.</h1>
      <p className="my-4">Your order {paid.orderNumber} is confirmed. Your order details are below.</p>
      <ul className="my-4 space-y-1">{paid.lines.map((l, i) => <li key={i}>{l.name} × {l.qty} · {money(paid.currency, l.lineMinor)}</li>)}</ul>
      <p className="font-semibold">Paid {money(paid.currency, paid.amount)}</p>
      <Link className="underline" href="/browse/collection">Continue shopping</Link>
    </main>
  );
  if (lines && !lines.length) return <main className="container-x py-10"><h1 className="text-3xl">Your cart is empty</h1><p className="my-4">{problem}</p><Link className="underline" href="/browse/collection">Shop designs</Link></main>;

  // Layout and field treatment from the actual Zyvorah checkout. Payment and
  // totals remain connected to MimiPip's server-authoritative order adapter.
  const fieldClass = 'h-12 w-full min-w-0 rounded-[14px] border border-edge bg-surface px-4 outline-none transition-colors focus:border-charcoal';
  const field = (key: keyof typeof form, label: string, auto: string, type = 'text') => (
    <label className="grid min-w-0 gap-1.5 text-xs text-slate" key={key}>{label}
      <input className={fieldClass + ' text-base text-charcoal'} name={key} required type={type} autoComplete={auto} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />
    </label>
  );
  const bill = quoteReady && quote ? india ? (
    <InvoiceBreakdown lines={quote.lines.flatMap(l=>[{label:`${l.name} × ${l.qty}${l.billedSqft ? ` · ${l.billedSqft} sq ft each` : ''}`,incl:(l.lineMinor-(l.installationMinor??0)-(l.personalisationMinor??0))/100},...(l.installationMinor?[{label:`Installation — ${l.name}`,incl:l.installationMinor/100}]:[]),...(l.personalisationMinor?[{label:`Name cloud — ${l.name}`,incl:l.personalisationMinor/100}]:[])])} />
  ) : (
    <div className="space-y-3 text-sm">
      <ul className="divide-y divide-edge">
        {quote.lines.map((l, i) => <li className="flex items-start justify-between gap-3 py-3" key={i}>
          <div className="min-w-0"><p className="font-semibold">{l.name}</p><p className="mt-1 text-xs text-slate">Quantity {l.qty}{l.billedSqft ? ` · ${l.billedSqft} sq ft each` : ''}</p></div>
          <span className="shrink-0 tabular-nums">{money(quote.currency, l.lineMinor)}</span>
        </li>)}
      </ul>
      <p className="flex justify-between gap-3 text-slate"><span>Delivery</span><span>Included</span></p>
      <div className="flex justify-between gap-3 border-t border-edge pt-3 text-lg font-bold"><span>Total</span><span className="tabular-nums">{money(quote.currency, quote.totalMinor)}</span></div>
      <p className="text-xs text-slate">Duties and customs are payable locally if charged.</p>
    </div>
  ) : <p className="text-sm text-slate" role="status">{problem ? 'Check your cart and delivery country to continue.' : 'Updating your order…'}</p>;
  const placeButton = <button type="submit" form="mimipip-checkout" className="btn btn-primary w-full" disabled={busy || !quoteReady || open !== true}>{busy ? 'Opening payment…' : quoteReady && quote ? (quote.payableMinor===0?'Place order with gift card':`Pay ${money(quote.currency, quote.payableMinor??quote.totalMinor)}`) : 'Pay'}</button>;
  const terms = <p className="mt-3 text-xs leading-relaxed text-slate">By paying you accept our <Link className="underline" href="/guides/shipping-returns">delivery and returns</Link> and <Link className="underline" href="/guides/terms">terms</Link>.</p>;
  return (
    <main className="container-x py-10 pb-[calc(env(safe-area-inset-bottom)+140px)] lg:pb-10">
      <Link className="text-xs text-slate underline underline-offset-2" href="/cart/">← Back to your cart</Link>
      <h1 className="mt-4 font-display text-2xl font-bold">Checkout</h1>
      <section aria-label="Order summary" className="mt-3 rounded-[18px] bg-wash p-3.5 lg:hidden">{bill}</section>
      <div className="mt-5 grid gap-5 lg:mt-8 lg:grid-cols-[1.4fr_1fr] lg:gap-10">
        <form id="mimipip-checkout" className="min-w-0 space-y-4" onSubmit={pay}>
          <p className="caps text-slate">Your details</p>
          <label className="grid gap-1.5 text-xs text-slate">Deliver to
            <select className={fieldClass + ' text-base text-charcoal'} autoComplete="shipping country" value={countryCode} onChange={e => void setCountry(e.target.value)}>
              {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('name', 'Full name', 'name')}
            {field('phone', india ? 'Mobile number' : 'Phone number with country code', 'tel', 'tel')}
          </div>
          {field('email', 'Email', 'email', 'email')}
          {field('address', 'Street address', 'shipping street-address')}
          <div className="grid gap-3 sm:grid-cols-3">
            {field('postcode', india ? 'PIN code' : 'Postcode', 'shipping postal-code')}
            {field('city', 'City', 'shipping address-level2')}
            {field('state', 'State', 'shipping address-level1')}
          </div>
          {(india || form.gstin || form.billingName) && <details className="rounded-[14px] border border-edge p-4"><summary className="cursor-pointer text-sm font-semibold">Business GST invoice (optional)</summary><div className="mt-3 grid gap-3"><label className="grid gap-1.5 text-xs text-slate">GSTIN<input className={fieldClass+' text-base text-charcoal'} value={form.gstin} maxLength={15} autoCapitalize="characters" onChange={e=>setForm({...form,gstin:e.target.value.toUpperCase()})}/></label><label className="grid gap-1.5 text-xs text-slate">Registered business name<input className={fieldClass+' text-base text-charcoal'} value={form.billingName} maxLength={200} onChange={e=>setForm({...form,billingName:e.target.value})}/></label></div></details>}
          {problem && <p role="alert" className="rounded-[12px] bg-blush/50 px-4 py-3 text-sm text-charcoal">{problem}</p>}
          {open === false && <p role="status" className="text-sm">Payments are paused for a moment. Your cart is saved.</p>}
          {india&&giftsOpen&&<section className="rounded-[14px] border border-edge p-4"><label className="grid gap-2 text-sm">Have a MimiPip gift card?<input className={fieldClass} value={giftDraft} maxLength={40} autoComplete="off" placeholder="MIMI-…" onChange={e=>setGiftDraft(e.target.value)}/></label><button type="button" className="btn mt-3" disabled={busy} onClick={()=>{const code=giftDraft.trim();setGiftCode(code);sessionStorage.setItem('mimipip-checkout-gift',code);}}>Apply gift card</button>{!!giftCode&&<button type="button" className="btn mt-3 ml-2" disabled={busy} onClick={()=>{setGiftCode('');setGiftDraft('');sessionStorage.removeItem('mimipip-checkout-gift');}}>Remove gift card</button>}{quoteReady&&!!quote?.giftMinor&&<p className="mt-3 text-sm">Gift card: {money('INR',quote.giftMinor)} · Remaining to pay: {money('INR',quote.payableMinor??quote.totalMinor)}</p>}<p className="mt-2 text-xs text-slate">Any unused balance stays on your card. Once checkout starts, its gift balance stays reserved while the payment is open; a checkout left unpaid returns it to your card within about 90 minutes.</p></section>}
          {terms}
        </form>
        <section aria-label="Order summary" className="hidden h-fit lg:sticky lg:top-32 lg:flex lg:max-h-[calc(100vh-10rem)] lg:flex-col lg:rounded-[22px] lg:bg-wash lg:p-6">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1"><p className="caps mb-3 text-slate">Order summary</p>{bill}</div>
          <div className="mt-4 shrink-0 border-t border-edge pt-4">{placeButton}<p className="mt-3 text-center text-xs text-slate">Secure payment by Razorpay.</p></div>
        </section>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-cloud/95 px-4 pt-3 backdrop-blur-md lg:hidden" style={{paddingBottom:'calc(env(safe-area-inset-bottom) + 0.5rem)'}}>
        {placeButton}<p className="mt-2 text-center text-xs text-slate">Secure payment by Razorpay.</p>
      </div>
    </main>
  );
}
