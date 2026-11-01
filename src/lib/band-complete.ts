import sharp from "sharp";

// GENERATIVE COMPLETION of a band's blank patches (Roheena, 14 October 2026,
// Nelamangala wall 7: "This doesn't work. The appliance needs to be
// completed … Astra can always complete the appliance with its image
// generation tool").
//
// Every earlier answer to "the run ends where an appliance stands" was to
// take the appliance away and paint the patch flat (band-paint.ts). A flat
// patch is honest but it is not the artwork, and on a one-design wall that
// cannot hold every object it leaves a plain olive band where a kettle was.
// Now the flat paint is only the UNDERCOAT: each patch wider than a hand's
// breadth is handed to the image model as a masked edit of the band around
// it — "continue the artwork into the transparent area with one more
// complete appliance on the same floor line" — and the model's panel is
// written back over the paint. The paint stays when the model cannot be
// reached, and the composer reports it so the wall says so.
//
// Pure in all but the one call: the band in, the band out; the model is the
// Vijay Sales OpenAI key's image model (gpt-image-2 by default), the same
// door the Proposal Studio renders through. The key travels with the request
// from the Worker: the media container holds no OpenAI key of its own.

export type BandVoid = { from: number; to: number };

export type CompleteOptions = {
  openaiKey: string | null | undefined;
  /** The image-edit model; `OPENAI_IMAGE_MODEL` or gpt-image-2. */
  model?: string;
  /** The store's floor line, as a fraction of the band height from the top. */
  floorLinePct: number | null;
  /** What the artwork is, in the measuring model's words (geometry notes). */
  describe: string;
  timeoutMs?: number;
  /** At most this many model calls per band; the rest keep their paint. */
  maxCalls?: number;
  fetchImpl?: typeof fetch;
  /** WHOLE-WALL MODE: the one design kept on the wall. The voids either side
   *  of it are drawn outward from it, panel by panel, so the model always
   *  works beside artwork, never beside paint. */
  anchor?: BandVoid | null;
  /** Every new panel holds a DIFFERENT appliance, drawn straight-on, in a
   *  new colour from the palette (Roheena, 14 October 2026, Nelamangala
   *  wall 8: "the angle … is looking really bad", "has repetition"). */
  distinct?: boolean;
};

export type CompleteResult = { buf: Buffer; completed: number; skipped: number; errors: string[] };

/** The edit model draws at this frame; the band window is scaled into it. */
export const GEN_W = 1536;
export const GEN_H = 1024;
/** A void narrower than this share of the band height stays painted: a few
 *  centimetres of panel need no appliance. */
export const MIN_VOID_OF_H = 0.12;
/** A void wider than this share of the edit window is filled in chunks, so
 *  the model always sees more artwork than blank. */
export const MAX_CHUNK_OF_WINDOW = 0.75;
/** A drawn patch with more than this share of near-black pixels painted its
 *  background black (Nelamangala wall 8, 14 October 2026, twice: a green
 *  toaster on a black slab). It is asked again once, then kept as paint. */
export const MAX_DARK_SHARE = 0.55;

/** Voids merged where they touch or overlap, sorted left to right, clipped to the band. */
export function mergeVoids(voids: readonly BandVoid[], width: number): BandVoid[] {
  const sorted = voids
    .map((v) => ({ from: Math.max(0, Math.floor(v.from)), to: Math.min(width, Math.ceil(v.to)) }))
    .filter((v) => v.to - v.from >= 1)
    .sort((p, q) => p.from - q.from);
  const out: BandVoid[] = [];
  for (const v of sorted) {
    const last = out[out.length - 1];
    if (last && v.from <= last.to + 1) last.to = Math.max(last.to, v.to);
    else out.push({ ...v });
  }
  return out;
}

/** The pieces a void is filled in: left to right, none wider than the chunk cap. */
export function voidChunks(v: BandVoid, windowW: number): BandVoid[] {
  const cap = Math.max(1, Math.floor(windowW * MAX_CHUNK_OF_WINDOW));
  const out: BandVoid[] = [];
  for (let a = v.from; a < v.to; a += cap) out.push({ from: a, to: Math.min(v.to, a + cap) });
  return out;
}

/** Whole-wall mode: a void's pieces of equal width, none wider than the cap,
 *  ordered from the anchor outward — a void left of the anchor is filled
 *  right to left, one right of it left to right. */
export function outwardChunks(v: BandVoid, windowW: number, anchor: BandVoid): (BandVoid & { side: "left" | "right" })[] {
  const cap = Math.max(1, Math.floor(windowW * MAX_CHUNK_OF_WINDOW));
  const n = Math.max(1, Math.ceil((v.to - v.from) / cap));
  const w = (v.to - v.from) / n;
  const pieces = Array.from({ length: n }, (_, i) => ({ from: Math.round(v.from + i * w), to: Math.round(v.from + (i + 1) * w) }));
  const side: "left" | "right" = v.to <= anchor.from ? "left" : "right";
  return (side === "left" ? pieces.reverse() : pieces).map((p) => ({ ...p, side }));
}

/** Whole-wall mode: the window puts the chunk at its far end, so everything
 *  else the model sees is the artwork already on the wall. */
export function outwardWindow(chunk: BandVoid & { side: "left" | "right" }, windowW: number, width: number): number {
  if (windowW >= width) return 0;
  const left = chunk.side === "left" ? chunk.from : chunk.to - windowW;
  return Math.max(0, Math.min(width - windowW, Math.round(left)));
}

/** The appliances a new panel may hold; the model picks one not yet shown. */
export const APPLIANCE_CHOICES = [
  "a refrigerator", "a front-load washing machine", "a microwave oven", "a split air-conditioner indoor unit",
  "a flat-screen television", "a tower speaker", "an espresso machine", "a mixer grinder", "an air fryer",
  "a water purifier", "a vacuum cleaner", "an induction cooktop", "a stand fan", "a rice cooker", "a laptop on a small stand",
];

/** Where the edit window sits on the band for a chunk: the chunk inside it,
 *  with as much artwork beside it as the band allows. A chunk at the band's
 *  end sits at the window's end, so the model sees the whole run up to it. */
export function windowFor(chunk: BandVoid, windowW: number, width: number): number {
  if (windowW >= width) return 0;
  if (chunk.to >= width) return width - windowW;
  if (chunk.from <= 0) return 0;
  const centre = (chunk.from + chunk.to) / 2;
  return Math.max(0, Math.min(width - windowW, Math.round(centre - windowW / 2)));
}

/** The instruction for one chunk. Exported so a test can read what the model is told. */
export function completionPrompt(
  describe: string, chunkOfH: number, floorLinePct: number | null,
  panel: { r: number; g: number; b: number } | null = null, insist = false, distinct = false,
): string {
  const floor = floorLinePct != null
    ? `standing on the same floor line as its neighbours, ${Math.round(floorLinePct * 100)}% of the way down the picture`
    : "standing on the same floor line as its neighbours";
  const what = distinct
    ? `ONE complete appliance of a DIFFERENT kind from every appliance already in the picture — choose one of ${APPLIANCE_CHOICES.join(", ")} — `
      + `never a copy or a recolour of an appliance already shown. Draw it straight-on from the front at eye level, exactly the viewing angle of its neighbours (no three-quarter or angled view), `
      + `LARGE: as tall as its neighbours, its top close to the top of the picture the way a seven-foot refrigerator would stand — never a small or distant appliance, never several small ones — ${floor}, centred on a new flat colour panel in a colour from the wall's palette that differs from the panel beside it`
    : chunkOfH >= 0.45
    ? `one more COMPLETE appliance of the same kind and size as its neighbours, ${floor}, in the middle of a new flat colour panel from the same palette`
    : `a plain continuation of the colour panel beside it, with a small appliance only if one fits whole, ${floor}`;
  return `This is part of a hand-drawn wallpaper for an electronics store: ${describe}. `
    + `Continue the artwork into the transparent area ONLY, drawn in exactly the same style, line weight, colours, scale and perspective. `
    + `Put there ${what}. `
    + `The appliance must be whole and sit fully INSIDE the transparent area, with a clear margin of plain background on both its left and right sides — it must not touch or cross either side edge of the area. Nothing floating. `
    + (panel && !distinct ? `The new panel's background is the flat colour rgb(${panel.r}, ${panel.g}, ${panel.b}), the colour already under the transparent area. ` : "")
    + `Never a black, dark or grey background: every panel on this wall is a light, flat colour. `
    + (insist ? `A previous attempt painted the background black; that is wrong — use the flat light colour named above. ` : "")
    + `Keep every pixel outside the transparent area exactly as it is. No text, no logos, no people, no shadows across the floor beyond what the neighbours have.`;
}

/** The margin, as a share of the band height, over which a completed
 *  patch is blended into the artwork either side of it. */
export const SEAM_OF_H = 0.06;

/** Blend the model's drawing into the band over a margin either side of the
 *  chunk: alpha ramps from 0 at the margin's outer edge to 1 at the chunk. */
export async function featherSeams(
  band: Buffer, back: Buffer, left: number, chunk: BandVoid, windowW: number, height: number,
): Promise<Buffer> {
  const m = Math.max(2, Math.round(height * SEAM_OF_H));
  const layers: { input: Buffer; left: number; top: number }[] = [];
  for (const side of ["left", "right"] as const) {
    const a = side === "left" ? Math.max(left, chunk.from - m) : chunk.to;
    const b = side === "left" ? chunk.from : Math.min(left + windowW, chunk.to + m);
    const w = b - a;
    if (w < 2) continue;
    const rgb = await sharp(back).extract({ left: a - left, top: 0, width: w, height }).removeAlpha().raw().toBuffer();
    const rgba = Buffer.alloc(w * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const t = side === "left" ? (x + 1) / (w + 1) : 1 - (x + 1) / (w + 1);
        rgba[i * 4] = rgb[i * 3]!; rgba[i * 4 + 1] = rgb[i * 3 + 1]!; rgba[i * 4 + 2] = rgb[i * 3 + 2]!;
        rgba[i * 4 + 3] = Math.round(255 * t);
      }
    }
    layers.push({ input: await sharp(rgba, { raw: { width: w, height, channels: 4 } }).png().toBuffer(), left: a, top: 0 });
  }
  return layers.length ? sharp(band).composite(layers).png().toBuffer() : band;
}

/** Clear background kept between a seated appliance and its panel's edges,
 *  as a share of the band height. */
export const SEAT_MARGIN_OF_H = 0.04;
/** How far past the chunk an appliance the model drew across its edge is
 *  followed, as a share of the band height. */
export const SEAT_REACH_OF_H = 0.35;

/**
 * An appliance the model drew ACROSS its area's edge is moved back inside.
 * Nelamangala walls 1 and 3, 14 October 2026: a fridge and a washing machine
 * were drawn starting just left of their panel, and the artwork beside it
 * covered their left sides (Roheena: "the washing machine is getting stuffed
 * … the fridge has got stuffed"). Telling the model to keep a margin was not
 * enough, and a feathered seam only softens the cut. The model redraws the
 * whole frame, so the appliance is whole in its drawing: it is lifted out of
 * the drawing — every pixel off the new panel's colour, and, outside the
 * area, also off the artwork that was there — and set back on its panel,
 * centred, shrunk about the floor line only if it is wider than the panel.
 * Returns the patch, or null when the drawing already sits inside.
 */
export async function seatAppliance(
  back: Buffer, orig: Buffer, left: number, chunk: BandVoid, windowW: number, height: number, floorLinePct: number | null,
): Promise<Buffer | null> {
  const B = await sharp(back).removeAlpha().raw().toBuffer();
  const O = await sharp(orig).removeAlpha().raw().toBuffer();
  const cx0 = chunk.from - left, cx1 = chunk.to - left, cw = cx1 - cx0;
  const at = (buf: Buffer, x: number, y: number) => (y * windowW + x) * 3;
  // The new panel's colour: the commonest colour of the drawn area.
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let y = 0; y < height; y += 2) {
    for (let x = cx0; x < cx1; x += 2) {
      const i = at(B, x, y);
      const k = ((B[i]! >> 4) << 8) | ((B[i + 1]! >> 4) << 4) | (B[i + 2]! >> 4);
      const e = bins.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += B[i]!; e.g += B[i + 1]!; e.b += B[i + 2]!;
      bins.set(k, e);
    }
  }
  let top = { n: 0, r: 0, g: 0, b: 0 };
  for (const e of bins.values()) if (e.n > top.n) top = e;
  if (!top.n) return null;
  const panel = { r: Math.round(top.r / top.n), g: Math.round(top.g / top.n), b: Math.round(top.b / top.n) };
  const T = 48;
  const busy = (x: number, y: number) => {
    const i = at(B, x, y);
    const offPanel = Math.max(Math.abs(B[i]! - panel.r), Math.abs(B[i + 1]! - panel.g), Math.abs(B[i + 2]! - panel.b)) > T;
    if (!offPanel) return false;
    if (x >= cx0 && x < cx1) return true;
    return Math.max(Math.abs(B[i]! - O[i]!), Math.abs(B[i + 1]! - O[i + 1]!), Math.abs(B[i + 2]! - O[i + 2]!)) > T;
  };
  const reach = Math.round(height * SEAT_REACH_OF_H);
  const lo = Math.max(0, cx0 - reach), hi = Math.min(windowW, cx1 + reach);
  const colBusy = new Uint8Array(windowW);
  for (let x = lo; x < hi; x++) {
    let n = 0;
    for (let y = 0; y < height; y++) if (busy(x, y)) n++;
    colBusy[x] = n >= height * 0.03 ? 1 : 0;
  }
  let a = -1, b = -1;
  for (let x = cx0; x < cx1; x++) if (colBusy[x]) { if (a < 0) a = x; b = x; }
  if (a < 0) return null;
  const GAP = 4;
  const extend = (from: number, step: number, stop: number) => {
    let edge = from, x = from + step, miss = 0;
    while (x !== stop && miss <= GAP) { if (colBusy[x]) { edge = x; miss = 0; } else miss++; x += step; }
    return edge;
  };
  a = extend(a, -1, lo - 1);
  b = extend(b, 1, hi);
  const m = Math.round(height * SEAT_MARGIN_OF_H);
  if (a >= cx0 + m && b <= cx1 - 1 - m) return null;
  const ow = b - a + 1;
  const cut = Buffer.alloc(ow * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = a; x <= b; x++) {
      const i = at(B, x, y), j = (y * ow + (x - a)) * 4;
      cut[j] = B[i]!; cut[j + 1] = B[i + 1]!; cut[j + 2] = B[i + 2]!;
      cut[j + 3] = busy(x, y) ? 255 : 0;
    }
  }
  const s = Math.min(1, Math.max(1, cw - 2 * m) / ow);
  const nw = Math.max(1, Math.round(ow * s)), nh = Math.max(1, Math.round(height * s));
  const floorY = floorLinePct != null ? floorLinePct * height : height;
  const obj = await sharp(cut, { raw: { width: ow, height, channels: 4 } }).resize({ width: nw, height: nh, fit: "fill" }).png().toBuffer();
  return sharp({ create: { width: cw, height, channels: 3, background: panel } })
    .composite([{ input: obj, left: Math.max(0, Math.round((cw - nw) / 2)), top: Math.max(0, Math.min(height - nh, Math.round(floorY * (1 - s)))) }])
    .png().toBuffer();
}

/** The share of near-black pixels in an image (each channel under 45). */
export async function darkShare(img: Buffer): Promise<number> {
  const { data, info } = await sharp(img).resize({ width: 96, height: 96, fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let dark = 0;
  for (let i = 0; i < data.length; i += info.channels) if (data[i]! < 45 && data[i + 1]! < 45 && data[i + 2]! < 45) dark++;
  return dark / (data.length / info.channels);
}

/** The commonest colour of an image (16 levels a channel), as the share of
 *  the image it covers and its mean RGB. */
export async function dominantColour(img: Buffer): Promise<{ share: number; r: number; g: number; b: number }> {
  const { data, info } = await sharp(img).resize({ width: 96, height: 96, fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  const total = data.length / info.channels;
  for (let i = 0; i < data.length; i += info.channels) {
    const k = ((data[i]! >> 4) << 8) | ((data[i + 1]! >> 4) << 4) | (data[i + 2]! >> 4);
    const e = bins.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += data[i]!; e.g += data[i + 1]!; e.b += data[i + 2]!;
    bins.set(k, e);
  }
  let top = { n: 0, r: 0, g: 0, b: 0 };
  for (const e of bins.values()) if (e.n > top.n) top = e;
  return top.n ? { share: top.n / total, r: top.r / top.n, g: top.g / top.n, b: top.b / top.n } : { share: 0, r: 0, g: 0, b: 0 };
}

/** A panel whose commonest colour is near-black is a failed drawing, however
 *  much of it the appliance covers (Nelamangala wall 2, 14 October 2026: the
 *  model drew a fridge on a narrow teal panel between two black slabs; the
 *  dark share was under the limit, the seating then took the black for the
 *  panel and lifted the teal panel along with the fridge). */
export async function darkPanel(img: Buffer): Promise<boolean> {
  const d = await dominantColour(img);
  return d.share >= 0.25 && Math.max(d.r, d.g, d.b) < 70;
}

/** An opaque mask with the chunk transparent, in the edit frame. */
async function maskFor(chunk: { x0: number; x1: number }): Promise<Buffer> {
  const raw = Buffer.alloc(GEN_W * GEN_H * 4, 0);
  for (let i = 3; i < raw.length; i += 4) raw[i] = 255;
  const x0 = Math.max(0, Math.min(GEN_W, Math.floor(chunk.x0)));
  const x1 = Math.max(x0, Math.min(GEN_W, Math.ceil(chunk.x1)));
  for (let y = 0; y < GEN_H; y++) {
    for (let x = x0; x < x1; x++) raw[(y * GEN_W + x) * 4 + 3] = 0;
  }
  return sharp(raw, { raw: { width: GEN_W, height: GEN_H, channels: 4 } }).png().toBuffer();
}

async function editOnce(
  image: Buffer, mask: Buffer, prompt: string, key: string, model: string, timeoutMs: number, fetchImpl: typeof fetch,
): Promise<Buffer> {
  const form = new FormData();
  form.append("model", model);
  form.append("size", `${GEN_W}x${GEN_H}`);
  // Medium: the patch is drawn in a 1536 px frame and scaled to the band
  // anyway, and high quality took ~80 s a call — the slowest step of a store.
  form.append("quality", "medium");
  form.append("n", "1");
  form.append("image", new Blob([new Uint8Array(image)], { type: "image/png" }), "band.png");
  form.append("mask", new Blob([new Uint8Array(mask)], { type: "image/png" }), "mask.png");
  form.append("prompt", prompt);
  const res = await fetchImpl("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const j = (await res.json().catch(() => ({}))) as { data?: { b64_json?: string }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(`${model} answered ${res.status}: ${(j?.error?.message ?? JSON.stringify(j)).slice(0, 200)}`);
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new Error(`${model} returned no image`);
  return Buffer.from(b64, "base64");
}

/**
 * Fill each void on the band with the model's continuation of the artwork.
 * The band comes back unchanged where a void is too narrow, the key is
 * missing or a call fails; every failure is in `errors`, so the caller can
 * put it on the wall rather than let a painted patch pass as finished.
 */
export async function completeVoids(
  band: Buffer, width: number, height: number, voids: readonly BandVoid[], opts: CompleteOptions,
): Promise<CompleteResult> {
  const errors: string[] = [];
  let completed = 0;
  let skipped = 0;
  const merged = mergeVoids(voids, width).filter((v) => {
    const ok = v.to - v.from >= height * MIN_VOID_OF_H;
    if (!ok) skipped++;
    return ok;
  });
  if (!merged.length) return { buf: band, completed, skipped, errors };
  if (!opts.openaiKey) {
    errors.push("no OpenAI key reached the composer — the patches keep their flat paint");
    return { buf: band, completed, skipped, errors };
  }
  const model = opts.model || "gpt-image-2";
  const timeoutMs = opts.timeoutMs ?? 110_000;
  const maxCalls = opts.maxCalls ?? 3;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const windowW = Math.min(width, Math.round(height * (GEN_W / GEN_H)));
  let out = band;
  let calls = 0;
  const anchor = opts.anchor ?? null;
  const chunksOf = (v: BandVoid) => anchor ? outwardChunks(v, windowW, anchor) : voidChunks(v, windowW).map((c) => ({ ...c, side: null as "left" | "right" | null }));
  // Whole-wall mode fills the void nearest the anchor first on each side by
  // interleaving the two sides' chunks, so neither runs out of calls alone.
  const ordered = anchor
    ? (() => {
        const l = merged.filter((v) => v.to <= anchor.from).flatMap(chunksOf);
        const r = merged.filter((v) => v.from >= anchor.to).flatMap(chunksOf);
        const outq: ReturnType<typeof chunksOf> = [];
        for (let i = 0; i < Math.max(l.length, r.length); i++) { if (r[i]) outq.push(r[i]!); if (l[i]) outq.push(l[i]!); }
        return [outq];
      })()
    : merged.map(chunksOf);
  for (const group of ordered) {
    for (const chunk of group) {
      if (calls >= maxCalls) { errors.push(`more patches than ${maxCalls} model calls allow — the rest keep their paint`); return { buf: out, completed, skipped, errors }; }
      calls++;
      const left = chunk.side ? outwardWindow(chunk as BandVoid & { side: "left" | "right" }, windowW, width) : windowFor(chunk, windowW, width);
      const sx = GEN_W / windowW;
      try {
        const window = await sharp(out).extract({ left, top: 0, width: windowW, height })
          .resize({ width: GEN_W, height: GEN_H, fit: "fill" }).png().toBuffer();
        const mask = await maskFor({ x0: (chunk.from - left) * sx, x1: (chunk.to - left) * sx });
        // The undercoat's colour, named to the model as the panel's background.
        const st = await sharp(out).extract({ left: chunk.from, top: 0, width: chunk.to - chunk.from, height }).stats();
        const panel = { r: Math.round(st.channels[0]!.mean), g: Math.round(st.channels[1]!.mean), b: Math.round(st.channels[2]!.mean) };
        const origWin = await sharp(out).extract({ left, top: 0, width: windowW, height }).png().toBuffer();
        let patch: Buffer | null = null;
        let lastBack: Buffer | null = null;
        for (let tryNo = 0; tryNo < 2 && !patch; tryNo++) {
          const prompt = completionPrompt(opts.describe, (chunk.to - chunk.from) / height, opts.floorLinePct, panel, tryNo > 0, !!opts.distinct);
          const drawn = await editOnce(window, mask, prompt, opts.openaiKey, model, timeoutMs, fetchImpl);
          // Back to the band's own pixels, and only the chunk is written: the
          // model is told to leave the rest alone, and this makes sure of it.
          const back = await sharp(drawn).resize({ width: windowW, height, fit: "fill" }).png().toBuffer();
          lastBack = back;
          const cut = await sharp(back).extract({ left: chunk.from - left, top: 0, width: chunk.to - chunk.from, height })
            .flatten({ background: panel }).png().toBuffer();
          if ((await darkShare(cut)) <= MAX_DARK_SHARE && !(await darkPanel(cut))) patch = cut;
        }
        if (!patch) throw new Error("the model painted the panel dark twice — kept the flat colour");
        // An appliance drawn across the area's edge is set back inside it
        // whole, and no seam is feathered: feathering would bring the part
        // that crossed the edge back over the artwork beside it.
        const seated = await seatAppliance(lastBack!, origWin, left, chunk, windowW, height, opts.floorLinePct);
        if (seated) {
          out = await sharp(out).composite([{ input: seated, left: chunk.from, top: 0 }]).png().toBuffer();
          completed++;
          continue;
        }
        out = await sharp(out).composite([{ input: patch, left: chunk.from, top: 0 }]).png().toBuffer();
        // A soft seam, never a hard cut: an appliance the model drew a little
        // past the edge of its area used to be sliced where the paste stopped
        // (Nelamangala wall 1, 14 October 2026: an air fryer cut at the panel
        // line). The model's own pixels are blended in over a margin either
        // side of the chunk, fading from fully drawn to the artwork beside it.
        out = await featherSeams(out, lastBack!, left, chunk, windowW, height);
        completed++;
      } catch (e) {
        errors.push(`could not complete the patch at ${Math.round((chunk.from / width) * 100)}%: ${String((e as Error)?.message ?? e).slice(0, 200)}`);
      }
    }
  }
  return { buf: out, completed, skipped, errors };
}
