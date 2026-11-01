import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { caSignedUrl } from "@/lib/corporate-art-store";
import { looksLikeUuid, OS_URL_TTL_S, readMintAsk, readSince, walkLinkState } from "@/lib/prospect-walk";
import {
  mintWalkLink, osWalkDoorOk, type ProspectMarkRow, type ProspectWalkRow, type WalkLinkRow,
} from "@/lib/prospect-walk-server";

export const dynamic = "force-dynamic";

/**
 * The OS's door to guest walkthrough links (documented in AGENTS.md).
 *
 * POST { company, recipientEmail, recipientName?, brief?, osConversationId?, days?, by? }
 *        → { ok, id, ref, url, expiresAt }   — the token is in `url`, once
 * POST { action: "revoke", id }               → { ok }
 * GET  ?id=<uuid>                             → { ok, link, walks }  (submitted walks, 24 h URLs)
 * GET  ?submittedSince=<iso>                  → { ok, links }
 *
 * Authority: the shared server secret in `x-zyvorah-token`, the same one
 * internalTokenOk checks. Anything else is 401.
 */

const unauthorised = () => NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
const sign = (path: string | null) => (path ? caSignedUrl(path, OS_URL_TTL_S) : Promise.resolve(null));

export async function POST(req: Request) {
  if (!osWalkDoorOk(req)) return unauthorised();
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "Unavailable" }, { status: 503 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });

  if (body.action === "revoke") {
    if (!looksLikeUuid(body.id)) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    const { data: link } = await sb.from("prospect_walk_links").select("id").eq("id", body.id as string).maybeSingle();
    if (!link) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    // Conditional: the first revocation's time is the one kept.
    await sb.from("prospect_walk_links").update({ revoked_at: new Date().toISOString() })
      .eq("id", body.id as string).is("revoked_at", null);
    return NextResponse.json({ ok: true });
  }
  if (body.action !== undefined) return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });

  const ask = readMintAsk(body);
  if (!ask.ok) return NextResponse.json({ ok: false, error: ask.error }, { status: 400 });
  const minted = await mintWalkLink(sb, ask.ask);
  if (!minted.ok) return NextResponse.json({ ok: false, error: minted.error }, { status: 500 });
  return NextResponse.json({ ok: true, id: minted.id, ref: minted.ref, url: minted.url, expiresAt: minted.expiresAt },
    { headers: { "cache-control": "no-store" } });
}

export async function GET(req: Request) {
  if (!osWalkDoorOk(req)) return unauthorised();
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "Unavailable" }, { status: 503 });
  const q = new URL(req.url).searchParams;
  const headers = { "cache-control": "no-store" };

  const id = q.get("id");
  if (id) {
    if (!looksLikeUuid(id)) return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
    const { data } = await sb.from("prospect_walk_links").select("*").eq("id", id).maybeSingle();
    if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    const link = data as WalkLinkRow;

    const { data: walkRows } = await sb.from("prospect_walks").select("*")
      .eq("link_id", link.id).not("submitted_at", "is", null).order("created_at");
    const walks = (walkRows ?? []) as ProspectWalkRow[];
    const ids = walks.map((w) => w.id);
    const { data: markRows } = ids.length
      ? await sb.from("prospect_walk_marks").select("*").in("walk_id", ids).order("seq")
      : { data: [] as ProspectMarkRow[] };

    return NextResponse.json({
      ok: true,
      link: {
        id: link.id, ref: link.ref, company: link.company_name, state: walkLinkState(link),
        openedAt: link.opened_at, submittedAt: link.submitted_at, expiresAt: link.expires_at,
      },
      walks: await Promise.all(walks.map(async (w) => ({
        id: w.id,
        seconds: w.video_seconds,
        videoUrl: await sign(w.video_path),
        audioUrl: await sign(w.audio_path),
        transcript: w.transcript,
        transcriptError: w.transcript_error,
        note: w.note,
        submittedAt: w.submitted_at,
        marks: await Promise.all(((markRows ?? []) as ProspectMarkRow[])
          .filter((m) => m.walk_id === w.id)
          .map(async (m) => ({ seq: m.seq, atSeconds: Number(m.at_seconds), stillUrl: await sign(m.still_path), label: m.label }))),
      }))),
    }, { headers });
  }

  if (q.has("submittedSince")) {
    const since = readSince(q.get("submittedSince"));
    if (!since) return NextResponse.json({ ok: false, error: "submittedSince must be an ISO time" }, { status: 400 });
    const { data } = await sb.from("prospect_walk_links")
      .select("id, ref, os_conversation_id, submitted_at")
      .gte("submitted_at", since).order("submitted_at").limit(200);
    return NextResponse.json({
      ok: true,
      links: (data ?? []).map((l) => ({
        id: l.id as string, ref: l.ref as string,
        osConversationId: (l.os_conversation_id as number | null) ?? null, submittedAt: l.submitted_at as string,
      })),
    }, { headers });
  }

  return NextResponse.json({ ok: false, error: "Pass id or submittedSince" }, { status: 400 });
}
