import { NextResponse } from "next/server";
import { signArt } from "@/lib/corporate-files";
import { caDownload, caRemove, caSignedUploadUrl } from "@/lib/corporate-art-store";
import { ensureAreaBatch, guardCapture } from "@/lib/portfolio-capture";
import { audioExtension, transcribeAudio } from "@/lib/transcribe";
import { areaLabel } from "@/lib/portfolio";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** A per-wall note is seconds long. Generous for a rambling one on a poor codec,
 *  mean enough that the bucket cannot become an audio host. */
const MAX_BYTES = 12 * 1024 * 1024;
const UPLOAD_TTL_S = 900;
const PLAYBACK_TTL_S = 900;

// Saying what a wall is for, out loud.
//
// Same two-step upload as the photo — the bytes go straight to storage and never
// through a function — with one addition, and the addition is the whole design:
//
//   THE RECORDING IS THE RECORD. THE TRANSCRIPT IS A VIEW OF IT.
//
// So commit stores the audio FIRST and only then attempts a transcription. If
// the transcription fails — no key, no credit, a timeout, an inaudible room —
// the commit still SUCCEEDS, the audio is kept, and voice_error says why there
// is no text yet. It can be re-run later against a file we still hold.
//
// The inverse (transcribe, store text, discard audio) would mean a bad minute
// on someone's phone permanently destroys what they said in a building we are
// never going to visit. That is the failure this whole feature exists to
// prevent, so it must not be reintroduced by the transcription step.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as {
    action?: string; areaId?: string; seq?: number;
    bytes?: number; contentType?: string; seconds?: number;
  };
  const action = String(b.action ?? "");
  if (action !== "sign" && action !== "commit" && action !== "delete") {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const g = await guardCapture(String(b.areaId ?? ""));
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { sb, area, store } = g.ctx;

  const seq = Math.round(Number(b.seq));
  if (!Number.isFinite(seq) || seq < 1) {
    return NextResponse.json({ ok: false, error: "Which wall is this about?" }, { status: 400 });
  }

  const batchId = await ensureAreaBatch(g.ctx);
  if (!batchId) {
    return NextResponse.json({ ok: false, error: "Could not open a survey for this space." }, { status: 500 });
  }

  const { data: wall } = await sb.from("corporate_site_batch_walls")
    .select("id, voice_path").eq("batch_id", batchId).eq("seq", seq).maybeSingle();
  if (!wall) {
    return NextResponse.json({ ok: false, error: "Save the wall before recording a note." }, { status: 404 });
  }

  // ── delete ────────────────────────────────────────────────────────────────
  // Clears the transcript with the audio: a transcript outliving its recording
  // is an unverifiable quote attributed to somebody.
  if (action === "delete") {
    if (wall.voice_path) await caRemove([wall.voice_path as string]);
    await sb.from("corporate_site_batch_walls").update({
      voice_path: null, voice_seconds: null,
      voice_transcript: null, voice_error: null, voice_transcribed_at: null,
    }).eq("batch_id", batchId).eq("seq", seq);
    return NextResponse.json({ ok: true, removed: true });
  }

  // The container decides the extension, and the allow-list decides whether we
  // accept the container at all — so the caller's content type never becomes an
  // arbitrary path segment. Chrome and Android record webm/opus; iOS Safari
  // records mp4/aac.
  const ext = audioExtension(String(b.contentType ?? ""));
  if (!ext) {
    return NextResponse.json({
      ok: false, error: "That recording format isn't one we can accept.",
    }, { status: 400 });
  }
  const path = `site/${batchId}/w${String(seq).padStart(2, "0")}-voice.${ext}`;

  if (action === "sign") {
    if ((Number(b.bytes) || 0) > MAX_BYTES) {
      return NextResponse.json({
        ok: false, error: "That recording is too long. Keep it under a couple of minutes.",
      }, { status: 413 });
    }
    // A previous note in a different container would otherwise be orphaned
    // under its own extension when this one lands.
    const previous = wall.voice_path as string | null;
    if (previous && previous !== path) await caRemove([previous]);

    let signed;
    try {
      signed = caSignedUploadUrl(path, { upsert: true, ttlSeconds: UPLOAD_TTL_S });
    } catch (e) {
      console.error("[walls/voice] sign failed:", path, (e as Error)?.message);
      return NextResponse.json({ ok: false, error: "Could not prepare the upload." }, { status: 500 });
    }
    return NextResponse.json({
      ok: true, path, signedUrl: signed.signedUrl, token: signed.token,
      expiresInSeconds: UPLOAD_TTL_S,
    });
  }

  // ── commit ────────────────────────────────────────────────────────────────
  const { data: file, error: dlErr } = await caDownload(path);
  if (dlErr || !file) {
    return NextResponse.json({ ok: false, error: "That recording didn't arrive. Try again." }, { status: 400 });
  }
  const raw = await file.arrayBuffer();
  if (raw.byteLength === 0 || raw.byteLength > MAX_BYTES) {
    await caRemove([path]);
    return NextResponse.json({
      ok: false,
      error: raw.byteLength ? "That recording is too long." : "That recording was empty.",
    }, { status: 413 });
  }

  const seconds = Number.isFinite(Number(b.seconds))
    ? Math.max(0, Math.min(3600, Math.round(Number(b.seconds)))) : null;

  // Recorded first. Everything after this point may fail without losing it.
  const { error: saveErr } = await sb.from("corporate_site_batch_walls").update({
    voice_path: path, voice_seconds: seconds,
    voice_transcript: null, voice_error: null, voice_transcribed_at: null,
  }).eq("batch_id", batchId).eq("seq", seq);
  if (saveErr) {
    console.error("[walls/voice] attach failed:", batchId, seq, saveErr.message);
    return NextResponse.json({ ok: false, error: "Could not save that recording." }, { status: 500 });
  }

  // Naming the building and the space steers spelling toward the vocabulary of
  // the room — "lift lobby" over "left lobby", and the tower's own name intact.
  const result = await transcribeAudio(raw, `w${seq}.${ext}`, String(b.contentType), {
    prompt: `A note about a wall in ${store.name}, ${areaLabel(area)}. Interior design brief for wallpaper.`,
  });

  const patch = result.ok
    ? { voice_transcript: result.text, voice_error: null, voice_transcribed_at: new Date().toISOString() }
    : { voice_transcript: null, voice_error: result.error.slice(0, 300), voice_transcribed_at: null };
  await sb.from("corporate_site_batch_walls").update(patch)
    .eq("batch_id", batchId).eq("seq", seq);

  // ok:true either way — the recording saved, which is what was asked for.
  // `transcript` being null with a `note` is the honest report of a derived step
  // that did not run, not a failure of the thing the person actually did.
  return NextResponse.json({
    ok: true, seq, seconds,
    transcript: result.ok ? result.text : null,
    note: result.ok ? null : result.error,
    voiceUrl: await signArt(sb, path, PLAYBACK_TTL_S),
  });
}
