import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropicKeyFor } from "@/lib/ai-keys";
import { caUpload } from "@/lib/corporate-art-store";
import { signArt, DAY } from "@/lib/corporate-files";
import { lumenCutRemote } from "@/lib/media-client";
import { mediaRendition, toMediaUrl } from "@/lib/media-url";
import {
  cutReady, fillNarration, filmHeadline, LUMEN_VERSION, pictureFor, sceneSkeleton, scriptReady, WORDS, MAX_NARRATION_CHARS,
  type LumenScene, type LumenScript, type LumenStatus,
} from "@/lib/lumen-rules";
import type { ProposalRow, PreviewRow } from "@/lib/prism";
import type { BlueprintRow } from "@/lib/trace-link";
import type { BlueprintWallRow } from "@/lib/vault";

// Lumen — the presentation film of a campus proposal, in the founder's voice.
//
// Three steps, each its own press on the desk, because the words leave in
// HER voice and the film goes to a college:
//
//   1. Write.   Lumen reads the proposal and writes what she says over each
//               scene, in her register (first person, plain, warm, exact).
//               She edits any line on the desk.
//   2. Record.  Every scene is spoken by her cloned voice on ElevenLabs
//               (LUMEN_VOICE_ID, spent with ELEVENLABS_API_KEY) and kept in
//               the private store. No key or no voice: the step says so and
//               nothing is sent.
//   3. Cut.     The container lays each scene's picture (the mockup on the
//               wall's photograph) under its narration and joins them; the
//               result lands on the film's row. The desk polls that row.
//
// The college sees the film only once it is PRESENTED, and only through the
// Vault of a presented proposal.

const MODEL = "claude-opus-5";
const ELEVEN = "https://api.elevenlabs.io/v1";
const ELEVEN_MODEL = "eleven_multilingual_v2";

export type FilmRow = {
  id: string; blueprint_id: string; account_id: string; proposal_id: string; revision: number;
  status: LumenStatus; script: LumenScript; voice_id: string | null;
  narration: { key: string; path: string; chars: number }[];
  film_path: string | null; poster_path: string | null; duration_s: number | null; error: string | null;
  model: string | null; created_by_email: string | null; presented_at: string | null; created_at: string; updated_at: string;
};

export type LumenView = {
  id: string; revision: number; status: LumenStatus; headline: string; script: LumenScript;
  recorded: string[]; filmUrl: string | null; posterUrl: string | null; durationS: number | null;
  error: string | null; presentedAt: string | null; createdAt: string; updatedAt: string;
  voice: { ready: boolean; why: string | null };
};

/** Whether the founder's voice can be recorded from this Worker. */
export function voiceReadiness(env: Record<string, string | undefined> = process.env): { ready: boolean; why: string | null } {
  const key = env.ELEVENLABS_API_KEY?.trim();
  const voice = env.LUMEN_VOICE_ID?.trim();
  if (!key && !voice) return { ready: false, why: "Lumen has no voice yet: ELEVENLABS_API_KEY and LUMEN_VOICE_ID (the founder's cloned voice) are not set on the Worker." };
  if (!key) return { ready: false, why: "ELEVENLABS_API_KEY is not set on the Worker." };
  if (!voice) return { ready: false, why: "LUMEN_VOICE_ID (the founder's cloned voice on ElevenLabs) is not set on the Worker." };
  return { ready: true, why: null };
}

const SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  required: ["title", "scenes"],
  properties: {
    title: { type: "string" as const },
    scenes: {
      type: "array" as const,
      items: {
        type: "object" as const, additionalProperties: false, required: ["key", "narration"],
        properties: { key: { type: "string" as const }, narration: { type: "string" as const } },
      },
    },
  },
};

/* ───────────────────────────── 1. Write ───────────────────────────── */

export async function writeScript(sb: SupabaseClient, blueprint: BlueprintRow, proposal: ProposalRow, account: { name: string; slug: string }, byEmail: string | null): Promise<{ ok: true; film: FilmRow } | { ok: false; error: string }> {
  if (!anthropicKeyFor("lumen")) return { ok: false, error: "Lumen has no key to spend (ANTHROPIC_KEY_LUMEN or the shared key)." };
  const { data: wallRows } = await sb.from("blueprint_walls").select("*").eq("blueprint_id", blueprint.id).neq("status", "dropped").order("seq");
  const walls = (wallRows ?? []) as BlueprintWallRow[];
  const n = proposal.narrative;
  const cands = n.candidates ?? {};
  const skeletonWalls = walls.flatMap((w) => {
    const c = n.walls.find((x) => x.seq === w.seq);
    return c ? [{ id: w.id, seq: w.seq, name: w.name, location: w.location, title: c.title }] : [];
  });
  if (!skeletonWalls.length) return { ok: false, error: "The proposal has no walls to film." };
  const skeleton = sceneSkeleton(n.direction, blueprint.name, skeletonWalls);

  const { data: prevRows } = await sb.from("prism_wall_previews").select("wall_id, product_handle").eq("proposal_id", proposal.id).eq("chosen", true);
  const chosen = new Map(((prevRows ?? []) as { wall_id: string; product_handle: string }[]).map((r) => [r.wall_id, r.product_handle]));

  const wallBrief = skeletonWalls.map((w) => {
    const c = n.walls.find((x) => x.seq === w.seq)!;
    const handle = chosen.get(w.id);
    const design = handle ? (cands[String(w.seq)] ?? []).find((x) => x.handle === handle) : undefined;
    return [
      `Scene key "wall:${w.seq}" — ${w.name}${w.location ? ` (${w.location})` : ""}${walls.find((x) => x.id === w.id)?.width_mm ? ` · ${(walls.find((x) => x.id === w.id)!.width_mm! / 1000).toFixed(1)} m × ${(walls.find((x) => x.id === w.id)!.height_mm! / 1000).toFixed(1)} m` : ""}`,
      `  title: ${c.title}`,
      `  concept: ${c.concept}`,
      `  why here: ${c.rationale}`,
      `  mood: ${c.mood}`,
      c.commissioned ? `  this piece is to be painted for the wall${c.commissionNote ? `: ${c.commissionNote}` : ""}` : design ? `  the design on it: ${design.title}` : "",
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  const prompt = `You are Lumen ${LUMEN_VERSION}, writing the narration of a short presentation film for ${blueprint.name}${blueprint.city ? `, ${blueprint.city}` : ""}. The film is spoken by Roheena Nagpal, the founder of Zyvorah, in her own voice, to the people who run the college. Write exactly what she says — nothing else.

HER REGISTER: first person singular. Plain Indian English, warm and exact, the way a founder talks to a vice-chancellor she respects: no superlatives, no "excited", no "amazing", no exclamation marks, no sales language, no bullet points. Short sentences. She describes what the wall will show and what it does for the people who pass it, as if walking them through the campus. She never reads the concept text aloud; she tells it. Numbers are spelled out ("eight walls", "three metres"). The word Zyvorah is written exactly so. Do not invent facts about the college, its people or its history beyond the dossier; where unsure, speak about the walls.

THE DIRECTION: "${n.direction}" — ${n.standfirst}
${n.theme}

Palette: ${n.palette.map((p) => p.name).join(", ")}. Motifs: ${n.motifs.map((m) => m.name).join(", ")}.
${n.journeys.length ? `How people walk it: ${n.journeys.map((j) => `${j.who}: ${j.route.join(" → ")}. ${j.body}`).join(" ")}` : ""}

THE SCENES, in order. Return one narration per key:
- "opening" (about ${WORDS.opening} words): who she is in one line, what she saw when she looked at this campus, and the direction in one sentence.
${wallBrief.split("\n\n").map((b) => `- ${b.replace(/^Scene key /, "")} (about ${WORDS.wall} words)`).join("\n")}
- "closing" (about ${WORDS.closing} words): what happens next — she will bring design samples of two or three of these to the campus, walk the walls with them, and the whole programme can be installed within weeks of their word — and a plain thank you. No pressure, no deadline.

Also return "title": the film's title in three to six words, drawn from the direction.

Return JSON only: { "title": string, "scenes": [{ "key": string, "narration": string }] } with every key above, in order.`;

  let script: LumenScript;
  try {
    const anthropic = new Anthropic({ apiKey: anthropicKeyFor("lumen") });
    const message = await anthropic.messages.create({
      model: MODEL, max_tokens: 4000,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: prompt }],
    });
    const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    if (!text) return { ok: false, error: "Lumen returned nothing readable." };
    const parsed = JSON.parse(text) as { title: string; scenes: { key: string; narration: string }[] };
    script = { title: (parsed.title || n.direction).trim().slice(0, 80), scenes: fillNarration(skeleton, parsed.scenes ?? []) };
  } catch (e) {
    console.error("[lumen] write failed:", (e as Error)?.message);
    return { ok: false, error: "Lumen could not be reached. Nothing was changed; try again in a moment." };
  }

  const { data: row, error } = await sb.from("lumen_films").insert({
    blueprint_id: blueprint.id, account_id: blueprint.account_id, proposal_id: proposal.id, revision: proposal.revision,
    status: "scripted", script, model: `${MODEL} · Lumen ${LUMEN_VERSION}`, created_by_email: byEmail,
  }).select("*").single();
  if (error || !row) return { ok: false, error: `Could not keep the script: ${error?.message ?? "unknown"}` };
  void account;
  return { ok: true, film: row as FilmRow };
}

/** The founder's edits to the words. Allowed until the film is cut; an
 *  edited scene loses its recording, so it is spoken again. */
export async function saveScript(sb: SupabaseClient, film: FilmRow, edits: { key: string; narration: string }[], title?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (film.status === "cutting") return { ok: false, error: "The film is being cut. Wait for it, then change the words and cut again." };
  if (film.status === "cut") return { ok: false, error: "This film is cut. Press Write again for a new one; the cut stays until the new film is cut." };
  const changed = new Set<string>();
  const scenes: LumenScene[] = film.script.scenes.map((s) => {
    const e = edits.find((x) => x.key === s.key);
    if (!e) return s;
    const narration = e.narration.trim().slice(0, MAX_NARRATION_CHARS);
    if (narration !== s.narration) changed.add(s.key);
    return { ...s, narration };
  });
  const narration = film.narration.filter((n) => !changed.has(n.key));
  const status: LumenStatus = narration.length && narration.length === scenes.filter((s) => s.narration.trim()).length ? "narrated" : "scripted";
  const { error } = await sb.from("lumen_films").update({
    script: { title: (title ?? film.script.title).trim().slice(0, 80) || film.script.title, scenes }, narration, status,
    film_path: null, poster_path: null, duration_s: null, error: null, updated_at: new Date().toISOString(),
  }).eq("id", film.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/* ───────────────────────────── 2. Record ──────────────────────────── */

/** TTS trims unfamiliar names; the brand's own fix (vapi-speech.ts) respells
 *  it for the voice only. The stored script keeps the real spelling. */
const spoken = (text: string) => text.replace(/Zyvorah/g, "Zivorah");

async function speak(text: string, voiceId: string, apiKey: string): Promise<Buffer> {
  const res = await fetch(`${ELEVEN}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({
      text: spoken(text),
      model_id: ELEVEN_MODEL,
      voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.1, use_speaker_boost: true, speed: 0.95 },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 200)}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 1000) throw new Error("ElevenLabs returned an empty recording");
  return bytes;
}

export const narrationPath = (slug: string, filmId: string, key: string) => `lumen/${slug}/${filmId}/${key.replace(/[^a-z0-9]+/gi, "-")}.mp3`;
export const filmPath = (slug: string, filmId: string) => `lumen/${slug}/${filmId}.mp4`;
export const posterPath = (slug: string, filmId: string) => `lumen/${slug}/${filmId}.jpg`;

/** Speak every scene that has words and no recording yet. Partial progress
 *  is kept scene by scene, so a failure half-way resumes, never restarts. */
export async function recordNarration(sb: SupabaseClient, film: FilmRow, slug: string): Promise<{ ok: true; recorded: number } | { ok: false; error: string }> {
  const voice = voiceReadiness();
  if (!voice.ready) return { ok: false, error: voice.why! };
  const ready = scriptReady(film.script);
  if (!ready.ok) return { ok: false, error: ready.reason };
  if (film.status === "cutting") return { ok: false, error: "The film is being cut." };
  const apiKey = process.env.ELEVENLABS_API_KEY!.trim();
  const voiceId = process.env.LUMEN_VOICE_ID!.trim();
  const have = new Map(film.narration.map((n) => [n.key, n]));
  const todo = film.script.scenes.filter((s) => s.narration.trim() && !have.has(s.key));
  if (!todo.length) {
    await sb.from("lumen_films").update({ status: "narrated", voice_id: voiceId, updated_at: new Date().toISOString() }).eq("id", film.id);
    return { ok: true, recorded: 0 };
  }
  await sb.from("lumen_films").update({ status: "narrating", voice_id: voiceId, error: null, updated_at: new Date().toISOString() }).eq("id", film.id);
  let count = 0;
  for (const s of todo) {
    try {
      const mp3 = await speak(s.narration, voiceId, apiKey);
      const path = narrationPath(slug, film.id, s.key);
      const up = await caUpload(path, mp3, { contentType: "audio/mpeg", upsert: true });
      if (up.error) throw new Error(`storing the recording: ${up.error.message}`);
      have.set(s.key, { key: s.key, path, chars: s.narration.length });
      count++;
      await sb.from("lumen_films").update({ narration: [...have.values()], updated_at: new Date().toISOString() }).eq("id", film.id);
    } catch (e) {
      const msg = `${s.heading}: ${(e as Error).message}`;
      await sb.from("lumen_films").update({ status: "scripted", error: msg, narration: [...have.values()], updated_at: new Date().toISOString() }).eq("id", film.id);
      return { ok: false, error: `Recording stopped at ${msg}. ${count} scene${count === 1 ? "" : "s"} kept; press Record again to continue.` };
    }
  }
  await sb.from("lumen_films").update({ status: "narrated", error: null, updated_at: new Date().toISOString() }).eq("id", film.id);
  return { ok: true, recorded: count };
}

/* ─────────────────────────────── 3. Cut ───────────────────────────── */

/** The picture for every wall of the proposal: the exported mockup first. */
async function wallPictures(sb: SupabaseClient, proposal: ProposalRow): Promise<Map<string, { url: string } | null>> {
  const [{ data: wallRows }, { data: prevRows }] = await Promise.all([
    sb.from("blueprint_walls").select("id, seq, photo_path").eq("blueprint_id", proposal.blueprint_id).neq("status", "dropped"),
    sb.from("prism_wall_previews").select("*").eq("proposal_id", proposal.id).eq("chosen", true),
  ]);
  const previews = new Map(((prevRows ?? []) as PreviewRow[]).map((p) => [p.wall_id, p]));
  const cands = proposal.narrative.candidates ?? {};
  const out = new Map<string, { url: string } | null>();
  for (const w of (wallRows ?? []) as { id: string; seq: number; photo_path: string | null }[]) {
    const pv = previews.get(w.id);
    const cand = pv ? (cands[String(w.seq)] ?? []).find((c) => c.handle === pv.product_handle) : undefined;
    const pic = pictureFor({
      renderUrl: pv?.render_path ? await signArt(sb, pv.render_path, DAY) : null,
      photoUrl: w.photo_path ? await signArt(sb, w.photo_path, DAY) : null,
      artUrl: cand?.flat ? mediaRendition(toMediaUrl(cand.flat), 1920) : null,
    });
    out.set(w.id, pic ? { url: pic.url } : null);
  }
  return out;
}

export async function cutFilm(sb: SupabaseClient, film: FilmRow, proposal: ProposalRow, blueprint: BlueprintRow, account: { name: string; slug: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (film.status === "cutting") return { ok: false, error: "The film is already being cut." };
  const pictures = await wallPictures(sb, proposal);
  const ready = cutReady(film.script, film.narration, pictures);
  if (!ready.ok) return { ok: false, error: ready.reason };
  const audio = new Map(film.narration.map((n) => [n.key, n.path]));
  const scenes = [];
  for (const s of film.script.scenes) {
    const a = audio.get(s.key);
    scenes.push({
      key: s.key,
      imageUrl: s.wallId ? pictures.get(s.wallId)!.url : null,
      audioUrl: a ? await signArt(sb, a, DAY) : null,
      heading: s.heading,
      caption: s.caption,
    });
  }
  const spec = {
    campus: blueprint.city ? `${blueprint.name}, ${blueprint.city}` : blueprint.name,
    direction: proposal.narrative.direction,
    signoff: "Roheena Nagpal · Founder, Zyvorah",
  };
  await sb.from("lumen_films").update({ status: "cutting", error: null, updated_at: new Date().toISOString() }).eq("id", film.id);
  try {
    const r = await lumenCutRemote({ filmId: film.id, filmPath: filmPath(account.slug, film.id), posterPath: posterPath(account.slug, film.id), spec, scenes });
    if (!r.accepted) throw new Error("the container did not accept the job");
    return { ok: true };
  } catch (e) {
    const msg = `Could not start the cut: ${(e as Error).message}`;
    await sb.from("lumen_films").update({ status: "narrated", error: msg, updated_at: new Date().toISOString() }).eq("id", film.id);
    return { ok: false, error: msg };
  }
}

/** A cut that never came back (the container restarted under it) is failed
 *  after this long, so the desk never shows "cutting" forever. */
const CUT_STALE_MS = 20 * 60 * 1000;

/* ───────────────────────────── Reading ───────────────────────────── */

export async function latestFilm(sb: SupabaseClient, proposalId: string): Promise<FilmRow | null> {
  const { data } = await sb.from("lumen_films").select("*").eq("proposal_id", proposalId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const film = data as FilmRow | null;
  if (film && film.status === "cutting" && Date.now() - new Date(film.updated_at).getTime() > CUT_STALE_MS) {
    const error = "The cut did not come back from the media container in twenty minutes. Press Cut again.";
    await sb.from("lumen_films").update({ status: "failed", error, updated_at: new Date().toISOString() }).eq("id", film.id);
    return { ...film, status: "failed", error };
  }
  return film;
}

export async function filmView(sb: SupabaseClient, film: FilmRow): Promise<LumenView> {
  return {
    id: film.id, revision: film.revision, status: film.status, headline: filmHeadline(film.script, film.revision), script: film.script,
    recorded: film.narration.map((n) => n.key),
    filmUrl: film.film_path && film.status === "cut" ? await signArt(sb, film.film_path, DAY) : null,
    posterUrl: film.poster_path && film.status === "cut" ? await signArt(sb, film.poster_path, DAY) : null,
    durationS: film.duration_s == null ? null : Number(film.duration_s),
    error: film.error, presentedAt: film.presented_at, createdAt: film.created_at, updatedAt: film.updated_at,
    voice: voiceReadiness(),
  };
}

export async function presentFilm(sb: SupabaseClient, film: FilmRow, proposal: ProposalRow): Promise<{ ok: true } | { ok: false; error: string }> {
  if (film.status !== "cut") return { ok: false, error: "Cut the film first." };
  if (proposal.status !== "presented") return { ok: false, error: "Present the proposal to the college first; the film goes with it." };
  const { error } = await sb.from("lumen_films").update({ presented_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", film.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** What the college may see: the latest presented cut of a presented proposal. */
export async function presentedFilm(sb: SupabaseClient, proposalId: string): Promise<{ url: string; posterUrl: string | null; durationS: number | null; title: string } | null> {
  const { data } = await sb.from("lumen_films").select("*").eq("proposal_id", proposalId).eq("status", "cut").not("presented_at", "is", null)
    .order("presented_at", { ascending: false }).limit(1).maybeSingle();
  const film = data as FilmRow | null;
  if (!film?.film_path) return null;
  const url = await signArt(sb, film.film_path, DAY);
  if (!url) return null;
  return { url, posterUrl: film.poster_path ? await signArt(sb, film.poster_path, DAY) : null, durationS: film.duration_s == null ? null : Number(film.duration_s), title: film.script.title };
}
