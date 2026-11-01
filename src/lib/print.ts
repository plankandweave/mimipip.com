import { addTextToImage } from "./text-overlay-image";
import sharp from "sharp";
import { supabase } from "./supabase";
import { printPlan, seamlessPlan, panelWidthsCm, rollCmFromMm, type CropData } from "./visualizer";
import { fetchPrintRules } from "./print-rules";
import { toUploadBody } from "./storage-body";
import { docStorageClient } from "./private-doc";
import { ensurePrintMaster, designHandleForItem } from "./print-master";

const MM_PER_CM = 10;
// Fallback roll width if the material's roll_width_mm isn't set. The printer
// runs 4 ft media with 47" printable width (matches the Mimaki print engine's
// MAX_MEDIA_CM) — panel plans must mirror the physical machine.
const DEFAULT_ROLL_MM = 1194;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

export type Tile = {
  index: number;
  widthCm: number;
  heightCm: number;
  srcPx: { x: number; y: number; w: number; h: number };
};

export type PrintResult = {
  printFileUrl: string;
  tiles: Tile[];
  effectiveDpi: number;
  widthCm: number;
  heightCm: number;
};

type Master = { master: Buffer; rw: number; rh: number; effectiveDpi: number };

/**
 * The original behaviour: the exact window the customer framed, extracted at
 * the source's native resolution and stretched to the wall by the printer.
 *
 * The window comes from `plan.rect` — fractions of the image — rather than
 * `plan.pxRect`, which is pre-multiplied by the dimensions of the image the
 * CUSTOMER framed against (the ~2048 px web flat). Working in fractions is what
 * lets the same crop be lifted from a print master seven times larger: the
 * customer framed a REGION, not a pixel range.
 */
async function buildCropMaster(crop: CropData, src: Buffer, sw: number, sh: number): Promise<Master> {
  const plan = printPlan(crop);
  const left = clamp(plan.rect.x * sw, 0, sw - 1);
  const top = clamp(plan.rect.y * sh, 0, sh - 1);
  const rw = clamp(plan.rect.w * sw, 1, sw - left);
  const rh = clamp(plan.rect.h * sh, 1, sh - top);
  // Measured on the pixels actually extracted, so a master's higher resolution
  // shows up here instead of the web flat's DPI being reported for a file that
  // is no longer the source.
  const effectiveDpi = Math.round(
    Math.min(
      plan.wallWidthIn > 0 ? rw / plan.wallWidthIn : 0,
      plan.wallHeightIn > 0 ? rh / plan.wallHeightIn : 0,
    ),
  );

  // Mirror the printed master to match a flipped preview (.flop = horizontal,
  // .flip = vertical). Applied to the whole extracted window before tiling, so
  // panel 1 is still the left of the final printed image.
  // limitInputPixels: a print master is ~200 MP, well past sharp's default
  // 268 MP guard once a large panorama is involved.
  let pipe = sharp(src, { failOn: "none", limitInputPixels: false })
    .extract({ left, top, width: rw, height: rh });
  if (crop.flipH) pipe = pipe.flop();
  if (crop.flipV) pipe = pipe.flip();
  return { master: await pipe.png().toBuffer(), rw, rh, effectiveDpi };
}

/**
 * Seamless: repeat the whole tile across the wall at its fixed physical size.
 *
 * The tile is composited at its NATIVE pixel size and never resampled — the
 * master's pixel dimensions are derived from how many tiles fit, so one tile on
 * the wall is exactly one tile's pixels. Resizing the tile to hit a round DPI
 * would soften every repeat across the whole wall for no gain, and would also
 * break the seam: a resampled edge no longer matches the opposite edge it was
 * drawn to butt against.
 *
 * Flip is deliberately ignored here. Mirroring a tile breaks the very seam that
 * makes it seamless, so the visualiser hides the control for these designs and
 * the print master must not honour a stale flag from before the design was
 * marked as a tile.
 */
async function buildSeamlessMaster(crop: CropData, src: Buffer): Promise<Master> {
  const plan = seamlessPlan(crop);
  const tileW = crop.sourceW!;
  const tileH = crop.sourceH!;
  // Round OUT, never in: a master short of the wall would print a bald strip at
  // the right edge or the ceiling. The overshoot is trimmed on site, exactly as
  // a paperhanger trims a physical roll.
  const rw = Math.max(tileW, Math.ceil(plan.colsExact * tileW));
  const rh = Math.max(tileH, Math.ceil(plan.rowsExact * tileH));

  // The tile itself must be a clean, un-alpha'd RGB copy at native size —
  // sharp's `tile: true` repeats the composite input from the top-left across
  // the whole canvas, which is precisely a wallpaper repeat.
  const tile = await sharp(src, { failOn: "none" }).png().toBuffer();
  const master = await sharp({
    create: { width: rw, height: rh, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([{ input: tile, tile: true, blend: "over" }])
    .png()
    .toBuffer();

  return { master, rw, rh, effectiveDpi: plan.effectiveDpi };
}

/**
 * Turn a captured order item's crop into a print-ready master (the exact
 * cropped region of the flat source at native resolution) plus a tiling plan
 * for the material's roll width, and mark the print_job 'generated'. The final
 * drop into RasterLink's hot folder is stubbed until the Windows/RIP machine
 * is confirmed — everything up to that point is automatic (no human step).
 */
export async function generatePrintFile(params: {
  orderItemId: string;
  crop: CropData;
  widthCm: number;
  heightCm: number;
  materialSlug: string;
}): Promise<PrintResult> {
  const { orderItemId, crop, widthCm, heightCm, materialSlug } = params;
  if (crop?.concept?.requiresPreparation && !crop.imageUrl) throw new Error("Concept artwork preparation required: create and approve a flat print source from the saved room reference before generating print files.");
  if (!crop?.imageUrl) throw new Error("missing crop_data");

  // order_items is server-only under RLS, so read the roll width / ICC / hot
  // folder from the (anon-readable) materials table instead.
  const { data: material } = await supabase
    .from("materials")
    .select("roll_width_mm, icc_profile, rip_hotfolder")
    .eq("slug", materialSlug)
    .maybeSingle();

  // A seamless design is REPEATED at its fixed physical size; every other
  // design is one composition and the customer's crop window is stretched to
  // the wall. These produce a master the same way from here on — a PNG plus its
  // pixel dimensions — so the panel-strip plan below is identical for both.
  const seamlessSpec = crop.seamless?.repeatWidthCm ? crop.seamless : null;

  // Prefer the design's PRINT MASTER over the web flat.
  //
  // crop.imageUrl is the ~2048 px file the product page shows — roughly 21 DPI
  // once stretched over an 8 ft wall, which is why prints came back soft. The
  // master is the high-resolution tier, built on demand the first time a design
  // is ordered and kept for ever after (see lib/print-master.ts).
  //
  // Seamless designs are deliberately excluded: their tiles are composited at
  // NATIVE pixel size to keep the repeat exact (buildSeamlessMaster never
  // resamples), so a master of different dimensions would silently change the
  // physical repeat size and break every seam.
  let sourceUrl = crop.imageUrl;
  let usedMaster = false;
  // A signed Supabase URL carries its auth in the query string; the engine's
  // /master/file does not, so the header travels with the URL that needs it.
  let sourceHeaders: Record<string, string> | undefined;
  if (!seamlessSpec) {
    try {
      const handle = await designHandleForItem(orderItemId);
      const master = handle ? await ensurePrintMaster(handle) : null;
      if (master) {
        sourceUrl = master.url;
        usedMaster = true;
        if (master.engine) {
          sourceHeaders = { "X-Service-Key": process.env.MIMAKI_SERVICE_KEY! };
        }
      }
    } catch (e) {
      // A master is an upgrade, never a precondition. Any failure here prints
      // exactly what this pipeline printed before masters existed.
      console.error(`print master lookup failed for item ${orderItemId}:`, e);
    }
  }

  let resp = await fetch(sourceUrl, sourceHeaders ? { headers: sourceHeaders } : undefined);
  if (!resp.ok && usedMaster) {
    // The master was recorded as ready but is not fetchable right now — the
    // engine could be mid-deploy, or Drive could be unreachable for a file the
    // volume has evicted. A master is an upgrade, never a precondition, so fall
    // back to the web flat rather than failing an order the customer has paid
    // for. Loudly, because a 'ready' master that cannot be served is a real
    // fault worth fixing, just not at this customer's expense.
    console.error(
      `print master unfetchable (${resp.status}) for item ${orderItemId} — printing from the web flat`,
    );
    usedMaster = false;
    sourceUrl = crop.imageUrl;
    resp = await fetch(sourceUrl);
  }
  if (!resp.ok) throw new Error(`source fetch ${resp.status}`);
  const src = Buffer.from(await resp.arrayBuffer());
  const meta = await sharp(src, { failOn: "none", limitInputPixels: false }).metadata();
  // Measure the buffer actually fetched, preferring it over crop.sourceW/H.
  // Those describe the web flat the customer framed against, so trusting them
  // for a master would crop a 2048-px window out of a 14400-px file — printing
  // the top-left corner of the artwork blown up across the whole wall.
  const sw = meta.width || (usedMaster ? 0 : crop.sourceW || 0);
  const sh = meta.height || (usedMaster ? 0 : crop.sourceH || 0);
  if (!sw || !sh) throw new Error("unknown source dimensions");
  const built = seamlessSpec
    ? await buildSeamlessMaster({ ...crop, sourceW: sw, sourceH: sh }, src)
    : await buildCropMaster({ ...crop, sourceW: sw, sourceH: sh }, src, sw, sh);
  const { rw, rh, effectiveDpi } = built;
  const master = await addTextToImage(built.master, crop);

  // Tiling plan across the material roll width: an EQUAL division of the wall
  // into full-roll-width strips, capped by the live OS max-strip rule — this
  // mirrors how the Mimaki physically splits the job, so the piece lines on
  // customer documents line up with the panels off the machine.
  const rules = await fetchPrintRules();
  const rollCm = rollCmFromMm(material?.roll_width_mm || DEFAULT_ROLL_MM, rules.maxPanelCm);
  // Large-opening exclusion: when the crop carries an openingsPlan snapshot,
  // its panels ARE the tile plan — seams pinned to the opening's edges, the
  // panel over a door shortened to the strip above it, full-height panels
  // dropped. The snapshot is bill-time truth (the customer paid for exactly
  // this printed area), so it is used verbatim, never re-derived from live
  // rules. Skipped positions keep their index so P-numbers match production.
  const planPanels = crop.openingsPlan?.panels?.length ? crop.openingsPlan.panels : null;
  const tileWidths = planPanels ? planPanels.map((p) => p.widthCm) : panelWidthsCm(widthCm, rollCm, rules.overlapCm);
  const nTiles = tileWidths.length;
  const tiles: Tile[] = [];
  let accCm = 0; // wall cm consumed so far
  let prevEdgePx = 0; // pixel x of the previous panel's right edge
  for (let i = 0; i < nTiles; i++) {
    const isLast = i === nTiles - 1;
    const tileWcm = isLast ? widthCm - accCm : tileWidths[i];
    accCm += tileWcm;
    // Exact pixel boundary from the cumulative cm fraction; last panel takes
    // the remainder so the tiles cover the master with no gap or overlap.
    const edgePx = isLast ? rw : clamp((accCm / widthCm) * rw, prevEdgePx + 1, rw);
    const pxX = prevEdgePx;
    const pxW = Math.max(1, edgePx - pxX);
    prevEdgePx = edgePx;
    const printHcm = planPanels ? planPanels[i].printHeightCm : heightCm;
    if (planPanels && printHcm <= 0) continue; // skipped — full-height opening, not printed, not billed
    tiles.push({
      index: i + 1,
      widthCm: Math.round(tileWcm * 100) / 100,
      heightCm: Math.round(printHcm * 100) / 100,
      srcPx: {
        x: pxX,
        y: 0, // the strip above an opening starts at the wall top
        w: pxW,
        h: planPanels ? Math.max(1, clamp((printHcm / heightCm) * rh, 1, rh)) : rh,
      },
    });
  }

  const path = `${orderItemId}.png`;
  // Service role: the unconditional anon INSERT policy on this bucket is gone,
  // so an anon write would now be refused. The bucket still serves READS
  // publicly — the RIP path reads this URL and that has not been re-pointed.
  const printStore = docStorageClient();
  const up = await printStore.storage
    .from("print-files")
    .upload(path, toUploadBody(master, "image/png"), { contentType: "image/png", upsert: true });
  if (up.error) throw up.error;
  const { data: pub } = printStore.storage.from("print-files").getPublicUrl(path);
  const printFileUrl = pub.publicUrl;

  await supabase.rpc("mark_print_job_generated", {
    p_order_item_id: orderItemId,
    p_url: printFileUrl,
    p_tiles: tiles,
    p_icc: material?.icc_profile ?? null,
    p_hotfolder: material?.rip_hotfolder ?? null,
  });

  // NOTE: hand-off to RasterLink's hot folder is intentionally stubbed here —
  // it needs the Windows/RIP machine + hot-folder path (not yet provisioned).
  // At that point: copy `master`/tiles into `material.rip_hotfolder` and set
  // the print_job status to 'sent_to_rip'.

  return { printFileUrl, tiles, effectiveDpi, widthCm, heightCm };
}
