import {checkedBillingIdentity} from './billing-identity';
import {pricedLettering} from './lettering';
import {z} from 'zod';
/**
 * MimiPip's checkout. The server owns every figure: it re-prices the cart from
 * prices.ts, takes the money through Razorpay, proves the capture against
 * Razorpay's own records, and hands the paid order to the OS. D1 keeps only the
 * payment record; the OS order is the order.
 *
 * Trigger: a cart. Check: signature, then the captured payment and the paid
 * order fetched again from Razorpay. All of that goes through the store Worker,
 * which holds the keys (STORE_PAY); this site holds none.
 * Record: mimipip_orders. A paid order that
 * has not reached the OS is retried on the cron and listed at /unsent.
 */
import {pricedInstallation,installationAddressAllowed} from './installation';
import { priceSample } from './samples';
import { approvedLayout } from './approved-layout';
import { marketOf, currencyOf, nameOf, priceLine, refused, onSale, type Priced } from './prices';
import { artFor, webOrderBody, type StoredCustomer, type StoredLine } from './order-payload';

type Statement = {
  bind(...values: unknown[]): Statement;
  first<T = any>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
  all<T = any>(): Promise<{ results: T[] }>;
};
export type Pay = {
  ready(): boolean | Promise<boolean>;
  keyId(): string | null | Promise<string | null>;
  razorpay(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }>;
  verifySignature(message: string, signature: string): boolean | Promise<boolean>;
  sendOrder(order: { brand?: unknown }): Promise<{ ok: boolean; status: number; text: string }>;
  osTokenMatches(value: string): boolean | Promise<boolean>;
};
export type Env = {
  MIMIPIP_CHECKOUT_ENABLED?: string;
  MIMIPIP_SAMPLE_CHECKOUT_ENABLED?: string;
  MIMIPIP_LETTERING_CHECKOUT_ENABLED?: string;
  MIMIPIP_BUSINESS_INVOICE_ENABLED?: string;
  DB?: { prepare(sql: string): Statement };
  /** The store Worker's private door to Razorpay and the OS. The keys stay there; this site holds none. */
  STORE_PAY?: Pay;
};
type Order = {
  id: string; token_hash: string; status: string; amount: number; shipping: number;
  currency: 'INR' | 'USD'; lines: string; lines_hash: string | null; customer: string;
  razorpay_order_id: string | null; payment_id: string | null; amount_inr: number | null;
  os_status: string; os_error: string | null; os_tries: number; created_at: number; updated_at: number;
};

const encoder = new TextEncoder();
const hex = (v: ArrayBuffer) => Array.from(new Uint8Array(v), n => n.toString(16).padStart(2, '0')).join('');
export async function digest(v: string) { return hex(await crypto.subtle.digest('SHA-256', encoder.encode(v))); }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

const text = (v: unknown, min: number, max: number): v is string => typeof v === 'string' && v.trim().length >= min && v.length <= max;
export function validCustomer(c: any): boolean {
  if (!c || !text(c.name, 2, 100) || !text(c.email, 5, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return false;
  if (!text(c.address, 8, 500) || !text(c.city, 2, 80) || !text(c.state, 2, 80) || typeof c.countryCode !== 'string' || !/^[A-Z]{2}$/.test(c.countryCode)) return false;
  if (c.countryCode === 'IN') return /^[6-9]\d{9}$/.test(c.phone ?? '') && /^[1-9]\d{5}$/.test(c.postcode ?? '');
  return /^\+?[0-9 ()-]{7,19}$/.test(c.phone ?? '') && text(c.postcode, 2, 20);
}

/** Razorpay's rupee figure for what was captured: the amount itself in India,
 *  its stated rupee base abroad. No rate of ours; absent, the order waits. */
export function capturedInr(p: any, o: Pick<Order, 'currency'>): number | null {
  if (o.currency === 'INR') return p.amount / 100;
  return p.base_currency === 'INR' && Number.isSafeInteger(p.base_amount) && p.base_amount > 0 ? p.base_amount / 100 : null;
}
export function paymentMatches(p: any, o: Pick<Order, 'razorpay_order_id' | 'amount' | 'currency'>) {
  return p?.status === 'captured' && p.captured === true && p.order_id === o.razorpay_order_id && p.amount === o.amount
    && p.currency === o.currency && p.amount_refunded === 0 && /^pay_[A-Za-z0-9]+$/.test(p.id);
}

const plainPlacement=z.object({zoom:z.number().finite().min(1).max(8),cropX:z.number().finite().min(0).max(1),cropY:z.number().finite().min(0).max(1),flipH:z.boolean().optional(),flipV:z.boolean().optional()}).strict();
function cleanPlacement(p: unknown): StoredLine['placement'] {
  if (p == null) return undefined;
  const checked=plainPlacement.safeParse(p);
  if(!checked.success)throw new Error('Please reopen this design and check its placement.');
  return {...checked.data,flipH:!!checked.data.flipH,flipV:!!checked.data.flipV};
}

/** Prices a cart for a country, or says why it cannot be sold there. */
export function priceCart(lines: unknown, countryCode: string):
  { lines: (Priced & { kind?: 'sample'; installationMinor?:number; personalisationMinor?:number; placement?: StoredLine['placement']; crop?: StoredLine['crop'] })[]; totalMinor: number; currency: 'INR' | 'USD' } | { refused: string } {
  if (!Array.isArray(lines) || !lines.length || lines.length > 50) return { refused: 'Your cart is empty.' };
  const market = marketOf(countryCode);
  const out = [];
  for (const raw of lines as any[]) {
    const slug = String(raw?.slug ?? '');
    if (raw?.kind === 'sample') {
      const sample = priceSample(raw,countryCode);
      if ('refused' in sample) return sample;
      out.push(sample); continue;
    }
    if (raw?.kind != null) return {refused:'This order type is not supported.'};
    if (!artFor(slug) || !onSale(slug, market)) return { refused: `${nameOf(slug)} is not available to buy in this country. Please remove it.` };
    const priced = priceLine({ slug, qty: raw.qty, widthCm: raw.widthCm, heightCm: raw.heightCm, fixedSize: raw.fixedSize === true }, market);
    if (refused(priced)) return priced;
    try {
      const crop=approvedLayout(raw.crop,priced.widthCm,priced.heightCm,artFor(slug)!.art,slug);
      const placement=crop?{zoom:crop.zoom,cropX:crop.offsetX,cropY:crop.offsetY,flipH:!!crop.flipH,flipV:!!crop.flipV}:cleanPlacement(raw.placement);
      const installation=crop?.installation?pricedInstallation(crop.installation,priced.widthCm!,priced.heightCm!,priced.qty,countryCode):undefined;
      if(installation && priced.ratePerSqft===null)return {refused:'Installation is available for measured wallpaper only.'};
      if(crop && installation)crop.installation=installation;
      const lettering=pricedLettering(crop,priced.widthCm!,priced.heightCm!,countryCode);
      if(lettering && priced.ratePerSqft===null)return {refused:'Lettering is available for measured wallpaper only.'};
      if(crop && lettering){crop.textOverlay=lettering.overlay;crop.personalisation=lettering.personalisation;}
      out.push({ ...priced, lineMinor:priced.lineMinor+(installation?.total??0)*100+(lettering?.fee??0)*100, ...(lettering?{personalisationMinor:lettering.fee*100}:{}), ...(installation?{installationMinor:installation.total*100}:{}), placement, ...(crop?{crop}:{}) });
    } catch (error) { return {refused:error instanceof Error?error.message:'Check your approved layout.'}; }
  }
  return { lines: out, totalMinor: out.reduce((s, l) => s + l.lineMinor, 0), currency: currencyOf(market) };
}

const countryName = (code: string) => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code; } catch { return code; } };

function provider(pay: Pay) {
  return async (path: string, body?: unknown) => {
    const r = await pay.razorpay(path, body);
    if (!r.ok) throw new Error(`Razorpay answered ${r.status} for ${path}`);
    return r.data;
  };
}

/** Hands one paid order to the OS. The OS is idempotent per order and line, so a repeat is safe. */
export async function sendToOs(o: Order, pay: Pay, db: NonNullable<Env['DB']>): Promise<boolean> {
  if (o.status !== 'paid' || o.os_status === 'sent') return o.os_status === 'sent';
  const fail = async (why: string) => {
    await db.prepare('UPDATE mimipip_orders SET os_error=?,os_tries=os_tries+1,updated_at=? WHERE id=?').bind(why.slice(0, 500), Date.now(), o.id).run();
    return false;
  };
  if (o.amount_inr === null) return fail('Razorpay gave no rupee figure for this payment.');
  let body;
  try { body = webOrderBody({ id: o.id, paymentId: o.payment_id!, amountInr: o.amount_inr, lines: JSON.parse(o.lines), customer: JSON.parse(o.customer) }); }
  catch (e) { return fail((e as Error).message); }
  try {
    const res = await pay.sendOrder(body);
    if (!res.ok) return fail(`The OS answered ${res.status}: ${res.text}`);
  } catch (e) { return fail('The OS could not be reached: ' + (e as Error).message); }
  await db.prepare("UPDATE mimipip_orders SET os_status='sent',os_error=NULL,os_sent_at=?,updated_at=? WHERE id=?").bind(Date.now(), Date.now(), o.id).run();
  return true;
}

async function confirm(o: Order, p: any, pay: Pay, db: NonNullable<Env['DB']>, call: ReturnType<typeof provider>) {
  if (!paymentMatches(p, o)) return false;
  const ro = await call('orders/' + o.razorpay_order_id);
  if (ro.status !== 'paid' || ro.amount !== o.amount || ro.currency !== o.currency || ro.amount_paid !== o.amount) return false;
  await db.prepare("UPDATE mimipip_orders SET status='paid',payment_id=?,amount_inr=?,updated_at=? WHERE id=? AND status IN ('pending','paid')").bind(p.id, capturedInr(p, o), Date.now(), o.id).run();
  const fresh = (await db.prepare('SELECT * FROM mimipip_orders WHERE id=?').bind(o.id).first<Order>())!;
  await sendToOs(fresh, pay, db);
  return true;
}

export const checkoutReady = async (env: Env) => !!(env.MIMIPIP_CHECKOUT_ENABLED === '1' && env.DB && env.STORE_PAY && await env.STORE_PAY.ready());

export async function handleCommerce(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  if (path === '/api/checkout/readiness' && request.method === 'GET') return json({ open: await checkoutReady(env) });
  if (!env.DB) return json({ error: 'Checkout is temporarily unavailable.' }, 503);
  const db = env.DB;
  if (path === '/api/checkout/unsent' && request.method === 'GET') {
    if (!env.STORE_PAY || !await env.STORE_PAY.osTokenMatches(request.headers.get('x-zyvorah-token') ?? '')) return json({ error: 'Not authorised' }, 401);
    const rows = await db.prepare("SELECT id,amount,currency,os_error,os_tries,created_at,updated_at FROM mimipip_orders WHERE status='paid' AND os_status!='sent' ORDER BY created_at LIMIT 50").bind().all();
    return json({ unsent: rows.results });
  }
  // A price is the site's own arithmetic: showing one needs no payment keys.
  if (path === '/api/checkout/quote' && request.method === 'POST') {
    if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Invalid request origin' }, 403);
    try {
      const raw = await request.text();
      if (raw.length > 32768) return json({ error: 'Payload too large' }, 413);
      const b = JSON.parse(raw);
      const priced = priceCart(b.lines, String(b.countryCode ?? ''));
      if ('refused' in priced) return json({ error: priced.refused }, 400);
      return json({ currency: priced.currency, totalMinor: priced.totalMinor, lines: priced.lines });
    } catch { return json({ error: 'Check your cart and try again.' }, 400); }
  }
  const pay = env.STORE_PAY;
  if (!pay) return json({ error: 'Checkout is temporarily unavailable.' }, 503);
  const call = provider(pay);
  try {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Invalid request origin' }, 403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON required' }, 415);
    const raw = await request.text();
    if (raw.length > 32768) return json({ error: 'Payload too large' }, 413);
    const b = JSON.parse(raw);
    if (typeof b.token !== 'string' || !/^\w{64}$/.test(b.token)) return json({ error: 'Invalid checkout session' }, 400);
    const tokenHash = await digest(b.token);
    let o = await db.prepare('SELECT * FROM mimipip_orders WHERE token_hash=?').bind(tokenHash).first<Order>();
    if (path === '/api/checkout/create') {
      if (!await checkoutReady(env)) return json({ error: 'Checkout is temporarily unavailable.' }, 503);
      if (!validCustomer(b.customer)) return json({ error: 'Check your delivery details.' }, 400);
      let billingIdentity;
      try{billingIdentity=checkedBillingIdentity(b.customer.billingIdentity,b.customer.countryCode);}
      catch(error){return json({error:error instanceof Error?error.message:'Check business invoice details.'},400);}
      if(billingIdentity && env.MIMIPIP_BUSINESS_INVOICE_ENABLED!=='1')return json({error:'Please contact Mimi Pip for a business invoice before ordering.'},503);
      const priced = priceCart(b.lines, b.customer.countryCode);
      if ('refused' in priced) return json({ error: priced.refused }, 400);
      if (priced.lines.some(l=>l.kind==='sample') && env.MIMIPIP_SAMPLE_CHECKOUT_ENABLED !== '1')
        return json({error:'Sample ordering is not available yet. Please ask us for a close-up of your design.'},503);
      if(priced.lines.some(l=>l.crop?.textOverlay) && env.MIMIPIP_LETTERING_CHECKOUT_ENABLED!=='1')
        return json({error:'Lettering orders are not available yet. Your approved layout is saved in your cart.'},503);
      if(priced.lines.some(l=>l.crop?.installation) && !installationAddressAllowed(b.customer.countryCode,b.customer.postcode))
        return json({error:'Installation is not available at your delivery PIN code. Remove installation or use a serviceable delivery address.'},400);
      const linesHash = await digest(JSON.stringify(priced.lines));
      if (o && o.status === 'pending' && o.lines_hash !== linesHash) return json({ error: 'Your cart changed. Please try again.', renew: true }, 409);
      const c = b.customer;
      const customer: StoredCustomer = { name: c.name.trim(), email: c.email.trim(), phone: c.phone.trim(), address: c.address.trim(), city: c.city.trim(), state: c.state.trim(), postcode: c.postcode.trim(), countryCode: c.countryCode, country: countryName(c.countryCode),...(billingIdentity?{billingIdentity}:{}) };
      if (o && o.status === 'pending' && JSON.stringify(JSON.parse(o.customer)) !== JSON.stringify(customer))
        return json({ error: 'Your delivery details changed. Please try again.', renew: true }, 409);
      if (!o) {
        const id = 'MP-' + crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase();
        const now = Date.now();
        await db.prepare("INSERT INTO mimipip_orders (id,token_hash,status,amount,shipping,currency,lines,lines_hash,customer,fulfilment,created_at,updated_at) VALUES (?,?,'creating',?,0,?,?,?,?,'{}',?,?)")
          .bind(id, tokenHash, priced.totalMinor, priced.currency, JSON.stringify(priced.lines), linesHash, JSON.stringify(customer), now, now).run();
        let ro;
        try {
          // Capture follows the account's own setting, as the store's orders do.
          ro = await call('orders', { amount: priced.totalMinor, currency: priced.currency, receipt: id, notes: { brand: 'MimiPip', mimipip_order_id: id } });
          if (!/^order_[A-Za-z0-9]+$/.test(ro.id) || ro.amount !== priced.totalMinor || ro.currency !== priced.currency) throw new Error('Invalid provider order');
        } catch (e) {
          // The shopper never saw a payment window, so nothing can have been paid: let them try again.
          await db.prepare("DELETE FROM mimipip_orders WHERE id=? AND status='creating'").bind(id).run();
          throw e;
        }
        await db.prepare("UPDATE mimipip_orders SET razorpay_order_id=?,status='pending',updated_at=? WHERE id=?").bind(ro.id, Date.now(), id).run();
        o = (await db.prepare('SELECT * FROM mimipip_orders WHERE id=?').bind(id).first<Order>())!;
      }
      if (o.status === 'creating') return json({ error: 'Your payment session is being checked. Please do not pay again.' }, 409);
      if (o.status === 'paid') return json({ paid: true, orderNumber: o.id });
      if (o.status !== 'pending') return json({ error: 'This order cannot be paid.' }, 409);
      return json({ keyId: await pay.keyId(), orderId: o.razorpay_order_id, amount: o.amount, currency: o.currency, orderNumber: o.id, customer: JSON.parse(o.customer) });
    }
    if (!o) return json({ error: 'Order not found' }, 404);
    if (path === '/api/checkout/verify') {
      if (b.razorpay_order_id !== o.razorpay_order_id || !/^pay_[A-Za-z0-9]+$/.test(b.razorpay_payment_id || '') || !await pay.verifySignature(o.razorpay_order_id + '|' + b.razorpay_payment_id, b.razorpay_signature || '')) return json({ error: 'Payment verification failed.' }, 400);
      await confirm(o, await call('payments/' + b.razorpay_payment_id), pay, db, call);
    } else if (path === '/api/checkout/status') {
      if (o.status === 'pending' && o.razorpay_order_id) {
        const ps = await call('orders/' + o.razorpay_order_id + '/payments');
        for (const p of ps.items || []) if (paymentMatches(p, o)) { await confirm(o, p, pay, db, call); break; }
      }
    } else return json({ error: 'Not found' }, 404);
    o = (await db.prepare('SELECT * FROM mimipip_orders WHERE id=?').bind(o.id).first<Order>())!;
    return json({
      paid: o.status === 'paid', orderNumber: o.id, amount: o.amount, currency: o.currency,
      lines: JSON.parse(o.lines).map((l: StoredLine) => ({ name: l.name, qty: l.qty, lineMinor: l.lineMinor })),
      customer: JSON.parse(o.customer),
      message: o.status === 'paid' ? 'Payment received. Your order is confirmed.' : 'Payment has not been confirmed yet. If you were charged, please check again before paying.',
    });
  } catch (e) {
    console.error('checkout:', (e as Error).message);
    return json({ error: 'We could not complete this step. Please check this order again; do not pay twice if you were charged.' }, 503);
  }
}

/** Every few minutes: pending payments are asked of Razorpay, paid orders are offered to the OS again. */
export async function sweep(env: Env) {
  if (!env.DB || !env.STORE_PAY) return;
  const pay = env.STORE_PAY, db = env.DB, call = provider(pay), cutoff = Date.now() - 5 * 60_000;
  const pending = await db.prepare("SELECT * FROM mimipip_orders WHERE status='pending' AND razorpay_order_id IS NOT NULL AND created_at<? AND created_at>? ORDER BY created_at LIMIT 25").bind(cutoff, Date.now() - 3 * 864e5).all<Order>();
  for (const o of pending.results) {
    try {
      const ps = await call('orders/' + o.razorpay_order_id + '/payments');
      for (const p of ps.items || []) if (paymentMatches(p, o)) { await confirm(o, p, pay, db, call); break; }
    } catch { /* asked again on the next pass */ }
  }
  const unsent = await db.prepare("SELECT * FROM mimipip_orders WHERE status='paid' AND os_status!='sent' ORDER BY created_at LIMIT 25").bind().all<Order>();
  for (const o of unsent.results) await sendToOs(o, pay, db);
}
