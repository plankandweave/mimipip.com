import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";

/**
 * The page grammar every Zyvorah document shares — the quotation and the
 * specification sheets are two documents over one set of mechanics, so they
 * cannot drift apart.
 *
 * Taken from the KRT specification sheet of 6 October 2026, which is the look
 * Roheena signed off: the wordmark top left, the document's name top right in
 * small grey, Plus Jakarta Sans for headings and Inter for everything else,
 * the site's warm off-white page, a sage panel where a point needs weight,
 * hairline rules between rows, and the tagline in the footer with the page
 * count. Nothing typed in capitals except the tracked kickers.
 *
 * WHY THE BRAND FONTS ARE EMBEDDED. Every other PDF in this repo draws with
 * the standard Helvetica, which has no rupee sign — they print "Rs." instead.
 * A quotation is the one document a customer reads for its numbers, and
 * "Rs. 14,23,160" under a wordmark set in Plus Jakarta Sans is not the brand.
 * public/fonts/pdf holds Inter and Plus Jakarta Sans subset to Latin plus ₹,
 * the primes (72′6″), the minus sign and the degree sign, ~34 KB each, so the
 * document says ₹ in the same type the site does.
 *
 * Pure: takes bytes, returns bytes. Nothing here reads the network, a cookie
 * or the database, so a test can build a document and read it back — which
 * matters more than usual for a document nobody sees before a client does.
 */

export const A4: [number, number] = [595, 842];
/** Margins. Generous on purpose: the page has to breathe. */
export const M = 56;
export const RIGHT = A4[0] - M;
export const WIDTH = RIGHT - M;

export const CLOUD = rgb(0.98, 0.98, 0.968); // #FAFAF7, the site's page
export const INK = rgb(0.1, 0.1, 0.1);
export const SLATE = rgb(0.36, 0.36, 0.36);
export const MIST = rgb(0.55, 0.56, 0.58);
export const HAIR = rgb(0.86, 0.85, 0.82);
export const SAGE = rgb(0.894, 0.929, 0.894); // #E4EDE4
export const WASH = rgb(0.933, 0.922, 0.898); // #EEEBE5

export type BrandFontBytes = {
  regular: Uint8Array;
  semibold: Uint8Array;
  bold: Uint8Array;
  display: Uint8Array;
  displayHeavy: Uint8Array;
};

export type BrandAssets = {
  fonts: BrandFontBytes;
  /** public/logo-dark.png — the wordmark with its blue full stop, 640×205. */
  wordmarkPng: Uint8Array;
};

export type Fonts = {
  regular: PDFFont;
  semibold: PDFFont;
  bold: PDFFont;
  display: PDFFont;
  displayHeavy: PDFFont;
};

export const TAGLINE = "Original mural wallpaper designs from India.";

/** Wrap to a width by measurement. A single word wider than the column is
 *  left whole rather than broken — a quotation never hyphenates a figure. */
export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** A rounded rectangle as an SVG path, in pdf-lib's path space: y runs DOWN
 *  from the anchor, so the anchor is the panel's top-left corner. */
function roundedRectPath(w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  return [
    `M ${rr} 0`,
    `H ${w - rr}`,
    `A ${rr} ${rr} 0 0 1 ${w} ${rr}`,
    `V ${h - rr}`,
    `A ${rr} ${rr} 0 0 1 ${w - rr} ${h}`,
    `H ${rr}`,
    `A ${rr} ${rr} 0 0 1 0 ${h - rr}`,
    `V ${rr}`,
    `A ${rr} ${rr} 0 0 1 ${rr} 0`,
    "Z",
  ].join(" ");
}

export class Doc {
  readonly pdf: PDFDocument;
  readonly f: Fonts;
  private readonly wordmark: PDFImage;
  page!: PDFPage;
  /** The cursor: the baseline of the next thing drawn, measured from the page bottom. */
  y = 0;
  private pages: { page: PDFPage; label: string }[] = [];
  /** A small line above the tagline on every page — the issuing companies. */
  footerNote: string | null = null;
  private footers: { page: PDFPage; left: string | null; right: string }[] = [];

  private constructor(pdf: PDFDocument, f: Fonts, wordmark: PDFImage) {
    this.pdf = pdf;
    this.f = f;
    this.wordmark = wordmark;
  }

  static async create(assets: BrandAssets, meta: { title: string; subject: string }): Promise<Doc> {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const embed = (b: Uint8Array) => pdf.embedFont(b, { subset: true });
    const f: Fonts = {
      regular: await embed(assets.fonts.regular),
      semibold: await embed(assets.fonts.semibold),
      bold: await embed(assets.fonts.bold),
      display: await embed(assets.fonts.display),
      displayHeavy: await embed(assets.fonts.displayHeavy),
    };
    const wordmark = await pdf.embedPng(assets.wordmarkPng);
    pdf.setTitle(meta.title);
    pdf.setSubject(meta.subject);
    pdf.setAuthor("Zyvorah");
    pdf.setProducer("Zyvorah");
    pdf.setCreator("zyvorah.com");
    return new Doc(pdf, f, wordmark);
  }

  /** A fresh page with the header drawn: wordmark left, the document's name
   *  right. The cursor lands below the header. */
  newPage(label: string): void {
    this.page = this.pdf.addPage(A4);
    this.page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: CLOUD });
    const top = A4[1] - M;
    const w = 74;
    const h = (this.wordmark.height / this.wordmark.width) * w;
    this.page.drawImage(this.wordmark, { x: M, y: top - h + 2, width: w, height: h });
    this.textRight(label, RIGHT, top - h / 2 - 2, 8.5, this.f.regular, SLATE);
    this.pages.push({ page: this.page, label });
    this.y = top - h - 48;
  }

  get pageNumber(): number {
    return this.pages.length;
  }

  /** Room left above the footer. */
  get room(): number {
    return this.y - (M + 24);
  }

  /** Start a new page unless `height` points fit above the footer. */
  ensure(height: number, label: string): void {
    if (this.room < height) this.newPage(label);
  }

  text(s: string, x: number, y: number, size: number, font: PDFFont, color: RGB = INK): void {
    this.page.drawText(s, { x, y, size, font, color });
  }

  textRight(s: string, right: number, y: number, size: number, font: PDFFont, color: RGB = INK): void {
    this.page.drawText(s, { x: right - font.widthOfTextAtSize(s, size), y, size, font, color });
  }

  /** Small tracked capitals — the kicker above a heading and a table's column
   *  names. pdf-lib has no letter spacing, so each glyph is placed by hand. */
  kicker(s: string, x: number, y: number, color: RGB = SLATE, size = 7.5, tracking = 1.1): number {
    const font = this.f.semibold;
    let cx = x;
    for (const ch of s.toUpperCase()) {
      this.page.drawText(ch, { x: cx, y, size, font, color });
      cx += font.widthOfTextAtSize(ch, size) + tracking;
    }
    return cx - tracking - x;
  }

  /** The width a kicker will take, so one can be right-aligned over a column of figures. */
  kickerWidth(s: string, size = 7.5, tracking = 1.1): number {
    const font = this.f.semibold;
    let w = 0;
    for (const ch of s.toUpperCase()) w += font.widthOfTextAtSize(ch, size) + tracking;
    return w - tracking;
  }

  kickerRight(s: string, right: number, y: number, color: RGB = SLATE): void {
    this.kicker(s, right - this.kickerWidth(s), y, color);
  }

  /** Close a table row whose first baseline was the cursor: a hairline a
   *  little under the row's last line, and the cursor on the next baseline.
   *  The rule sits 9 points under the last baseline (clear of descenders)
   *  and the next baseline 15 under the rule, so a rule never runs through
   *  the row below it. */
  rowEnd(lines: number, leading: number, x0 = M, x1 = RIGHT, color: RGB = HAIR): void {
    const rule = this.y - (lines - 1) * leading - 9;
    this.hairline(rule, x0, x1, color);
    this.y = rule - 15;
  }

  hairline(y: number, x0 = M, x1 = RIGHT, color: RGB = HAIR): void {
    this.page.drawLine({ start: { x: x0, y }, end: { x: x1, y }, thickness: 0.6, color });
  }

  /** A paragraph from the cursor down; returns the height used. */
  paragraph(
    s: string, x: number, width: number, size: number, font: PDFFont, color: RGB = INK, leading = size * 1.5,
  ): number {
    const lines = wrap(s, font, size, width);
    let y = this.y;
    for (const line of lines) {
      this.page.drawText(line, { x, y, size, font, color });
      y -= leading;
    }
    const used = lines.length * leading;
    this.y -= used;
    return used;
  }

  /** The height a paragraph would take, for page-break decisions. */
  measure(s: string, width: number, size: number, font: PDFFont, leading = size * 1.5): number {
    return wrap(s, font, size, width).length * leading;
  }

  /** A filled rounded panel whose top-left corner is at (x, top). */
  panel(x: number, top: number, w: number, h: number, color: RGB, radius = 14): void {
    this.page.drawSvgPath(roundedRectPath(w, h, radius), { x, y: top, color, borderWidth: 0 });
  }

  /** The footer for a page: the page count on the right (a sheet inside a
   *  multi-sheet file counts its own pages), the tagline on the left unless
   *  another line is given. Drawn by `finish`, once the count is known. */
  footer(page: PDFPage, right: string, left: string | null = null): void {
    this.footers.push({ page, left, right });
  }

  /** Draw every footer, then serialise. Pages that registered no footer of
   *  their own get the tagline and "n / total". */
  async finish(): Promise<Uint8Array> {
    const total = this.pages.length;
    this.pages.forEach(({ page }, i) => {
      const custom = this.footers.find((f) => f.page === page);
      const left = custom?.left ?? TAGLINE;
      const right = custom?.right ?? `${i + 1} / ${total}`;
      if (this.footerNote) {
        page.drawText(this.footerNote, { x: M, y: M - 6, size: 6.8, font: this.f.regular, color: SLATE });
      }
      page.drawText(left, { x: M, y: M - 18, size: 7.5, font: this.f.regular, color: SLATE });
      page.drawText(right, {
        x: RIGHT - this.f.regular.widthOfTextAtSize(right, 7.5), y: M - 18, size: 7.5, font: this.f.regular, color: SLATE,
      });
    });
    return this.pdf.save();
  }
}

/** "6 October 2026" from a YYYY-MM-DD key, without touching a timezone. */
export function longDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${d} ${months[m - 1]} ${y}`;
}
