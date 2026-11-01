import type { PDFFont } from "pdf-lib";

/** Standard PDF fonts have no rupee glyph; preserve the amount in readable text. */
export function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.replace(/₹/g, "Rs ").split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const attempt = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(attempt, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = attempt;
  }
  if (line) lines.push(line);
  return lines;
}

/** Keep every line inside the text area, even when a paragraph spans pages. */
export function paginateText(paragraphs: string[], font: PDFFont, width: number) {
  const pages: { text: string; y: number }[][] = [[]];
  let y = 513;
  for (const paragraph of paragraphs) {
    for (const text of wrap(paragraph, font, 11, width)) {
      if (y < 68) { pages.push([]); y = 513; }
      pages[pages.length - 1].push({ text, y });
      y -= 17;
    }
    y -= 12;
  }
  return pages.filter(page => page.length);
}
