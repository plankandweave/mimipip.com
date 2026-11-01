// Lumen's frames — the presentation film cut from a campus proposal.
//
// Runs in the media container (ffmpeg, sharp, the brand fonts); the Worker
// only hands it pictures, narration tracks and words by URL, through /lumen,
// and reads the result back from the lumen_films row the container updates.
//
// The film: an opening card (the campus, the direction), one scene per wall
// (the design on the wall's photograph under a slow push-in, the concept's
// title in the house type), and a closing card (the mark and the sign-off).
// Each scene lasts its narration plus a breath, so the picture is never cut
// off mid-sentence; a scene with no narration holds for a few seconds.
// Scenes are encoded one at a time (video + its own audio, a short fade in
// and out) and joined without re-encoding, so one long ffmpeg run can never
// wedge the container the way a single-pass filter graph did on 12 October
// 2026, and a failure names the scene it happened on.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { fetchImage } from "./fetch";
import { bottomScrimSvg, esc, monogramSvg, PALETTE, SANS_TEXT, SERIF_DISPLAY, wordmarkSvg, wrap, MIN_PRIMARY_HEIGHT } from "./brand";
import { sceneSeconds } from "@/lib/lumen-rules";

export const LUMEN_FRAME = { w: 1920, h: 1080 } as const;
const FPS = 25;
const FADE = 0.5;
const LEAD_IN_MS = 600;

export type LumenSceneInput = {
  key: string;
  /** The picture under the words; null for a card scene (opening, closing). */
  imageUrl: string | null;
  /** The narration track; null for a silent scene. */
  audioUrl: string | null;
  heading: string;
  caption: string;
};

export type LumenFilmSpec = {
  /** The campus, on the opening card. */
  campus: string;
  /** The direction, under it. */
  direction: string;
  /** The closing line under the mark. */
  signoff: string;
};

export type LumenFilm = { video: Buffer; poster: Buffer; durationS: number; sceneSeconds: number[] };

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || FFMPEG.replace(/ffmpeg([^/\\]*)$/, "ffprobe$1");
/** One scene is seconds of work; a run still going after this is wedged. */
const RUN_LIMIT_MS = 150_000;

function run(bin: string, args: string[], capture = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", capture ? "pipe" : "ignore", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error(`${bin} did not finish within ${RUN_LIMIT_MS / 1000}s and was killed: ${err.slice(-400)}`));
    }, RUN_LIMIT_MS);
    p.stdout?.on("data", (d) => (out += d.toString()));
    p.stderr?.on("data", (d) => (err += d.toString()));
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(`${bin} exited ${code}: ${err.slice(-600)}`));
    });
  });
}

async function audioSeconds(file: string): Promise<number> {
  const out = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], true);
  const n = Number(out);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`could not read the narration's length (${out || "empty"})`);
  return n;
}

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetch ${res.status}: ${url.slice(0, 120)}`);
  return Buffer.from(await res.arrayBuffer());
}

/* ─────────────────────────── the house type ─────────────────────────── */

/** The words over a wall: a small-caps kicker (the wall), a hairline, the
 *  concept's title in the display serif. Lower left, over a scrim, and
 *  overlaid AFTER the push-in so the type never moves. */
export function lumenLowerThirdSvg(w: number, h: number, heading: string, caption: string): string {
  const x = Math.round(w * 0.06);
  const titleLines = wrap(heading, 34).slice(0, 2);
  const titleSize = Math.round(w * 0.04);
  const kickerSize = Math.round(w * 0.0125);
  const footY = Math.round(h * 0.88);
  const lineH = Math.round(titleSize * 1.12);
  const titleTop = footY - (titleLines.length - 1) * lineH;
  const capTop = titleTop - Math.round(titleSize * 0.72);
  const ruleY = capTop - Math.round(titleSize * 0.36);
  const kickerY = ruleY - Math.round(kickerSize * 0.9);
  const tspans = titleLines.map((ln, i) => `<tspan x="${x}" y="${titleTop + i * lineH}">${esc(ln)}</tspan>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <text x="${x}" y="${kickerY}" font-family="${SANS_TEXT}" font-size="${kickerSize}" fill="#FFFFFF" font-weight="700"
      letter-spacing="${Math.round(kickerSize * 0.3)}">${esc(caption.toUpperCase())}</text>
    <rect x="${x}" y="${ruleY}" width="${Math.round(w * 0.04)}" height="2" fill="#FFFFFF" opacity="0.85"/>
    <text font-family="${SERIF_DISPLAY}" font-weight="600" font-size="${titleSize}" fill="#FFFFFF">${tspans}</text>
  </svg>`;
}

/** The opening card: the campus in the display serif on the cloud ground,
 *  the direction beneath, the monogram above. */
export function lumenOpeningSvg(w: number, h: number, campus: string, direction: string): string {
  const x = Math.round(w * 0.1);
  const kickerSize = Math.round(w * 0.0125);
  const titleSize = Math.round(w * 0.052);
  const subSize = Math.round(w * 0.02);
  const titleLines = wrap(campus, 28).slice(0, 2);
  const lineH = Math.round(titleSize * 1.12);
  const titleTop = Math.round(h * 0.5);
  const tspans = titleLines.map((ln, i) => `<tspan x="${x}" y="${titleTop + i * lineH}">${esc(ln)}</tspan>`).join("");
  const subY = titleTop + (titleLines.length - 1) * lineH + Math.round(subSize * 2.4);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${PALETTE.cloud}"/>
    <text x="${x}" y="${titleTop - Math.round(titleSize * 1.6)}" font-family="${SANS_TEXT}" font-size="${kickerSize}" fill="${PALETTE.slate}" font-weight="700"
      letter-spacing="${Math.round(kickerSize * 0.3)}">A PROPOSAL FOR</text>
    <text font-family="${SERIF_DISPLAY}" font-weight="600" font-size="${titleSize}" fill="${PALETTE.charcoal}">${tspans}</text>
    <text x="${x}" y="${subY}" font-family="${SANS_TEXT}" font-size="${subSize}" fill="${PALETTE.slate}">${esc(direction)}</text>
  </svg>`;
}

export function lumenClosingSvg(w: number, h: number, signoff: string): string {
  const subSize = Math.round(w * 0.018);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${PALETTE.cloud}"/>
    <text x="${Math.round(w / 2)}" y="${Math.round(h * 0.64)}" text-anchor="middle" font-family="${SANS_TEXT}" font-size="${subSize}" fill="${PALETTE.slate}">${esc(signoff)}</text>
  </svg>`;
}

/* ────────────────────────────── the stills ───────────────────────────── */

async function wallStill(url: string): Promise<Buffer> {
  const { w, h } = LUMEN_FRAME;
  const src = await fetchImage(url, 2200);
  // Oversized a touch so the push-in never reveals an edge; the crop keeps
  // the floor (a room reads from the floor up).
  return sharp(src).resize(Math.round(w * 1.12), Math.round(h * 1.12), { fit: "cover", position: "south" }).jpeg({ quality: 92 }).toBuffer();
}

async function plate(w: number, h: number, svg: string): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: Buffer.from(bottomScrimSvg(w, h, 0.6)) }, { input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

async function openingCard(spec: LumenFilmSpec): Promise<Buffer> {
  const { w, h } = LUMEN_FRAME;
  const mono = Buffer.from(monogramSvg({ color: PALETTE.charcoal, height: Math.round(w * 0.028) }));
  return sharp(Buffer.from(lumenOpeningSvg(w, h, spec.campus, spec.direction)))
    .composite([{ input: mono, top: Math.round(h * 0.12), left: Math.round(w * 0.1) }])
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function closingCard(spec: LumenFilmSpec): Promise<Buffer> {
  const { w, h } = LUMEN_FRAME;
  const markH = Math.max(MIN_PRIMARY_HEIGHT, Math.round(w * 0.07));
  const mark = Buffer.from(wordmarkSvg({ color: PALETTE.charcoal, height: markH, placement: "primary" }));
  const meta = await sharp(mark).metadata();
  const markW = meta.width ?? Math.round(markH * 4);
  return sharp(Buffer.from(lumenClosingSvg(w, h, spec.signoff)))
    .composite([{ input: mark, top: Math.round(h * 0.5) - markH, left: Math.round((w - markW) / 2) }])
    .jpeg({ quality: 95 })
    .toBuffer();
}

/* ─────────────────────────────── the cut ─────────────────────────────── */

export async function renderLumenFilm(scenes: LumenSceneInput[], spec: LumenFilmSpec): Promise<LumenFilm> {
  if (!scenes.length) throw new Error("renderLumenFilm: no scenes");
  const { w, h } = LUMEN_FRAME;
  const dir = await mkdtemp(join(tmpdir(), "zyv-lumen-"));
  try {
    const segments: string[] = [];
    const seconds: number[] = [];
    let poster: Buffer | null = null;

    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i]!;
      const isCard = !s.imageUrl;
      // The picture.
      const still = join(dir, `s${i}.jpg`);
      if (s.key === "opening") await writeFile(still, await openingCard(spec));
      else if (s.key === "closing") await writeFile(still, await closingCard(spec));
      else if (s.imageUrl) await writeFile(still, await wallStill(s.imageUrl));
      else throw new Error(`scene ${s.key} has no picture`);

      // The words.
      const audio = s.audioUrl ? join(dir, `a${i}.mp3`) : null;
      if (audio) await writeFile(audio, await fetchBytes(s.audioUrl!));
      const dur = sceneSeconds(audio ? await audioSeconds(audio) + LEAD_IN_MS / 1000 : null);
      seconds.push(dur);

      const frames = Math.round(dur * FPS);
      const zoomStep = (0.06 / frames).toFixed(7);
      const motion = isCard
        ? `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`
        : `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},` +
          `zoompan=z='min(1+${zoomStep}*on,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${w}x${h}:fps=${FPS}`;
      const inputs = ["-framerate", String(FPS), "-loop", "1", "-t", dur.toFixed(2), "-i", still];
      const filters: string[] = [];
      let v = "[v0]";
      filters.push(`${motion},setpts=PTS-STARTPTS[v0]`);
      if (!isCard) {
        const p = join(dir, `p${i}.png`);
        await writeFile(p, await plate(w, h, lumenLowerThirdSvg(w, h, s.heading, s.caption)));
        inputs.push("-framerate", String(FPS), "-loop", "1", "-t", dur.toFixed(2), "-i", p);
        filters.push(`[v0][1:v]overlay=0:0:format=auto[v1]`);
        v = "[v1]";
        if (!poster) poster = await sharp(still).resize(w, h, { fit: "cover", position: "south" }).composite([{ input: await readFile(p) }]).jpeg({ quality: 88 }).toBuffer();
      }
      filters.push(`${v}fade=t=in:st=0:d=${FADE},fade=t=out:st=${(dur - FADE).toFixed(2)}:d=${FADE},format=yuv420p[vout]`);
      const audioIdx = isCard ? 1 : 2;
      if (audio) {
        inputs.push("-i", audio);
        // Cloned voices can arrive far below playback level. Normalize speech
        // before adding the lead-in/padding, keeping peaks below clipping.
        filters.push(`[${audioIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:LRA=11,adelay=${LEAD_IN_MS}|${LEAD_IN_MS},apad[aout]`);
      } else {
        inputs.push("-f", "lavfi", "-t", dur.toFixed(2), "-i", "anullsrc=r=44100:cl=stereo");
        filters.push(`[${audioIdx}:a]anull[aout]`);
      }
      const seg = join(dir, `seg${i}.mp4`);
      await run(FFMPEG, [
        "-y", ...inputs,
        "-filter_complex", filters.join(";"),
        "-map", "[vout]", "-map", "[aout]",
        "-t", dur.toFixed(2),
        "-r", String(FPS),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-maxrate", "2500k", "-bufsize", "5000k", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
        "-video_track_timescale", "90000",
        seg,
      ]).catch((e) => { throw new Error(`scene ${s.key} (${s.heading}): ${(e as Error).message}`); });
      segments.push(seg);
    }

    const list = join(dir, "list.txt");
    await writeFile(list, segments.map((p) => `file '${p}'`).join("\n") + "\n");
    const out = join(dir, "film.mp4");
    await run(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", out]);
    const video = await readFile(out);
    if (!poster) poster = await sharp(join(dir, "s0.jpg")).resize(w, h, { fit: "cover" }).jpeg({ quality: 88 }).toBuffer();
    return { video, poster, durationS: +seconds.reduce((a, b) => a + b, 0).toFixed(2), sceneSeconds: seconds };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
