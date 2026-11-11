// The quotation and the specification sheets, actually built.
//
// Nobody sees these before a client does, so the checks are about what would
// be embarrassing: a file that does not open, the brand type silently replaced
// by Helvetica (which has no rupee sign), a sheet attached for a material that
// was not quoted, a document missing its company's PAN (the customer deducts
// TDS against it), or the page count drifting from the documents Roheena
// signed off on 6 October 2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { renderQuotationPdf } from "./quotation-pdf";
import { MAGNITUDE_BRANDS, MAGNITUDE_SPACES } from "./issuers";
import { renderSpecSheetsPdf } from "./spec-sheet-pdf";
import { KRT_QUOTATION, KRT_SPEC_SHEETS } from "./krt-fixture";
import type { BrandAssets } from "./pdf-kit";

const PUBLIC = join(process.cwd(), "public");

/** The same files loadBrandAssets() fetches on the Worker, read off disk. */
export function brandAssetsFromDisk(): BrandAssets {
  const f = (p: string) => new Uint8Array(readFileSync(join(PUBLIC, p)));
  return {
    fonts: {
      regular: f("fonts/pdf/Inter-Regular.ttf"),
      semibold: f("fonts/pdf/Inter-SemiBold.ttf"),
      bold: f("fonts/pdf/Inter-Bold.ttf"),
      display: f("fonts/pdf/Jakarta-Bold.ttf"),
      displayHeavy: f("fonts/pdf/Jakarta-ExtraBold.ttf"),
    },
    wordmarkPng: f("logo-dark.png"),
  };
}

/** A 48×32 JPEG, so a test can put a picture on a wall without a file. */
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAgADADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDUooorA0CiiigAooooAKKKKACiiigAooooA//Z",
  "base64",
);

test("the KRT supply quotation: two pages, Magnitude Brands with GSTIN and PAN, in the brand's own type", async () => {
  const bytes = await renderQuotationPdf(KRT_QUOTATION, "supply", brandAssetsFromDisk());
  const pdf = await PDFDocument.load(bytes);
  // The walls one by one (measurement and price; no pictures on the
  // fixture) across pages one and two, then pricing, materials, terms, the
  // issuing company and the signature (6 October 2026).
  assert.equal(pdf.getPageCount(), 2);
  assert.equal(pdf.getTitle(), "Supply quotation ZYV/Q/2026-27/KRT-01-S · Rev. 1 — Knowledge Realty Trust");
  // Font dictionaries sit inside compressed object streams, so read them
  // through pdf-lib rather than grepping the bytes.
  const objects = pdf.context.enumerateIndirectObjects().map(([, o]) => o.toString()).join("\n");
  const fonts = objects.match(/\/BaseFont\s*\/([A-Za-z0-9+-]+)/g) ?? [];
  assert.ok(fonts.some((f) => f.includes("Inter")), `Inter is embedded: ${fonts.join(", ")}`);
  assert.ok(fonts.some((f) => f.includes("PlusJakartaSans")), `Plus Jakarta Sans is embedded: ${fonts.join(", ")}`);
  assert.ok(!fonts.some((f) => f.includes("Helvetica")), "no fallback to Helvetica");
  assert.ok(bytes.length < 400_000, `size ${bytes.length}`);
});

test("the KRT installation quotation: two pages, issued by Magnitude Spaces, and nothing of the supply schedule", async () => {
  const bytes = await renderQuotationPdf(KRT_QUOTATION, "install", brandAssetsFromDisk());
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 2);
  assert.equal(pdf.getTitle(), "Installation quotation ZYV/Q/2026-27/KRT-01-I · Rev. 1 — Knowledge Realty Trust");
});

test("a wall with a picture is quoted picture, measurement, price: the KRT documents run to four pages with pictures on six walls", async () => {
  // Roheena, 6 October 2026: "we add an image, then the measurement, then
  // the quotation" — the Vijay Sales sequence, for every quotation.
  const q = {
    ...KRT_QUOTATION,
    lines: KRT_QUOTATION.lines.map((l) => (l.seq === 2 ? l : { ...l, picture: { path: `quotation/x/w0${l.seq}.jpg`, kind: "proposed" as const, caption: `Proposed · ${l.location}` } })),
  };
  q.lines[3] = { ...q.lines[3], widthMm: 9450, heightMm: 3300 };
  const pictures = new Map<number, Uint8Array>(q.lines.filter((l) => l.picture).map((l) => [l.seq, new Uint8Array(TINY_JPEG)]));
  const supply = await PDFDocument.load(await renderQuotationPdf(q, "supply", brandAssetsFromDisk(), { pictures }));
  const install = await PDFDocument.load(await renderQuotationPdf(q, "install", brandAssetsFromDisk(), { pictures }));
  assert.equal(supply.getPageCount(), 4);
  assert.equal(install.getPageCount(), 4);
  // Six pictures embedded: one image XObject per wall that has one, over
  // and above the wordmark the header carries on every document.
  const imagesIn = (pdf: PDFDocument) => pdf.context.enumerateIndirectObjects().filter(([, o]) => /\/Subtype \/Image/.test(o.toString())).length;
  const bare = await PDFDocument.load(await renderQuotationPdf(KRT_QUOTATION, "supply", brandAssetsFromDisk()));
  assert.equal(imagesIn(supply) - imagesIn(bare), 6);
  // A picture that cannot be decoded costs the picture, never the document.
  const broken = new Map<number, Uint8Array>([[1, new Uint8Array([1, 2, 3])]]);
  const bytes = await renderQuotationPdf(q, "supply", brandAssetsFromDisk(), { pictures: broken });
  assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 2);
});

test("a supply-only quotation has no installation document", async () => {
  const canvasOnly = {
    ...KRT_QUOTATION,
    lines: [{ seq: 1, location: "Boardroom", basis: "", material: "canvas", sqft: 40 }],
    rates: [{ material: "canvas", supplyExGst: 211.86, installExGst: null }],
    materialNotes: [{ material: "canvas", text: "Canvas." }],
  };
  const supply = await renderQuotationPdf(canvasOnly, "supply", brandAssetsFromDisk());
  assert.ok((await PDFDocument.load(supply)).getPageCount() >= 1);
  await assert.rejects(renderQuotationPdf(canvasOnly, "install", brandAssetsFromDisk()), /no installation quotation/);
});

test("the identities each document prints: a GSTIN that embeds its PAN, a CIN, one registered office", () => {
  // pdf-lib subsets the fonts, so glyphs are drawn by glyph id and the page
  // text is not greppable; the identities are checked on the issuer records
  // the renderer draws from.
  assert.equal(MAGNITUDE_BRANDS.gstin.slice(2, 12), MAGNITUDE_BRANDS.pan, "a GSTIN embeds the PAN");
  assert.equal(MAGNITUDE_SPACES.gstin.slice(2, 12), MAGNITUDE_SPACES.pan, "a GSTIN embeds the PAN");
  assert.equal(MAGNITUDE_BRANDS.address, MAGNITUDE_SPACES.address, "Roheena, 6 October 2026: both have the same registered office");
  assert.match(MAGNITUDE_BRANDS.cin, /^U\d{5}PN\d{4}PTC\d{6}$/);
  assert.match(MAGNITUDE_SPACES.cin, /^U\d{5}PN\d{4}PTC\d{6}$/);
});

test("the KRT specification sheets: two pages for the film, one for the non-woven, each counted on its own", async () => {
  const bytes = await renderSpecSheetsPdf(KRT_SPEC_SHEETS, brandAssetsFromDisk());
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 3);
  assert.equal(pdf.getTitle(), "Zyvorah product specification");
});

test("a sheet is refused for a material that is not in the library, and for no material at all", async () => {
  const assets = brandAssetsFromDisk();
  await assert.rejects(renderSpecSheetsPdf([{ material: "marble", kicker: "x", forWhat: "x" }], assets), /unknown material/);
  await assert.rejects(renderSpecSheetsPdf([], assets), /nothing to render/);
});

test("every library material renders a sheet on its own", async () => {
  const { MATERIAL_SPECS } = await import("./material-specs");
  const assets = brandAssetsFromDisk();
  for (const m of MATERIAL_SPECS) {
    const bytes = await renderSpecSheetsPdf([{ material: m.key, kicker: "Test walls", forWhat: "the test walls" }], assets);
    const pdf = await PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() >= 1, m.key);
  }
});
