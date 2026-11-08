import "server-only";
import sharp from "sharp";
import { DAY, artPathOf, canonicalArtUrl, signArt } from "@/lib/corporate-files";
import { caDownload, caUpload } from "@/lib/corporate-art-store";
import type { SupabaseClient } from "@/brand/database-types";

// The INTERACTIVE band composer — moved verbatim out of
// /api/corporate/band/route.ts so the media container can run it (workerd
// cannot load sharp). This is deliberately NOT corporate-band-compose.ts:
// the two pipelines diverged on purpose — this one tiles a chosen sequence
// (A B C A B C…), crops the run's last copy at the band's edge from the LEFT,
// and has its own segment ceiling — and unifying them silently would change
// what partners' showrooms print.

const MAX_CANVAS_H = 4096;
const MAX_CANVAS_W = 40_000;
// Bound the MASTER by total pixels, not width alone: a 128 ft run at 16k wide
// was being squeezed to 435 px tall — throwing away half the source's real
// resolution on the longest, most visible prints. ~25 MP keeps a long band at
// its sources' full height while staying well inside the function's memory.
const MAX_CANVAS_PX = 25_000_000;

export type InteractiveBandDesign = {
  id: string;
  title: string | null;
  design_url: string;
  design_code: string | null;
};

export type InteractiveBandPiece = {
  url: string;
  previewUrl: string | null;
  width: number;
  height: number;
  name: string;
  widthMm: number;
};

export type InteractiveBandResult =
  | { pieces: InteractiveBandPiece[]; tiles: number; passes: number }
  | { error: string; status: number };

/** Compose the band from CLEAN originals and store each ≤full-roll piece as a
 *  permanent corporate-art file. Errors come back as {error, status} with the
 *  route's original user-facing messages, never thrown. */
export async function composeInteractiveBand(
  sb: SupabaseClient,
  accountSlug: string,
  designs: InteractiveBandDesign[],
  ids: string[],
  widthMm: number,
  heightMm: number,
  nPieces: number,
): Promise<InteractiveBandResult> {
  const byId = new Map(designs.map((d) => [d.id, d]));

  // Fetch each unique original once (the same design may repeat in the run).
  const buffers = new Map<string, { buf: Buffer; w: number; h: number }>();
  for (const id of new Set(ids)) {
    const d = byId.get(id)!;
    const path = artPathOf(d.design_url);
    if (!path) return { error: `“${d.title}” has no readable artwork file.`, status: 500 };
    const dl = await caDownload(path);
    if (dl.error || !dl.data) {
      return { error: `Could not fetch “${d.title}” from storage.`, status: 502 };
    }
    const buf = Buffer.from(await dl.data.arrayBuffer());
    const meta = await sharp(buf, { failOn: "none" }).metadata();
    if (!meta.width || !meta.height) {
      return { error: `“${d.title}” could not be read as an image.`, status: 400 };
    }
    buffers.set(id, { buf, w: meta.width, h: meta.height });
  }

  // Fit every segment to one common height — the tallest source, so the best
  // asset is never downscaled — capped so the finished strip stays tractable.
  const bandAspect = widthMm / heightMm;
  const canvasH = Math.max(1, Math.min(
    Math.max(...[...buffers.values()].map((s) => s.h)),
    MAX_CANVAS_H,
    Math.floor(MAX_CANVAS_W / bandAspect),
    Math.floor(Math.sqrt(MAX_CANVAS_PX / bandAspect)),
  ));
  const targetW = Math.round(canvasH * bandAspect);

  // TILE the chosen sequence across the run: A B C A B C … until the band is
  // full. Picking four designs for a thirty-foot band is choosing the ORDER,
  // not promising to cover it by hand — so a short sequence repeats rather
  // than refusing to build, and the run ends wherever the band ends.
  const segments: { input: Buffer; left: number; width: number }[] = [];
  const resized = new Map<string, { buf: Buffer; w: number }>();
  for (const [id, s] of buffers) {
    const segW = Math.max(1, Math.round(canvasH * (s.w / s.h)));
    resized.set(id, {
      buf: await sharp(s.buf, { failOn: "none" }).resize({ height: canvasH }).png().toBuffer(),
      w: segW,
    });
  }

  let x = 0;
  let guard = 0;
  const MAX_TILES = 400; // a 15 m band of narrow strips still lands far below this
  while (x < targetW && guard < MAX_TILES) {
    const id = ids[guard % ids.length]!;
    const r = resized.get(id)!;
    const visibleW = Math.min(r.w, targetW - x);
    const input = visibleW < r.w
      // The run ends mid-design: crop that last copy at the band's edge.
      ? await sharp(r.buf).extract({ left: 0, top: 0, width: visibleW, height: canvasH }).png().toBuffer()
      : r.buf;
    segments.push({ input, left: x, width: visibleW });
    x += visibleW;
    guard++;
  }
  const passes = Math.round((guard / ids.length) * 10) / 10;

  const composite = await sharp({
    create: { width: targetW, height: canvasH, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite(segments.map((s) => ({ input: s.input, left: s.left, top: 0 })))
    .png()
    .toBuffer();

  // Slice the composed run into its ≤39 m (full-roll) pieces and store each as
  // its own permanent print master. The tiling ran across the WHOLE band
  // first, so the pattern flows continuously over the piece joins — a join
  // falls wherever it falls, exactly like a panel seam within a piece.
  const codes = ids.map((id) => byId.get(id)!.design_code ?? byId.get(id)!.title);
  const baseName = `Band · ${codes.join(" + ")}`.slice(0, 100);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const pieces: InteractiveBandPiece[] = [];
  for (let i = 0; i < nPieces; i++) {
    const left = Math.round((targetW * i) / nPieces);
    const right = Math.round((targetW * (i + 1)) / nPieces);
    const pieceBuf = nPieces === 1
      ? composite
      : await sharp(composite).extract({ left, top: 0, width: right - left, height: canvasH }).png().toBuffer();
    const path = `band/${accountSlug}/${stamp}${nPieces > 1 ? `-p${i + 1}` : ""}.png`;
    const up = await caUpload(path, pieceBuf, {
      contentType: "image/png", upsert: false,
    });
    if (up.error) {
      console.error("[band-compose-interactive]", up.error.message);
      return { error: "Could not save the band artwork — please try again.", status: 502 };
    }
    pieces.push({
      url: canonicalArtUrl(sb, path),
      previewUrl: await signArt(sb, path, DAY),
      width: right - left,
      height: canvasH,
      name: nPieces > 1 ? `${baseName} · piece ${i + 1}/${nPieces}` : baseName,
      // mm split mirrors the px split, so piece widths sum exactly to the band.
      widthMm: Math.round((widthMm * (i + 1)) / nPieces) - Math.round((widthMm * i) / nPieces),
    });
  }

  return { pieces, tiles: guard, passes };
}
