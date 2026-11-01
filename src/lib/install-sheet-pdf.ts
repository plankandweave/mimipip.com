import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import type { InstallSheet, InstallWall, Readiness } from "./install-sheet";
import { toMediaUrl, isMediaUrl, mediaRendition } from "@/lib/media-url";
import { fetchMediaAware } from "@/lib/r2-media";

/**
 * The installation sheet as a file — something that survives being forwarded.
 *
 * The HTML view is the better read (it composites the creative onto the wall
 * photo with the same warp the approval page uses), but an installer on a
 * Bhosari shop floor gets sent things on WhatsApp, and WhatsApp forwards a
 * PDF, not a session-gated URL. So this exists to be attached and forwarded,
 * and it deliberately carries the two things a forwarded copy must not lose:
 * the ZVY number of every roll, and the order those rolls go up in.
 *
 * UNLIKE the job documents next door, this is NOT a frozen revisioned record.
 * A quotation is an offer someone may later hold us to, so it is numbered,
 * stored and superseded rather than edited. An installation sheet is a
 * snapshot of where production has got to — it is regenerated whenever it is
 * asked for, and yesterday's copy being stale is the point, not a defect.
 * That is why nothing here writes a `corporate_job_documents` row.
 *
 * IMAGES. The job document is deliberately thumbnail-free because 28 walls of
 * pricing does not need pictures and the images would blow the 60s function
 * budget. This one cannot be: "which wall" is a visual question, and a sheet
 * of names would send the installer back to the phone. The budget is bought
 * back by asking Supabase's render CDN to downscale wherever the URL is a
 * render URL (see `fetchJpeg` below) — a 420 px thumbnail is more than a
 * 150 pt PDF cell can show. A plain signed URL is embedded as fetched.
 */

const A4: [number, number] = [595, 842];
const M = 38;
const R = A4[0] - M;

const ink = rgb(0.09, 0.11, 0.13);
const soft = rgb(0.42, 0.45, 0.5);
const hair = rgb(0.82, 0.84, 0.87);
const good = rgb(0.11, 0.44, 0.29);
const warn = rgb(0.59, 0.38, 0.10);
const bad = rgb(0.65, 0.21, 0.21);

const READY_LABEL: Record<Readiness, string> = {
  on_site: "DISPATCHED",
  in_production: "STILL PRINTING",
  not_printed: "NOT PRINTED",
};
const READY_COLOR: Record<Readiness, ReturnType<typeof rgb>> = {
  on_site: good,
  in_production: warn,
  not_printed: bad,
};

const m2 = (mm: number) => `${(mm / 1000).toFixed(2)} m`;

/** Fetch an image, downscaled where the URL allows it. Failure is never fatal —
 *  a missing thumbnail costs a picture, a thrown error costs the whole sheet.
 *
 *  The downscale used to be a local sharp resize; workerd cannot run sharp, so
 *  a render-CDN URL (Supabase's `/render/image/`) is asked to do it instead by
 *  setting width/quality on the URL itself. Anything else is fetched as-is and
 *  embedded unscaled. */
async function fetchJpeg(url: string, maxEdge = 420): Promise<Buffer | null> {
  try {
    // R2-migrated media: pick a pre-generated rendition and read through the
    // binding (own-zone URLs cannot be fetched from the Worker).
    const mapped = toMediaUrl(url);
    if (isMediaUrl(mapped)) {
      const r = await fetchMediaAware(mediaRendition(mapped, maxEdge));
      return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
    }
    let target = url;
    if (url.includes("/render/image/")) {
      const u = new URL(url);
      u.searchParams.set("width", String(maxEdge));
      u.searchParams.set("quality", "78");
      target = u.toString();
    }
    const r = await fetch(target, { signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

export async function renderInstallSheetPdf(sheet: InstallSheet): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Every image the sheet will use, fetched once and in parallel — a wall at a
  // time would serialise 30-odd round trips into the function budget.
  const jobs: { key: string; url: string }[] = [];
  for (const w of sheet.walls) {
    if (w.photoUrl) jobs.push({ key: `photo:${w.seq}`, url: w.photoUrl });
    w.pieces.forEach((p) => {
      if (p.previewUrl) jobs.push({ key: `art:${w.seq}:${p.index}`, url: p.previewUrl });
    });
  }
  const fetched = await Promise.all(jobs.map(async (j) => [j.key, await fetchJpeg(j.url)] as const));
  const images = new Map<string, PDFImage>();
  for (const [key, buf] of fetched) {
    if (!buf) continue;
    try {
      images.set(key, await pdf.embedJpg(buf));
    } catch {
      // fetchJpeg no longer transcodes, so a PNG preview arrives as a PNG.
      try {
        images.set(key, await pdf.embedPng(buf));
      } catch {
        /* an image that will not embed is simply not drawn */
      }
    }
  }

  const pages: PDFPage[] = [];
  let page = pdf.addPage(A4);
  let y = 0;
  pages.push(page);

  const text = (s: string, x: number, yy: number, size = 9, f: PDFFont = font, color = ink) =>
    page.drawText(s, { x, y: yy, size, font: f, color });
  const right = (s: string, x: number, yy: number, size = 9, f: PDFFont = font, color = ink) =>
    page.drawText(s, { x: x - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color });
  const rule = (yy: number, thickness = 0.6, color = hair) =>
    page.drawLine({ start: { x: M, y: yy }, end: { x: R, y: yy }, thickness, color });

  /** Truncate to a measured width rather than a character count — wall names
   *  are free text and "Ground floor entry left side wall A" is not short. */
  const clip = (s: string, size: number, width: number, f: PDFFont = font) => {
    if (f.widthOfTextAtSize(s, size) <= width) return s;
    let out = s;
    while (out.length > 1 && f.widthOfTextAtSize(`${out}…`, size) > width) out = out.slice(0, -1);
    return `${out}…`;
  };

  const newPage = () => {
    page = pdf.addPage(A4);
    pages.push(page);
    y = A4[1] - M;
  };

  // ── Header ───────────────────────────────────────────────────────────────
  y = A4[1] - M;
  text("INSTALLATION SHEET", M, y - 10, 15, bold);
  right(`${sheet.totals.walls} walls`, R, y - 10, 10, bold, soft);
  y -= 26;
  text(sheet.title, M, y, 11, bold);
  y -= 14;
  const shipLine = [sheet.shipAddress, sheet.shipCity, sheet.state].filter(Boolean).join(", ");
  if (shipLine) {
    text(clip(shipLine, 8.5, R - M), M, y, 8.5, font, soft);
    y -= 11;
  }
  const contact = [sheet.shipContactName, sheet.shipContactPhone].filter(Boolean).join(" · ");
  if (contact) {
    text(`Site contact: ${contact}`, M, y, 8.5, font, soft);
    y -= 11;
  }
  y -= 4;
  rule(y);
  y -= 16;

  // ── The one instruction that prevents the mix-up ─────────────────────────
  text(
    "Each roll's header band prints its ZVY number and PIECE n OF m — that m counts strips inside",
    M, y, 8.5, font, ink,
  );
  y -= 11;
  text(
    "that ONE roll, not pieces of the wall. Every roll restarts at P1, so match the ZVY number first.",
    M, y, 8.5, font, ink,
  );
  y -= 11;
  text(
    "ZYVS- codes are artwork references and appear nowhere on the paper. A roll carries only its ZVY",
    M, y, 8.5, font, ink,
  );
  y -= 11;
  text("number and its P number.", M, y, 8.5, font, ink);
  y -= 8;
  rule(y);
  y -= 18;

  // A forwarded PDF outlives the moment it was built, so an unknown status has
  // to be stamped ON the paper — the reader has no way to ask it anything.
  if (sheet.statusUnknown) {
    page.drawRectangle({ x: M, y: y - 26, width: R - M, height: 32, color: rgb(0.99, 0.96, 0.90) });
    text("Production could not be reached — the statuses on this sheet are NOT reliable.", M + 8, y - 6, 8.5, bold, warn);
    text("Walls, rolls and ZVY numbers are correct; printed/dispatched is unknown. Check with the office.", M + 8, y - 17, 8, font, warn);
    y -= 40;
  }

  const summary = sheet.statusUnknown
    ? `${sheet.totals.walls} walls · roll status unavailable`
    : `${sheet.totals.wallsReady} walls dispatched · ${sheet.totals.wallsInProduction} still printing · ${sheet.totals.wallsNotPrinted} not printed`;
  text(summary, M, y, 9, bold, soft);
  y -= 18;

  // ── Wall blocks ──────────────────────────────────────────────────────────
  const PHOTO_W = 116;
  const PHOTO_H = 74;

  for (const w of sheet.walls) {
    const blockH = wallBlockHeight(w);
    if (y - blockH < M + 24) newPage();

    const top = y;
    // Status stripe: readable before any of the words are.
    page.drawRectangle({
      x: M, y: top - blockH + 8, width: 2.5, height: blockH - 10,
      color: READY_COLOR[w.readiness],
    });

    const bodyX = M + 12;
    text(`${w.seq}.`, bodyX, top - 10, 10, bold, soft);
    text(clip(w.name, 11.5, 300, bold), bodyX + 20, top - 10, 11.5, bold);
    right(READY_LABEL[w.readiness], R, top - 10, 8, bold, READY_COLOR[w.readiness]);

    // Dimensions and series only. The ZYVS- design codes are deliberately NOT
    // on this line: unlabelled beside a ZVY number they read as a second thing
    // to match, and wall 1 carries nine of them. They go at the foot of the
    // block, named as what they are not.
    let ry = top - 24;
    const dims = `${m2(w.widthMm)} × ${m2(w.heightMm)}`;
    const series = w.series.length ? ` · ${w.series.join(" + ")}` : "";
    text(clip(`${dims}${series}`, 8.5, R - bodyX - 20), bodyX + 20, ry, 8.5, font, soft);
    ry -= 14;

    // Site photo on the left, the run's rolls to its right.
    const photo = images.get(`photo:${w.seq}`);
    const photoTop = ry;
    if (photo) {
      const scale = Math.min(PHOTO_W / photo.width, PHOTO_H / photo.height);
      page.drawImage(photo, {
        x: bodyX + 20,
        y: photoTop - photo.height * scale,
        width: photo.width * scale,
        height: photo.height * scale,
      });
    } else {
      page.drawRectangle({
        x: bodyX + 20, y: photoTop - PHOTO_H, width: PHOTO_W, height: PHOTO_H,
        borderColor: hair, borderWidth: 0.6,
      });
      text("no site photo", bodyX + 34, photoTop - PHOTO_H / 2, 7.5, font, soft);
    }

    // Roll rows. One line per ZVY number, in the order they go up.
    const rollX = bodyX + 20 + PHOTO_W + 14;
    let rowY = photoTop - 9;
    if (!w.pieces.length) {
      text("No rolls ordered for this wall yet.", rollX, rowY, 8.5, font, bad);
      rowY -= 12;
    }
    for (const p of w.pieces) {
      const art = images.get(`art:${w.seq}:${p.index}`);
      if (art) {
        const ah = 22;
        const aw = Math.min(38, (art.width / art.height) * ah);
        page.drawImage(art, { x: rollX, y: rowY - ah + 7, width: aw, height: ah });
      }
      const tx = rollX + 44;
      text(p.zvy ?? p.orderRef, tx, rowY, 10, bold);
      const order = p.total > 1 ? `piece ${p.index} of ${p.total}` : "single roll";
      const strips = p.strips ? `${p.strips} strip${p.strips === 1 ? "" : "s"} · P1–P${p.strips}` : "strips not yet set";
      text(`${order}  ·  ${strips}  ·  ${m2(p.widthMm)}`, tx + 62, rowY, 8, font, soft);
      right(READY_LABEL[p.readiness], R, rowY, 7, bold, READY_COLOR[p.readiness]);
      rowY -= 26;
    }

    if (w.codes.length) {
      const refs = `Artwork references, not on the rolls: ${w.codes.join(", ")}`;
      text(clip(refs, 7, R - rollX), rollX, rowY + 6, 7, font, soft);
      rowY -= 11;
    }

    // Rolls that exist but must not go up. Silence here is how a superseded
    // roll ends up on a wall.
    if (w.supersededZvy.length) {
      const msg = `DO NOT USE: ${w.supersededZvy.join(", ")} — cancelled/replaced print of this wall.`;
      text(clip(msg, 8, R - rollX), rollX, rowY + 6, 8, bold, bad);
      rowY -= 12;
    }

    y = top - blockH;
    rule(y + 6, 0.4);
  }

  // ── Footer on every page ─────────────────────────────────────────────────
  const stamp = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  pages.forEach((p, i) => {
    p.drawText(`${sheet.accountName} · ${sheet.title} · installation sheet · ${stamp}`, {
      x: M, y: 24, size: 7.5, font, color: soft,
    });
    const n = `Page ${i + 1} of ${pages.length}`;
    p.drawText(n, { x: R - font.widthOfTextAtSize(n, 7.5), y: 24, size: 7.5, font, color: soft });
    p.drawText("Status shown is as at the date above and changes as consignments dispatch.", {
      x: M, y: 14, size: 6.5, font, color: soft,
    });
  });

  return pdf.save();
}

/** How tall a wall's block will be, so pagination can decide before drawing. */
function wallBlockHeight(w: InstallWall): number {
  const rows = Math.max(w.pieces.length, 1);
  const rollsH = rows * 26 + (w.codes.length ? 11 : 0) + (w.supersededZvy.length ? 12 : 0);
  return 38 + Math.max(74, rollsH) + 14;
}
