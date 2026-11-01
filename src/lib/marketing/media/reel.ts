// Reel compositor — programmatic camera moves over owned scene renders, rendered
// to a 1080×1920 MP4 with ffmpeg. This is how pattern/wallpaper brands make
// "video" without filming: a slow push-in (Ken Burns), a cross-dissolve between
// rooms, a lower-third that fades in. It reads as premium motion, not a
// slideshow, and nothing in frame reveals process.
//
// ffmpeg is required at runtime (verified present in dev; on Vercel it ships via
// a layer or the job runs on a machine that has it). If ffmpeg is missing,
// renderReel throws and the pipeline falls back to a still/carousel for the slot.

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { fetchImage } from "./fetch";
import { CANVAS, IG_SAFE } from "./types";
import { bottomScrimSvg, lowerThirdSvg, monogramSvg, PALETTE } from "./brand";
import { socialLayout, reelCoverLayout } from "./social-layout";
import { measurePortrait, measureReelCover } from "./layout-measure";
import type { LayoutFrame } from "../layout-check";

export type ReelSpec = {
  title: string;
  sub?: string;
  /** Small-caps kicker above the title, e.g. "ZYVORAH · TAASH". */
  kicker?: string;
  secondsPerScene?: number; // default 2.5
  /** The house frame (Z. upper left, the name lower left on the portrait
   *  grid) that the layout check measures. Required for Instagram review. */
  measured?: boolean;
};

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

/** A reel encode is tens of seconds; one that is still running after this
 *  is wedged, and a wedged ffmpeg held the whole daily compose open for over
 *  an hour on 12 October 2026 (two runs, the same reel, nothing after it
 *  composed). Killed and reported, so the caller records the failure and the
 *  day moves on to another design. */
const FFMPEG_LIMIT_MS = 180_000;

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error(`ffmpeg did not finish within ${FFMPEG_LIMIT_MS / 1000}s and was killed: ${err.slice(-400)}`));
    }, FFMPEG_LIMIT_MS);
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-800)}`));
    });
  });
}

/** Prepare one 1080×1920 still: cover-fit scene, and burn the lower-third onto
 *  the FIRST frame's still only (so text sits on the opening scene). */
async function prepStill(url: string): Promise<Buffer> {
  const { w, h } = CANVAS.reel;
  const src = await fetchImage(url, 1440);
  // Zoompan works from a larger source; upsize a touch so the push-in never
  // reveals an edge. "south" keeps the crop off the FLOOR — a room reads from
  // the floor up (AGENTS.md rule 8), and "attention" used to wander onto a
  // window or a light fitting.
  const base = await sharp(src).resize(Math.round(w * 1.15), Math.round(h * 1.15), { fit: "cover", position: "south" }).toBuffer();
  return sharp(base).resize(w, h, { fit: "cover", position: "south" }).jpeg({ quality: 90 }).toBuffer();
}

/**
 * The reel's words, as a transparent 1080×1920 plate.
 *
 * Burned onto the first STILL, the type went through the push-in with the
 * picture: zoompan crops as it zooms, so the lower third was progressively
 * eaten while the reel played — the founder saw a title reading "aash, in
 * three oves" (26 Sep 2026). Type belongs ON TOP of the finished motion, not
 * inside the frame being moved, so this plate is overlaid after the zoom and
 * the cross-dissolves and never moves a pixel.
 */
async function textPlate(spec: ReelSpec): Promise<Buffer> {
  const { w, h } = CANVAS.reel;
  if (spec.measured) {
    // The house hierarchy on the portrait grid, drawn from the same
    // primitives measurePortrait audits (social-layout.ts).
    const l = socialLayout(w, h);
    return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([
        { input: Buffer.from(bottomScrimSvg(w, h)) },
        { input: Buffer.from(monogramSvg({ height: l.logoHeight })), top: l.logoTop, left: l.left },
        { input: Buffer.from(lowerThirdSvg(w, h, spec.title, spec.sub, spec.kicker)), top: 0, left: 0 },
      ])
      .png()
      .toBuffer();
  }
  // A Reel's foot belongs to Instagram — username, caption, the audio strip —
  // and its right edge to the like/comment/share rail. Draw the type above
  // the footer. Instagram supplies the account name, so no extra mark sits
  // at the top under its chrome.
  const textH = h - IG_SAFE.reel.bottom;
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: Buffer.from(bottomScrimSvg(w, h)) },
      { input: Buffer.from(lowerThirdSvg(w, textH, spec.title, spec.sub, spec.kicker)), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
}

/**
 * Render a Reel from up to 5 scene renders. Each scene gets a slow push-in;
 * scenes cross-dissolve into each other. Returns the MP4 buffer.
 */
/**
 * Render on the worker when one is configured.
 *
 * ffmpeg is absent from the Vercel serverless runtime, so on the deployed site
 * this is the path that actually runs; the local ffmpeg path below is what dev
 * machines and the worker container itself use. If the worker is unset or
 * fails, this throws and runSlot downgrades the slot to a still - the same
 * fallback that has been carrying every reel slot until now.
 */
async function renderReelOnWorker(
  base: string,
  sceneUrls: string[],
  spec: ReelSpec,
): Promise<Buffer> {
  const token = process.env.REEL_WORKER_TOKEN;
  if (!token) throw new Error("REEL_WORKER_URL is set but REEL_WORKER_TOKEN is not");

  // A cold container plus a multi-scene encode is tens of seconds. Bounded so a
  // hung worker cannot hold the whole marketing cron open to its 300s ceiling.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    // The reel worker is the MEDIA container now — on workerd this must go
    // through the service binding (public worker-to-worker fetch is error
    // 1042); everywhere else mediaFetch degrades to plain fetch.
    const { mediaFetch } = await import("@/lib/media-client");
    const res = await mediaFetch(base.replace(/\/$/, "") + "/render", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify({
        sceneUrls: sceneUrls.slice(0, 5),
        title: spec.title,
        sub: spec.sub,
        secondsPerScene: spec.secondsPerScene,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error("reel worker " + res.status + ": " + detail.slice(0, 300));
    }
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

export async function renderReel(sceneUrls: string[], spec: ReelSpec): Promise<Buffer> {
  const worker = process.env.REEL_WORKER_URL;
  if (worker) return renderReelOnWorker(worker, sceneUrls, spec);

  const { w, h } = CANVAS.reel;
  const per = spec.secondsPerScene ?? 2.5;
  const fps = 30;
  const scenes = sceneUrls.slice(0, 5);
  if (scenes.length === 0) throw new Error("renderReel: no scenes");

  const dir = await mkdtemp(join(tmpdir(), "zyv-reel-"));
  try {
    // Write prepped stills (text on the first).
    const stills: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const buf = await prepStill(scenes[i]);
      const p = join(dir, `s${i}.jpg`);
      await writeFile(p, buf);
      stills.push(p);
    }

    const framesPerScene = Math.round(per * fps);
    // Per-scene: a zoompan push-in from 1.0 → 1.08.
    //
    // d=1 is load-bearing. zoompan's `d` is output frames PER INPUT FRAME, and
    // `-loop 1 -t <per>` already feeds it per*fps frames. Setting d=framesPerScene
    // therefore multiplied: 75 input frames × 75 = 5,625 frames, a 2m41s reel from
    // three stills instead of 7.5s. That bug shipped and was never seen, because
    // ffmpeg is absent from the Vercel runtime so this code had never actually
    // rendered in production — every reel slot fell back to a still first.
    //
    // With d=1 each input frame yields exactly one output frame, so the scene is
    // per*fps frames long, and the zoom is driven by `on` (the output frame index)
    // to ramp 1.0 → 1.08 across exactly that span rather than accumulating.
    const zoomStep = (0.08 / framesPerScene).toFixed(6);
    const inputs: string[] = [];
    const filters: string[] = [];
    stills.forEach((p, i) => {
      inputs.push("-loop", "1", "-t", String(per), "-i", p);
      filters.push(
        `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},` +
          // x/y CENTRE the zoom. zoompan defaults to x=0,y=0 — anchored at the
          // top-left — so the push-in ate the right and bottom edges as it
          // ran, taking the lower third with it and cropping the floor out of
          // every room. Centred, the composition holds.
          `zoompan=z='min(1+${zoomStep}*on,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${w}x${h}:fps=${fps},` +
          `setpts=PTS-STARTPTS,format=yuv420p[v${i}]`,
      );
    });

    // Chain cross-dissolves (0.6s) between consecutive scenes.
    let lastLabel = "v0";
    let offset = per - 0.6;
    for (let i = 1; i < stills.length; i++) {
      const out = i === stills.length - 1 ? "vout" : `x${i}`;
      filters.push(
        `[${lastLabel}][v${i}]xfade=transition=fade:duration=0.6:offset=${offset.toFixed(2)}[${out}]`,
      );
      lastLabel = out;
      offset += per - 0.6;
    }
    // Single scene: no xfade, just map v0.
    let mapLabel = stills.length === 1 ? "v0" : "vout";

    // The words go on LAST, over the finished motion, so the push-in and the
    // dissolves cannot crop or fade them.
    const plate = join(dir, "text.png");
    await writeFile(plate, await textPlate(spec));
    inputs.push("-loop", "1", "-t", String(per * stills.length), "-i", plate);
    filters.push(`[${mapLabel}][${stills.length}:v]overlay=0:0:format=auto[vtxt]`);
    mapLabel = "vtxt";

    const args = [
      "-y",
      ...inputs,
      "-filter_complex",
      filters.join(";"),
      "-map",
      `[${mapLabel}]`,
      "-r",
      String(fps),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-preset",
      "medium",
      // Cap bitrate so an ~11s Reel stays a few MB, not 40+ — well within
      // Instagram's recommendations and fast to upload.
      "-crf",
      "23",
      "-maxrate",
      "6M",
      "-bufsize",
      "12M",
      join(dir, "out.mp4"),
    ];
    await run(args);
    return await readFile(join(dir, "out.mp4"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export const REEL_BRAND_BG = PALETTE.cloud;

/**
 * How much of a video frame is actually PICTURE, as opposed to a flat page
 * ground. On 25 September 2026 a delivered reel ("Taash, in three moves")
 * opened on its full-bleed poster and then played as a slideshow of 4:5
 * editorial cards sat inside the 9:16 frame — most of every frame was beige
 * margin, and the cross-dissolves melted one card's type into the next.
 * A reel plays full-screen; a page design belongs in the feed, not here.
 *
 * The measure: the middle frame, downscaled, against the median of its border
 * pixels. A full-bleed room render's border IS picture, so nearly every pixel
 * deviates from it (coverage ≈ 0.9+); a card-on-a-ground frame deviates only
 * where the card sits (≈ 0.4–0.55). The gate in the pipeline refuses below
 * 0.55 — the same "keep ≥55% of the picture" floor the homepage crop rules
 * already enforce (src/lib/image-orientation.ts).
 */
export type VideoProbe = { coverage: number; width: number; height: number };

const FFPROBE = process.env.FFPROBE_PATH || FFMPEG.replace(/ffmpeg([^/\\]*)$/, "ffprobe$1");

function runProbe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFPROBE, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(`ffprobe exited ${code}: ${err.slice(-400)}`)),
    );
  });
}

/** One frame's content fraction: pixels that deviate from the median of the
 *  frame's own border. A full-bleed picture's border IS picture, so nearly
 *  everything deviates; a card on a page ground deviates only where the card
 *  sits. */
async function frameCoverage(file: string): Promise<number> {
  const { data, info } = await sharp(file)
    .resize(72, 128, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: pw, height: ph } = info;
  const border: number[] = [];
  for (let x = 0; x < pw; x++) border.push(data[x], data[(ph - 1) * pw + x]);
  for (let y = 0; y < ph; y++) border.push(data[y * pw], data[y * pw + pw - 1]);
  border.sort((a, b) => a - b);
  const bg = border[Math.floor(border.length / 2)];
  let content = 0;
  for (let i = 0; i < data.length; i++) if (Math.abs(data[i] - bg) > 24) content++;
  return content / data.length;
}

export async function probeVideoCoverage(url: string): Promise<VideoProbe> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`probeVideoCoverage: fetch ${res.status}`);
  const dir = await mkdtemp(join(tmpdir(), "zyv-probe-"));
  try {
    const vid = join(dir, "v.mp4");
    await writeFile(vid, Buffer.from(await res.arrayBuffer()));
    // Five frames spread across the clip, MEDIAN coverage. One frame is not
    // enough: the first probe of the Taash story video happened to land on a
    // cross-dissolve — two pages melted together read as "busy", and a page
    // slideshow passed as full-bleed. Pages hold far longer than dissolves,
    // so the median sees the page; and a single dark opening frame cannot
    // fail a genuinely full-bleed reel either.
    const durOut = await runProbe(["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", vid]);
    const dur = Math.max(0.2, Number(durOut) || 0.2);
    const coverages: number[] = [];
    for (const frac of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const frame = join(dir, `f${Math.round(frac * 100)}.jpg`);
      await run(["-y", "-ss", (dur * frac).toFixed(2), "-i", vid, "-vframes", "1", frame]);
      coverages.push(await frameCoverage(frame));
    }
    coverages.sort((a, b) => a - b);
    const meta = await runProbe([
      "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", vid,
    ]);
    const [w, h] = meta.split(",").map(Number);
    return {
      coverage: coverages[Math.floor(coverages.length / 2)],
      width: w || 0,
      height: h || 0,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// What a finished film needs before it can stand on zyvorah.com: a poster
// frame, and its narration as a small mono MP3 for captioning. Runs in the
// media container (ffmpeg lives there); the site Worker calls it through
// media-client.filmDerivativesRemote with the film's own bytes, so a film in
// the PRIVATE library never needs a public URL to be prepared.

export type FilmDerivatives = {
  poster: Buffer;
  /** Null when the film has no audio stream at all. */
  audio: Buffer | null;
  width: number;
  height: number;
  durationS: number;
};

export async function filmDerivatives(film: Buffer): Promise<FilmDerivatives> {
  const dir = await mkdtemp(join(tmpdir(), "zyv-film-"));
  try {
    const vid = join(dir, "film.mp4");
    await writeFile(vid, film);
    const durOut = await runProbe(["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", vid]);
    const durationS = Math.max(0.2, Number(durOut) || 0.2);
    const meta = await runProbe([
      "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", vid,
    ]);
    const [w, h] = meta.split(",").map(Number);
    // The poster is taken a little way in — past a fade-up from black, before
    // the story has moved on from its opening room — and never upscaled.
    const posterPath = join(dir, "poster.jpg");
    await run(["-y", "-ss", Math.min(2.5, durationS * 0.12).toFixed(2), "-i", vid, "-vframes", "1", "-q:v", "3", posterPath]);
    const poster = await sharp(await readFile(posterPath))
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 84 })
      .toBuffer();
    const hasAudio = (await runProbe(["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", vid])).trim().length > 0;
    let audio: Buffer | null = null;
    if (hasAudio) {
      // 16 kHz mono at 32 kbps: what a speech model listens at, and ~700 KB
      // for a three-minute film, so the transcript request stays small.
      const audioPath = join(dir, "narration.mp3");
      await run(["-y", "-i", vid, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", "-f", "mp3", audioPath]);
      audio = await readFile(audioPath);
    }
    return { poster, audio, width: w || 0, height: h || 0, durationS };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}


/** The reel's profile cover, 1080×1920: the opening room, with the feed
 *  frame drawn inside the centred 4:5 window the grid shows (reelCoverLayout). */
async function reelCover(sceneUrl: string, spec: ReelSpec): Promise<Buffer> {
  const { w, h } = CANVAS.reel;
  const l = reelCoverLayout();
  const src = await fetchImage(sceneUrl, 1440);
  const base = await sharp(src).resize(w, h, { fit: "cover", position: "south" }).toBuffer();
  return sharp(base)
    .composite([
      { input: Buffer.from(bottomScrimSvg(w, l.cropHeight)), top: l.cropTop, left: 0 },
      { input: Buffer.from(monogramSvg({ height: l.logoHeight })), top: l.logoTop, left: l.left },
      { input: Buffer.from(lowerThirdSvg(w, l.cropHeight, spec.title, spec.sub, spec.kicker)), top: l.cropTop, left: 0 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

export type MeasuredReel = { video: Buffer; frame: LayoutFrame; cover: Buffer; coverFrame: LayoutFrame };

/** A reel and its cover in the house frame, each with the measurement the
 *  layout check reads. Measured BEFORE rendering: a title the frame cannot
 *  hold fails here, not after a minute of encoding. Runs where sharp and
 *  ffmpeg live (the media container). */
/** The measured frame's foot is its sub line: without one the block ends
 *  higher than the house grid and the layout check refuses it (9 Oct 2026:
 *  every daily reel failed "Bottom in place" because the cadence has no hook
 *  or collection to say). An empty line reads "Mural wallpaper". */
export const measuredSub = (sub: string | undefined): string => sub?.trim() || "Mural wallpaper";

export async function renderMeasuredReel(sceneUrls: string[], given: ReelSpec): Promise<MeasuredReel> {
  const spec = { ...given, sub: measuredSub(given.sub) };
  const frame = await measurePortrait(spec.title, spec.sub, spec.kicker);
  const coverFrame = await measureReelCover(spec.title, spec.sub, spec.kicker);
  const video = await renderReel(sceneUrls, { ...spec, measured: true });
  const cover = await reelCover(sceneUrls[0], spec);
  return { video, frame, cover, coverFrame };
}

/** A daily-cadence Story in the measured portrait frame (social-layout.ts:
 *  Z. upper left, the name lower left, the foot left clear for a Link
 *  sticker): the reel's plate over one still room, floor kept (south). */
export async function renderMeasuredStory(sceneUrl: string, given: ReelSpec): Promise<{ image: Buffer; frame: LayoutFrame }> {
  const spec = { ...given, sub: measuredSub(given.sub) };
  const { w, h } = CANVAS.story;
  const frame = await measurePortrait(spec.title, spec.sub, spec.kicker);
  const src = await fetchImage(sceneUrl, 1440);
  const base = await sharp(src).resize(w, h, { fit: "cover", position: "south" }).toBuffer();
  const image = await sharp(base)
    .composite([{ input: await textPlate({ ...spec, measured: true }) }])
    .jpeg({ quality: 90 })
    .toBuffer();
  return { image, frame };
}
