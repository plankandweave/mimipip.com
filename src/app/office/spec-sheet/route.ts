import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { getOfficeFinishes } from "@/lib/office";
import { officeSpec } from "@/lib/office-spec";
import { SITE_URL } from "@/lib/seo";

/**
 * The office specification as a file.
 *
 * A facilities manager or a specifying architect does not bookmark a page —
 * they forward a PDF to a contractor, a procurement desk or a client, and the
 * decision gets made inside that thread without us. So this exists to survive
 * being forwarded, and it deliberately carries the two things a forwarded copy
 * must not lose: the rate per square foot and the lead time.
 *
 * Regenerated on request rather than stored, for the same reason the install
 * sheet is: it is a snapshot of what we currently sell, and yesterday's copy
 * going stale is the point. It is NOT a quotation and says so — a quotation is
 * an offer someone can hold us to and belongs to the projects flow.
 */

export const revalidate = 3600;

const A4: [number, number] = [595, 842];
const M = 46;
const RIGHT = A4[0] - M;

const ink = rgb(0.09, 0.11, 0.13);
const soft = rgb(0.42, 0.45, 0.5);
const hair = rgb(0.87, 0.86, 0.83);

type Ctx = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
};

/**
 * The standard PDF fonts are WinAnsi-encoded and cannot draw "₹" (nor any other
 * glyph outside that set), and pdf-lib throws rather than dropping it — so a
 * single rupee sign in a spec row would fail the whole build. The house answer
 * is the same one the GST invoice uses: print amounts as "Rs.". Anything else
 * unencodable is dropped rather than allowed to throw, because a missing
 * character costs a character and an exception costs the document.
 */
function ansi(s: string, font: PDFFont): string {
  const swapped = s.replace(/₹\s?/g, "Rs. ");
  let out = "";
  for (const ch of swapped) {
    try {
      font.widthOfTextAtSize(ch, 10);
      out += ch;
    } catch {
      /* unencodable — drop it */
    }
  }
  return out;
}

/** Greedy wrap to a pixel width — pdf-lib has no text box. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of ansi(text, font).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      out.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) out.push(line);
  return out;
}

function newPage(c: Ctx) {
  c.page = c.doc.addPage(A4);
  c.y = A4[1] - M;
}

/** Reserve vertical space, breaking the page when it will not fit. */
function need(c: Ctx, h: number) {
  if (c.y - h < M + 28) newPage(c);
}

export async function GET() {
  const finishes = await getOfficeFinishes();
  const groups = officeSpec({ finishes });

  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const c: Ctx = { doc, page: doc.addPage(A4), y: A4[1] - M, regular, bold };

  // ---- masthead ----
  c.page.drawText("ZYVORAH", { x: M, y: c.y - 14, size: 15, font: bold, color: ink });
  c.page.drawText("Office wallpaper — specification", {
    x: M,
    y: c.y - 34,
    size: 10,
    font: regular,
    color: soft,
  });
  const issued = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  const issuedW = regular.widthOfTextAtSize(issued, 9);
  c.page.drawText(issued, { x: RIGHT - issuedW, y: c.y - 14, size: 9, font: regular, color: soft });
  c.y -= 52;
  c.page.drawLine({ start: { x: M, y: c.y }, end: { x: RIGHT, y: c.y }, thickness: 1, color: ink });
  c.y -= 26;

  // ---- standfirst ----
  for (const line of wrap(
    "Original mural wallpaper designs for commercial interiors. Cut to the measured wall rather than supplied in standard rolls, colour-matched across every drop, and proofed before production.",
    regular,
    10,
    RIGHT - M,
  )) {
    c.page.drawText(line, { x: M, y: c.y, size: 10, font: regular, color: ink });
    c.y -= 14;
  }
  c.y -= 14;

  // ---- groups ----
  const KEY_W = 132;
  const VAL_W = RIGHT - M - KEY_W - 12;

  /** Height one key/value row will occupy. */
  const rowHeight = (r: { k: string; v: string }) =>
    Math.max(wrap(r.k, bold, 9.5, KEY_W).length, wrap(r.v, regular, 9.5, VAL_W).length) * 13 + 8;

  for (const g of groups) {
    // Break BEFORE the heading unless it can carry its first two rows with it.
    // A heading stranded at the foot of a page with one row under it reads as a
    // truncated document, which is the last thing a spec sheet should do.
    const keep = g.rows.slice(0, 2).reduce((n, r) => n + rowHeight(r), 0);
    need(c, 32 + keep);
    c.page.drawText(g.heading.toUpperCase(), { x: M, y: c.y, size: 9, font: bold, color: soft });
    c.y -= 8;
    c.page.drawLine({ start: { x: M, y: c.y }, end: { x: RIGHT, y: c.y }, thickness: 0.6, color: hair });
    c.y -= 16;

    for (const r of g.rows) {
      const keyLines = wrap(r.k, bold, 9.5, KEY_W);
      const valLines = wrap(r.v, regular, 9.5, VAL_W);
      const h = rowHeight(r);
      need(c, h);
      let ky = c.y;
      for (const l of keyLines) {
        c.page.drawText(l, { x: M, y: ky, size: 9.5, font: bold, color: ink });
        ky -= 13;
      }
      let vy = c.y;
      for (const l of valLines) {
        c.page.drawText(l, { x: M + KEY_W + 12, y: vy, size: 9.5, font: regular, color: ink });
        vy -= 13;
      }
      c.y -= h;
    }
    c.y -= 12;
  }

  // ---- footer on every page ----
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: M, y: M + 22 },
      end: { x: RIGHT, y: M + 22 },
      thickness: 0.6,
      color: hair,
    });
    p.drawText(
      "Indicative specification, not a quotation. Prices are GST inclusive and current at the date of issue.",
      { x: M, y: M + 10, size: 7.5, font: regular, color: soft },
    );
    const right = `${SITE_URL.replace(/^https?:\/\//, "")}/office  ·  hello@zyvorah.com  ·  ${i + 1}/${pages.length}`;
    p.drawText(right, {
      x: RIGHT - regular.widthOfTextAtSize(right, 7.5),
      y: M + 10,
      size: 7.5,
      font: regular,
      color: soft,
    });
  });

  const bytes = await doc.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="zyvorah-office-specification.pdf"',
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
