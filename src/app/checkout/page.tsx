'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { countryOptions } from '@/lib/markets';
import { useMarket } from '@/components/MarketProvider';
import { clearCart, linePayload as payload, readLines, type Line } from '@/components/design-cart-store';

type Quote = { currency: 'INR' | 'USD'; totalMinor: number; lines: { slug: string; name: string; qty: number; lineMinor: number; billedSqft: number | null }[] };
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
const loadRazorpay = () => new Promise<void>((resolve, reject) => {
  if ((window as any).Razorpay) { resolve(); return; }
  const s = document.createElement('script');
  s.src = 'https://checkout.razorpay.com/v1/checkout.js';
  s.onload = () => resolve();
  s.onerror = () => { s.remove(); reject(new Error('The payment window could not load. Please try again.')); };
  document.head.appendChild(s);
});

export default function Checkout() {
  const { market } = useMarket();
  const [lines, setLines] = useState<Line[] | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<boolean | null>(null);
  const [paid, setPaid] = useState<Paid | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', city: '', state: '', postcode: '', countryCode: '' });
  const countries = useMemo(() => countryOptions(), []);
  const countryCode = form.countryCode || market.countryCode;
  const india = countryCode === 'IN';

  const check = useCallback(async () => {
    try {
      const d = await post('status', { token: session() });
      if (d.paid) { setPaid(d); clearCart(); sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem('mimipip-checkout-started'); }
      else setProblem(d.message);
    } catch (e) { setProblem((e as Error).message); }
  }, []);

  useEffect(() => {
    try { setLines(readLines()); } catch { setLines([]); setProblem('Your cart could not be read. Please add your designs again.'); }
    fetch('/api/checkout/readiness').then(r => r.json()).then(d => setOpen(!!d.open)).catch(() => setOpen(false));
    if (sessionStorage.getItem('mimipip-checkout-started')) void check();
  }, [check]);

  useEffect(() => {
    if (!lines?.length) return;
    let live = true;
    post('quote', { lines: lines.map(payload), countryCode })
      .then(q => { if (live) { setQuote(q); setProblem(''); } })
      .catch(e => { if (live) { setQuote(null); setProblem((e as Error).message); } });
    return () => { live = false; };
  }, [lines, countryCode]);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !lines) return;
    setBusy(true); setProblem('');
    const customer = { ...form, countryCode, phone: form.phone.replace(india ? /\D/g : /^$/, '') };
    try {
      let d;
      try { d = await post('create', { token: session(), lines: lines.map(payload), customer }); }
      catch (err) {
        if (!(err as { renew?: boolean }).renew) throw err;
        sessionStorage.setItem(SESSION_KEY, newSession());
        d = await post('create', { token: session(), lines: lines.map(payload), customer });
      }
      if (d.paid) { await check(); return; }
      sessionStorage.setItem('mimipip-checkout-started', '1');
      await loadRazorpay();
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
      widget.on('payment.failed', () => { setProblem('The payment did not go through. You have not been charged. Please try again.'); setBusy(false); });
      widget.open();
    } catch (err) { setProblem((err as Error).message); setBusy(false); }
  }

  if (paid) return (
    <main className="container-x max-w-3xl py-10">
      <h1 className="text-3xl">Thank you, {paid.customer.name}.</h1>
      <p className="my-4">Your order {paid.orderNumber} is confirmed. We have sent the details to {paid.customer.email}.</p>
      <ul className="my-4 space-y-1">{paid.lines.map((l, i) => <li key={i}>{l.name} × {l.qty} · {money(paid.currency, l.lineMinor)}</li>)}</ul>
      <p className="font-semibold">Paid {money(paid.currency, paid.amount)}</p>
      <Link className="underline" href="/browse/collection">Continue shopping</Link>
    </main>
  );
  if (lines && !lines.length) return <main className="container-x py-10"><h1 className="text-3xl">Your cart is empty</h1><p className="my-4">{problem}</p><Link className="underline" href="/browse/collection">Shop designs</Link></main>;

  const field = (key: keyof typeof form, label: string, auto: string, type = 'text') => (
    <label className="grid gap-1" key={key}>{label}
      <input className="w-full rounded-lg border p-2" required type={type} autoComplete={auto} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />
    </label>
  );
  return (
    <main className="container-x max-w-3xl py-10">
      <Link href="/cart/">← Back to your cart</Link>
      <h1 className="mt-6 text-3xl">Checkout</h1>
      {quote && <section className="my-6 space-y-1" aria-label="Your order">
        {quote.lines.map((l, i) => <p key={i}>{l.name} × {l.qty}{l.billedSqft ? ` · ${l.billedSqft} sq ft` : ''} · {money(quote.currency, l.lineMinor)}</p>)}
        <p>Delivery included</p>
        <p className="text-xl font-semibold">Total {money(quote.currency, quote.totalMinor)}{india ? ' including GST' : ''}</p>
      </section>}
      <form className="grid gap-3" onSubmit={pay}>
        <label className="grid gap-1">Deliver to
          <select className="w-full rounded-lg border p-2" autoComplete="country" value={countryCode} onChange={e => setForm({ ...form, countryCode: e.target.value })}>
            {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </label>
        {field('name', 'Full name', 'name')}
        {field('email', 'Email', 'email', 'email')}
        {field('phone', india ? 'Mobile number' : 'Phone number with country code', 'tel', 'tel')}
        {field('address', 'Street address', 'street-address')}
        {field('city', 'City', 'address-level2')}
        {field('state', 'State', 'address-level1')}
        {field('postcode', india ? 'PIN code' : 'Postcode', 'postal-code')}
        <p role="status">{problem}</p>
        <button className="btn btn-primary" disabled={busy || !quote || open === false}>{busy ? 'Opening payment…' : quote ? `Pay ${money(quote.currency, quote.totalMinor)}` : 'Pay'}</button>
        {open === false && <p role="status">Payments are paused for a moment. Your cart is saved on this device.</p>}
        <p className="text-sm">By paying you accept our <Link className="underline" href="/guides/shipping-returns">delivery and returns</Link> and <Link className="underline" href="/guides/terms">terms</Link>.</p>
      </form>
    </main>
  );
}
