// Captions and a poster for every Library film, made from the film itself.
//
// Most phones play video muted, and the voiceover is the best part of these
// films — so the words have to reach a visitor who never turns the sound on.
// This module listens to each filed film and writes its narration as WebVTT
// beside it in the private Library bucket (`captions_key`). From there:
//   - the Library card shows the captions for the listening review, and
//     Roheena can correct them (saveCaptions) before anything is public;
//   - the site publisher (site-film-publish.ts) copies them out with the film;
//   - the YouTube long-form uploader already uploads `captions_key` when set.
//
// The media container does the ffmpeg work (poster frame + a 16 kHz mono MP3
// of the narration, `/film-derivatives`); Cloudflare Workers AI's Whisper
// does the listening (`AI` binding, wrangler.jsonc). OpenAI is not involved.
//
// BEST-EFFORT BY CONTRACT. A transcript is a derived view of the film. A film
// whose captions cannot be made right now publishes exactly as it would have
// without them; the reason is written on the row (`captions_error`), shown on
// the card, and retried by the next cron tick up to MAX_ATTEMPTS.
//
// A poster is derived ONLY when the film was filed without a cover. An
// uploaded cover always wins.

import { createHash } from "node:crypto";
import { privateBucket } from "@/lib/r2-media";
import { filmDerivativesRemote } from "@/lib/media-client";
import { serviceClient } from "./db";

const LIBRARY = "marketing_asset_library";
export const MAX_CAPTION_ATTEMPTS = 5;

export type CaptionRow = {
  id: string;
  title: string;
  media_key: string | null;
  cover_key: string | null;
  language: string | null;
  captions_key: string | null;
  captions_sha256: string | null;
  captions_attempts: number | null;
  site_state?: string | null;
};

/** Which films the caption pass serves first: films shoppers can already see,
 *  then the newest. Pure; pinned by the test. */
export function captionOrder<T extends Pick<CaptionRow, "site_state">>(rows: T[]): T[] {
  return rows.map((r, i) => ({ r, i })).sort((a, b) => Number(b.r.site_state === "live") - Number(a.r.site_state === "live") || a.i - b.i).map((x) => x.r);
}

type Segment = { start: number; end: number; text: string };

const stamp = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(3).padStart(6, "0");
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${sec}`;
};

/** WebVTT from timed segments. Pure; pinned by film-captions.test.ts. */
export function segmentsToVtt(segments: Segment[]): string {
  const cues = segments
    .filter((s) => s.text.trim() && s.end > s.start)
    .map((s) => `${stamp(s.start)} --> ${stamp(s.end)}\n${s.text.trim().replace(/\s*\n+\s*/g, " ")}`);
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

/** Whisper's language code for what the film is spoken in, or null when
 *  there is nothing to caption (no voice) or nobody has said yet. */
export function whisperLanguage(language: string | null): "en" | "hi" | "mr" | null {
  return language === "english" ? "en" : language === "hindi" ? "hi" : language === "marathi" ? "mr" : null;
}

/** What a film still needs. Pure; pinned by the test. */
export function captionNeeds(row: CaptionRow): { captions: boolean; poster: boolean } {
  if (!row.media_key || (row.captions_attempts ?? 0) >= MAX_CAPTION_ATTEMPTS) return { captions: false, poster: false };
  return { captions: whisperLanguage(row.language) !== null && !row.captions_key, poster: !row.cover_key };
}

/** A person's captions, checked before they are stored: every cue needs a
 *  timestamp line. Returns the normalised file, or the reason it was refused. */
export function normaliseVtt(input: string): { vtt: string } | { error: string } {
  const body = input.replace(/\r\n/g, "\n").trim().replace(/^WEBVTT[^\n]*\n*/, "");
  if (body.length < 8) return { error: "Paste the captions, as WebVTT (timestamps and lines)." };
  if (!/\d\d:\d\d(:\d\d)?\.\d{3} --> \d\d:\d\d(:\d\d)?\.\d{3}/.test(body)) {
    return { error: "Captions need timestamps, e.g. 00:00:01.000 --> 00:00:04.000 on the line above each caption." };
  }
  return { vtt: `WEBVTT\n\n${body}\n` };
}

type Ai = { run(model: string, input: Record<string, unknown>): Promise<unknown> };

async function aiBinding(): Promise<Ai | null> {
  try {
    const mod = (await import(/* @vite-ignore */ "cloudflare:workers")) as { env: { AI?: Ai } };
    return mod.env?.AI ?? null;
  } catch {
    return null;
  }
}

async function transcribe(audio: Uint8Array, language: "en" | "hi" | "mr"): Promise<string> {
  const ai = await aiBinding();
  if (!ai) throw new Error("the Workers AI binding is not available in this runtime");
  const out = (await ai.run("@cf/openai/whisper-large-v3-turbo", {
    audio: Buffer.from(audio).toString("base64"),
    task: "transcribe",
    language,
    vad_filter: true,
    // Music under the narration invites Whisper to invent words in the gaps.
    condition_on_previous_text: false,
  })) as { vtt?: string; segments?: Segment[] };
  if (Array.isArray(out.segments) && out.segments.length) return segmentsToVtt(out.segments);
  if (typeof out.vtt === "string" && out.vtt.includes("-->")) {
    const n = normaliseVtt(out.vtt);
    if ("vtt" in n) return n.vtt;
  }
  throw new Error("Whisper heard no narration in the film");
}

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Make what the row lacks and write it to the row. Returns the patch it
 *  wrote (including any failure reason), or null when nothing was needed. */
export async function prepareFilm(row: CaptionRow): Promise<Record<string, unknown> | null> {
  const need = captionNeeds(row);
  if (!need.captions && !need.poster) return null;
  const patch: Record<string, unknown> = { captions_attempts: (row.captions_attempts ?? 0) + 1, captions_error: null };
  try {
    const priv = await privateBucket();
    if (!priv) throw new Error("the private Library store is not bound in this runtime");
    const film = await priv.get(row.media_key!);
    if (!film) throw new Error("the film file is missing from the Library store");
    // Streamed straight from the store to the container: the Worker never
    // holds the film in memory.
    const d = await filmDerivativesRemote(film.body);
    if (need.poster) {
      const coverKey = `marketing-library/${row.id}/cover.jpg`;
      await priv.put(coverKey, d.poster, { httpMetadata: { contentType: "image/jpeg", cacheControl: "private, no-store" } });
      patch.cover_key = coverKey;
    }
    const lang = whisperLanguage(row.language);
    if (need.captions && lang) {
      if (!d.audio) throw new Error("the film has no sound track to caption");
      const vtt = new TextEncoder().encode(await transcribe(d.audio, lang));
      const captionsKey = `marketing-library/${row.id}/captions.vtt`;
      await priv.put(captionsKey, vtt, { httpMetadata: { contentType: "text/vtt; charset=utf-8", cacheControl: "private, no-store" } });
      Object.assign(patch, { captions_key: captionsKey, captions_sha256: digest(vtt), captions_source: "auto" });
    }
  } catch (e) {
    patch.captions_error = (e instanceof Error ? e.message : String(e)).slice(0, 400);
  }
  const { error } = await serviceClient().from(LIBRARY).update({ ...patch, updated_at: new Date().toISOString() }).eq("id", row.id);
  if (error) throw new Error(`Library write for ${row.id}: ${error.message}`);
  return patch;
}

/** Captions a person corrected replace the automatic ones. The site copy
 *  follows on the next publisher pass, because its hash no longer matches. */
export async function saveCaptions(row: Pick<CaptionRow, "id" | "captions_key">, vtt: string): Promise<Record<string, unknown>> {
  const priv = await privateBucket();
  if (!priv) throw new Error("the private Library store is not bound in this runtime");
  const bytes = new TextEncoder().encode(vtt);
  const captionsKey = row.captions_key ?? `marketing-library/${row.id}/captions.vtt`;
  await priv.put(captionsKey, bytes, { httpMetadata: { contentType: "text/vtt; charset=utf-8", cacheControl: "private, no-store" } });
  return { captions_key: captionsKey, captions_sha256: digest(bytes), captions_source: "edited", captions_error: null };
}

export async function readCaptions(captionsKey: string | null): Promise<string | null> {
  if (!captionsKey) return null;
  const obj = await (await privateBucket())?.get(captionsKey);
  return obj ? new TextDecoder().decode(await obj.arrayBuffer()) : null;
}

/** One pass over films that still need captions or a poster, newest first,
 *  inside a time budget. Never throws for a single film. */
export async function prepareFilms(opts: { budgetMs: number; max: number }) {
  const started = Date.now();
  const { data, error } = await serviceClient()
    .from(LIBRARY)
    .select("id,title,media_key,cover_key,language,captions_key,captions_sha256,captions_attempts,site_state")
    .not("media_key", "is", null)
    .lt("captions_attempts", MAX_CAPTION_ATTEMPTS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Library read: ${error.message}`);
  const done: { title: string; ok: boolean; reason?: string }[] = [];
  for (const row of captionOrder((data ?? []) as CaptionRow[])) {
    if (done.length >= opts.max || Date.now() - started > opts.budgetMs) break;
    const patch = await prepareFilm(row);
    if (patch) done.push({ title: row.title, ok: !patch.captions_error, reason: (patch.captions_error as string) ?? undefined });
  }
  return done;
}
