/**
 * The funnel, counted on our own server in D1 (no new vendor, no cookie, nothing
 * about a person): product view, add to cart, checkout started, paid. One row per
 * day, event, design and country. The OS reads it at GET /api/checkout/funnel
 * with its token. A counter that fails never fails the page or the payment.
 */
import { isSellable } from './site';

export const FUNNEL_EVENTS = ['product_view', 'add_to_cart', 'checkout_started', 'paid'] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];
type Statement = { bind(...values: unknown[]): Statement; run(): Promise<unknown>; all<T = any>(): Promise<{ results: T[] }> };
export type FunnelDb = { prepare(sql: string): Statement };

const CREATE = "CREATE TABLE IF NOT EXISTS mimipip_funnel (day TEXT NOT NULL, event TEXT NOT NULL, slug TEXT NOT NULL, country TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, event, slug, country))";
let ready: Promise<unknown> | null = null;
const ensure = (db: FunnelDb) => (ready ??= db.prepare(CREATE).bind().run().catch(() => { ready = null; }));

/** The IST calendar day, the day the business reads its numbers by. */
export const istDay = (at = Date.now()) => new Date(at + 5.5 * 3600_000).toISOString().slice(0, 10);
export const cleanCountry = (c: unknown) => (typeof c === 'string' && /^[A-Z]{2}$/.test(c) && !['XX', 'T1'].includes(c) ? c : 'ZZ');
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|monitor|curl|wget|python|node-fetch/i;
export const looksAutomated = (userAgent: string | null) => !userAgent || BOT.test(userAgent);

export function validEvent(event: unknown, slug: unknown): event is FunnelEvent {
  return typeof event === 'string' && (FUNNEL_EVENTS as readonly string[]).includes(event) && typeof slug === 'string' && isSellable(slug);
}

export async function count(db: FunnelDb | undefined, event: FunnelEvent, slugs: string[], country: unknown, at = Date.now()) {
  if (!db) return;
  try {
    await ensure(db);
    for (const slug of [...new Set(slugs)].filter(isSellable).slice(0, 50))
      await db.prepare('INSERT INTO mimipip_funnel (day,event,slug,country,n) VALUES (?,?,?,?,1) ON CONFLICT(day,event,slug,country) DO UPDATE SET n=n+1')
        .bind(istDay(at), event, slug, cleanCountry(country)).run();
  } catch { /* a counter never breaks the shop */ }
}

/** The browser's part: a product page seen, a piece put in the cart. Only these two; the rest is counted where it happens. */
export async function handleFunnelBeacon(request: Request, db: FunnelDb | undefined): Promise<Response> {
  const done = new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST' || request.headers.get('origin') !== new URL(request.url).origin) return done;
  if (looksAutomated(request.headers.get('user-agent'))) return done;
  try {
    const raw = await request.text();
    if (raw.length > 300) return done;
    const b = JSON.parse(raw);
    if ((b.e === 'product_view' || b.e === 'add_to_cart') && validEvent(b.e, b.s))
      await count(db, b.e, [b.s], (request as Request & { cf?: { country?: string } }).cf?.country);
  } catch { /* ignored */ }
  return done;
}

export type FunnelRow = { day: string; event: FunnelEvent; slug: string; country: string; n: number };
export function summarise(rows: FunnelRow[]) {
  const totals = Object.fromEntries(FUNNEL_EVENTS.map(e => [e, 0])) as Record<FunnelEvent, number>;
  const byDay: Record<string, Record<FunnelEvent, number>> = {};
  const bySlug: Record<string, Record<FunnelEvent, number>> = {};
  for (const r of rows) {
    if (!(r.event in totals)) continue;
    totals[r.event] += r.n;
    (byDay[r.day] ??= { ...Object.fromEntries(FUNNEL_EVENTS.map(e => [e, 0])) } as Record<FunnelEvent, number>)[r.event] += r.n;
    (bySlug[r.slug] ??= { ...Object.fromEntries(FUNNEL_EVENTS.map(e => [e, 0])) } as Record<FunnelEvent, number>)[r.event] += r.n;
  }
  return { totals, byDay, bySlug };
}

export async function readFunnel(db: FunnelDb, days: number, now = Date.now()) {
  const span = Math.min(Math.max(Math.trunc(days) || 30, 1), 400);
  await ensure(db);
  const since = istDay(now - (span - 1) * 864e5);
  const rows = (await db.prepare('SELECT day,event,slug,country,n FROM mimipip_funnel WHERE day>=? ORDER BY day,event,slug,country').bind(since).all<FunnelRow>()).results;
  // Paid orders, from the payment records themselves: the figure the counter is checked against.
  const orders = (await db.prepare("SELECT currency, COUNT(*) AS orders, SUM(amount) AS amountMinor FROM mimipip_orders WHERE status='paid' AND created_at>=? GROUP BY currency").bind(now - span * 864e5).all()).results;
  return { since, days: span, ...summarise(rows), paidOrders: orders, rows };
}
