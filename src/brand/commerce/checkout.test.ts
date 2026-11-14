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
import {handleSampleOrder} from './sample-order';

const india = { name: 'Test Buyer', email: 'buyer@example.test', phone: '9000000000', address: 'Test address only', city: 'Pune', state: 'Maharashtra', postcode: '411008', countryCode: 'IN' };
const abroad = { name: 'Test Buyer', email: 'buyer@example.test', phone: '+1 312 555 0100', address: '1 Test Street, Apt 2', city: 'Chicago', state: 'Illinois', postcode: '60601', countryCode: 'US' };
const wall = { slug: 'almond-blossom', qty: 1, widthCm: 300, heightCm: 250 };
const hop = { slug: 'hopscotch-peach-pop', qty: 2 };
const wallMinor = (rate: number) => Math.round((300 * 250) / 929.0304 * rate * 100);

function harness(opts: { base?: number | null; osStatus?: number; keyId?: string | null } = {}) {
  const db = new DatabaseSync(':memory:');
  for (const f of ['0000_volatile_phantom_reporter', '0001_typical_sheva_callister', '0002_cart_checkout','0006_gift_cards','0007_gift_funding','0008_gift_card_reference','0009_gift_buyer_copy']) db.exec(readFileSync('drizzle/' + f + '.sql', 'utf8'));
  const DB = { prepare(sql: string) { return { bind(...v: any[]) { const s = db.prepare(sql); return { first: async () => s.get(...v) || null, run: async () => ({ meta: { changes: Number(s.run(...v).changes) } }), all: async () => ({ results: s.all(...v) }) }; } }; } };
  let captured = false, currency = 'INR', total = 0, osStatus = opts.osStatus ?? 200;
  const posts: any[] = [];
  const pay = () => ({ id: 'pay_test', status: captured ? 'captured' : 'authorized', captured, amount: total, currency, amount_refunded: 0, order_id: 'order_test', ...(currency === 'USD' && opts.base !== null ? { base_amount: opts.base ?? 501234, base_currency: 'INR' } : {}) });
  const fakeSecret = 'test-secret';
  const STORE_PAY = {
    ready: () => true, keyId: () => opts.keyId === undefined ? 'rzp_live_fixture' : opts.keyId,
    razorpay: async (path: string, body?: any) => {
      let data: any;
      if (body) { total = body.amount; currency = body.currency; data = { id: 'order_test', amount: total, currency }; }
      else if (path.endsWith('/payments')) data = { items: [pay()] };
      else if (path.startsWith('payments/')) data = pay();
      else data = { status: captured ? 'paid' : 'attempted', amount: total, amount_paid: captured ? total : 0, currency };
      return { ok: true, status: 200, data };
    },
    verifySignature: (message: string, signature: string) => createHmac('sha256', fakeSecret).update(message).digest('hex') === signature,
    sendOrder: async (body: any) => { posts.push({ body }); return { ok: osStatus < 300, status: osStatus, text: osStatus < 300 ? '' : 'down' }; },
    osTokenMatches: (v: string) => v === 'os-token',
  };
  const env: any = { DB, MIMIPIP_CHECKOUT_ENABLED: '1', STORE_PAY };
  const call = (action: string, data: any = {}, origin = 'https://mimipip.com') => handleCommerce(new Request('https://mimipip.com/api/checkout/' + action, { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'a'.repeat(64), ...data }) }), env);
  const pass = () => call('verify', { razorpay_order_id: 'order_test', razorpay_payment_id: 'pay_test', razorpay_signature: createHmac('sha256', fakeSecret).update('order_test|pay_test').digest('hex') });
  return { db, env, call, pass, posts, setCaptured: () => { captured = true; }, setOs: (n: number) => { osStatus = n; }, total: () => total };
}

test('a wall is priced from the catalogue, billed at 20 sq ft at least', () => {
  const p = priceLine(wall, 'IN'); assert.ok(!refused(p));
  assert.equal(p.ratePerSqft, 200); assert.equal(p.billedSqft, 80.73); assert.equal(p.unitMinor, wallMinor(200));
  const small = priceLine({ ...wall, widthCm: 100, heightCm: 100 }, 'IN'); assert.ok(!refused(small)); assert.equal(small.unitMinor, 400000);
  assert.equal(billedSqft(10, 10), 20);
});
test('abroad every wall is her US$10 a sq ft; India uses the approved ₹200 GST-inclusive rate', () => {
  assert.equal(ratePerSqft('almond-blossom', 'ABROAD'), 10);
  assert.equal(ratePerSqft('nafas-spiral-bloom', 'IN'), 200);
  const p = priceLine(wall, 'ABROAD'); assert.ok(!refused(p)); assert.equal(p.currency, 'USD'); assert.equal(p.unitMinor, wallMinor(10));
});
test('Hopscotch uses the selling-price sheet in India and the US', () => {
  const p = priceLine(hop, 'IN'); assert.ok(!refused(p)); assert.equal(p.lineMinor, 980000); assert.equal(p.widthCm, 75);
  assert.equal(onSale('hopscotch-peach-pop', 'ABROAD'), true); const abroad = priceLine(hop, 'ABROAD'); assert.ok(!refused(abroad)); assert.equal(abroad.lineMinor, 41980);
});
test('a design with no price on record is refused, never given one', () => {
  for (const r of catalogue as any[]) {
    if (!r.type.includes('stair-sticker')) continue;
    assert.equal(onSale(r.slug, 'IN'), false, r.slug); assert.equal(onSale(r.slug, 'ABROAD'), false, r.slug);
  }
  const unlisted = (catalogue as any[]).find(r => r.type.includes('wallpaper') && r.sourceIndiaPricePerSqft == null);
  assert.equal(onSale(unlisted.slug, 'IN'), true);
});
test('a design with no print artwork cannot be bought, even with a price', () => {
  const noArt = (catalogue as any[]).find(r => r.collection[0] === 'happy-lines' && !artFor(r.slug)); assert.ok(noArt);
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
  const expected = wallMinor(200) + 980000;
  assert.equal(made.amount, expected); assert.equal(made.currency, 'INR'); assert.equal(h.total(), expected);
  assert.equal((await (await h.call('status')).json()).paid, false); assert.equal(h.posts.length, 0);
  assert.equal((await h.call('verify', { razorpay_order_id: 'order_test', razorpay_payment_id: 'pay_test', razorpay_signature: '0'.repeat(64) })).status, 400);
  h.setCaptured(); r = await h.pass(); assert.equal(r.status, 200); assert.equal((await r.json()).paid, true);
  assert.equal(h.posts.length, 1);
  assert.equal(h.db.prepare('SELECT count(*) n FROM mimipip_order_email').get().n,1);
  const { body } = h.posts[0];
  assert.equal(body.brand, 'lorange'); assert.equal(body.items[0].brand, 'lorange'); assert.equal(body.amountInr, expected / 100); assert.equal(body.payment.razorpayPaymentId, 'pay_test');
  assert.equal(body.customer.pincode, '411008'); assert.equal(body.customer.countryCode, 'IN'); assert.equal(body.orderRef, made.orderNumber);
  assert.equal(body.items[0].widthMm, 3000); assert.equal(body.items[0].heightMm, 2500); assert.equal(body.items[0].catalogueRatePerSqft, 200); assert.equal(body.items[0].materialSlug, 'self-adhesive-vinyl'); assert.equal(body.items[0].material, 'self_adhesive');
  assert.match(body.items[0].designUrl, /^https:\/\//); assert.deepEqual(body.items[0].placement, { zoom: 1.5, cropX: .2, cropY: .3, flipH: false, flipV: false });
  assert.equal(body.items[1].widthMm, 780); assert.equal(body.items[1].heightMm, 2630); assert.equal(body.items[1].qty, 2); assert.equal(body.items[1].material, 'self_adhesive'); assert.match(body.items[1].designUrl, /^https:\/\/media\.zyvorah\.com\/_print-masters\/mimipip\/hopscotch-peach-pop-[0-9a-f]{10}\.jpg$/);
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
  const list = (t?: string) => handleCommerce(new Request('https://mimipip.com/api/checkout/unsent', { headers: t ? { 'x-zyvorah-token': t } : {} }), h.env);
  assert.equal((await list()).status, 401);
  const waiting = (await (await list('os-token')).json()).unsent;
  assert.equal(waiting.length, 1);
  assert.equal(typeof waiting[0].created_at, 'number', 'retries move updated_at, so the OS alarm must count from created_at');
  h.setOs(200); await sweep(h.env);
  assert.equal(h.db.prepare('select os_status from mimipip_orders').get().os_status, 'sent'); assert.equal((await (await list('os-token')).json()).unsent.length, 0);
});
test('a closed browser loses nothing: the sweep finds the captured payment', async () => {
  const h = harness();
  await h.call('create', { lines: [hop], customer: india }); h.setCaptured();
  h.db.exec('update mimipip_orders set created_at=created_at-600000');
  await sweep(h.env);
  assert.equal(h.db.prepare('select status from mimipip_orders').get().status, 'paid'); assert.equal(h.posts.length, 1);
});
test('one session cannot pay for a different cart; a missing key keeps checkout shut', async () => {
  const h = harness();
  await h.call('create', { lines: [hop], customer: india });
  const r = await h.call('create', { lines: [{ ...hop, qty: 1 }], customer: india }); assert.equal(r.status, 409); assert.equal((await r.json()).renew, true);
  assert.equal((await h.call('create', { lines: [hop], customer: india }, 'https://evil.test')).status, 403);
  h.env.STORE_PAY = { ...h.env.STORE_PAY, ready: () => false };
  assert.equal((await h.call('create', { lines: [hop], customer: india, token: 'c'.repeat(64) })).status, 503);
});
test('a price can be shown with no way to pay, but money cannot be taken', async () => {
  const h = harness();
  delete h.env.STORE_PAY;
  const quote = await h.call('quote', { lines: [hop], countryCode: 'IN' });
  assert.equal(quote.status, 200); assert.equal((await quote.json()).totalMinor, 980000);
  const usQuote = await h.call('quote', { lines: [hop], countryCode: 'US' }); assert.equal(usQuote.status, 200); assert.equal((await usQuote.json()).totalMinor, 41980);
  assert.equal((await h.call('quote', { lines: [hop], countryCode: 'IN' }, 'https://evil.test')).status, 403);
  assert.equal((await h.call('create', { lines: [hop], customer: india })).status, 503);
});
test('a design that cannot be bought is named, so the shopper knows which to remove', () => {
  const r = priceCart([{ slug: 'sage-meadow', qty: 1 }], 'US');
  assert.ok('refused' in r); assert.match(r.refused, /Sage Meadow/);
});
test('an order Razorpay refuses leaves the shopper free to try again', async () => {
  const h = harness();
  const real = h.env.STORE_PAY.razorpay;
  h.env.STORE_PAY = { ...h.env.STORE_PAY, razorpay: async () => ({ ok: false, status: 400, data: null }) };
  assert.equal((await h.call('create', { lines: [hop], customer: india })).status, 503);
  assert.equal(h.db.prepare('select count(*) as n from mimipip_orders').get().n, 0);
  h.env.STORE_PAY = { ...h.env.STORE_PAY, razorpay: real };
  assert.equal((await h.call('create', { lines: [hop], customer: india })).status, 200);
});
test('the order sent to Razorpay carries only what the store sends', async () => {
  const h = harness();
  const real = h.env.STORE_PAY.razorpay;
  let sent: any;
  h.env.STORE_PAY = { ...h.env.STORE_PAY, razorpay: async (p: string, b?: any) => { if (b) sent = b; return real(p, b); } };
  await h.call('create', { lines: [hop], customer: india });
  assert.deepEqual(Object.keys(sent).sort(), ['amount', 'currency', 'notes', 'receipt']);
});
test('webOrderBody refuses a line with no artwork rather than sending a blank', () => {
  assert.throws(() => webOrderBody({ id: 'MP-1', paymentId: 'pay_1', amountInr: 1, lines: [{ slug: 'no-such', name: 'x', qty: 1, lineMinor: 1, widthCm: 1, heightCm: 1, ratePerSqft: null, billedSqft: null }], customer: india as any }));
});

test('changed delivery details cannot reuse an old payable order', async()=>{
 const h=harness();
 assert.equal((await h.call('create',{lines:[hop],customer:india})).status,200);
 const r=await h.call('create',{lines:[hop],customer:{...india,address:'A different delivery address'}});
 assert.equal(r.status,409);assert.equal((await r.json()).renew,true);
});

test('legacy durable advanced layouts are held instead of silently losing instructions',()=>{
 const line={slug:wall.slug,name:'Almond Blossom',qty:1,lineMinor:100,widthCm:300,heightCm:250,ratePerSqft:200,billedSqft:80,crop:{imageUrl:artFor(wall.slug)!.art,wallWidthCm:300,wallHeightCm:250,offsetX:.5,offsetY:.5,zoom:1,divisions:[100]}};
 assert.throws(()=>webOrderBody({id:'MP-old',paymentId:'pay_old',amountInr:1,lines:[line],customer:india as any}),/confirm fulfilment/);
});

test('Hush and Wander wall preview and print source both quote at checkout',()=>{
 const slug='hush-and-wander-duckling-pond';
 const art=artFor(slug)!.art;
 for(const imageUrl of [art,'/nursery-worlds/02-duckling-pond-art-v3.webp']){
  const result=priceCart([{slug,qty:1,widthCm:244,heightCm:274,crop:{imageUrl,wallWidthCm:244,wallHeightCm:274,offsetX:.5,offsetY:.5,zoom:1}}],'US');
  assert.ok(!('refused' in result), 'checkout should accept the approved '+imageUrl);
  assert.equal(result.lines[0].crop?.imageUrl,art);
 }
});

test('sample pricing is exactly one India-only A4 self-adhesive sample, never a discounted wall', () => {
  const sample={slug:'almond-blossom',kind:'sample',qty:1};
  const q=priceCart([{...sample,amount:1,lineMinor:1}], 'IN');assert.ok(!('refused' in q));
  assert.equal(q.totalMinor,20000);assert.equal(q.lines[0].widthCm,21);assert.equal(q.lines[0].heightCm,29.7);assert.equal(q.lines[0].kind,'sample');
  for(const bad of [{...sample,qty:2},{...sample,widthCm:300},{...sample,crop:{}},{...sample,placement:{}},{...sample,slug:hop.slug},{...sample,kind:'unknown'}])assert.ok('refused' in priceCart([bad],'IN'));
  assert.ok('refused' in priceCart([sample],'US'));
});
test('sample capture carries the dedicated two-card sample metadata and survives retry', async()=>{
  const h=harness({osStatus:503});h.env.MIMIPIP_SAMPLE_CHECKOUT_ENABLED='1';
  const made=await h.call('create',{customer:india,lines:[{slug:'almond-blossom',kind:'sample',qty:1}]});assert.equal(made.status,200);assert.equal(h.total(),20000);
  assert.equal(h.posts.length,0);h.setCaptured();await h.pass();assert.equal(h.posts.length,1);
  const item=h.posts[0].body.items[0];assert.equal(item.widthMm,210);assert.equal(item.heightMm,297);assert.equal(item.lineTotalInr,200);assert.equal(item.materialSlug,'self-adhesive-vinyl');
  assert.deepEqual(item.sample,{designHandle:'almond-blossom',materialSlug:'self-adhesive-vinyl',materialLabel:'Smooth Self-Adhesive',muralWidthCm:243.84,muralHeightCm:243.84,sourceUrl:artFor('almond-blossom')!.art});
  assert.equal(item.catalogueRatePerSqft,undefined);assert.equal(item.placement,undefined);
  h.setOs(200);await sweep(h.env);assert.equal(h.db.prepare('select os_status from mimipip_orders').get().os_status,'sent');
  const count=h.posts.length;await h.call('status');assert.equal(h.posts.length,count);
});
test('sample fulfilment release gate blocks payment even through the general checkout endpoint', async()=>{
  const h=harness();const res=await h.call('create',{customer:india,lines:[{slug:'almond-blossom',kind:'sample',qty:1}]});assert.equal(res.status,503);assert.equal(h.total(),0);assert.equal(h.db.prepare('select count(*) as n from mimipip_orders').get().n,0);
});

test('original sample widget adapter creates the same scoped payment order and reuses its token',async()=>{
 const h=harness();h.env.MIMIPIP_SAMPLE_CHECKOUT_ENABLED='1';
 const b={token:'a'.repeat(64),name:india.name,email:india.email,phone:'+91'+india.phone,countryCode:'IN',design:{handle:'almond-blossom',title:'tampered title'},finishes:['Smooth Self-Adhesive'],address:{line1:india.address,city:india.city,state:india.state,pincode:india.postcode},amount:1};
 const request=()=>new Request('https://mimipip.com/api/sample-order',{method:'POST',headers:{origin:'https://mimipip.com','Content-Type':'application/json'},body:JSON.stringify(b)});
 let r=await handleSampleOrder(request(),h.env);assert.equal(r.status,200);const data=await r.json();assert.equal(data.amount,200);assert.equal(data.razorpay.amount,20000);assert.equal(data.razorpay.razorpayOrderId,'order_test');
 r=await handleSampleOrder(request(),h.env);assert.equal((await r.json()).orderNumber,data.orderNumber);assert.equal(h.db.prepare('select count(*) as n from mimipip_orders').get().n,1);
 h.setCaptured();await h.pass();r=await handleSampleOrder(request(),h.env);assert.equal((await r.json()).paid,true);
 assert.match(h.posts[0].body.items[0].designName,/Almond Blossom/);assert.doesNotMatch(h.posts[0].body.items[0].designName,/tampered/);
});

test('installation uses the original rate and quantity rounding, never a supplied charge',async()=>{
 const h=harness();
 const crop={imageUrl:'/review/hover-art/almond-blossom.webp',wallWidthCm:300,wallHeightCm:250,offsetX:.5,offsetY:.5,zoom:1,installation:{ratePerSqft:35,total:1}};
 const q=priceCart([{...wall,qty:2,crop}],'IN');assert.ok(!('refused' in q));
 // areaSqFt uses the original native 3-decimal rounding before installation pricing.
 const charge=Math.round(80.729*35*2*1.18)*100;
 assert.equal(q.lines[0].installationMinor,charge);assert.equal(q.totalMinor,wallMinor(200)*2+charge);
 assert.ok('refused' in priceCart([{...wall,crop}],'US'));
 assert.ok('refused' in priceCart([{...wall,widthCm:200,crop:{...crop,wallWidthCm:200}}],'IN'));
 let r=await h.call('create',{customer:{...india,postcode:'110001',city:'Pune'},lines:[{...wall,qty:2,crop}]});assert.equal(r.status,400);assert.equal(h.total(),0);
 r=await h.call('create',{customer:india,lines:[{...wall,qty:2,crop}]});assert.equal(r.status,200);h.setCaptured();await h.pass();
 const item=h.posts[0].body.items[0];assert.equal(item.installByUs,true);assert.equal(item.installationTotalInr,charge/100);assert.equal(item.lineTotalInr,q.totalMinor/100);
});


test('lettering is approved, priced authoritatively and faithfully handed to OS after capture',async()=>{
 const overlay={version:1,kind:'cloud',shape:'scalloped',text:'Mira',font:'jakarta',color:'#273746',background:'#fff8ed',align:'center',x:.2,y:.2,width:.4,
  companion:{version:1,kind:'quote',shape:'scalloped',text:'Dream big',font:'inter',color:'#273746',background:'none',align:'center',x:.2,y:.65,width:.4}};
 const crop={imageUrl:'/review/hover-art/almond-blossom.webp',wallWidthCm:300,wallHeightCm:250,offsetX:.5,offsetY:.5,zoom:1,textOverlay:overlay,personalisation:{childName:'tampered',fee:1},approval:{approvedAt:'2026-11-08T10:00:00.000Z',panelArrangement:'Three panels'}};
 const line={...wall,qty:2,crop};
 const q=priceCart([line],'IN');assert.ok(!('refused'in q));assert.equal(q.totalMinor,wallMinor(200)*2+50000);assert.equal(q.lines[0].personalisationMinor,50000);assert.deepEqual(q.lines[0].crop?.personalisation,{childName:'Mira',fee:500});
 assert.ok('refused'in priceCart([line],'US'));
 for(const bad of [{...crop,approval:null},{...crop,textOverlay:{...overlay,x:.99}},{...crop,textOverlay:null}])assert.ok('refused'in priceCart([{...wall,crop:bad}],'IN'));
 const h=harness();let r=await h.call('create',{lines:[line],customer:india});assert.equal(r.status,503);assert.equal(h.total(),0);
 h.env.MIMIPIP_LETTERING_CHECKOUT_ENABLED='1';r=await h.call('create',{lines:[line],customer:india});assert.equal(r.status,200);
 h.setCaptured();assert.equal((await h.pass()).status,200);const sent=h.posts[0].body.items[0];assert.deepEqual(sent.textOverlay,overlay);assert.equal(sent.personalisationTotalInr,500);assert.equal(sent.lineTotalInr,q.totalMinor/100);
 assert.throws(()=>webOrderBody({id:'test',paymentId:'pay_test',amountInr:q.totalMinor/100,customer:{...india,country:'India'},lines:[{...q.lines[0],personalisationMinor:100}]}),/Lettering price/);
});

test('an approved quote is included in either country and a naked placement never drops production instructions',()=>{
 const crop={imageUrl:'/review/hover-art/almond-blossom.webp',wallWidthCm:300,wallHeightCm:250,offsetX:.5,offsetY:.5,zoom:1,textOverlay:{version:1,kind:'quote',shape:'scalloped',text:'Dream big',font:'inter',color:'#273746',background:'none',align:'center',x:.2,y:.2,width:.4},approval:{approvedAt:'2026-11-08T10:00:00.000Z',panelArrangement:'Three panels'}};
 for(const country of ['IN','US']){const q=priceCart([{...wall,crop} ],country);assert.ok(!('refused'in q));assert.equal(q.totalMinor,wallMinor(country==='IN'?200:10));assert.equal(q.lines[0].personalisationMinor,0);}
 for(const extra of [{rotation:90},{seamless:{repeatWidthCm:60}},{flipH:'false'},{doors:[{}]}])assert.ok('refused'in priceCart([{...wall,placement:{zoom:1,cropX:.5,cropY:.5,...extra}}],'IN'));
});


test('business identity is validated before payment and preserved without a corporate channel',async()=>{
 const alphabet='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',prefix='27AAAAA0000A1Z';
 let sum=0;for(let i=0;i<14;i++){const n=alphabet.indexOf(prefix[i]!)*(i%2?2:1);sum+=Math.floor(n/36)+n%36;}
 const gstin=prefix+alphabet[(36-sum%36)%36]; // Synthetic checksum fixture, not a registration claim.
 const identity={gstin,legalName:'Example Test Business'};
 const h=harness();
 for(const billingIdentity of [{...identity,gstin:gstin.slice(0,14)+'?'},{...identity,legalName:''},{...identity,unexpected:true}]){
  assert.equal((await h.call('create',{lines:[wall],customer:{...india,billingIdentity}})).status,400);assert.equal(h.total(),0);
 }
 assert.equal((await h.call('create',{lines:[wall],customer:{...abroad,billingIdentity:identity}})).status,400);
 assert.equal((await h.call('create',{lines:[wall],customer:{...india,billingIdentity:identity}})).status,503);assert.equal(h.total(),0);
 h.env.MIMIPIP_BUSINESS_INVOICE_ENABLED='1';
 assert.equal((await h.call('create',{lines:[wall],customer:{...india,billingIdentity:{gstin:gstin.toLowerCase(),legalName:'  Example   Test Business  '}}})).status,200);
 assert.equal((await h.call('create',{lines:[wall],customer:{...india,billingIdentity:{...identity,legalName:'Changed Test Business'}}})).status,409);
 h.setCaptured();assert.equal((await h.pass()).status,200);
 assert.deepEqual(h.posts[0].body.billingIdentity,identity);
 assert.equal(h.posts[0].body.corporate,undefined);
 assert.equal(h.posts[0].body.brand,'lorange');
});

test('new orders snapshot server artwork and material, ignoring caller substitutions', () => {
 const q=priceCart([{...wall,fulfilmentArt:{art:'https://evil.test/a',material:'paste'}}],'IN');
 assert.ok(!('refused' in q));
 assert.deepEqual(q.lines[0].fulfilmentArt,artFor(wall.slug));
 const snapshot=structuredClone(q.lines[0]);
 const body=webOrderBody({id:'test',paymentId:'pay_test',amountInr:q.totalMinor/100,createdAt:Date.now(),customer:{...india,country:'India'},lines:[snapshot]});
 assert.equal(body.items[0].material,'self_adhesive');
 assert.equal(body.items[0].materialSlug,'self-adhesive-vinyl');
});

test('legacy pending wallpaper keeps its purchased pasted stock; ambiguous records stop', () => {
 const q=priceCart([wall],'IN');assert.ok(!('refused' in q));
 const {fulfilmentArt,...legacy}=q.lines[0];
 const order={id:'test',paymentId:'pay_test',amountInr:q.totalMinor/100,customer:{...india,country:'India'},lines:[legacy]};
 assert.equal(webOrderBody({...order,createdAt:Date.parse('2026-11-10T01:00:00Z')}).items[0].material,'paste');
 assert.throws(()=>webOrderBody({...order,createdAt:Date.now()}),/Unversioned material/);
});

test('a saved pasted-material selection cannot silently become self-adhesive',()=>{
 const q=priceCart([{...wall,materialSlug:'smooth-matt'}],'IN');
 assert.ok('refused' in q);assert.match(q.refused,/material has changed/);
 const current=priceCart([{...wall,materialSlug:'self-adhesive-vinyl'}],'IN');
 assert.ok(!('refused' in current));
});

async function seedGift(h:ReturnType<typeof harness>,minor:number,recipient=india.email){
 const {giftHash,normalizedGiftCode,giftReference}=await import('./gift-ledger');const {walletTicket}=await import('./gift-wallet');
 const id='MPG-'+'B'.repeat(24);
 h.env.MIMIPIP_GIFTS_ENABLED='1';h.env.MIMIPIP_GIFT_SECRET='test-only-key-value-'.repeat(3);h.db.exec('PRAGMA foreign_keys=ON');
 h.db.prepare("INSERT INTO mimipip_gift_orders(id,token_hash,fingerprint,status,amount,currency,presentation,purchaser_email,recipient_email,valid_days,created_at) VALUES(?,?,?,'pending',?,'INR','{}','gift.buyer@example.test',?,0,?)").run(id,id,id,minor,recipient,Date.now());
 const ref=await giftReference(h.env.MIMIPIP_GIFT_SECRET,id,0);
 h.db.prepare("INSERT INTO mimipip_gift_cards(id,code_hash,initial_minor,balance_minor,currency,status,activated_at) VALUES(?,?,?,?,'INR','active',?)").run(id,await giftHash(normalizedGiftCode(ref)),minor,minor,Date.now());
 // A balance is spent only with the signed-in recipient's ticket (the wallet route issues it).
 return walletTicket(h.env.MIMIPIP_GIFT_SECRET,id,recipient);
}
test('partial gift charges only the balance and hands OS full invoice plus distinct tender',async()=>{
 const h=harness();const code=await seedGift(h,100100);const made=await(await h.call('create',{lines:[wall],customer:india,giftTicket:code})).json();assert.equal(made.amount,wallMinor(200)-100100);h.setCaptured();await h.pass();assert.equal(h.posts.length,1);const b=h.posts[0].body;assert.equal(b.amountInr,wallMinor(200)/100);assert.equal(b.payment.amountInr,made.amount/100);assert.equal(b.giftTender.amountInr,1001);assert.equal(b.giftTender.redemptionRef,made.orderNumber);await h.pass();assert.equal(h.posts.length,1);
});
test('fully gifted order never creates a provider payment and retains excess gift balance',async()=>{
 const h=harness();const code=await seedGift(h,2000000);const made=await(await h.call('create',{lines:[wall],customer:india,giftTicket:code})).json();assert.equal(made.paid,true);assert.equal(h.total(),0);assert.equal(h.posts.length,1);assert.equal(h.posts[0].body.payment,undefined);assert.equal(h.posts[0].body.giftTender.amountInr,wallMinor(200)/100);assert.equal(h.db.prepare('SELECT balance_minor FROM mimipip_gift_cards').get().balance_minor,2000000-wallMinor(200));
});
test('late provider response cannot publish a recovered unpresented gift checkout',async()=>{
 const h=harness();const code=await seedGift(h,100100);const original=h.env.STORE_PAY.razorpay;
 h.env.STORE_PAY.razorpay=async(path:string,body?:any)=>{const result=await original(path,body);if(body){h.db.exec("UPDATE mimipip_orders SET created_at=1 WHERE status='creating'");const {recoverCreatingGiftOrders}=await import('./gift-ledger');await recoverCreatingGiftOrders(h.env.DB);}return result;};
 const r=await h.call('create',{lines:[wall],customer:india,giftTicket:code});assert.notEqual(r.status,200);assert.equal((await r.json()).orderId,undefined);assert.equal(h.db.prepare('SELECT count(*) n FROM mimipip_orders').get().n,0);assert.equal(h.db.prepare('SELECT balance_minor FROM mimipip_gift_cards').get().balance_minor,100100);
});
test('a changed part-gift checkout gives its balance back and starts afresh; a payment in flight keeps it',async()=>{
 const h=harness();h.env.MIMIPIP_GIFTS_ENABLED='1';const code=await seedGift(h,100100);
 const made=await(await h.call('create',{lines:[wall],customer:india,giftTicket:code})).json();assert.ok(made.orderId);
 assert.equal(h.db.prepare('SELECT balance_minor FROM mimipip_gift_cards').get().balance_minor,0);
 // Razorpay shows no payment on the order: the change releases it.
 const orig=h.env.STORE_PAY.razorpay;h.env.STORE_PAY.razorpay=async(path:string,body?:any)=>path.endsWith('/payments')?{ok:true,status:200,data:{items:[]}}:orig(path,body);
 const r=await h.call('create',{lines:[{...wall,widthCm:310}],customer:india,giftTicket:code});assert.equal(r.status,409);const j=await r.json();assert.equal(j.renew,true);
 assert.equal(h.db.prepare('SELECT balance_minor FROM mimipip_gift_cards').get().balance_minor,100100);
 assert.equal(h.db.prepare("SELECT status FROM mimipip_orders WHERE id=?").get(made.orderNumber).status,'expired');
});
test('a gift card cannot settle a design service',async()=>{
 const h=harness();const code=await seedGift(h,100100);
 const svc={slug:'bespoke-customisation',qty:1,crop:{bespoke:{note:'A sunny nursery wall'}}};
 const priced=priceCart([wall,svc],'IN');assert.ok(!('refused' in priced)&&priced.lines.some((l:any)=>l.kind==='design-service'));
 const q=await handleCommerce(new Request('https://mimipip.com/api/checkout/quote',{method:'POST',headers:{origin:'https://mimipip.com','Content-Type':'application/json'},body:JSON.stringify({lines:[wall,svc],countryCode:'IN',giftTicket:code})}),h.env);
 assert.equal(q.status,400);assert.match((await q.json()).error,/design service/);
 const c=await h.call('create',{lines:[wall,svc],customer:india,giftTicket:code});assert.equal(c.status,400);
 assert.equal(h.db.prepare('SELECT balance_minor FROM mimipip_gift_cards').get().balance_minor,100100);
});

// A Razorpay test key takes no real money, but its payments still read as captured: nothing may come of them.
test('a test or unknown Razorpay key closes checkout and says why, without exposing the key',async()=>{
 for(const [keyId,mode] of [['rzp_test_fixture','test'],[null,'unknown'],['something_else','unknown']] as const){
  const h=harness({keyId});
  const r=await(await handleCommerce(new Request('https://mimipip.com/api/checkout/readiness'),h.env)).json();
  assert.equal(r.open,false);assert.equal(r.gateway,mode);assert.ok(!JSON.stringify(r).includes('fixture'));
  const made=await h.call('create',{lines:[wall],customer:india});assert.equal(made.status,503);assert.equal(h.total(),0);
 }
 const live=await(await handleCommerce(new Request('https://mimipip.com/api/checkout/readiness'),harness().env)).json();
 assert.equal(live.open,true);assert.equal(live.gateway,'live');
});
test('a payment captured on a test key never becomes a paid order or reaches the OS',async()=>{
 const h=harness();const made=await(await h.call('create',{lines:[wall],customer:india})).json();assert.ok(made.orderId);
 h.env.STORE_PAY={...h.env.STORE_PAY,keyId:()=>'rzp_test_fixture'};h.setCaptured();
 await h.pass();await sweep(h.env);
 const row=h.db.prepare('SELECT status,os_error FROM mimipip_orders WHERE id=?').get(made.orderNumber);
 assert.equal(row.status,'review');assert.equal(row.os_error,'gateway_not_live');assert.equal(h.posts.length,0);
});
test('an unreadable key holds a captured payment for the next pass instead of deciding',async()=>{
 const h=harness();const made=await(await h.call('create',{lines:[wall],customer:india})).json();
 h.env.STORE_PAY={...h.env.STORE_PAY,keyId:()=>{throw new Error('binding down');}};h.setCaptured();await h.pass();
 assert.equal(h.db.prepare('SELECT status FROM mimipip_orders WHERE id=?').get(made.orderNumber).status,'pending');assert.equal(h.posts.length,0);
 h.env.STORE_PAY={...h.env.STORE_PAY,keyId:()=>'rzp_live_fixture'};await h.pass();
 assert.equal(h.db.prepare('SELECT status FROM mimipip_orders WHERE id=?').get(made.orderNumber).status,'paid');assert.equal(h.posts.length,1);
});

test('a gift balance is spent only by its signed-in recipient: a typed reference, a forged ticket or another email spends nothing',async()=>{
 const h=harness();await seedGift(h,100100);
 const {giftReference}=await import('./gift-ledger');const ref=await giftReference(h.env.MIMIPIP_GIFT_SECRET,'MPG-'+'B'.repeat(24),0);
 // A typed reference is not a way to pay: the order is charged in full and the balance is untouched.
 const typed=await(await h.call('create',{lines:[wall],customer:india,giftCode:ref})).json();assert.equal(typed.amount,wallMinor(200));
 assert.equal(h.db.prepare('SELECT balance_minor FROM mimipip_gift_cards').get().balance_minor,100100);
 const h2=harness();const t2=await seedGift(h2,100100);
 const forged=t2.slice(0,-1)+(t2.endsWith('0')?'1':'0');
 assert.equal((await h2.call('create',{lines:[wall],customer:india,giftTicket:forged})).status,400);
 assert.equal((await h2.call('create',{lines:[wall],customer:{...india,email:'someone.else@example.test'},giftTicket:t2})).status,400);
 assert.equal(h2.db.prepare('SELECT balance_minor FROM mimipip_gift_cards').get().balance_minor,100100);
 // A ticket for a card sent to someone else is refused even though it is genuinely signed.
 const h3=harness();const {walletTicket}=await import('./gift-wallet');await seedGift(h3,100100,'shardul@example.test');
 const stolen=await walletTicket(h3.env.MIMIPIP_GIFT_SECRET,'MPG-'+'B'.repeat(24),india.email);
 assert.equal((await h3.call('create',{lines:[wall],customer:india,giftTicket:stolen})).status,400);
 assert.equal(h3.db.prepare('SELECT balance_minor FROM mimipip_gift_cards').get().balance_minor,100100);
});

test('a part-gift checkout whose payment window was closed resumes with the same ticket and the same held balance',async()=>{
 const h=harness();const ticket=await seedGift(h,100100);
 const first=await(await h.call('create',{lines:[wall],customer:india,giftTicket:ticket})).json();assert.ok(first.orderId);assert.equal(first.amount,wallMinor(200)-100100);
 assert.equal(h.db.prepare('SELECT balance_minor FROM mimipip_gift_cards').get().balance_minor,0);
 const again=await h.call('create',{lines:[wall],customer:india,giftTicket:ticket});assert.equal(again.status,200);
 const second=await again.json();assert.equal(second.orderId,first.orderId);assert.equal(second.amount,first.amount);
 const q=await h.call('quote',{lines:[wall],countryCode:'IN',giftTicket:ticket});
 assert.equal(q.status,200);assert.equal((await q.json()).giftMinor,100100);
});

// Jump Jamboree uses the existing live shop flow; courier costing is not a gate.
test('Jump Jamboree charges 3778 including GST, no delivery, and sends the exact floor size to the OS', async () => {
  const h = harness();
  const made = await (await h.call('create', { lines: [{ slug: 'jump-jamboree', qty: 1, amount: 1 }], customer: india })).json();
  assert.equal(made.amount, 377800);
  assert.equal(made.currency, 'INR');
  const row = h.db.prepare('select shipping from mimipip_orders').get();
  assert.equal(row.shipping, 0);
  h.setCaptured();
  assert.equal((await h.pass()).status, 200);
  const body = h.posts[0].body;
  assert.equal(body.amountInr, 3778);
  assert.equal(body.shippingInr, 0);
  assert.equal(body.items[0].widthMm, 820);
  assert.equal(body.items[0].heightMm, 2140);
  assert.match(body.items[0].designUrl, /jump-jamboree-[a-f0-9]{10}\.png$/);
});
