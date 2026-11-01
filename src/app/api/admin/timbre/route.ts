import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { candidateViews, choose, design, houseVoice, keyReadiness, noteAttempt, noteOpened, recentLines, sayIn, voiceRow } from "@/lib/timbre";
import { isTimbreLanguage, LANGUAGES, VOICE_BRIEF } from "@/lib/timbre-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// The Timbre desk.
//
//   GET                    → the voice (chosen or not), the candidates on the
//                            desk, the languages, the last lines spoken
//   POST action: "design"  → design candidates from the brief
//   POST action: "choose"  → save one as the house voice
//   POST action: "say"     → speak a line (written into the language first)

export async function GET(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "The desk is unavailable." }, { status: 503 });
  const [row, voice, lines] = await Promise.all([voiceRow(sb), houseVoice(sb), recentLines(sb), noteOpened(sb)]);
  return NextResponse.json({
    key: keyReadiness(),
    voice,
    chosenAt: row.chosen_at,
    brief: row.brief ?? VOICE_BRIEF,
    candidates: await candidateViews(sb, row.candidates),
    languages: Object.entries(LANGUAGES).map(([code, l]) => ({ code, name: l.name, native: l.native, sample: l.sample })),
    lines,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return notStaff();
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "The desk is unavailable." }, { status: 503 });
  const b = await req.json().catch(() => ({})) as { action?: string; generatedVoiceId?: string; text?: string; language?: string };
  const action = String(b.action ?? "");

  if (action === "design") {
    const r = await design(sb);
    await noteAttempt(sb, "design", r.ok ? null : r.error);
    return r.ok ? NextResponse.json({ ok: true, candidates: r.candidates }) : NextResponse.json({ error: r.error }, { status: 503 });
  }
  if (action === "choose") {
    const r = await choose(sb, String(b.generatedVoiceId ?? ""), staff.email ?? null);
    await noteAttempt(sb, "choose", r.ok ? null : r.error);
    return r.ok ? NextResponse.json({ ok: true, voiceId: r.voiceId }) : NextResponse.json({ error: r.error }, { status: 409 });
  }
  if (action === "say") {
    const language = String(b.language ?? "en");
    if (!isTimbreLanguage(language)) return NextResponse.json({ error: "Timbre does not speak that language yet." }, { status: 400 });
    const r = await sayIn(sb, String(b.text ?? ""), language);
    await noteAttempt(sb, `say:${language}`, r.ok ? null : r.error);
    return r.ok ? NextResponse.json({ ok: true, line: r.line }) : NextResponse.json({ error: r.error }, { status: 409 });
  }
  return NextResponse.json({ error: "Bad request" }, { status: 400 });
}
