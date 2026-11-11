import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { paginateText, wrap } from "./project-pdf-text";

test("hotel cost paragraphs can be encoded in the actual PDF font", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const lines = wrap("A six-room pilot costs ₹83,200 at ₹200 per sq ft.", font, 11, 746);
  assert.equal(lines.join(" "), "A six-room pilot costs Rs 83,200 at Rs 200 per sq ft.");
  const page = pdf.addPage();
  lines.forEach((line, i) => page.drawText(line, { font, size: 11, y: 700 - i * 17 }));
  assert.ok((await pdf.save()).length > 500);
});

test("a long room story retains its final sentence within printable page margins", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const paragraphs = Array.from({ length: 80 }, (_, i) => `Room story ${i + 1}: ${"Subtle garden drawings belong inside measured panelling. ".repeat(7)}`);
  paragraphs.push("The final production proof must be approved before printing.");
  const pages = paginateText(paragraphs, font, 746);
  assert.ok(pages.length > 3);
  assert.equal(pages.flat().at(-1)?.text, paragraphs.at(-1));
  assert.ok(pages.flat().every(line => line.y >= 68 && line.y <= 513));
  assert.equal(pages.flat().map(line => line.text).join(" "), paragraphs.join(" ").trim());
});
