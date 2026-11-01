import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { staffKey } from '@/lib/staff-key';
import { presDownload, presUpload, presExists, presList } from '@/lib/presentation-store';
import { REVIEW_LIMIT, REVIEW_CSP, reviewPath } from '@/lib/private-review';
export const runtime = 'nodejs';
// Only a confirmed missing object permits a new immutable write.
function checkDownload(error: { message: string } | null) {
  if (error && !/object not found|not found/i.test(error.message)) throw error;
}
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
async function authorized(req: Request) {
  const key = await staffKey(req);
  if (!key) return false;
  const { data, error } = await supabase.rpc('admin_key_ok', { p_key: key });
  return !error && data === true;
}
export async function GET(req: Request) {
  if (!await authorized(req)) return new Response('Not found', { status: 404, headers });
  const url = new URL(req.url), company = url.searchParams.get('company_id') ?? '', digest = url.searchParams.get('digest');
  try {
    if (!digest) {
      reviewPath(company, '0'.repeat(64), 'complete.json');
      const reviews = [];
      for (const item of await presList(`staff-reviews/${company}`)) {
        if (!/^[0-9a-f]{64}$/.test(item.name)) continue;
        const { data: manifest } = await presDownload(reviewPath(company, item.name, 'complete.json'));
        if (manifest) {
          const files = await presList(`staff-reviews/${company}/${item.name}`);
          const template = files.filter(f => /^ltm-[0-9a-f]{64}\.html$/.test(f.name)).sort((x, y) => (y.createdAt ?? '').localeCompare(x.createdAt ?? ''))[0]?.name;
          reviews.push({ digest: item.name, ...JSON.parse(await manifest.text()), template });
        }
      }
      return Response.json({ reviews }, { headers });
    }
    const asset = url.searchParams.get('asset') ?? 'deck.html';
    const path = reviewPath(company, digest, asset);
    if (asset === 'complete.json' || !await presExists(reviewPath(company, digest, 'complete.json'))) return new Response('Not found', { status: 404, headers });
    // Read from R2 through the binding: the Supabase copy of a 4–15 MB asset
    // was metered egress on every single view (lib/presentation-store.ts).
    const { data, error } = await presDownload(path);
    if (!data || error) return new Response('Not found', { status: 404, headers });
    return new Response(await data.arrayBuffer(), { headers: { ...headers, 'Content-Type': asset.endsWith('.html') ? 'text/html; charset=utf-8' : asset === 'film.mp4' ? 'video/mp4' : 'application/pdf', 'Content-Security-Policy': REVIEW_CSP, ...(!asset.endsWith('.html') ? { 'Content-Disposition': `attachment; filename="${asset}"` } : {}) } });
  } catch { return new Response('Unavailable', { status: 400, headers }); }
}
export async function POST(req: Request) {
  if (!await authorized(req)) return new Response('Not found', { status: 404, headers });
  // Browser uploads must originate here; reject cross-site submissions before parsing.
  if (req.headers.get('origin') !== new URL(req.url).origin) return new Response('Forbidden', { status: 403, headers });
  const sb = supabaseAdmin();
  if (!sb) return new Response('Unavailable', { status: 503, headers });
  try {
    if (Number(req.headers.get('content-length')) > REVIEW_LIMIT) return new Response('Too large', { status: 413, headers });
    const form = await req.formData(), company = String(form.get('company_id') ?? '');
    const files = ['html', 'film', 'booklet'].map(key => form.get(key));
    if (files.some(f => !(f instanceof File)) || files.reduce((n, f) => n + (f as File).size, 0) > REVIEW_LIMIT) return new Response('Provide HTML, MP4 and PDF under 40 MB', { status: 400, headers });
    const bytes = await Promise.all(files.map(f => (f as File).arrayBuffer()));
    const html = new TextDecoder('utf-8', { fatal: true }).decode(bytes[0]);
    if (!/<html[\s>]/i.test(html) || new TextDecoder().decode(bytes[1].slice(4,8)) !== 'ftyp' || new TextDecoder().decode(bytes[2].slice(0,5)) !== '%PDF-') return new Response('Invalid file format', { status: 415, headers });
    const hashes = await Promise.all(bytes.map(async b => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b))).map(x => x.toString(16).padStart(2,'0')).join('')));
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashes.join(':'))))).map(x => x.toString(16).padStart(2,'0')).join('');
    const manifestPath = reviewPath(company, digest, 'complete.json');
    const { data: crm } = await sb.from('crm_companies').select('id').eq('id', company).maybeSingle();
    if (!crm) return new Response('Company not found', { status: 404, headers });
    const { data: existing, error: existingError } = await presDownload(manifestPath);
    checkDownload(existingError);
    if (existing) return Response.json({ digest, duplicate: true }, { headers });
    const assets = ['deck.html','film.mp4','booklet.pdf'], types = ['text/html','video/mp4','application/pdf'];
    for (let i = 0; i < assets.length; i++) {
      const path = reviewPath(company, digest, assets[i]);
      const { data: prior, error: priorError } = await presDownload(path);
      checkDownload(priorError);
      if (prior) {
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await prior.arrayBuffer()))).map(x => x.toString(16).padStart(2,'0')).join('');
        if (hash !== hashes[i]) throw new Error('Conflict');
      } else {
        const { error } = await presUpload(path, bytes[i], { contentType: types[i], upsert: false });
        if (error) throw error;
      }
    }
    const manifest = { title: (files[0] as File).name.slice(0,150), imported_at: new Date().toISOString(), hashes };
    const { error } = await presUpload(manifestPath, new TextEncoder().encode(JSON.stringify(manifest)), { contentType: 'application/json', upsert: false });
    if (error) throw error;
    return Response.json({ digest }, { headers });
  } catch { return new Response('Import incomplete. Retry the same files to resume safely.', { status: 500, headers }); }
}
