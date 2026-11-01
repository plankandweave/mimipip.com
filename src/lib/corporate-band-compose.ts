import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_RUN_MM, equalSlices } from "@/lib/print-limits";
import { DAY, artPathOf, canonicalArtUrl, signArt } from "@/lib/corporate-files";
import { caDownload, caUpload } from "@/lib/corporate-art-store";
import { CENTRE, ensureFocalPoints } from "@/lib/design-focal";
import { ensureDesignGeometry } from "@/lib/design-geometry";
import { gapPaint, stripPiece } from "@/lib/band-paint";
import { completeVoids, type BandVoid } from "@/lib/band-complete";
import { type ColumnRGB, type SubjectBox, BAND_RULES_VERSION, MAX_FLOOR_SCALE, fillToHeight, maxRunScale, colourBoundaries, panelBoundaries, cutOnPatch, fitToFloor, holdsFloorLine, tipsStayInFrame, medianFloor, safeCut, sameLanguage, standingOrAll, edgePaints, wholeSubjectWindow, sliverRuns, clearSpans, arrangementOf, oneArrangement, panelEnds, panelJoins, bestFill, scaledWidths } from "@/lib/band-geometry";

// The band composer, extracted from /api/corporate/band so the site-batch
// pipeline (token-driven, no browser session) can build the same print
// masters the interactive route builds. Behaviour is the route's, unchanged:
// segments fitted to one common height, tiled left→right across the run,
// sliced into ≤38 m (full-roll) pieces, each stored as permanent corporate
// art.
//
// THE FLOOR LINE (Roheena, 6 October 2026). Fitting every segment to the band
// height was assumed to keep the platform line level — it does only when every
// design draws its floor at the same height, and they do not: on the Narol
// proposal televisions stood lower than the cans beside them. Each design's
// floor is now measured once (design-geometry.ts) and every segment is scaled
// and shifted so its floor lands on the STORE's one floor line (`floorLinePct`,
// fixed per store by the caller). THE CUT: a run that ends mid-design is cut in
// the background gap before the next appliance and the remainder painted from
// that gap (band-geometry.ts `safeCut`), never through an object — the tablet
// on Narol wall 3 was sliced in half. Both decisions are pure functions in
// band-geometry.ts, pinned by its tests; this file only applies them.

const MAX_SEGMENTS = 24;
const MAX_TILES = 400;
const MAX_CANVAS_H = 4096;
const MAX_CANVAS_W = 40_000;
const MAX_CANVAS_PX = 25_000_000;

export type BandDesignRow = { id: string; title: string; design_url: string; design_code: string | null };
export type BandPiece = {
  url: string; previewUrl: string | null; width: number; height: number;
  name: string; widthMm: number; path: string;
};
/** One piece of a design on this wall: `from`/`to` are fractions of the
 *  design's width, `atMm`/`lenMm` where it sits on the wall. */
export type BandStrip = { id: string; from: number; to: number; atMm: number; lenMm: number };

export type BandComposeOptions = {
  /** The store's floor line as a fraction of band height from the top. Null
   *  = not yet fixed: the composer uses the median floor of this wall's
   *  designs and reports it back as `floorLinePct` for the caller to fix. */
  floorLinePct?: number | null;
  /** The Vijay Sales OpenAI key, handed in by the Worker: the image model
   *  completes every painted patch with a whole appliance (band-complete.ts).
   *  Without it the patches keep their flat paint and `notes` says so. */
  openaiKey?: string | null;
  /** What the artwork is, for the model's instruction (the designs' geometry notes). */
  describe?: string | null;
  /** Whole-wall mode: keep `seedId` (or the first design) as the anchor and
   *  have the image model draw the rest of the wall outward from it. */
  generate?: { seedId?: string | null } | null;
  /** SERIAL RUN (serial-run-rules.ts; Roheena, 25 October 2026): the exact
   *  pieces this wall carries — whole designs one after another, a design
   *  reaching a corner carried on round it, cut only at the run's free ends.
   *  Laid as given at the band's height: no floor fitting, no fill, no
   *  completion. */
  strips?: BandStrip[] | null;
  /** Told the stage the composer has reached. The container writes it to the
   *  wall, so a compose that never returns still says where it stopped
   *  (Nelamangala wall 4, 14 October 2026: three runs vanished on it with
   *  nothing on the row). Never throws into the composer. */
  onProgress?: (stage: string) => Promise<void> | void;
};
export type BandComposeResult = {
  pieces: BandPiece[]; tiles: number; passes: number;
  /** The floor line actually composed to (null = these designs have no floor). */
  floorLinePct: number | null;
  /** Where a run's end was moved off an appliance into a background gap. */
  cutsMoved: number;
  /** Patches the image model completed with artwork. */
  completed: number;
  /** Why a painted patch was NOT completed — flat colour left on the band.
   *  Any entry fails the wall (bandOutcome). */
  incomplete: string[];
  /** What the composer could not do as well as it wanted — shown on the wall. */
  notes: string[];
  /** BAND_RULES_VERSION of the composer that made this band. */
  rulesVersion: string;
};

export async function composeBandPieces(
  sb: SupabaseClient,
  accountSlug: string,
  rows: BandDesignRow[],
  orderedIds: string[],
  widthMm: number,
  heightMm: number,
  opts: BandComposeOptions = {},
): Promise<BandComposeResult | { error: string }> {
  if (orderedIds.length < 1) return { error: "No designs in the chain." };
  if (orderedIds.length > MAX_SEGMENTS) return { error: `A band carries at most ${MAX_SEGMENTS} designs.` };
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of orderedIds) if (!byId.get(id)) return { error: "A design in the chain could not be loaded." };

  const nPieces = Math.max(1, Math.ceil(widthMm / MAX_RUN_MM));
  const buffers = new Map<string, { buf: Buffer; w: number; h: number }>();
  for (const id of new Set(orderedIds)) {
    const d = byId.get(id)!;
    const path = artPathOf(d.design_url);
    if (!path) return { error: `“${d.title}” has no readable artwork file.` };
    const dl = await caDownload(path);
    if (dl.error || !dl.data) return { error: `Could not fetch “${d.title}” from storage.` };
    const buf = Buffer.from(await dl.data.arrayBuffer());
    const meta = await sharp(buf, { failOn: "none" }).metadata();
    if (!meta.width || !meta.height) return { error: `“${d.title}” could not be read as an image.` };
    buffers.set(id, { buf, w: meta.width, h: meta.height });
  }

  const focals = await ensureFocalPoints(sb, [...new Set(orderedIds)]);
  const geometry = await ensureDesignGeometry(sb, [...new Set(orderedIds)]);
  // The store's floor line, or this wall's own median when the store has
  // none yet (the caller fixes it on the store from the first composition).
  const floorLinePct = opts.floorLinePct ?? medianFloor([...geometry.values()].map((g) => g.floorY));
  let cutsMoved = 0;
  // Every painted patch wider than a hand, in band pixels: the undercoat the
  // image model completes with an appliance once the band is assembled.
  const voids: BandVoid[] = [];
  const notes: string[] = [];
  const progress = async (stage: string) => { try { await opts.onProgress?.(stage); } catch { /* a marker never stops the band */ } };
  await progress("designs loaded");
  const bandAspect = widthMm / heightMm;
  const canvasH = Math.max(1, Math.min(
    Math.max(...[...buffers.values()].map((s) => s.h)),
    MAX_CANVAS_H,
    Math.floor(MAX_CANVAS_W / bandAspect),
    Math.floor(Math.sqrt(MAX_CANVAS_PX / bandAspect)),
  ));
  const targetW = Math.round(canvasH * bandAspect);

  const mmPx = (mm: number) => Math.max(1, Math.round((mm * canvasH) / heightMm));

  // The finished band, cut into print pieces and saved.
  const saveBand = async (band: Buffer, shown: readonly string[]): Promise<BandPiece[] | { error: string }> => {
    const codes = shown.map((id) => byId.get(id)!.design_code ?? byId.get(id)!.title);
    const baseName = `Band · ${codes.join(" + ")}`.slice(0, 100);
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const out: BandPiece[] = [];
    const cuts = equalSlices(targetW, nPieces);
    const mmCuts = equalSlices(widthMm, nPieces);
    for (let i = 0; i < nPieces; i++) {
      const { left, width } = cuts[i]!;
      const pieceBuf = nPieces === 1
        ? band
        : await sharp(band).extract({ left, top: 0, width, height: canvasH }).png().toBuffer();
      const path = `band/${accountSlug}/${stamp}${nPieces > 1 ? `-p${i + 1}` : ""}.png`;
      const up = await caUpload(path, pieceBuf, {
        contentType: "image/png", upsert: false,
      });
      if (up.error) return { error: "Could not save the band artwork — please try again." };
      out.push({
        url: canonicalArtUrl(sb, path),
        previewUrl: await signArt(sb, path, DAY),
        width,
        height: canvasH,
        name: nPieces > 1 ? `${baseName} · piece ${i + 1}/${nPieces}` : baseName,
        widthMm: mmCuts[i]!.width,
        path,
      });
    }
    return out;
  };

  // SERIAL RUN: lay exactly the pieces the run planner gave this wall. Each
  // piece is the design at the band's height, cut where the plan cuts it and
  // placed where the plan places it — the plan already kept every design
  // whole except at the run's free ends and its corners.
  if (opts.strips?.length) {
    await progress("laying the run");
    const layers: { input: Buffer; left: number; top: number }[] = [];
    for (const st of opts.strips) {
      const src = buffers.get(st.id);
      if (!src) return { error: "A design of the run could not be loaded." };
      const left = Math.round((st.atMm / widthMm) * targetW);
      const right = Math.round(((st.atMm + st.lenMm) / widthMm) * targetW);
      if (right - left <= 0) continue;
      // Cropped in the design's own pixels, then scaled once to its place
      // (a pixel or two of rounding between millimetres and band pixels).
      const piece = await stripPiece(src.buf, src.w, src.h, st.from, st.to, right - left, canvasH);
      layers.push({ input: piece, left, top: 0 });
    }
    const band = await sharp({
      create: { width: targetW, height: canvasH, channels: 3, background: { r: 255, g: 255, b: 255 } },
    }).composite(layers).png().toBuffer();
    await progress("uploading");
    const shown = [...new Set(opts.strips.map((st) => st.id))];
    const saved = await saveBand(band, shown);
    if ("error" in saved) return saved;
    return {
      pieces: saved, tiles: layers.length, passes: 1, floorLinePct, cutsMoved: 0, completed: 0,
      incomplete: [], notes: [], rulesVersion: BAND_RULES_VERSION,
    };
  }

  // The colour-block boundaries of an artwork, read off a one-pixel-tall
  // strip (each column averaged). A band or a crop must END on one of these,
  // never a few centimetres past it — a sliver of the next patch on a wall
  // reads as a printing error (Narol walls 1 and 2, 6 October 2026).
  // Read twice: the whole height, and a thin strip along the top edge where
  // the panels are pure colour (panelBoundaries; EBD Gurgaon wall 3).
  const stripBoundaries = async (buf: Buffer, w: number): Promise<number[]> => {
    const stripW = Math.min(w, 4096);
    const columns = async (img: ReturnType<typeof sharp>) => {
      const { data, info } = await img.resize({ width: stripW, height: 1, fit: "fill" })
        .removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const cols: ColumnRGB[] = [];
      for (let i = 0; i < info.width; i++) cols.push([data[i * 3]!, data[i * 3 + 1]!, data[i * 3 + 2]!]);
      return cols;
    };
    const full = await columns(sharp(buf, { failOn: "none" }));
    const meta = await sharp(buf, { failOn: "none" }).metadata();
    const h = meta.height ?? 0;
    const top = h >= 20 && meta.width
      ? await columns(sharp(buf, { failOn: "none" }).extract({ left: 0, top: 0, width: meta.width, height: Math.max(1, Math.round(h * 0.06)) }))
      : null;
    const win = Math.max(4, Math.round(full.length * 0.004));
    const scale = w / full.length;
    return panelBoundaries(full, top, win).map((b) => Math.round(b * scale));
  };

  // Cover a single design across the whole wall, centred on its focal point.
  // Used only for the one-design wall: there is no seam and no neighbour to
  // hold a floor line level with, so the subject-centred crop is right.
  // Returns null when no crop can show the design's objects whole: the wall
  // is then tiled like a band instead (fit to height, repeated, cut in a gap).
  const coverWall = async (
    src: { buf: Buffer; w: number; h: number }, f: { x: number; y: number }, storeFloorY: number | null,
    subjects: ReadonlyArray<SubjectBox>,
  ): Promise<{ buf: Buffer; objects: { a: number; b: number }[]; voids: BandVoid[] } | null> => {
    type Plan = {
      covered: Buffer; left: number; top: number; xs: { a: number; b: number }[]; paints: ReturnType<typeof edgePaints>;
    };
    const plan = async (floorY: number | null): Promise<Plan | null> => {
    // Cover the wall, and when the design has a floor, scale enough that the
    // floor can be pinned to the store's line without leaving white.
    // A floor the line cannot reach without enlarging past MAX_FLOOR_SCALE
    // is not pinned: the subject-centred cover is better than a giant crop.
    if (floorY != null && !holdsFloorLine({ w: src.w, h: src.h, floorY }, floorLinePct, canvasH)) floorY = null;
    // As big as the wall here too (fillToHeight): a one-design wall was cropped
    // at the plain floor fit and its blenders stood half the band high beside
    // walls whose appliances filled it (Nelamangala walls 1, 7 and 15).
    const floorFit = floorY != null
      ? fillToHeight({ w: src.w, h: src.h, floorY, subjects }, floorLinePct, canvasH)
      : fitToFloor({ w: src.w, h: src.h, floorY }, floorLinePct, canvasH);
    const scale = Math.max(targetW / src.w, canvasH / src.h, floorFit.height / src.h);
    const rw = Math.max(targetW, Math.round(src.w * scale));
    const rh = Math.max(canvasH, Math.round(src.h * scale));
    const covered = await sharp(src.buf, { failOn: "none" }).resize({ width: rw, height: rh }).png().toBuffer();
    let left = Math.max(0, Math.min(rw - targetW, Math.round(f.x * rw - targetW / 2)));
    const xs = subjects.map((b) => ({ a: Math.min(b.x0, b.x1) * rw, b: Math.max(b.x0, b.x1) * rw }));
    const ys = subjects.map((b) => ({ a: Math.min(b.y0, b.y1) * rh, b: Math.max(b.y0, b.y1) * rh }));
    const cuts = (boxes: { a: number; b: number }[], off: number, win: number) =>
      boxes.some(({ a, b }) => a < off + win && b > off && !(a >= off && b <= off + win));
    // Never slice an object at the wall's edge: move the window to one that
    // holds whole objects, or give the wall to the band tiler.
    let paints: ReturnType<typeof edgePaints> = [];
    if (rw > targetW && xs.length && cuts(xs, left, targetW)) {
      const m = Math.round(rw * 0.01);
      const off = wholeSubjectWindow(rw, targetW, xs, left + targetW / 2, m);
      if (off != null) {
        left = off;
      } else {
        // A narrow bay over a wide design: centre on the object nearest the
        // focal point and paint over whatever the edges would slice.
        const centre = left + targetW / 2;
        const pick = xs.filter((x) => x.b - x.a <= targetW - 2 * m)
          .sort((p, q) => Math.abs((p.a + p.b) / 2 - centre) - Math.abs((q.a + q.b) / 2 - centre))[0];
        if (!pick) return null;
        left = Math.max(0, Math.min(rw - targetW, Math.round((pick.a + pick.b) / 2 - targetW / 2)));
        paints = edgePaints(left, targetW, xs, m);
      }
    }
    // End the crop on a patch boundary: shift the window left by up to the
    // sliver's width so the wall's right edge is a full colour panel — but
    // never onto an object.
    const bs = await stripBoundaries(covered, rw);
    const pull = Math.min(mmPx(450), Math.round(targetW * 0.12));
    const edge = left + targetW;
    const snapTo = bs.filter((b) => b > left + targetW * 0.55 && b < edge - 2 && edge - b <= pull).pop();
    if (snapTo != null && !paints.length) {
      const moved = Math.max(0, left - (edge - snapTo));
      if (!cuts(xs, moved, targetW)) left = moved;
    }
    // Vertical: the floor decides where one exists; the focal point otherwise.
    const wantTop = floorY != null && floorLinePct != null
      ? Math.round(floorY * rh - floorLinePct * canvasH)
      : Math.round(f.y * rh - canvasH / 2);
    let top = Math.max(0, Math.min(rh - canvasH, wantTop));
    if (rh > canvasH && ys.length && cuts(ys, top, canvasH)) {
      const off = wholeSubjectWindow(rh, canvasH, ys, top + canvasH / 2, Math.round(rh * 0.01));
      if (off == null) return null;
      top = off;
    }
    return { covered, left, top, xs, paints };
    };
    // The floor is pinned only while the wall can still hold the design's
    // objects whole. Pinning enlarges a design whose floor sits above the
    // store's line, and on Nelamangala wall 7 (14 October 2026) that
    // enlargement pushed the toaster off the left edge and the kettle off the
    // right, both painted over as flat bands, to keep a line nobody can see
    // across a corner. The whole design at its own floor beats that.
    let p = await plan(storeFloorY);
    if (p && p.paints.length && storeFloorY != null) {
      const q = await plan(null);
      if (q && !q.paints.length) p = q;
    }
    if (!p) return null;
    const { covered, left, top, xs, paints } = p;
    const crop = await sharp(covered).extract({ left, top, width: targetW, height: canvasH }).png().toBuffer();
    const objects = xs.map((o) => ({ a: o.a - left, b: o.b - left }));
    if (!paints.length) return { buf: crop, objects, voids: [] };
    const layers: { input: Buffer; left: number; top: number }[] = [];
    for (const pt of paints) {
      // A paint at the wall's left edge sits against its gap's left end; one
      // at the right edge against its gap's right end. The paint is the
      // undercoat: the model completes the patch with an appliance below.
      const slab = await gapPaint(crop, { left: pt.gapFrom, width: pt.gapTo - pt.gapFrom }, { width: pt.to - pt.from, height: canvasH },
        pt.from === 0 ? "left" : "right");
      layers.push({ input: slab, left: pt.from, top: 0 });
    }
    return { buf: await sharp(crop).composite(layers).png().toBuffer(), objects, voids: paints.map((pt) => ({ from: pt.from, to: pt.to })) };
  };

  const segments: { input: Buffer; left: number }[] = [];
  // Where the objects stand on the finished band, so the sliver pass below
  // only ever looks at background.
  const objects: { a: number; b: number }[] = [];
  const placeObjects = (subjects: ReadonlyArray<SubjectBox>, w: number, x: number, kept: number) => {
    for (const s of subjects) {
      const a = Math.min(s.x0, s.x1) * w, b = Math.max(s.x0, s.x1) * w;
      if (a < kept) objects.push({ a: x + a, b: x + Math.min(b, kept) });
    }
  };
  let tiles = 0;
  let shownIds = orderedIds;

  // One design covers the wall, centred on its subject — no neighbour to keep
  // a floor line level with — unless no crop can show its objects whole, in
  // which case it is tiled like a band below.
  // A one-design wall of colour panels is tiled like a band instead (the
  // panels end it whole): a cover crop sliced the fridge on Nelamangala
  // wall 7. Only a picture with no panel to end on — a city sketch — covers.
  // WHOLE-WALL MODE (Roheena, 14 October 2026, Nelamangala wall 8: "the
  // angle of the right-hand side appliances and the left is looking really
  // bad … the right-hand side has repetition … can Astra just create this
  // image with this panel, keeping the floor line … without repeating it?").
  // One design is kept as the anchor, centred, on the store's floor line;
  // everything else on the wall is drawn by the image model outward from
  // it, panel by panel, each panel a different appliance at the same
  // straight-on angle (band-complete.ts `anchor` / `distinct`).
  const genSeed = opts.generate
    ? (orderedIds.includes(opts.generate.seedId ?? "") ? opts.generate.seedId! : orderedIds[0]!)
    : null;
  let anchor: BandVoid | null = null;
  const oneId = !genSeed && orderedIds.length === 1 ? orderedIds[0]! : null;
  const coverable = oneId != null && await (async () => {
    const src = buffers.get(oneId)!;
    const subs = geometry.get(oneId)?.subjects ?? [];
    const objs = subs.map((b) => ({ a: Math.min(b.x0, b.x1) * src.w, b: Math.max(b.x0, b.x1) * src.w }));
    const ends = panelEnds(src.w, objs, await stripBoundaries(src.buf, src.w), Math.round(src.w * 0.01));
    // A row of appliances standing on a floor is always tiled — panels end
    // whole, the run ends past its last appliance and the rest is completed —
    // never cropped as one picture, which kept the design's empty edge strips
    // and sliced the end appliances (Nelamangala walls 1, 5, 7 and 14,
    // 14 October 2026). Only a picture with no row to end on (a city sketch)
    // covers its wall.
    const g = geometry.get(oneId);
    const standingRow = g?.floorY != null && subs.filter((b) => Math.abs(Math.max(b.y0, b.y1) - g.floorY!) <= 0.08).length >= 2;
    if (standingRow) return false;
    return ends.filter((e) => e < src.w - 2).length < 2;
  })();
  const covered = oneId != null && coverable
    ? await coverWall(
      buffers.get(orderedIds[0]!)!, focals.get(orderedIds[0]!) ?? CENTRE,
      geometry.get(orderedIds[0]!)?.floorY ?? null, geometry.get(orderedIds[0]!)?.subjects ?? [],
    )
    : null;
  if (genSeed) {
    const src = buffers.get(genSeed)!;
    const g = geometry.get(genSeed);
    const pinned = fitToFloor({ w: src.w, h: src.h, floorY: g?.floorY ?? null }, floorLinePct, canvasH);
    const fit = pinned.scaleUp <= MAX_FLOOR_SCALE
      ? fillToHeight({ w: src.w, h: src.h, floorY: g?.floorY ?? null, subjects: g?.subjects ?? null }, floorLinePct, canvasH)
      : fitToFloor({ w: src.w, h: src.h, floorY: null }, null, canvasH);
    let buf = await sharp(src.buf, { failOn: "none" }).resize({ height: fit.height }).png().toBuffer();
    if (fit.height > canvasH) buf = await sharp(buf).extract({ left: 0, top: -fit.top, width: fit.width, height: canvasH }).png().toBuffer();
    const w = Math.min(fit.width, targetW);
    if (w < fit.width) buf = await sharp(buf).extract({ left: Math.round((fit.width - w) / 2), top: 0, width: w, height: canvasH }).png().toBuffer();
    const x0 = Math.max(0, Math.round((targetW - w) / 2));
    const take = Math.max(2, Math.round(canvasH * 0.03));
    if (x0 > 0) {
      segments.push({ input: await gapPaint(buf, { left: 0, width: take }, { width: x0, height: canvasH }, "left"), left: 0 });
      voids.push({ from: 0, to: x0 });
    }
    segments.push({ input: buf, left: x0 });
    if (x0 + w < targetW) {
      segments.push({ input: await gapPaint(buf, { left: w - take, width: take }, { width: targetW - x0 - w, height: canvasH }, "right"), left: x0 + w });
      voids.push({ from: x0 + w, to: targetW });
    }
    for (const b of g?.subjects ?? []) objects.push({ a: x0 + Math.min(b.x0, b.x1) * w, b: x0 + Math.max(b.x0, b.x1) * w });
    anchor = { from: x0, to: x0 + w };
    tiles = 1;
    shownIds = [genSeed];
  } else if (covered) {
    segments.push({ input: covered.buf, left: 0 });
    objects.push(...covered.objects);
    voids.push(...covered.voids);
    tiles = 1;
  } else {
    // A flat lay cannot stand in the band: a design whose measured objects
    // have no floor under them (standsInBand) is dropped from the run — the
    // remaining designs tile its share — rather than laid sideways-looking
    // next to appliances standing on the store's line (Narol wall 1,
    // 6 October 2026). If most designs fail the test, the floor is not the
    // wall's language and the original chain composes as a plain height fit
    // (standingOrAll; EBD Gurgaon, 25 October 2026).
    const standing = standingOrAll(orderedIds, (id) => geometry.get(id));
    // And one visual language per band: a chain that mixes continuous scenes
    // with one-object-per-panel blocks keeps the blocks (sameLanguage) — the
    // two languages butted together read as two different wallpapers
    // (Narol wall 5, 6 October 2026).
    const spoken = sameLanguage(standing.length > 0 ? standing : orderedIds, (id) => geometry.get(id)?.style);
    const spokenIds = spoken.length > 0 ? spoken : orderedIds;
    // And a design that cannot meet the store's floor line without being
    // enlarged past MAX_FLOOR_SCALE gives its place to those that can.
    const holds = spokenIds.filter((id) => {
      const src = buffers.get(id)!;
      const g = geometry.get(id);
      const d = { w: src.w, h: src.h, floorY: g?.floorY ?? null, subjects: g?.subjects ?? null };
      return holdsFloorLine(d, floorLinePct, canvasH) && tipsStayInFrame(d, floorLinePct, canvasH);
    });
    const heldIds = holds.length > 0 ? holds : spokenIds;
    // And appliances in one line: a chain that mixes stacked designs (a
    // grid, a TV on a cabinet) with designs in a row keeps the row
    // (oneArrangement; Nelamangala walls 4 and 5, 14 October 2026).
    const bandIds = oneArrangement(heldIds, (id) => arrangementOf(geometry.get(id)));
    // MULTI-DESIGN WALL — a BAND that adds each design AHEAD of the last
    // (Roheena's rule, 15 Sep 2026), the same tiling the interactive band
    // composer uses so the two pipelines build identical masters.
    //
    // Every design is fitted to the band by HEIGHT and laid at its NATURAL
    // width, top-aligned to the band (`top: 0`). Because these creatives share
    // a bottom-platform composition, equal heights make the floor line meet at
    // every join, and natural widths keep every appliance at its true size —
    // nothing is scaled to a panel, so nothing is squashed or blown up. Designs
    // follow one another A B C A B C … until the run is full; only the LAST
    // copy is cropped, at the band's far edge (a corner), never mid-wall.
    //
    // (This replaces the per-panel / uniform-scale layouts that squashed a
    // design to fit a fixed panel and put a seam through an appliance mid-wall.)
    // Each design is fitted so its FLOOR lands on the store's floor line
    // (band-geometry.ts fitToFloor): scaled to the smallest height that still
    // covers the band with the floor pinned, then the overflow cropped off the
    // top or bottom. A design with no floor is a plain height fit, as before.
    const resized = new Map<string, { buf: Buffer; w: number }>();
    for (const [id, src] of buffers) {
      // As big as the wall: the tallest appliance reaches just under the top,
      // the floor stays on the store's line (fillToHeight).
      const g = geometry.get(id);
      const pinned = fitToFloor({ w: src.w, h: src.h, floorY: g?.floorY ?? null }, floorLinePct, canvasH);
      const fit = pinned.scaleUp <= MAX_FLOOR_SCALE
        ? fillToHeight({ w: src.w, h: src.h, floorY: g?.floorY ?? null, subjects: g?.subjects ?? null }, floorLinePct, canvasH)
        : fitToFloor({ w: src.w, h: src.h, floorY: null }, null, canvasH);
      let buf = await sharp(src.buf, { failOn: "none" }).resize({ height: fit.height }).png().toBuffer();
      if (fit.height > canvasH) {
        buf = await sharp(buf).extract({ left: 0, top: -fit.top, width: fit.width, height: canvasH }).png().toBuffer();
      }
      resized.set(id, { buf, w: fit.width });
    }
    const boundsCache = new Map<string, number[]>();
    const boundariesOf = async (id: string, r: { buf: Buffer; w: number }) => {
      const hit = boundsCache.get(id);
      if (hit) return hit;
      const b = await stripBoundaries(r.buf, r.w);
      boundsCache.set(id, b);
      return b;
    };
    // The old end: cut in the gap before the next appliance and paint the
    // rest from that gap. Kept only for a chain with no panels to end on.
    const legacyTile = async (): Promise<number> => {
    let x = 0;
      let guard = 0;
      while (x < targetW && guard < MAX_TILES) {
        const id = bandIds[guard % bandIds.length]!;
        const r = resized.get(id)!;
        const visibleW = Math.min(r.w, targetW - x);
        if (visibleW < r.w) {
          // The run ends mid-design. Cut in the background gap before the next
          // appliance (never through one) and paint what is given up from that
          // gap, mirrored, so the band ends on a colour patch — Roheena's
          // "move the blue line on the right so that can get cut off".
          // Paint never covers more than a small share of the band. When ending
          // this copy in its gap would leave more than that, the copy ends at the
          // gap and the NEXT design carries on from there instead.
          const fillCap = Math.max(mmPx(250), Math.round(targetW * 0.12));
          const subjects = geometry.get(id)?.subjects ?? [];
          const open = safeCut(visibleW, r.w, subjects, { maxGiveUp: 1 });
          if (open.movedForSubject && open.fill > fillCap && bandIds.length > 1 && open.cutX > r.w * 0.05) {
            cutsMoved++;
            segments.push({ input: await sharp(r.buf).extract({ left: 0, top: 0, width: open.cutX, height: canvasH }).png().toBuffer(), left: x });
            placeObjects(subjects, r.w, x, open.cutX);
            x += open.cutX;
            guard++;
            continue;
          }
          const pull = Math.min(Math.max(mmPx(450), Math.round(r.w * 0.08)), Math.round(visibleW * 0.3));
          const cut = cutOnPatch(visibleW, r.w, subjects, await boundariesOf(id, r), pull, { maxFill: fillCap });
          const kept = await sharp(r.buf).extract({ left: 0, top: 0, width: cut.cutX, height: canvasH }).png().toBuffer();
          segments.push({ input: kept, left: x });
          placeObjects(subjects, r.w, x, cut.cutX);
          if (cut.fill > 0) {
            if (cut.movedForSubject || cut.snapped) cutsMoved++;
            const gapW = Math.max(1, cut.cutX - cut.gapStart);
            // The gap's colour, carried on as one smooth gradient (gapPaint):
            // the patch continues, floor shading and all. Mirrored slabs of the
            // gap read as a kaleidoscope on a wide fill (Narol wall 4), and a
            // colour per pixel row as horizontal streaks (wall 1, 7 Oct 2026).
            const fillW = Math.max(1, visibleW - cut.cutX);
            const paint = await gapPaint(r.buf, { left: cut.gapStart, width: gapW }, { width: fillW, height: canvasH }, "right");
            segments.push({ input: paint, left: x + cut.cutX });
            voids.push({ from: x + cut.cutX, to: x + cut.cutX + fillW });
          }
        } else {
          segments.push({ input: r.buf, left: x });
          placeObjects(geometry.get(id)?.subjects ?? [], r.w, x, r.w);
        }
        x += visibleW;
        guard++;
      }
      return guard;
    };
    // THE RUN ENDS ON A WHOLE PANEL (Roheena, 14 October 2026, Nelamangala
    // walls 2, 7 and 8: "there is a yellow patch, there should be an
    // appliance"; a fridge cut at the edge; an empty magenta band). Whole
    // copies are laid while they fit; the rest of the run is filled with the
    // longest piece of any chain design that ends on a panel holding an
    // appliance (panelEnds); and the few centimetres still left over are
    // shared out across every panel join on the wall (panelJoins,
    // spreadSlack) — each panel a little wider, half from each side, in its
    // own colour — so no appliance is cut and no panel stands empty. Only a
    // chain with no panels to end on (a continuous scene) falls back to the
    // old cut-and-paint end.
    type Piece = { id: string; r: { buf: Buffer; w: number }; keep: number; objs: { a: number; b: number }[]; joins: number[] };
    const objsOf = (id: string, w: number) => (geometry.get(id)?.subjects ?? [])
      .map((b) => ({ a: Math.min(b.x0, b.x1) * w, b: Math.max(b.x0, b.x1) * w }));
    const pieces: Piece[] = [];
    const pieceOf = async (id: string, keep: number): Promise<Piece> => {
      const r = resized.get(id)!;
      const objs = objsOf(id, r.w);
      const m = Math.round(r.w * 0.01);
      return { id, r, keep, objs, joins: panelJoins(keep, objs, await boundariesOf(id, r), m) };
    };
    // Where each design may end (panelEnds). A whole copy is laid only up to
    // its LAST panel holding an appliance: a design whose own right edge is
    // an empty colour strip (ZYVS-44H2UU's green, Nelamangala walls 5 and
    // 14, 14 October 2026) would otherwise carry that strip onto the wall as
    // a plain band, and the model is never asked to complete it.
    const designs: { id: string; ends: number[] }[] = [];
    for (const id of bandIds) {
      const r = resized.get(id)!;
      designs.push({ id, ends: panelEnds(r.w, objsOf(id, r.w), await boundariesOf(id, r), Math.round(r.w * 0.01)) });
    }
    const fullOf = (id: string) => {
      const r = resized.get(id)!;
      const ends = designs.find((d) => d.id === id)?.ends ?? [];
      const end = ends.length ? Math.max(...ends) : r.w;
      // A design whose last panel holds no appliance and whose colour change
      // the strip reader misses (ZYVS-44H2UU's green edge: walls 5 and 14,
      // 14 October 2026) still ends a hand's width past its last appliance;
      // what is left of the wall is completed with a new one.
      const objs = objsOf(id, r.w);
      const lastObj = objs.length ? Math.max(...objs.map((o) => o.b)) : end;
      return Math.round(Math.min(end, lastObj + canvasH * 0.12));
    };
    // No piece anywhere in the run may reach past that cap either: the
    // end-of-run fill chose ZYVS-44H2UU's full width, green strip and all,
    // as its closest fit (walls 5 and 14, 14 October 2026, twice).
    for (const d of designs) {
      const cap = fullOf(d.id);
      d.ends = [...new Set([...d.ends.filter((e) => e < cap), cap])].sort((p, q) => p - q);
    }
    let x = 0;
    let guard = 0;
    // Each design is laid whole at most ONCE: a second copy is a repeat on
    // the same wall (Roheena, 14 October 2026: "again repeated toasters").
    while (guard < Math.min(MAX_TILES, bandIds.length)) {
      const id = bandIds[guard]!;
      const full = fullOf(id);
      if (x + full > targetW) break;
      pieces.push(await pieceOf(id, full));
      if (full < resized.get(id)!.w) cutsMoved++;
      x += full;
      guard++;
    }
    // The rest of the run: the closest fit of whole panels from any design
    // in the chain (bestFill), trying again with the last one or two whole
    // copies taken back off — a different mix often lands far closer to the
    // wall's width (Nelamangala wall 4, 14 October 2026: no single panel
    // fitted, and the old cut sliced a blender at the edge).
    {
      let choice: { back: number; pieces: { id: string; end: number }[]; slack: number } | null = null;
      for (let back = 0; back <= Math.min(2, pieces.length); back++) {
        const kept = pieces.slice(0, pieces.length - back);
        const used = kept.reduce((s2, p) => s2 + p.keep, 0);
        const fill = bestFill(targetW - used, designs, kept.length ? kept[kept.length - 1]!.id : null, 3, kept.map((p) => p.id));
        if (!choice || fill.slack < choice.slack) choice = { back, ...fill };
        if (fill.slack === 0) break;
      }
      if (choice) {
        if (choice.back) pieces.splice(pieces.length - choice.back, choice.back);
        for (const pc of choice.pieces) {
          pieces.push(await pieceOf(pc.id, pc.end));
          if (pc.end < resized.get(pc.id)!.w) cutsMoved++;
        }
        x = pieces.reduce((s2, p) => s2 + p.keep, 0);
      }
    }
    const slack = targetW - x;
    // The run falls a little short: enlarge the whole run by one factor (up
    // to 15%), crop the overflow off the top with the floor line pinned, and
    // every panel keeps its proportions — no blank patch anywhere.
    const scaled = pieces.length > 0 && slack > 0 ? scaledWidths(pieces.map((p) => p.keep), targetW, maxRunScale(floorLinePct)) : null;
    if (scaled) {
      const scale = targetW / x;
      const scaledH = Math.round(canvasH * scale);
      const floorAt = floorLinePct ?? 0.85;
      const top = Math.max(0, Math.min(scaledH - canvasH, Math.round(floorAt * canvasH * (scale - 1))));
      let X = 0;
      for (let pi = 0; pi < pieces.length; pi++) {
        const pc = pieces[pi]!;
        const w = scaled[pi]!;
        const buf = await sharp(pc.r.buf).extract({ left: 0, top: 0, width: pc.keep, height: canvasH })
          .resize({ width: w, height: scaledH, fit: "fill" })
          .extract({ left: 0, top, width: w, height: canvasH }).png().toBuffer();
        segments.push({ input: buf, left: X });
        for (const o of pc.objs) if (o.a < pc.keep) objects.push({ a: X + o.a * scale, b: X + Math.min(o.b, pc.keep) * scale });
        X += w;
      }
      if (slack > 0) cutsMoved++;
      tiles = pieces.length;
      shownIds = bandIds;
    } else {
    // The run falls short by more than the scale can absorb (Nelamangala
    // wall 4, 14 October 2026: a 30 cm-a-join cap sent the run back to the
    // old cut and sliced a blender; walls 7, 8 and 10: the slack spread
    // across the joins stood as blank patches). The pieces are laid as they
    // are, the rest of the wall is painted from the last panel's end as an
    // UNDERCOAT, and the image model completes that patch with one more
    // whole appliance once the band is assembled (band-complete.ts; Roheena,
    // 14 October 2026: "the appliance needs to be completed"). Never a
    // widened empty panel, never a sliced one. Only a chain with no panel to
    // end on at all takes the old cut-and-paint end — completed the same way.
    // With no design left that is not already on the wall, completion is the
    // only answer that does not repeat one, however wide the patch.
    if (pieces.length > 0 && slack >= 0 && (slack <= targetW / 3 || bandIds.every((id) => pieces.some((p) => p.id === id)))) {
      // A patch narrower than ~45% of the band height has no room for an
      // appliance the size of its neighbours (Nelamangala wall 4, 14 October
      // 2026: the model drew a toaster a third the size of the grinder beside
      // it). The last piece gives back its final panel so the patch can hold
      // a whole one at full size.
      const want = canvasH * 0.45;
      if (slack > 0 && slack < want) {
        const last = pieces[pieces.length - 1]!;
        const jn = [...last.joins].reverse().find((j) => {
          const room = targetW - (x - last.keep + j);
          return room >= want && room <= targetW / 3 && j > last.r.w * 0.2;
        });
        if (jn != null) {
          pieces[pieces.length - 1] = await pieceOf(last.id, jn);
          x = x - last.keep + jn;
          cutsMoved++;
        }
      }
      const room = targetW - x;
      let X = 0;
      for (const pc of pieces) {
        segments.push({ input: await sharp(pc.r.buf).extract({ left: 0, top: 0, width: pc.keep, height: canvasH }).png().toBuffer(), left: X });
        for (const o of pc.objs) if (o.a < pc.keep) objects.push({ a: X + o.a, b: X + Math.min(o.b, pc.keep) });
        X += pc.keep;
      }
      if (room > 0) {
        const last = pieces[pieces.length - 1]!;
        const take = Math.max(2, Math.round(canvasH * 0.03));
        const at = Math.max(0, Math.min(last.keep, last.r.w) - take - 2);
        segments.push({
          input: await gapPaint(last.r.buf, { left: at, width: Math.min(take, last.r.w - at) }, { width: room, height: canvasH }, "right"),
          left: X,
        });
        voids.push({ from: X, to: targetW });
        cutsMoved++;
      }
      tiles = pieces.length;
    } else {
      segments.length = 0;
      objects.length = 0;
      tiles = await legacyTile();
    }
    shownIds = bandIds;
    }
  }

  let composite = await sharp({
    create: { width: targetW, height: canvasH, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).composite(segments.map((s) => ({ input: s.input, left: s.left, top: 0 }))).png().toBuffer();

  // No sliver of a neighbouring panel survives anywhere on the band: read the
  // finished band in horizontal strips (a cream block along the floor never
  // moves a whole-column average), and paint every strip narrower than
  // 15 cm that sits between colour changes in open background with the panel
  // beside it (band-geometry.ts sliverRuns; Nelamangala, 13 October 2026).
  // Tiled bands only: a wall covered by one picture (the Bengaluru city
  // sketches) has no join in it — the first pass painted a grey bar down the
  // edge of walls 1 and 15. NOT keyed on composition_style: "scene" designs
  // still sit on colour panels, and skipping them brought the strips back on
  // walls 12, 13 and 14.
  if (!covered) {
    const ROWS = 8;
    const stripW = Math.min(targetW, 4096);
    const { data, info } = await sharp(composite, { failOn: "none" })
      .resize({ width: stripW, height: ROWS, fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const scale = targetW / info.width;
    const win = Math.max(2, Math.round(info.width * 0.002));
    const bounds: number[] = [];
    for (let row = 0; row < info.height; row++) {
      const cols: ColumnRGB[] = [];
      for (let i = 0; i < info.width; i++) {
        const o = (row * info.width + i) * 3;
        cols.push([data[o]!, data[o + 1]!, data[o + 2]!]);
      }
      for (const b of colourBoundaries(cols, win)) bounds.push(Math.round(b * scale));
    }
    const margin = Math.round(canvasH * 0.01);
    const seams = [0, targetW, ...segments.map((sg) => sg.left)];
    const slivers = sliverRuns(bounds, clearSpans(objects.map((o) => ({ a: o.a - margin, b: o.b + margin })), targetW), targetW, mmPx(150), seams);
    if (slivers.length) {
      const layers: { input: Buffer; left: number; top: number }[] = [];
      for (const s of slivers) {
        const slab = await gapPaint(composite, { left: s.gap.from, width: s.gap.to - s.gap.from }, { width: s.to - s.from, height: canvasH },
          s.side === "left" ? "right" : "left");
        layers.push({ input: slab, left: s.from, top: 0 });
      }
      composite = await sharp(composite).composite(layers).png().toBuffer();
      cutsMoved += slivers.length;
    }
  }

  // THE COMPLETION (Roheena, 14 October 2026: "the appliance needs to be
  // completed … Astra can always complete the appliance with its image
  // generation tool"). Every patch painted above — a run's end, an object a
  // one-design wall's edge would have sliced — is handed to the image model
  // as a masked edit of the band around it and comes back as one more panel
  // with a whole appliance. The paint stays where the model cannot be
  // reached, and the wall says so (`notes`). After the sliver pass, which
  // reads only the measured objects and must never paint over a drawn one.
  let completed = 0;
  const incomplete: string[] = [];
  await progress(`band assembled, ${voids.length} patch(es) to complete`);
  if (voids.length) {
    const done = await completeVoids(composite, targetW, canvasH, voids, {
      openaiKey: opts.openaiKey ?? null,
      model: process.env.OPENAI_IMAGE_MODEL || undefined,
      // The band composes in the container's own queue now (never a Worker
      // wait), so a whole wall may take as many panels as it needs.
      maxCalls: anchor ? 10 : 4,
      timeoutMs: anchor ? 100_000 : 80_000,
      anchor,
      // Every completed patch is a new, different appliance at the
      // neighbours' height and straight-on angle — never miniatures or a copy
      // (Nelamangala wall 10, 14 October 2026: three small blenders).
      distinct: true,
      floorLinePct,
      describe: opts.describe?.trim()
        || "a row of retro home appliances sketched in ink with pencil hatching, each standing on one shared floor line in front of flat solid colour panels",
    });
    composite = done.buf as typeof composite;
    completed = done.completed;
    notes.push(...done.errors);
    incomplete.push(...done.errors);
    await progress(`completion done (${done.completed} drawn, ${done.errors.length} failed)`);
  }
  await progress("uploading");
  const pieces = await saveBand(composite, shownIds);
  if ("error" in pieces) return pieces;
  return { pieces, tiles, passes: Math.round((tiles / shownIds.length) * 10) / 10, floorLinePct, cutsMoved, completed, incomplete, notes, rulesVersion: BAND_RULES_VERSION };
}
