import "server-only";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropicKeyFor } from "@/lib/ai-keys";
import { caDownload, caUpload } from "@/lib/corporate-art-store";
import { signArt, DAY } from "@/lib/corporate-files";
import {
  candidatePath, DESIGN_SAMPLE, LANGUAGES, lineKeyMaterial, linePath, lineReady, spokenText, TIMBRE_VERSION, VOICE_BRIEF, VOICE_NAME, voiceSettings,
  type TimbreLanguage,
} from "@/lib/timbre-rules";

// Timbre — the house voice, spoken. Three doors:
//
//   design(…)   asks ElevenLabs to DESIGN voices from the brief (never a
//               stock voice) and keeps the candidates where the founder can
//               hear them;
//   choose(…)   saves the one she picks as the house voice, once;
//   say(…)      speaks a line in it — written into the language first when
//               it is not English — and keeps the recording, so the same
//               line is never generated twice.
//
// ELEVENLABS_API_KEY is the only secret; the chosen voice is a row
// (timbre_voice), or TIMBRE_VOICE_ID when the founder prefers to pin it.

const ELEVEN = "https://api.elevenlabs.io/v1";
const DESIGN_MODEL = "eleven_multilingual_ttv_v2";
const MODEL = "claude-opus-5";

export type VoiceRow = {
  id: string; voice_id: string | null; name: string | null; brief: string | null;
  candidates: { generatedVoiceId: string; path: string; seconds: number | null; text: string }[];
  chosen_at: string | null; chosen_by_email: string | null; updated_at: string;
};
export type LineRow = {
  id: string; key: string; voice_id: string; language: string; text: string; source_text: string | null; path: string; model: string | null; created_at: string;
};

export function keyReadiness(env: Record<string, string | undefined> = process.env): { ready: boolean; why: string | null } {
  return env.ELEVENLABS_API_KEY?.trim() ? { ready: true, why: null } : { ready: false, why: "ELEVENLABS_API_KEY is not set on the Worker, so Timbre cannot be designed or spoken yet." };
}

async function eleven(path: string, init: { method?: string; body?: unknown; accept?: string } = {}): Promise<Response> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  return fetch(`${ELEVEN}${path}`, {
    method: init.method ?? "POST",
    headers: { "xi-api-key": key, "content-type": "application/json", accept: init.accept ?? "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(90_000),
  });
}

/** ElevenLabs renamed the voice-design routes in 2026; the older names are
 *  tried when the new ones answer 404, so a rename on their side never
 *  stops the desk. */
async function elevenEither(paths: string[], init: { body?: unknown }): Promise<Response> {
  let last: Response | null = null;
  for (const p of paths) {
    const r = await eleven(p, init);
    if (r.status !== 404) return r;
    last = r;
  }
  return last!;
}

async function fail(r: Response, what: string): Promise<never> {
  const body = await r.text().catch(() => "");
  throw new Error(`${what}: ElevenLabs ${r.status} ${body.slice(0, 240)}`);
}

/* ──────────────────────────────── the trace ────────────────────────────── */

/** Every visit and every press leaves a line on the voice row, so a press
 *  that fails before it saves anything can still be read afterwards (the
 *  first live test, 12 October 2026, left no trace at all). Never throws:
 *  the trace must not be the thing that breaks the desk. */
export async function noteOpened(sb: SupabaseClient): Promise<void> {
  try {
    await sb.from("timbre_voice").update({ last_opened_at: new Date().toISOString(), key_ready: keyReadiness().ready }).eq("id", "house");
  } catch { /* the trace is best-effort */ }
}

export async function noteAttempt(sb: SupabaseClient, action: string, error: string | null): Promise<void> {
  try {
    await sb.from("timbre_voice").update({
      last_action: action.slice(0, 120), last_error: error ? error.slice(0, 1000) : null,
      last_attempt_at: new Date().toISOString(), key_ready: keyReadiness().ready,
    }).eq("id", "house");
  } catch { /* the trace is best-effort */ }
}

/* ─────────────────────────── the voice itself ─────────────────────────── */

export async function voiceRow(sb: SupabaseClient): Promise<VoiceRow> {
  const { data } = await sb.from("timbre_voice").select("*").eq("id", "house").maybeSingle();
  return (data as VoiceRow | null) ?? { id: "house", voice_id: null, name: null, brief: null, candidates: [], chosen_at: null, chosen_by_email: null, updated_at: new Date(0).toISOString() };
}

/** The voice Timbre speaks with: the pinned id, else the chosen row. */
export async function houseVoice(sb: SupabaseClient): Promise<{ voiceId: string; name: string; pinned: boolean } | null> {
  const pinned = process.env.TIMBRE_VOICE_ID?.trim();
  if (pinned) return { voiceId: pinned, name: "pinned by TIMBRE_VOICE_ID", pinned: true };
  const row = await voiceRow(sb);
  return row.voice_id ? { voiceId: row.voice_id, name: row.name ?? VOICE_NAME, pinned: false } : null;
}

export type Candidate = { generatedVoiceId: string; url: string | null; seconds: number | null; text: string };

/** Design candidates from the brief. Each preview is kept in the private
 *  store so the founder can come back to them; choosing one is a second,
 *  separate press. */
export async function design(sb: SupabaseClient, brief: string = VOICE_BRIEF): Promise<{ ok: true; candidates: Candidate[] } | { ok: false; error: string }> {
  const k = keyReadiness();
  if (!k.ready) return { ok: false, error: k.why! };
  const body = { voice_description: brief, text: DESIGN_SAMPLE, model_id: DESIGN_MODEL, output_format: "mp3_44100_128", loudness: 0.4, guidance_scale: 5 };
  let previews: { audio_base_64: string; generated_voice_id: string; duration_secs?: number }[];
  try {
    const r = await elevenEither(["/text-to-voice/design", "/text-to-voice/create-previews"], { body });
    if (!r.ok) await fail(r, "designing the voice");
    const j = (await r.json()) as { previews?: typeof previews };
    previews = j.previews ?? [];
    if (!previews.length) throw new Error("designing the voice: ElevenLabs returned no previews");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const kept: VoiceRow["candidates"] = [];
  for (const p of previews.slice(0, 4)) {
    const path = candidatePath(p.generated_voice_id);
    const up = await caUpload(path, Buffer.from(p.audio_base_64, "base64"), { contentType: "audio/mpeg", upsert: true });
    if (up.error) return { ok: false, error: `keeping a candidate: ${up.error.message}` };
    kept.push({ generatedVoiceId: p.generated_voice_id, path, seconds: p.duration_secs ?? null, text: DESIGN_SAMPLE });
  }
  await sb.from("timbre_voice").upsert({ id: "house", brief, candidates: kept, updated_at: new Date().toISOString() }, { onConflict: "id" });
  return { ok: true, candidates: await candidateViews(sb, kept) };
}

export async function candidateViews(sb: SupabaseClient, c: VoiceRow["candidates"]): Promise<Candidate[]> {
  return Promise.all(c.map(async (x) => ({ generatedVoiceId: x.generatedVoiceId, url: await signArt(sb, x.path, DAY), seconds: x.seconds, text: x.text })));
}

/** Save the chosen candidate as the house voice on ElevenLabs and here. */
export async function choose(sb: SupabaseClient, generatedVoiceId: string, byEmail: string | null): Promise<{ ok: true; voiceId: string } | { ok: false; error: string }> {
  const k = keyReadiness();
  if (!k.ready) return { ok: false, error: k.why! };
  const row = await voiceRow(sb);
  const cand = row.candidates.find((c) => c.generatedVoiceId === generatedVoiceId);
  if (!cand) return { ok: false, error: "That candidate is not on the desk any more. Design again." };
  try {
    const r = await elevenEither(["/text-to-voice", "/text-to-voice/create-voice-from-preview"], {
      body: { voice_name: VOICE_NAME, voice_description: row.brief ?? VOICE_BRIEF, generated_voice_id: generatedVoiceId, labels: { brand: "Zyvorah", role: "Timbre", version: TIMBRE_VERSION } },
    });
    if (!r.ok) await fail(r, "saving the voice");
    const j = (await r.json()) as { voice_id?: string };
    if (!j.voice_id) throw new Error("saving the voice: ElevenLabs returned no voice id");
    await sb.from("timbre_voice").update({ voice_id: j.voice_id, name: VOICE_NAME, chosen_at: new Date().toISOString(), chosen_by_email: byEmail, updated_at: new Date().toISOString() }).eq("id", "house");
    return { ok: true, voiceId: j.voice_id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* ────────────────────────────── speaking ─────────────────────────────── */

/** The line, written into the language by the model: natural spoken
 *  register in the native script, the brand name left in Latin letters. */
export async function writeIn(english: string, language: TimbreLanguage): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (language === "en") return { ok: true, text: english.trim() };
  if (!anthropicKeyFor("timbre")) return { ok: false, error: "Timbre has no key to spend (ANTHROPIC_KEY_TIMBRE or the shared key)." };
  const l = LANGUAGES[language];
  try {
    const anthropic = new Anthropic({ apiKey: anthropicKeyFor("timbre") });
    const message = await anthropic.messages.create({
      model: MODEL, max_tokens: 1200,
      output_config: { format: { type: "json_schema", schema: { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } } } },
      messages: [{ role: "user", content: `Write this line in ${l.name} (${l.native}), in its own script, as a calm, warm woman would SAY it to a visitor standing in front of a wall — spoken register, not written; everyday words a first-year student from a smaller town would understand; no English words except names. Keep "Zyvorah" exactly as it is, in Latin letters. Keep numbers as digits. Return JSON only: {"text": "..."}.\n\nTHE LINE (English):\n${english.trim()}` }],
    });
    const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    const parsed = text ? (JSON.parse(text) as { text?: string }) : null;
    if (!parsed?.text?.trim()) return { ok: false, error: "Timbre could not write the line." };
    return { ok: true, text: parsed.text.trim() };
  } catch (e) {
    console.error("[timbre] write failed:", (e as Error)?.message);
    return { ok: false, error: "Timbre could not be reached to write the line. Try again in a moment." };
  }
}

export type SpokenLine = { id: string; language: TimbreLanguage; text: string; sourceText: string | null; url: string | null; publicPath: string; createdAt: string; cached: boolean };

async function lineView(sb: SupabaseClient, row: LineRow, cached: boolean): Promise<SpokenLine> {
  return { id: row.id, language: row.language as TimbreLanguage, text: row.text, sourceText: row.source_text, url: await signArt(sb, row.path, DAY), publicPath: `/api/timbre/line/${row.id}`, createdAt: row.created_at, cached };
}

/** Speak a line in the house voice, once. `text` is in `language` already
 *  (use writeIn first for a translation); `sourceText` is kept for the record. */
export async function say(sb: SupabaseClient, text: string, language: TimbreLanguage, sourceText: string | null = null): Promise<{ ok: true; line: SpokenLine } | { ok: false; error: string }> {
  const k = keyReadiness();
  if (!k.ready) return { ok: false, error: k.why! };
  const ready = lineReady(text);
  if (!ready.ok) return { ok: false, error: ready.reason };
  const voice = await houseVoice(sb);
  if (!voice) return { ok: false, error: "Timbre has no voice yet. Design one and choose it on the desk." };
  const key = createHash("sha256").update(lineKeyMaterial(voice.voiceId, language, text)).digest("hex");
  const { data: existing } = await sb.from("timbre_lines").select("*").eq("key", key).maybeSingle();
  if (existing) return { ok: true, line: await lineView(sb, existing as LineRow, true) };

  const model = LANGUAGES[language].model;
  let mp3: Buffer;
  try {
    const r = await eleven(`/text-to-speech/${encodeURIComponent(voice.voiceId)}?output_format=mp3_44100_128`, {
      // No language_code: both models detect the language from the script
      // itself, and the parameter is refused by models that do not take it.
      body: { text: spokenText(text), model_id: model, voice_settings: voiceSettings(model) },
      accept: "audio/mpeg",
    });
    if (!r.ok) await fail(r, `speaking in ${LANGUAGES[language].name}`);
    mp3 = Buffer.from(await r.arrayBuffer());
    if (mp3.length < 1000) throw new Error("ElevenLabs returned an empty recording");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const path = linePath(key);
  const up = await caUpload(path, mp3, { contentType: "audio/mpeg", upsert: true });
  if (up.error) return { ok: false, error: `keeping the line: ${up.error.message}` };
  const { data: row, error } = await sb.from("timbre_lines").insert({ key, voice_id: voice.voiceId, language, text: text.trim(), source_text: sourceText, path, model }).select("*").single();
  if (error || !row) return { ok: false, error: `recording the line: ${error?.message ?? "unknown"}` };
  return { ok: true, line: await lineView(sb, row as LineRow, false) };
}

/** Write (when needed) and speak, in one call — what the desk and Sonar use. */
export async function sayIn(sb: SupabaseClient, english: string, language: TimbreLanguage): Promise<{ ok: true; line: SpokenLine } | { ok: false; error: string }> {
  const w = await writeIn(english, language);
  if (!w.ok) return w;
  return say(sb, w.text, language, language === "en" ? null : english.trim());
}

export async function recentLines(sb: SupabaseClient, limit = 12): Promise<SpokenLine[]> {
  const { data } = await sb.from("timbre_lines").select("*").order("created_at", { ascending: false }).limit(limit);
  return Promise.all(((data ?? []) as LineRow[]).map((r) => lineView(sb, r, true)));
}

/** The bytes of a spoken line, for the public player. */
export async function lineBytes(sb: SupabaseClient, id: string): Promise<{ bytes: ArrayBuffer; language: string } | null> {
  const { data } = await sb.from("timbre_lines").select("path, language").eq("id", id).maybeSingle();
  const row = data as { path: string; language: string } | null;
  if (!row) return null;
  const { data: blob } = await caDownload(row.path);
  if (!blob) return null;
  return { bytes: await blob.arrayBuffer(), language: row.language };
}
