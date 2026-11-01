import { addTextToImage } from "./text-overlay-image";
import { PDFDocument, StandardFonts, rgb, type PDFImage } from "pdf-lib";
import sharp from "sharp";
import { supabase } from "./supabase";
import { printPlan, seamlessPlan, panelWidthsCm, panelArrangementLabel, rollCmFromMm, type CropData } from "./visualizer";
import { fetchPrintRules, type PrintRules } from "./print-rules";
import { CM_PER_FOOT, areaSqFt, MIN_WALLPAPER_SQFT } from "./pricing";
import { BORDER_MATERIAL_SLUG } from "./product-category";
import { toUploadBody } from "./storage-body";
import { readDoc, docStorageClient } from "./private-doc";

type Args = {
  orderId: string;
  orderNumber: number;
  productHandle: string;
  materialSlug: string;
  widthCm: number;
  heightCm: number;
  areaSqft: number;
  quantity: number;
  lineTotal: number;
  crop: CropData;
  roomComposite: string | null;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fmtNum = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

// Panel split + labels (panelWidthsCm / panelArrangementLabel) live in
// visualizer.ts and read the material's roll width — shared with the
// composition-approval UI, so what the customer signs off on matches what's
// printed on this document (and the actual print tiles in print.ts).

// Installation-instruction templates, keyed by the material's install_type.
// Current custom-print materials are paste-the-wall; pre-sized "renter
// edition" SKUs are self-adhesive and must say SELF-STICKING explicitly.
type InstallType = "paste" | "self_adhesive";

const INSTALL_TEMPLATES: Record<InstallType, { heading: string; intro: string; steps: string[] }> = {
  paste: {
    heading: "HOW TO INSTALL — PASTE-THE-WALL",
    intro: "This wallpaper needs wallpaper adhesive (not included). Dotted lines above show where the pieces join.",
    steps: [
      "Prepare a smooth, clean, dry wall — fill cracks, sand, and prime freshly painted walls.",
      "Draw a light vertical plumb line one piece-width from the left corner (piece widths are listed above).",
      "Apply adhesive evenly to the wall, one piece-width at a time (paste the wall, not the paper).",
      "Hang piece P1 against the line and smooth from the centre outwards with a soft squeegee.",
      "Overlap the next piece on the printed seam allowance — the pattern matches automatically.",
      "Trim the excess at top and bottom with a sharp blade; wipe off any paste immediately.",
    ],
  },
  self_adhesive: {
    heading: "HOW TO INSTALL — SELF-STICKING",
    intro: "This is a SELF-STICKING wallpaper — no paste, no glue. Dotted lines above show where the pieces join.",
    steps: [
      "Clean the wall with a dry cloth and let it dry fully — dust is the enemy of adhesion.",
      "Peel 10–15 cm of the liner from the top of piece P1 and stick the top edge level.",
      "Peel the liner away gradually while smoothing downwards and outwards with a squeegee.",
      "Overlap the next piece on the printed seam allowance — the pattern matches automatically.",
      "Trim the excess at top and bottom with a sharp blade.",
      "Repositionable: if a piece goes crooked, peel it back gently and re-stick.",
    ],
  },
};

const asInstallType = (v: unknown): InstallType => (v === "self_adhesive" ? "self_adhesive" : "paste");

/** Extract the exact printed crop of the flat mural as a JPEG buffer. */
export async function renderCropImage(crop: CropData): Promise<Buffer | null> {
  if(!crop.imageUrl) return null;
  try {
    const resp = await fetch(crop.imageUrl);
    if (!resp.ok) throw new Error("Could not load the approved wallpaper image");
    const srcBuf = Buffer.from(await resp.arrayBuffer());
    const meta = await sharp(srcBuf, { failOn: "none" }).metadata();
    const sw = meta.width || 0, sh = meta.height || 0;
    if (!sw || !sh) throw new Error("Unknown wallpaper image dimensions");
    let image: Buffer;
    // Proofs use the same physical repeat size as production, at preview resolution.
    if (crop.seamless?.repeatWidthCm) {
      const plan = seamlessPlan({ ...crop, imageAspect: crop.imageAspect ?? sw / sh });
      const width = 1400, height = Math.max(1, Math.round(width * crop.wallHeightCm / crop.wallWidthCm));
      if (height > 14000) throw new Error("Wall proportions are too tall for a proof");
      const tw = Math.max(1, Math.round(width / plan.colsExact));
      const th = Math.max(1, Math.round(height / plan.rowsExact));
      const tile = await sharp(srcBuf).resize(tw, th).png().toBuffer();
      const visibleTile = await sharp(tile).extract({ left: 0, top: 0, width: Math.min(tw, width), height: Math.min(th, height) }).png().toBuffer();
      image = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
        .composite([{ input: visibleTile, tile: true, gravity: "northwest" }]).png().toBuffer();
    } else {
      const { rect } = printPlan({ ...crop, imageAspect: crop.imageAspect ?? sw / sh });
      const left = clamp(rect.x * sw, 0, sw - 1), top = clamp(rect.y * sh, 0, sh - 1);
      const width = clamp(rect.w * sw, 1, sw - left), height = clamp(rect.h * sh, 1, sh - top);
      let pipe = sharp(srcBuf, { failOn: "none" }).extract({ left, top, width, height });
      if (crop.flipH) pipe = pipe.flop();
      if (crop.flipV) pipe = pipe.flip();
      image = await pipe.resize({ width: 1400, withoutEnlargement: true }).png().toBuffer();
    }
    return await addTextToImage(image, crop);
  } catch (e) {
    if (crop.textOverlay || crop.personalisation?.childName) throw e;
    return null;
  }
}

export function dataUrlToJpeg(dataUrl: string): Promise<Buffer | null> {
  try {
    const b64 = dataUrl.split(",")[1];
    if (!b64) return Promise.resolve(null);
    return sharp(Buffer.from(b64, "base64"), { failOn: "none" })
      .resize({ width: 1400, withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer()
      .catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

/**
 * Build the "This is what you ordered." PDF (Zyvorah wordmark, the room
 * composite + the exact flat crop, and line-item dimensions), upload it to the
 * immutable order-copies bucket, attach it to the order, and return its URL.
 */
export async function buildOrderCopyPdf(a: Args): Promise<string> {
  const [{ data: prod }, { data: mat }] = await Promise.all([
    supabase.from("products").select("title, code").eq("handle", a.productHandle).maybeSingle(),
    supabase.from("materials").select("name, install_type, roll_width_mm").eq("slug", a.materialSlug).maybeSingle(),
  ]);
  const title = (prod as { title?: string } | null)?.title ?? a.productHandle;
  const code = (prod as { code?: string } | null)?.code ?? null;
  const materialName = (mat as { name?: string } | null)?.name ?? a.materialSlug;
  const installType = asInstallType((mat as { install_type?: string } | null)?.install_type);
  // Live production rules — the piece lines on this document must fall where
  // the machine actually cuts.
  const rules = await fetchPrintRules();
  const panelCm = rollCmFromMm((mat as { roll_width_mm?: number | null } | null)?.roll_width_mm, rules.maxPanelCm);

  const [cropBuf, roomBuf] = await Promise.all([
    renderCropImage(a.crop),
    a.roomComposite ? dataUrlToJpeg(a.roomComposite) : Promise.resolve(null),
  ]);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4 portrait, pt
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = page.getWidth();
  const M = 48;
  const contentW = W - M * 2;
  const ink = rgb(0.09, 0.09, 0.09);
  const soft = rgb(0.42, 0.42, 0.42);
  let y = page.getHeight() - M;

  const text = (
    s: string,
    x: number,
    yy: number,
    size: number,
    f = font,
    color = ink,
  ) => page.drawText(s, { x, y: yy, size, font: f, color });

  // Header — wordmark + title
  text("ZYVORAH", M, y - 18, 22, bold);
  text("Mural wallpaper & murals", M, y - 32, 8.5, font, soft);
  const dateStr = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  const oNum = `Order #${a.orderNumber}`;
  text(oNum, W - M - bold.widthOfTextAtSize(oNum, 11), y - 16, 11, bold);
  text(dateStr, W - M - font.widthOfTextAtSize(dateStr, 9), y - 30, 9, font, soft);
  y -= 52;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 26;

  text("This is what you ordered.", M, y, 17, bold);
  y -= 26;

  const embed = async (buf: Buffer): Promise<PDFImage | null> => {
    try {
      return await pdf.embedJpg(buf);
    } catch {
      try {
        return await pdf.embedPng(buf);
      } catch {
        return null;
      }
    }
  };

  // Fit an image into a cell of given width, capped height, centred; returns
  // the drawn rect so captions align and overlays (piece lines) can be drawn.
  const fitInCell = async (buf: Buffer, cellX: number, cellW: number, top: number, maxH: number) => {
    const img = await embed(buf);
    if (!img) return null;
    const d = img.scale(1);
    let w = cellW;
    let h = (w / d.width) * d.height;
    if (h > maxH) {
      h = maxH;
      w = (h / d.height) * d.width;
    }
    const x = cellX + (cellW - w) / 2;
    page.drawImage(img, { x, y: top - h, width: w, height: h });
    return { x, y: top - h, w, h };
  };

  // Dashed vertical lines where the physical pieces join, with P1..Pn
  // labels — so the customer (and the packer) can read the pieces off the
  // artwork. White-under-dark double stroke stays visible on any design.
  // With a large-opening exclusion the BILL-TIME snapshot (crop.openingsPlan)
  // is the piece plan — seams pinned to the opening's edges, short/skipped
  // panels — never a re-derivation from live rules: the customer paid against
  // these exact pieces.
  const openings = a.crop.openingsPlan?.panels?.length ? a.crop.openingsPlan : null;
  const drawPieceLines = (rect: { x: number; y: number; w: number; h: number }, widthCm: number) => {
    const widths = openings ? openings.panels.map((p) => p.widthCm) : panelWidthsCm(widthCm, panelCm, rules.overlapCm);
    const n = widths.length;
    if (openings) {
      // Door/opening boxes rising from the floor line, hatch-free but shaded,
      // plus a dashed line where a short panel stops — the customer sees why
      // a piece is short or absent before it arrives.
      for (const di of openings.qualifyingDoors) {
        const d = a.crop.doors?.[di];
        if (!d) continue;
        const ox = rect.x + (clamp(d.offsetCm, 0, widthCm) / widthCm) * rect.w;
        const ow = (clamp(d.widthCm, 0, widthCm - clamp(d.offsetCm, 0, widthCm)) / widthCm) * rect.w;
        const oh = Math.min(1, d.heightCm / a.heightCm) * rect.h;
        page.drawRectangle({ x: ox, y: rect.y, width: ow, height: oh, color: rgb(1, 1, 1), opacity: 0.55 });
        page.drawRectangle({ x: ox, y: rect.y, width: ow, height: oh, borderColor: rgb(0.12, 0.12, 0.12), borderWidth: 0.8 });
        const lbl = "OPENING — NOT PRINTED";
        const lw = bold.widthOfTextAtSize(lbl, 6);
        if (lw < ow - 4) page.drawText(lbl, { x: ox + (ow - lw) / 2, y: rect.y + oh / 2, size: 6, font: bold, color: rgb(0.12, 0.12, 0.12) });
      }
    }
    if (n < 2 && !openings) return;
    // Equal division of the wall — matches the print engine's real split.
    // Seam positions must be exact for the packer.
    const edges: number[] = []; // fractional x of each panel's RIGHT edge
    let acc = 0;
    for (let i = 0; i < n; i++) { acc += widths[i]; edges.push(acc / widthCm); }
    for (let i = 0; i < n - 1; i++) {
      const x = rect.x + edges[i] * rect.w;
      for (const [color, thickness] of [
        [rgb(1, 1, 1), 2] as const,
        [rgb(0.12, 0.12, 0.12), 0.8] as const,
      ]) {
        page.drawLine({
          start: { x, y: rect.y },
          end: { x, y: rect.y + rect.h },
          thickness,
          color,
          dashArray: [4, 3],
        });
      }
    }
    for (let i = 0; i < n; i++) {
      const leftFrac = i === 0 ? 0 : edges[i - 1];
      const cx = rect.x + ((leftFrac + edges[i]) / 2) * rect.w;
      const panel = openings?.panels[i];
      const skipped = !!panel && panel.printHeightCm <= 0;
      const short = !!panel && !skipped && panel.printHeightCm < a.heightCm - 0.5;
      if (short) {
        // Dashed stop line where the short piece ends (just below the
        // opening's top edge — the rest of that drop is not printed).
        const stopY = rect.y + rect.h - (panel!.printHeightCm / a.heightCm) * rect.h;
        const x0 = rect.x + leftFrac * rect.w;
        const x1 = rect.x + edges[i] * rect.w;
        for (const [color, thickness] of [
          [rgb(1, 1, 1), 2] as const,
          [rgb(0.12, 0.12, 0.12), 0.8] as const,
        ]) {
          page.drawLine({ start: { x: x0, y: stopY }, end: { x: x1, y: stopY }, thickness, color, dashArray: [4, 3] });
        }
      }
      const label = skipped ? `P${i + 1} (skip)` : `P${i + 1}`;
      const lw = bold.widthOfTextAtSize(label, 8);
      page.drawRectangle({
        x: cx - lw / 2 - 4,
        y: rect.y + rect.h - 16,
        width: lw + 8,
        height: 12,
        color: skipped ? rgb(0.55, 0.55, 0.55) : rgb(0.09, 0.09, 0.09),
        opacity: 0.75,
      });
      page.drawText(label, { x: cx - lw / 2, y: rect.y + rect.h - 13, size: 8, font: bold, color: rgb(1, 1, 1) });
    }
  };

  const imgs: { buf: Buffer; caption: string; isCrop: boolean }[] = [];
  if (roomBuf) imgs.push({ buf: roomBuf, caption: "On your wall — your room preview", isCrop: false });
  if (cropBuf) imgs.push({ buf: cropBuf, caption: "Your exact print — dotted lines show the pieces", isCrop: true });

  const rowTop = y;
  const maxRowH = 215;
  if (imgs.length === 2) {
    const gap = 18;
    const cellW = (contentW - gap) / 2;
    const r0 = await fitInCell(imgs[0].buf, M, cellW, rowTop, maxRowH);
    const r1 = await fitInCell(imgs[1].buf, M + cellW + gap, cellW, rowTop, maxRowH);
    if (r1 && imgs[1].isCrop) drawPieceLines(r1, a.widthCm);
    const capY = rowTop - Math.max(r0?.h ?? 0, r1?.h ?? 0) - 12;
    text(imgs[0].caption, M, capY, 8, font, soft);
    text(imgs[1].caption, M + cellW + gap, capY, 8, font, soft);
    y = capY - 20;
  } else if (imgs.length === 1) {
    const r = await fitInCell(imgs[0].buf, M, contentW, rowTop, maxRowH);
    if (r && imgs[0].isCrop) drawPieceLines(r, a.widthCm);
    text(imgs[0].caption, M, rowTop - (r?.h ?? 0) - 12, 8.5, font, soft);
    y = rowTop - (r?.h ?? 0) - 32;
  }

  // Line items
  y = Math.max(y, 210);
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 20;
  text("ORDER DETAILS", M, y, 9, bold, soft);
  y -= 20;

  const wFt = a.widthCm / CM_PER_FOOT;
  const hFt = a.heightCm / CM_PER_FOOT;
  const rows: [string, string][] = [
    ["Design", code ? `${title}  (${code})` : title],
    ["Material", materialName],
    ...(a.crop.concept?.requiresPreparation ? [["Artwork", "Room reference - final proof required before printing"] as [string,string]] : []),
    ...(a.crop.concept?.roomLabel ? [["Room / wall", a.crop.concept.roomLabel] as [string,string]] : []),
    ["Wall size", `${wFt.toFixed(1)} × ${hFt.toFixed(1)} ft   (${Math.round(a.widthCm)} × ${Math.round(a.heightCm)} cm)`],
    // A preset is a guess the customer was promised we would check. Said on
    // the studio's own sheet so no file is cut to an unconfirmed wall.
    ...(a.crop.sizeAssumed ? [["CONFIRM SIZE", `Chosen from the ${a.crop.sizeAssumed.preset} preset, not measured - confirm the wall with the customer before printing`] as [string, string]] : []),
    // areaSqft is the BILLED area, which can differ from the wall in two ways:
    // an opening exclusion makes it smaller, the small-order minimum makes it
    // bigger. Either way, say which is which — printed area next to a wall
    // size it doesn't multiply out to reads as a bug.
    ["Area", openings
      ? `${(areaSqFt(a.widthCm, a.heightCm) - openings.excludedSqft).toFixed(2)} sq ft printed, ${a.areaSqft.toFixed(2)} billed (${openings.excludedSqft.toFixed(1)} sq ft of openings excluded)`
      : a.areaSqft > areaSqFt(a.widthCm, a.heightCm) + 0.005
        ? `${areaSqFt(a.widthCm, a.heightCm).toFixed(2)} sq ft printed, billed at our ${MIN_WALLPAPER_SQFT} sq ft minimum (${a.areaSqft.toFixed(2)} sq ft)`
        : `${a.areaSqft.toFixed(2)} sq ft`],
    ["Pieces", a.crop.approval?.panelArrangement && openings
      ? a.crop.approval.panelArrangement
      : panelArrangementLabel(a.widthCm, panelCm, rules.overlapCm)],
    ["Quantity", `${a.quantity}`],
  ];
  for (const [k, v] of rows) {
    text(k, M, y, 10, bold);
    text(v, M + 110, y, 10, font);
    y -= 18;
  }
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: rgb(0.9, 0.9, 0.9) });
  y -= 20;
  text("Total", M, y, 12, bold);
  const totalStr = `Rs ${fmtNum.format(a.lineTotal)}`;
  text(totalStr, W - M - bold.widthOfTextAtSize(totalStr, 12), y, 12, bold);
  y -= 30;

  // Installation instructions — template picked by the material's install type.
  const tpl = INSTALL_TEMPLATES[installType];
  text(tpl.heading, M, y, 9, bold, soft);
  y -= 14;
  text(tpl.intro, M, y, 8.5, font);
  y -= 15;
  for (let i = 0; i < tpl.steps.length && y > M + 12; i++) {
    text(`${i + 1}.  ${tpl.steps[i]}`, M, y, 8.5, font);
    y -= 12.5;
  }

  // Footer
  const foot = "Prepared for your order · Free shipping across India · zyvorah.com · hello@zyvorah.com";
  text(foot, M, M - 6, 8, font, soft);

  const bytes = await pdf.save();
  const path = `${a.orderId}.pdf`;
  const docs = docStorageClient();
  const up = await docs.storage
    .from("order-copies")
    .upload(path, toUploadBody(Buffer.from(bytes), "application/pdf"), { contentType: "application/pdf", upsert: true });
  if (up.error) throw up.error;

  const { data: pub } = docs.storage.from("order-copies").getPublicUrl(path);
  const url = pub.publicUrl;
  await supabase.rpc("set_order_copy_url", { p_order_id: a.orderId, p_url: url });
  return url;
}

export type OrderCopyItem = {
  productTitle: string;
  materialName: string;
  materialSlug?: string;
  widthCm: number;
  heightCm: number;
  areaSqft: number;
  quantity: number;
  lineTotal: number;
  crop: CropData | null;
  previewUrl: string | null;
};

// The cart preview lives in a private bucket now, so this reads the object with
// the service role rather than fetching a public URL. `readDoc` still plain-
// fetches anything that is not one of those buckets, so an external preview URL
// keeps working exactly as before.
export async function fetchJpeg(u: string): Promise<Buffer | null> {
  try {
    const bytes = await readDoc(u);
    if (!bytes) return null;
    return await sharp(bytes, { failOn: "none" })
      .resize({ width: 400, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    return null;
  }
}

/** A pre-payment quote rather than a confirmation. Adds the validity banner and
 *  a priced breakdown (list → discount → net → GST) in place of a bare total,
 *  and says plainly that it is not a tax invoice. Corporate partners hand this
 *  to their own client before any money moves. */
export type ProposalMeta = {
  accountName: string;
  /** Rendered date string, e.g. "24 August 2026". */
  validUntil: string;
  lines: { label: string; amount: number; strike?: boolean }[];
  total: number;
};

/** The SHOWROOM document: the partner's brand, their client's name, and ONE
 *  amount — the selling price, taxes included. Their cost never appears; the
 *  gap between this figure and our net is the dealer's margin, and this PDF is
 *  shown on a screen with their client standing at it. Deliberately not a tax
 *  document of any kind and it says so; `proforma` renders the pro forma
 *  variant, which exists but is not exposed in the UI until a partner asks. */
export type ClientQuoteMeta = {
  partnerName: string;
  /** Partner logo bytes (JPEG/PNG). Null falls back to the partner's name in
   *  type — never to the Zyvorah wordmark, which must not brand their quote. */
  logo: Buffer | null;
  clientName: string;
  clientRef: string | null;
  /** The one figure the client sees — website list price, taxes included. */
  totalIncTax: number;
  /** The client's on-screen signature, burnt into the stored PDF. Null renders
   *  a blank signature rule instead (quote saved before anyone signed). */
  signature: Buffer | null;
  signedAtLabel: string | null;
  proforma?: boolean;
};

export type OrderCopyRenderOpts = {
  /** Top-right reference — "Order #1234" retail, "MOCO-000007" corporate. */
  reference: string;
  shippingLine?: { label: string; amount: number } | null;
  proposal?: ProposalMeta | null;
  /** Mutually exclusive with `proposal` — the showroom client copy. */
  clientQuote?: ClientQuoteMeta | null;
  /** Reseller / corporate buyer: we never prepaid their freight, so this copy
   *  must not promise free shipping. The consignee settles it with the courier
   *  on delivery — the OS books the docket that way. */
  freightToPay?: boolean;
};

/**
 * Render the multi-item order copy / proposal to PDF bytes. Kept separate from
 * storage so the same layout serves a paid retail order (persisted against the
 * `orders` row) and a corporate proposal (persisted per partner, pre-payment) —
 * the earlier version could only ever write back to the retail table.
 */
export async function renderCartOrderCopyPdf(
  items: OrderCopyItem[],
  opts: OrderCopyRenderOpts,
): Promise<Uint8Array> {
  const { reference, proposal = null } = opts;
  const clientQuote = opts.clientQuote ?? null;
  const shippingLine = opts.shippingLine ?? null;
  const freightToPay = opts.freightToPay === true;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.09, 0.09, 0.09);
  const soft = rgb(0.42, 0.42, 0.42);
  const M = 48;

  // Live production rules — panel labels must match the machine's real split.
  const rules: PrintRules = await fetchPrintRules();
  // Which installation templates apply (per distinct material install type).
  const slugs = [...new Set(items.map((it) => it.materialSlug).filter(Boolean))] as string[];
  let installTypes: InstallType[] = ["paste"];
  const rollBySlug = new Map<string, number | null>();
  if (slugs.length) {
    const { data: mats } = await supabase.from("materials").select("slug, install_type, roll_width_mm").in("slug", slugs);
    const rows = (mats ?? []) as { slug: string; install_type?: string; roll_width_mm?: number | null }[];
    const found = [...new Set(rows.map((m) => asInstallType(m.install_type)))];
    if (found.length) installTypes = found;
    for (const m of rows) rollBySlug.set(m.slug, m.roll_width_mm ?? null);
  }

  let page = pdf.addPage([595.28, 841.89]);
  const W = page.getWidth();
  let y = page.getHeight() - M;

  const embed = async (buf: Buffer) => {
    try { return await pdf.embedJpg(buf); } catch { try { return await pdf.embedPng(buf); } catch { return null; } }
  };
  const text = (s: string, x: number, yy: number, size: number, f = font, color = ink) =>
    page.drawText(s, { x, y: yy, size, font: f, color });

  // Header. A client quote is the PARTNER's document: their logo (or their
  // name in type) is the only brand on it — never the Zyvorah wordmark.
  if (clientQuote) {
    const logoImg = clientQuote.logo ? await embed(clientQuote.logo) : null;
    if (logoImg) {
      const d = logoImg.scale(1);
      const h = 34;
      page.drawImage(logoImg, { x: M, y: y - 36, width: Math.min((h / d.height) * d.width, 150), height: h });
    } else {
      text(clientQuote.partnerName.toUpperCase(), M, y - 18, 20, bold);
    }
  } else {
    text("ZYVORAH", M, y - 18, 22, bold);
    text("Mural wallpaper & murals", M, y - 32, 8.5, font, soft);
  }
  const dateStr = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  text(reference, W - M - bold.widthOfTextAtSize(reference, 11), y - 16, 11, bold);
  text(dateStr, W - M - font.widthOfTextAtSize(dateStr, 9), y - 30, 9, font, soft);
  y -= 52;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 26;

  if (clientQuote) {
    text(clientQuote.proforma ? "Pro forma invoice" : "Order confirmation", M, y, 17, bold);
    const forLine = clientQuote.clientRef
      ? `For ${clientQuote.clientName} · Ref ${clientQuote.clientRef}`
      : `For ${clientQuote.clientName}`;
    text(forLine, M, y - 16, 9.5, font, soft);
    // Said up front as well as in the footer: this document must never be
    // mistaken for a tax document by anyone it is shown to.
    const banner = "Not a tax invoice";
    text(banner, W - M - font.widthOfTextAtSize(banner, 8.5), y, 8.5, font, soft);
    y -= 40;
  } else if (proposal) {
    text("Proposal", M, y, 17, bold);
    text(`Prepared for ${proposal.accountName}`, M, y - 16, 9.5, font, soft);
    // Stated twice on purpose: this document travels to the partner's own
    // client, who must not mistake it for a demand for payment.
    const banner = `Valid until ${proposal.validUntil} · not a tax invoice`;
    text(banner, W - M - font.widthOfTextAtSize(banner, 8.5), y, 8.5, font, soft);
    y -= 40;
  } else {
    text("This is what you ordered.", M, y, 17, bold);
    y -= 28;
  }

  let grand = 0;
  for (const it of items) {
    grand += it.lineTotal;
    if (y < 160) {
      page = pdf.addPage([595.28, 841.89]);
      y = page.getHeight() - M;
    }
    const rowH = 96;
    const top = y;
    // thumbnails: preview (room) then crop
    const thumbs: Buffer[] = [];
    const cropBuf = it.crop ? await renderCropImage(it.crop) : null;
    const prevBuf = it.previewUrl ? await fetchJpeg(it.previewUrl) : null;
    if (prevBuf) thumbs.push(prevBuf);
    if (cropBuf) thumbs.push(cropBuf);
    let x = M;
    for (const t of thumbs.slice(0, 2)) {
      const img = await embed(t);
      if (img) {
        const d = img.scale(1);
        const h = rowH;
        const w = (h / d.height) * d.width;
        page.drawImage(img, { x, y: top - h, width: Math.min(w, 120), height: h });
        x += Math.min(w, 120) + 10;
      }
    }
    const tx = x + 6;
    const wFt = it.widthCm / CM_PER_FOOT;
    const hFt = it.heightCm / CM_PER_FOOT;
    text(it.productTitle, tx, top - 14, 12, bold);
    text([it.crop?.concept?.roomLabel, it.materialName].filter(Boolean).join(" · "), tx, top - 30, 9.5, font, soft);
    if ((it.materialSlug ?? "") === BORDER_MATERIAL_SLUG) {
      // A per-metre line carries quantity = metres of fixed lengths — no wall
      // dimensions, no priced area, no panel arrangement.
      text(`${it.quantity} m — supplied in fixed lengths`, tx, top - 46, 9.5, font);
    } else {
      // Label the area as BILLED whenever the small-order minimum lifted it
      // above the wall's own size, so w × h and the sq ft can't look wrong.
      const areaLabel =
        it.areaSqft > areaSqFt(it.widthCm, it.heightCm) + 0.005
          ? `${it.areaSqft.toFixed(2)} sq ft billed (min ${MIN_WALLPAPER_SQFT} sq ft)`
          : `${it.areaSqft.toFixed(2)} sq ft`;
      text(`${wFt.toFixed(1)} × ${hFt.toFixed(1)} ft  ·  ${areaLabel}  ·  Qty ${it.quantity}`, tx, top - 46, 9.5, font);
      text(panelArrangementLabel(it.widthCm, rollCmFromMm(rollBySlug.get(it.materialSlug ?? ""), rules.maxPanelCm), rules.overlapCm), tx, top - 60, 8.5, font, soft);
    }
    if (it.crop?.approval) {
      const approvedDate = new Date(it.crop.approval.approvedAt).toLocaleDateString("en-IN", {
        day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
      });
      text(it.crop.concept?.requiresPreparation ? "Measurements confirmed - artwork proof required before printing" : `Composition approved ${approvedDate} — this exact crop, scale and position prints`, tx, top - 74, 8, font, soft);
    }
    // A client quote never prints per-line amounts: item lineTotals here are
    // the PARTNER's net, and the only money on their client's copy is the one
    // selling figure drawn below.
    if (!clientQuote) {
      const lt = `Rs ${fmtNum.format(it.lineTotal)}`;
      text(lt, W - M - bold.widthOfTextAtSize(lt, 11), top - 14, 11, bold);
    }
    y = top - rowH - 16;
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.5, color: rgb(0.9, 0.9, 0.9) });
  }

  if (y < 90) {
    page = pdf.addPage([595.28, 841.89]);
    y = page.getHeight() - M;
  }
  y -= 6;
  if (!clientQuote && shippingLine && shippingLine.amount > 0) {
    text(shippingLine.label, M, y, 10, font, soft);
    const shipStr = `Rs ${fmtNum.format(shippingLine.amount)}`;
    text(shipStr, W - M - font.widthOfTextAtSize(shipStr, 10), y, 10, font, soft);
    y -= 18;
    grand += shippingLine.amount;
  }

  if (clientQuote) {
    // One figure, taxes in. No list/discount/net chain — that chain is the
    // partner's cost structure and this page faces their client.
    text("Total (inclusive of taxes)", M, y, 13, bold);
    const totalStr = `Rs ${fmtNum.format(clientQuote.totalIncTax)}`;
    text(totalStr, W - M - bold.widthOfTextAtSize(totalStr, 13), y, 13, bold);
    y -= 34;

    // Sign-off block: the burnt-in signature once the client has approved on
    // the showroom screen, or a blank rule for a copy printed to sign by hand.
    if (y < 130) {
      page = pdf.addPage([595.28, 841.89]);
      y = page.getHeight() - M;
    }
    if (clientQuote.signature) {
      const sig = await embed(clientQuote.signature);
      if (sig) {
        const d = sig.scale(1);
        const h = 44;
        page.drawImage(sig, { x: M, y: y - h, width: Math.min((h / d.height) * d.width, 200), height: h });
        y -= h + 6;
      }
      page.drawLine({ start: { x: M, y }, end: { x: M + 220, y }, thickness: 0.7, color: ink });
      y -= 12;
      const approved = clientQuote.signedAtLabel
        ? `Approved by ${clientQuote.clientName} · ${clientQuote.signedAtLabel}`
        : `Approved by ${clientQuote.clientName}`;
      text(approved, M, y, 9, font, soft);
    } else {
      y -= 40;
      page.drawLine({ start: { x: M, y }, end: { x: M + 220, y }, thickness: 0.7, color: ink });
      y -= 12;
      text(`Client signature (${clientQuote.clientName})`, M, y, 9, font, soft);
    }
    y -= 28;
  } else if (proposal) {
    // List → discount → net → GST, so the partner's client can see exactly what
    // the partner rate bought them.
    for (const line of proposal.lines) {
      text(line.label, M, y, 10, font, soft);
      const amtStr = `Rs ${fmtNum.format(line.amount)}`;
      text(amtStr, W - M - font.widthOfTextAtSize(amtStr, 10), y, 10, font, line.strike ? soft : ink);
      if (line.strike) {
        const wdt = font.widthOfTextAtSize(amtStr, 10);
        page.drawLine({
          start: { x: W - M - wdt, y: y + 3 }, end: { x: W - M, y: y + 3 },
          thickness: 0.6, color: soft,
        });
      }
      y -= 16;
    }
    page.drawLine({ start: { x: W - M - 190, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 1, color: ink });
    y -= 6;
    text("Total payable", M, y, 13, bold);
    const totalStr = `Rs ${fmtNum.format(proposal.total)}`;
    text(totalStr, W - M - bold.widthOfTextAtSize(totalStr, 13), y, 13, bold);
    y -= 28;
  } else {
    text("Total", M, y, 13, bold);
    const totalStr = `Rs ${fmtNum.format(grand)}`;
    text(totalStr, W - M - bold.widthOfTextAtSize(totalStr, 13), y, 13, bold);
    y -= 28;
  }

  // Installation instructions — one block per install type in the order.
  for (const t of installTypes) {
    const tpl = INSTALL_TEMPLATES[t];
    const blockH = 30 + tpl.steps.length * 12.5;
    if (y - blockH < M) {
      page = pdf.addPage([595.28, 841.89]);
      y = page.getHeight() - M;
    }
    text(tpl.heading, M, y, 9, bold, soft);
    y -= 14;
    text(tpl.intro, M, y, 8.5, font);
    y -= 15;
    for (let i = 0; i < tpl.steps.length; i++) {
      text(`${i + 1}.  ${tpl.steps[i]}`, M, y, 8.5, font);
      y -= 12.5;
    }
    y -= 12;
  }

  // A client quote's footer carries the partner's name and no zyvorah.com —
  // it is their document, and it repeats what it is not.
  const foot = clientQuote
    ? `${clientQuote.partnerName} · Prepared for your order · ${clientQuote.proforma ? "Pro forma invoice — not a tax invoice" : "Order confirmation — not a tax invoice or pro forma invoice"}`
    : proposal
    ? "Prepared for your order · Prices held until the date above · zyvorah.com · hello@zyvorah.com"
    : shippingLine && shippingLine.amount > 0
      ? `Prepared for your order · ${shippingLine.label} · zyvorah.com · hello@zyvorah.com`
      : freightToPay
        ? "Prepared for your order · Freight to-pay · zyvorah.com · hello@zyvorah.com"
        : "Prepared for your order · Free shipping across India · zyvorah.com · hello@zyvorah.com";
  page.drawText(foot, { x: M, y: M - 6, size: 8, font, color: soft });

  return pdf.save();
}

/**
 * Multi-item "This is what you ordered." PDF for a cart checkout, uploaded and
 * attached to the retail order. Unchanged behaviour — the layout now lives in
 * renderCartOrderCopyPdf so corporate proposals can share it.
 */
export async function buildCartOrderCopyPdf(
  orderId: string,
  orderNumber: number,
  /** The order's ZVY number — what the customer quotes and what production,
   *  the courier label and the invoice all carry. Null only when the issuer
   *  was unreachable at checkout, and then the internal id stands in. */
  zvy: string | null,
  items: OrderCopyItem[],
  shippingLine: { label: string; amount: number } | null = null,
  freightToPay = false,
): Promise<string> {
  const bytes = await renderCartOrderCopyPdf(items, {
    reference: zvy ? `Order ${zvy}` : `Order #${orderNumber}`,
    shippingLine,
    freightToPay,
  });
  const path = `${orderId}.pdf`;
  const docs = docStorageClient();
  const up = await docs.storage
    .from("order-copies")
    .upload(path, toUploadBody(Buffer.from(bytes), "application/pdf"), { contentType: "application/pdf", upsert: true });
  if (up.error) throw up.error;
  const { data: pub } = docs.storage.from("order-copies").getPublicUrl(path);
  const url = pub.publicUrl;
  await supabase.rpc("set_order_copy_url", { p_order_id: orderId, p_url: url });
  return url;
}
