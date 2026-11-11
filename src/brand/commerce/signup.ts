/**
 * "Hear from us first": an email list, kept in D1. Email only, never a child's
 * details. First-time opt-ins queue one welcome email. The answer is the same whether or not an
 * address is already known, so the form cannot be used to test who has signed up.
 */
export const CONSENT_TEXT = 'I agree to emails from MimiPip about new designs and launches. I can leave at any time.';
const SOURCES = new Set(['home', 'footer', 'campaign']);
export const validEmail = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const normal = (v: string) => v.trim().toLowerCase();

type Statement = { bind(...v: unknown[]): Statement; run(): Promise<unknown> };
type Env = { DB?: { prepare(sql: string): Statement } };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

export async function handleSignup(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Invalid request origin' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON required' }, 415);
  if (!env.DB) return json({ error: 'Please try again in a moment.' }, 503);
  let b: any;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return json({ error: 'Too long' }, 413);
    b = JSON.parse(raw);
  } catch { return json({ error: 'Please check your email address.' }, 400); }
  try {
    if (path === '/api/signup') {
      if (b.agree !== true) return json({ error: 'Please tick the box to agree.' }, 400);
      // A field people cannot see: only a form-filling robot completes it. It gets the same thank-you.
      if (b.website) return json({ ok: true });
      if (!validEmail(b.email)) return json({ error: 'Please check your email address.' }, 400);
      const country = (request as Request & { cf?: { country?: string } }).cf?.country ?? null;
      const source = SOURCES.has(b.source) ? b.source : 'footer';
      await env.DB.prepare(
        `INSERT INTO mimipip_signups (email,consent,source,country,leave_key,created_at) VALUES (?,?,?,?,?,?)
         ON CONFLICT(email) DO UPDATE SET unsubscribed_at=NULL,consent=excluded.consent,source=excluded.source,created_at=excluded.created_at`,
      ).bind(normal(b.email), CONSENT_TEXT, source, country, crypto.randomUUID().replaceAll('-', ''), Date.now()).run();
      return json({ ok: true });
    }
    if (path === '/api/signup/leave') {
      const now = Date.now();
      if (typeof b.key === 'string' && /^[a-f0-9]{32}$/.test(b.key)) {
        await env.DB.prepare('UPDATE mimipip_signups SET unsubscribed_at=? WHERE leave_key=? AND unsubscribed_at IS NULL').bind(now, b.key).run();
        return json({ ok: true });
      }
      if (!validEmail(b.email)) return json({ error: 'Please check your email address.' }, 400);
      await env.DB.prepare('UPDATE mimipip_signups SET unsubscribed_at=? WHERE email=? AND unsubscribed_at IS NULL').bind(now, normal(b.email)).run();
      return json({ ok: true });
    }
    return json({ error: 'Not found' }, 404);
  } catch { return json({ error: 'Please try again in a moment.' }, 503); }
}
