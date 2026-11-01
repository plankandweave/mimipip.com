import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { toMediaUrl, isMediaUrl, mediaRendition } from "@/lib/media-url";
import { fetchMediaAware } from "@/lib/r2-media";

/**
 * The wall studies as a file.
 *
 * The portal is the better place to look at these — the mockups are drawn live
 * and you can open one full-screen. But the person who has to be convinced is
 * usually not the person who logged in: it goes to a head of design, a landlord,
 * a board. That person will not be given a portal account, and a session-gated
 * URL is not something you forward. So this exists to be forwarded.
 *
 * WHAT IT DELIBERATELY CARRIES: the wall as it is now, beside the wall wearing
 * the design. Side by side on one page, because the decision being asked for is
 * a comparison, and a reader who has to flip between two pages to make it will
 * make it badly.
 *
 * Purchasable proposals also include the current server-priced cart breakdown.
 *
 * pdf-lib rather than a headless browser: workerd has neither a browser nor
 * sharp, and this has to run in the same request that serves it.
 *
 * Deliberately NOT marked `server-only`, unlike its caller. Nothing here reads
 * a secret, a cookie or the database — it takes rows and signed URLs it is
 * handed and returns bytes. Keeping it pure is what lets a test actually build
 * a document and read it back, which matters more than usual for the one
 * artefact in this feature that nobody sees before a client does.
 */

const A4: [number, number] = [595, 842];
const M = 40;
const R = A4[0] - M;

const ink = rgb(0.09, 0.11, 0.13);
const soft = rgb(0.42, 0.45, 0.5);
const hair = rgb(0.82, 0.84, 0.87);
const goodInk = rgb(0.11, 0.44, 0.29);

export type StudyForPdf = {
  checkout?: {wallpaper:number;customisation:number;total:number};
  designTitle: string;
  designCode: string | null;
  approved: boolean;
  /** The composed mockup as the client saw it. Null when never exported. */
  renderUrl: string | null;
  renderBytes?: Uint8Array;
  note: string | null;
};

export type WallForPdf = {
  seq: number;
  name: string;
  widthMm: number;
  heightMm: number;
  brief: string | null;
  /** What was said on site, when it was said rather than typed. */
  spoken: string | null;
  photoUrl: string | null;
  photoBytes?: Uint8Array;
  studies: StudyForPdf[];
};

export type StudyBook = {
  accountName: string;
  buildingName: string;
  areaLabel: string;
  dateLabel: string;
  walls: WallForPdf[];
};

const m = (mm: number) => `${(mm / 1000).toFixed(2)} m`;
const sqft = (w: number, h: number) => Math.round((w / 304.8) * (h / 304.8));

/** Fetch an image for embedding. Failure is never fatal — a missing picture
 *  costs a picture; a thrown error costs the whole document.
 *
 *  Asks Supabase's render CDN to downscale where the URL allows it, because
 *  workerd cannot resize locally and a 900 px source is far more than a
 *  240 pt cell can show. */
async function fetchJpeg(url: string, maxEdge = 900): Promise<Uint8Array | null> {
  try {
    // R2-migrated media: rendition + binding read (own zone is unfetchable
    // from the Worker).
    const mapped = toMediaUrl(url);
    if (isMediaUrl(mapped)) {
      const r = await fetchMediaAware(mediaRendition(mapped, maxEdge));
      return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
    }
    let target = url;
    if (url.includes("/render/image/")) {
      const u = new URL(url);
      u.searchParams.set("width", String(maxEdge));
      u.searchParams.set("quality", "80");
      target = u.toString();
    }
    const res = await fetch(target);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Wrap to a width, by measurement rather than by character count. */
function wrap(text: string, font: PDFFont, size: number, width: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.length) {
    const last = lines[maxLines - 1];
    if (font.widthOfTextAtSize(last, size) > width - 12) {
      lines[maxLines - 1] = `${last.slice(0, Math.max(0, last.length - 3))}…`;
    }
  }
  return lines;
}

export async function renderStudyBook(book: StudyBook): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  pdf.setTitle(`${book.buildingName} — ${book.areaLabel}`);
  pdf.setAuthor("Zyvorah");
  pdf.setSubject("Design proposal");

  let page: PDFPage = pdf.addPage(A4);
  let y = A4[1] - M;

  const header = (first: boolean) => {
    if (!first) {
      page = pdf.addPage(A4);
      y = A4[1] - M;
    }
    page.drawText(book.accountName, { x: M, y: y - 10, size: 9, font: body, color: soft });
    page.drawText(book.buildingName, { x: M, y: y - 30, size: 17, font: bold, color: ink });
    page.drawText(book.areaLabel, { x: M, y: y - 48, size: 11, font: body, color: soft });
    page.drawText(book.dateLabel, {
      x: R - body.widthOfTextAtSize(book.dateLabel, 9), y: y - 10, size: 9, font: body, color: soft,
    });
    y -= 64;
    page.drawLine({ start: { x: M, y }, end: { x: R, y }, thickness: 0.7, color: hair });
    y -= 22;
  };

  header(true);

  if (book.walls.length === 0) {
    page.drawText("No walls have been captured in this space yet.", {
      x: M, y, size: 11, font: body, color: soft,
    });
    return pdf.save();
  }

  for (const wall of book.walls) {
    // A wall and its first study want ~300 pt. Break before rather than orphan
    // a heading at the foot of a page.
    if (y < 320) header(false);

    page.drawText(`${wall.seq}. ${wall.name}`, { x: M, y, size: 13, font: bold, color: ink });
    const size = `${m(wall.widthMm)} × ${m(wall.heightMm)} · ${sqft(wall.widthMm, wall.heightMm)} sq ft`;
    page.drawText(size, {
      x: R - body.widthOfTextAtSize(size, 9), y: y + 1, size: 9, font: body, color: soft,
    });
    y -= 16;

    // The brief in the client's own words — typed, or as spoken on site. This is
    // the sentence the design is answering, so it belongs above the pictures.
    const brief = wall.brief?.trim() || wall.spoken?.trim() || "";
    if (brief) {
      for (const line of wrap(brief, body, 9.5, R - M, 3)) {
        page.drawText(line, { x: M, y, size: 9.5, font: body, color: soft });
        y -= 12;
      }
      y -= 2;
    }
    y -= 6;

    // Side by side: as it is, and as it could be. Equal cells, because the
    // comparison is the point and an unequal pair argues for the bigger one.
    const gap = 14;
    const cellW = (R - M - gap) / 2;
    const cellH = Math.round(cellW * 0.66);

    const studies = wall.studies.length ? wall.studies : [null];
    for (const study of studies) {
      if (y - cellH < M + 40) header(false);

      const drawCell = async (
        x: number, label: string, url: string | null, accent: boolean, storedBytes?: Uint8Array,
      ) => {
        page.drawText(label, { x, y, size: 8.5, font: accent ? bold : body, color: accent ? goodInk : soft });
        const top = y - 6;
        const bytes = storedBytes ?? (url ? await fetchJpeg(url) : null);
        if (bytes) {
          try {
            const img = await pdf.embedJpg(bytes);
            const scale = Math.min(cellW / img.width, cellH / img.height);
            const w = img.width * scale, h = img.height * scale;
            page.drawImage(img, { x: x + (cellW - w) / 2, y: top - h, width: w, height: h });
          } catch {
            // An embed that throws must cost a picture, not the document.
            page.drawRectangle({ x, y: top - cellH, width: cellW, height: cellH, borderColor: hair, borderWidth: 0.7 });
          }
        } else {
          page.drawRectangle({ x, y: top - cellH, width: cellW, height: cellH, borderColor: hair, borderWidth: 0.7 });
          const missing = url ? "Image unavailable" : "Not yet composed";
          page.drawText(missing, {
            x: x + (cellW - body.widthOfTextAtSize(missing, 9)) / 2,
            y: top - cellH / 2, size: 9, font: body, color: soft,
          });
        }
      };

      await drawCell(M, "AS IT IS", wall.photoUrl, false, wall.photoBytes);

      if (study) {
        const right = study.approved ? `${study.designTitle.toUpperCase()} · APPROVED` : study.designTitle.toUpperCase();
        await drawCell(M + cellW + gap, right.slice(0, 46), study.renderUrl, study.approved, study.renderBytes);
      } else {
        await drawCell(M + cellW + gap, "NO DESIGN STUDIED YET", null, false);
      }

      y -= cellH + 14;

      if (study) {
        const meta = [study.designCode, study.note].filter(Boolean).join(" · ");
        if (meta) {
          for (const line of wrap(meta, body, 8.5, R - M, 2)) {
            page.drawText(line, { x: M, y, size: 8.5, font: body, color: soft });
            y -= 11;
          }
        }
        if (study.checkout) {
          if (y < M + 110) header(false);
          const money = (n:number) => `INR ${n.toLocaleString("en-IN", {maximumFractionDigits:0})}`;
          const c = study.checkout;
          for (const [label,value] of [["Wallpaper after AID discount",c.wallpaper],["Customisation (no discount)",c.customisation],["Total including GST",c.total]] as const) {
            page.drawText(`${label}: ${money(value)}`, {x:M,y,size:10,font:label.startsWith("Total")?bold:body,color:ink}); y-=15;
          }
          for (const line of wrap("Current cart price. Installation and applicable trade freight excluded. Design approval and payment required before production. Review and pay in your partner portal.", body, 8.5, R-M, 3)) {
            page.drawText(line,{x:M,y,size:8.5,font:body,color:soft});y-=11;
          }
        }
        y -= 4;
      }
    }

    y -= 8;
    page.drawLine({ start: { x: M, y }, end: { x: R, y }, thickness: 0.5, color: hair });
    y -= 20;
  }

  // Footer on every page, last, so it cannot be pushed off by content.
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const foot = `Zyvorah · ${book.buildingName} · ${book.areaLabel}`;
    p.drawText(foot, { x: M, y: 26, size: 8, font: body, color: soft });
    const n = `${i + 1} / ${pages.length}`;
    p.drawText(n, { x: R - body.widthOfTextAtSize(n, 8), y: 26, size: 8, font: body, color: soft });
  });

  return pdf.save();
}
