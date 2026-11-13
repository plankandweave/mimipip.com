import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeCacheKey, storable, ageOf, withEdgeCache, FRESH_SECONDS, STALE_SECONDS } from './edge-cache';

const paths = new Set(['/', '/nafas']);
const req = (url: string, init: RequestInit = {}) => new Request(url, init);
const page = (headers: Record<string, string> = {}) => new Response('<html>home</html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'index, follow', 'cache-control': 'no-store', ...headers } });

test('a public page is keyed by deploy and address; tracking parameters share one copy', () => {
  assert.equal(edgeCacheKey(req('https://mimipip.com/'), paths, 'v1'), 'https://mimipip.com/__edge/v1/');
  assert.equal(edgeCacheKey(req('https://mimipip.com/?utm_source=ig&fbclid=x'), paths, 'v1'), 'https://mimipip.com/__edge/v1/');
  assert.equal(edgeCacheKey(req('https://mimipip.com/?market=US'), paths, 'v1'), 'https://mimipip.com/__edge/v1/?market=US');
  assert.notEqual(edgeCacheKey(req('https://mimipip.com/'), paths, 'v1'), edgeCacheKey(req('https://mimipip.com/'), paths, 'v2'));
});

test('nothing per shopper, private or partial is cached', () => {
  assert.equal(edgeCacheKey(req('https://mimipip.com/checkout'), paths, 'v1'), null);
  assert.equal(edgeCacheKey(req('https://mimipip.com/?launch_preview=1'), paths, 'v1'), null);
  assert.equal(edgeCacheKey(req('https://mimipip.com/', { headers: { RSC: '1' } }), paths, 'v1'), null);
  assert.equal(edgeCacheKey(req('https://mimipip.com/', { headers: { cookie: 'zyv_country=US; zyv_cart=abc' } }), paths, 'v1'), null);
  assert.equal(edgeCacheKey(req('https://mimipip.com/', { headers: { cookie: 'sb-qrtz-auth-token=x' } }), paths, 'v1'), null);
  assert.equal(edgeCacheKey(req('https://mimipip.com/', { method: 'POST' }), paths, 'v1'), null);
  assert.equal(edgeCacheKey(req('https://www.mimipip.com/'), paths, 'v1'), null);
  // The country cookie alone does not make the page anyone's own: the browser picks the price from it.
  assert.ok(edgeCacheKey(req('https://mimipip.com/', { headers: { cookie: 'zyv_country=US' } }), paths, 'v1'));
  const withCookie = page(); withCookie.headers.append('set-cookie', 'a=b'); assert.equal(storable(withCookie), false);
  assert.equal(storable(page({ 'x-robots-tag': 'noindex, nofollow' })), false);
  assert.equal(storable(new Response('x', { status: 500, headers: { 'content-type': 'text/html', 'x-robots-tag': 'index' } })), false);
  assert.equal(storable(page()), true);
});

test('fresh is served, stale is served and rebuilt, expired is rebuilt', () => {
  assert.equal(ageOf(0, FRESH_SECONDS * 1000), 'fresh');
  assert.equal(ageOf(0, (FRESH_SECONDS + 1) * 1000), 'stale');
  assert.equal(ageOf(0, (STALE_SECONDS + 1) * 1000), 'expired');
  assert.equal(ageOf(NaN, 0), 'expired');
});

function memoryCache() {
  const m = new Map<string, Response>();
  return { m, async match(k: string) { const r = m.get(k); return r ? r.clone() : undefined; }, async put(k: string, r: Response) { m.set(k, new Response(await r.text(), r)); } };
}

test('the first visitor builds the page; the next is served the stored copy without a build', async () => {
  const cache = memoryCache(); const waits: Promise<unknown>[] = []; const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); } };
  let builds = 0; const build = async () => { builds++; return page(); };
  const key = 'https://mimipip.com/__edge/v1/';
  const first = await withEdgeCache(req('https://mimipip.com/'), ctx, key, build, cache, () => 1000);
  assert.equal(await first.text(), '<html>home</html>'); await Promise.all(waits);
  assert.equal(first.headers.get('x-mimipip-edge'), 'miss');
  const second = await withEdgeCache(req('https://mimipip.com/'), ctx, key, build, cache, () => 2000);
  assert.equal(builds, 1); assert.equal(second.headers.get('x-mimipip-edge'), 'hit');
  assert.equal(await second.text(), '<html>home</html>');
  assert.equal(second.headers.get('cache-control'), 'no-store');
  assert.equal(second.headers.get('x-mimipip-edge-stored'), null);
  // Stale: served at once, rebuilt behind.
  const third = await withEdgeCache(req('https://mimipip.com/'), ctx, key, build, cache, () => 1000 + (FRESH_SECONDS + 5) * 1000);
  assert.equal(third.headers.get('x-mimipip-edge'), 'stale'); await Promise.all(waits); assert.equal(builds, 2);
});

test('a broken cache never stops the page', async () => {
  const broken = { async match(): Promise<Response | undefined> { throw new Error('down'); }, async put() { throw new Error('down'); } };
  const r = await withEdgeCache(req('https://mimipip.com/'), { waitUntil: p => { p.catch(() => {}); } }, 'k', async () => page(), broken);
  assert.equal(await r.text(), '<html>home</html>');
});
