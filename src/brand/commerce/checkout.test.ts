import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Test runner is Node 25; application retains Node 20 type declarations.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { handleCommerce, sweep, priceCart, capturedInr, validCustomer } from './checkout';
import { priceLine, refused, onSale, ratePerSqft, billedSqft } from './prices';
import { linesInr, webOrderBody, artFor } from './order-payload';
import catalogue from '../review/catalogue.json';

const india = { name: 'Test Buyer', email: 'buyer@example.test', phone: '9000000000', address: 'Test address only', city: 'Pune', state: 'Maharashtra', postcode: '411008', countryCode: 'IN' };
const abroad = { name: 'Test Buyer', email: 'buyer@example.test', phone: '+1 312 555 0100', address: '1 Test Street, Apt 2', city: 'Chicago', state: 'Illinois', postcode: '60601', countryCode: 'US' };
const wall = { slug: 'almond-blossom', qty: 1, widthCm: 300, heightCm: 250 };
const hop = { slug: 'hopscotch-peach-pop', qty: 2 };
const wallMinor = (rate: number) => Math.round((300 * 250) / 929.0304 * rate * 100);

function harness(opts: { base?: number | null; osStatus?: number } = {}) {
  const db = new DatabaseSync(':memory:');
  for (const f of ['0000_volatile_phantom_reporter', '0001_typical_sheva_callister', '0002_cart_checkout']) db.exec(readFileSync('drizzle/' + f + '.sql', 'utf8'));
  const DB = { prepare(sql: string) { return { bind(...v: any[]) { const s = db.prepare(sql); return { first: async () => s.get(...v) || null, run: async () => ({ meta: { changes: Number(s.run(...v).changes) } }), all: async () => ({ results: s.all(...v) }) }; } }; } };
  let captured = false, currency = 'INR', total = 0, osStatus = opts.osStatus ?? 200;
  const posts: any[] = [];
  const pay = () => ({ id: 'pay_test', status: captured ? 'captured' : 'authorized', captured, amount: total, currency, amount_refunded: 0, order_id: 'order_test', ...(currency === 'USD' && opts.base !== null ? { base_amount: opts.base ?? 501234, base_currency: 'INR' } : {}) });
  const transport = (async (input: any, init: any) => {
    const path = new URL(input).pathname;
    let data: any;
    if (init.method === 'POST') { const b = JSON.parse(init.body); total = b.amount; currency = b.currency; data = { id: 'order_test', amount: total, currency }; }
    else if (path.endsWith('/payments')) data = { items: [pay()] };
    else if (path.includes('/payments/')) data = pay();
    else data = { status: captured ? 'paid' : 'attempted', amount: total, amount_paid: captured ? total : 0, currency };
    return Response.json(data);
  }) as typeof fetch;
  const osFetch = (async (url: any, init: any) => { posts.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return new Response('{}', { status: osStatus }); }) as typeof fetch;
  const env: any = { DB, MIMIPIP_CHECKOUT_ENABLED: '1', RAZORPAY_KEY_ID: 'test', RAZORPAY_KEY_SECRET: 'test-secret', RAZORPAY_WEBHOOK_SECRET: 'webhook-test', ZYVORAH_WEBHOOK_TOKEN: 'os-token' };
  const call = (action: string, data: any = {}, origin = 'https://mimipip.com') => handleCommerce(new Request('https://mimipip.com/api/checkout/' + action, { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'a'.repeat(64), ...data }) }), env, transport, osFetch);
  const pass = () => call('verify', { razorpay_order_id: 'order_test', razorpay_payment_id: 'pay_test', razorpay_signature: createHmac('sha256', 'test-secret').update('order_test|pay_test').digest('hex') });
  return { db, env, call, pass, posts, transport, osFetch, setCaptured: () => { captured = true; }, setOs: (n: number) => { osStatus = n; }, total: () => total };
}

test('a wall is priced from the catalogue, billed at 20 sq ft at least', () => {
  const p = priceLine(wall, 'IN'); assert.ok(!refused(p));
  assert.equal(p.ratePerSqft, 200); assert.equal(p.billedSqft, 80.73); assert.equal(p.unitMinor, wallMinor(200));
  const small = priceLine({ ...wall, widthCm: 100, heightCm: 100 }, 'IN'); assert.ok(!refused(small)); assert.equal(small.unitMinor, 400000);
  assert.equal(billedSqft(10, 10), 20);
});
test('abroad every wall is her US$60 a sq ft; in India the design keeps its own rate', () => {
  assert.equal(ratePerSqft('almond-blossom', 'ABROAD'), 60);
  assert.equal(ratePerSqft('nafas-spiral-bloom', 'IN'), 300);
  const p = priceLine(wall, 'ABROAD'); assert.ok(!refused(p)); assert.equal(p.currency, 'USD'); assert.equal(p.unitMinor, wallMinor(60));
});
test('Hopscotch is ₹3,999 in India; with no price abroad it is not sold there', () => {
  const p = priceLine(hop, 'IN'); assert.ok(!refused(p)); assert.equal(p.lineMinor, 799800); assert.equal(p.widthCm, 75);
  assert.equal(onSale('hopscotch-peach-pop', 'ABROAD'), false); assert.ok(refused(priceLine(hop, 'ABROAD')));
});
test('a design with no price on record is refused, never given one', () => {
  for (const r of catalogue as any[]) {
    if (r.type.includes('wallpaper') || r.type.includes('floor-sticker')) continue;
    assert.equal(onSale(r.slug, 'IN'), false, r.slug); assert.equal(onSale(r.slug, 'ABROAD'), false, r.slug);
  }
  const unlisted = (catalogue as any[]).find(r => r.type.includes('wallpaper') && r.sourceIndiaPricePerSqft == null);
  assert.equal(onSale(unlisted.slug, 'IN'), false);
});
test('a design with no print artwork cannot be bought, even with a price', () => {
  const noArt = (catalogue as any[]).find(r => r.collection[0] === 'dotty-days' && !artFor(r.slug)); assert.ok(noArt);
  assert.ok('refused' in priceCart([{ slug: noArt.slug, qty: 1, widthCm: 300, heightCm: 250 }], 'US'));
});
test('a tampered cart cannot change the money', () => {
  const a = priceCart([{ ...wall, lineMinor: 1, unitMinor: 1, amount: 1 }], 'IN'); assert.ok(!('refused' in a)); assert.equal(a.totalMinor, wallMinor(200));
  for (const bad of [{ ...wall, qty: 0 }, { ...wall, qty: 100 }, { ...wall, widthCm: 0 }, { ...wall, heightCm: 99999 }, { slug: 'nothing', qty: 1 }]) assert.ok('refused' in priceCart([bad], 'IN'));
  assert.ok('refused' in priceCart([], 'IN'));
});
test('customers are checked for their own country', () => {
  assert.ok(validCustomer(india)); assert.ok(validCustomer(abroad));
  assert.ok(!validCustomer({ ...india, postcode: '12' })); assert.ok(!validCustomer({ ...india, phone: '+1 312 555 0100' }));
  assert.ok(!validCustomer({ ...abroad, postcode: '' })); assert.ok(!validCustomer({ ...abroad, countryCode: 'usa' }));
});
test('rupees for lines add back to the total exactly', () => {
  const inr = linesInr([{ lineMinor: 100 }, { lineMinor: 200 }, { lineMinor: 300 }], 1000.01);
  assert.equal(Math.round(inr.reduce((s, n) => s + n, 0) * 100), 100001);
});
test('India: the paid cart reaches the OS as a MimiPip order, once', async () => {
  const h = harness();
  const lines = [{ ...wall, placement: { zoom: 1.5, cropX: .2, cropY: .3 } }, hop];
  let r = await h.call('create', { lines, customer: india, amount: 1 }); assert.equal(r.status, 200);
  const made = await r.json();
  const expected = wallMinor(200) + 799800;
  assert.equal(made.amount, expected); assert.equal(made.currency, 'INR'); assert.equal(h.total(), expected);
  assert.equal((await (await h.call('status')).json()).paid, false); assert.equal(h.posts.length, 0);
  assert.equal((await h.call('verify', { razorpay_order_id: 'order_test', razorpay_payment_id: 'pay_test', razorpay_signature: '0'.repeat(64) })).status, 400);
  h.setCaptured(); r = await h.pass(); assert.equal(r.status, 200); assert.equal((await r.json()).paid, true);
  assert.equal(h.posts.length, 1);
  const { url, headers, body } = h.posts[0];
  assert.equal(url, 'https://os.magnitudegroup.in/api/zyvorah/web-order'); assert.equal(headers['x-zyvorah-token'], 'os-token');
  assert.equal(body.brand, 'lorange'); assert.equal(body.items[0].brand, 'lorange'); assert.equal(body.amountInr, expected / 100); assert.equal(body.payment.razorpayPaymentId, 'pay_test');
  assert.equal(body.customer.pincode, '411008'); assert.equal(body.customer.countryCode, 'IN'); assert.equal(body.orderRef, made.orderNumber);
  assert.equal(body.items[0].widthMm, 3000); assert.equal(body.items[0].heightMm, 2500); assert.equal(body.items[0].catalogueRatePerSqft, 200); assert.equal(body.items[0].materialSlug, 'smooth-matt');
  assert.match(body.items[0].designUrl, /^https:\/\/zyvorah\.com\//); assert.deepEqual(body.items[0].placement, { zoom: 1.5, cropX: .2, cropY: .3, flipH: false, flipV: false });
  assert.equal(body.items[1].widthMm, 750); assert.equal(body.items[1].qty, 2); assert.equal(body.items[1].material, 'self_adhesive'); assert.equal(body.items[1].designUrl, 'https://mimipip.com/floor-play-images/hopscotch-peach-pop/art.png');
  await h.pass(); await h.call('status'); assert.equal(h.posts.length, 1, 'a repeat never sends twice');
});
test('abroad: USD is charged and the OS gets Razorpay’s own rupee figure', async () => {
  const h = harness();
  const made = await (await h.call('create', { lines: [wall], customer: abroad })).json(); assert.equal(made.currency, 'USD');
  h.setCaptured(); await h.pass();
  const body = h.posts[0].body;
  assert.equal(body.amountInr, 5012.34); assert.equal(body.customer.countryCode, 'US'); assert.equal(body.customer.pincode, '60601');
  assert.equal(body.items[0].catalogueRatePerSqft, undefined); assert.equal(body.items[0].lineTotalInr, 5012.34);
});
test('abroad with no rupee figure: the money is recorded and the OS waits, loudly', async () => {
  const h = harness({ base: null });
  await h.call('create', { lines: [wall], customer: abroad }); h.setCaptured(); await h.pass();
  assert.equal(h.posts.length, 0);
  const row = h.db.prepare('select status,os_status,os_error from mimipip_orders').get();
  assert.equal(row.status, 'paid'); assert.equal(row.os_status, 'waiting'); assert.match(row.os_error, /rupee/);
  assert.equal(capturedInr({ amount: 100 }, { currency: 'USD' }), null);
});
test('the OS being down loses nothing: the sweep delivers it, /unsent lists it till then', async () => {
  const h = harness({ osStatus: 503 });
  await h.call('create', { lines: [hop], customer: india }); h.setCaptured(); await h.pass();
  const row = h.db.prepare('select os_status,os_error,os_tries from mimipip_orders').get();
  assert.equal(row.os_status, 'waiting'); assert.match(row.os_error, /503/); assert.equal(row.os_tries, 1);
  const list = (t?: string) => handleCommerce(new Request('https://mimipip.com/api/checkout/unsent', { headers: t ? { 'x-zyvorah-token': t } : {} }), h.env, h.transport, h.osFetch);
  assert.equal((await list()).status, 401); assert.equal((await (await list('os-token')).json()).unsent.length, 1);
  h.setOs(200); await sweep(h.env, h.transport, h.osFetch);
  assert.equal(h.db.prepare('select os_status from mimipip_orders').get().os_status, 'sent'); assert.equal((await (await list('os-token')).json()).unsent.length, 0);
});
test('a closed browser loses nothing: the sweep finds the captured payment', async () => {
  const h = harness();
  await h.call('create', { lines: [hop], customer: india }); h.setCaptured();
  h.db.exec('update mimipip_orders set created_at=created_at-600000');
  await sweep(h.env, h.transport, h.osFetch);
  assert.equal(h.db.prepare('select status from mimipip_orders').get().status, 'paid'); assert.equal(h.posts.length, 1);
});
test('the webhook is signature-checked, and confirms only a real captured payment', async () => {
  const h = harness();
  await h.call('create', { lines: [hop], customer: india });
  const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_test', order_id: 'order_test' } } } });
  const hook = (sig: string) => handleCommerce(new Request('https://mimipip.com/api/checkout/webhook', { method: 'POST', headers: { 'x-razorpay-signature': sig }, body: raw }), h.env, h.transport, h.osFetch);
  assert.equal((await hook('0'.repeat(64))).status, 401);
  const sig = createHmac('sha256', 'webhook-test').update(raw).digest('hex');
  assert.equal((await hook(sig)).status, 200);
  assert.equal(h.db.prepare('select status from mimipip_orders').get().status, 'pending', 'unpaid at Razorpay stays pending');
});
test('one session cannot pay for a different cart; a missing key keeps checkout shut', async () => {
  const h = harness();
  await h.call('create', { lines: [hop], customer: india });
  const r = await h.call('create', { lines: [{ ...hop, qty: 1 }], customer: india }); assert.equal(r.status, 409); assert.equal((await r.json()).renew, true);
  assert.equal((await h.call('create', { lines: [hop], customer: india }, 'https://evil.test')).status, 403);
  delete h.env.ZYVORAH_WEBHOOK_TOKEN;
  assert.equal((await h.call('create', { lines: [hop], customer: india, token: 'c'.repeat(64) })).status, 503);
});
test('a price can be shown before any payment key exists, but money cannot be taken', async () => {
  const h = harness();
  delete h.env.RAZORPAY_KEY_ID; delete h.env.RAZORPAY_KEY_SECRET;
  const quote = await h.call('quote', { lines: [hop], countryCode: 'IN' });
  assert.equal(quote.status, 200); assert.equal((await quote.json()).totalMinor, 799800);
  assert.equal((await h.call('quote', { lines: [hop], countryCode: 'US' })).status, 400);
  assert.equal((await h.call('quote', { lines: [hop], countryCode: 'IN' }, 'https://evil.test')).status, 403);
  assert.equal((await h.call('create', { lines: [hop], customer: india })).status, 503);
});
test('webOrderBody refuses a line with no artwork rather than sending a blank', () => {
  assert.throws(() => webOrderBody({ id: 'MP-1', paymentId: 'pay_1', amountInr: 1, lines: [{ slug: 'no-such', name: 'x', qty: 1, lineMinor: 1, widthCm: 1, heightCm: 1, ratePerSqft: null, billedSqft: null }], customer: india as any }));
});
