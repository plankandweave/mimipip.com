import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Test runner is Node 25; application retains Node 20 type declarations.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleSignup, CONSENT_TEXT, validEmail } from './signup';

function harness() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync('drizzle/0003_signups.sql', 'utf8'));
  const DB = { prepare(sql: string) { return { bind(...v: any[]) { const s = db.prepare(sql); return { run: async () => s.run(...v) }; } }; } };
  const call = (path: string, body: any, origin = 'https://mimipip.com') => handleSignup(new Request('https://mimipip.com' + path, { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), { DB } as any);
  return { db, call, rows: () => db.prepare('select * from mimipip_signups').all() };
}

test('an address and its consent are kept, and only those', async () => {
  const h = harness();
  assert.equal((await h.call('/api/signup', { email: ' Parent@Example.TEST ', agree: true, source: 'home' })).status, 200);
  const [r] = h.rows();
  assert.equal(r.email, 'parent@example.test'); assert.equal(r.consent, CONSENT_TEXT); assert.equal(r.source, 'home');
  assert.deepEqual(Object.keys(r).sort(), ['consent', 'country', 'created_at', 'email', 'id', 'leave_key', 'source', 'unsubscribed_at']);
});
test('no tick, no sign-up; a bad address is refused', async () => {
  const h = harness();
  assert.equal((await h.call('/api/signup', { email: 'a@b.test' })).status, 400);
  assert.equal((await h.call('/api/signup', { email: 'nonsense', agree: true })).status, 400);
  assert.equal(h.rows().length, 0);
  assert.equal(validEmail('a@b'), false);
});
test('another site cannot post to the form, and a robot is thanked but not kept', async () => {
  const h = harness();
  assert.equal((await h.call('/api/signup', { email: 'a@b.test', agree: true }, 'https://evil.test')).status, 403);
  assert.equal((await h.call('/api/signup', { email: 'a@b.test', agree: true, website: 'x' })).status, 200);
  assert.equal(h.rows().length, 0);
});
test('signing up twice is one row, with the same answer', async () => {
  const h = harness();
  await h.call('/api/signup', { email: 'a@b.test', agree: true });
  const again = await h.call('/api/signup', { email: 'A@B.test', agree: true });
  assert.equal(again.status, 200); assert.equal(h.rows().length, 1);
});
test('leaving works by link or by address, says nothing about who is listed, and signing up again rejoins', async () => {
  const h = harness();
  await h.call('/api/signup', { email: 'a@b.test', agree: true });
  const key = h.rows()[0].leave_key;
  assert.equal((await h.call('/api/signup/leave', { key })).status, 200);
  assert.ok(h.rows()[0].unsubscribed_at);
  await h.call('/api/signup', { email: 'a@b.test', agree: true });
  assert.equal(h.rows()[0].unsubscribed_at, null);
  assert.equal((await h.call('/api/signup/leave', { email: 'A@b.test' })).status, 200);
  assert.ok(h.rows()[0].unsubscribed_at);
  assert.equal((await h.call('/api/signup/leave', { email: 'nobody@b.test' })).status, 200);
});
