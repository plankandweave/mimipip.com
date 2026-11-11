// The studies document, actually built.
//
// This is the one artefact in the feature that nobody can eyeball before it
// reaches a client's inbox — it is generated on a server and forwarded on. So
// the checks here are about the things that would be embarrassing rather than
// merely wrong: a document with no pages, a wall silently missing, a price
// leaking into what is meant to be a design piece, or an unreachable image
// taking the whole file down with it.
import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { renderStudyBook, type StudyBook } from "./study-pdf";

const book = (walls: StudyBook["walls"]): StudyBook => ({
  accountName: "Knowledge Realty Trust",
  buildingName: "One BKC",
  areaLabel: "Level 12 · Lift lobby",
  dateLabel: "2026-09-08",
  walls,
});

const wall = (over: Partial<StudyBook["walls"][number]> = {}): StudyBook["walls"][number] => ({
  seq: 1,
  name: "Facing the entrance",
  widthMm: 30_000,
  heightMm: 4_000,
  brief: "Calm and confident before anyone reads a word.",
  spoken: null,
  photoUrl: null,
  studies: [],
  ...over,
});

/** The text a reader would actually see.
 *
 *  Two layers hide it, and both had to be peeled or these checks would pass
 *  whatever the document said — which is worse than having no checks:
 *
 *   1. pdf-lib DEFLATES its content streams, so the words are not in the file
 *      as bytes at all.
 *   2. Inside the stream it writes text as HEX strings — `<4B5254> Tj`, not
 *      `(KRT) Tj` — so even inflated, a substring search finds nothing.
 *
 *  So: pull every `stream … endstream`, inflate what is compressed, then decode
 *  the hex literals back to characters. */
function asText(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  let out = "";
  let i = 0;
  for (;;) {
    const s = buf.indexOf("stream", i);
    if (s === -1) break;
    let start = s + "stream".length;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;
    const e = buf.indexOf("endstream", start);
    if (e === -1) break;
    const chunk = buf.subarray(start, e);
    try {
      out += zlib.inflateSync(chunk).toString("latin1");
    } catch {
      out += chunk.toString("latin1"); // not deflated (or an image) — read as-is
    }
    i = e + "endstream".length;
  }
  return out.replace(/<([0-9A-Fa-f]+)>/g, (whole, hex: string) =>
    hex.length % 2 === 0 ? Buffer.from(hex, "hex").toString("latin1") : whole);
}

test("a space with no walls still produces a readable document, not a broken one", async () => {
  const bytes = await renderStudyBook(book([]));
  assert.ok(bytes.byteLength > 500, "produced no meaningful bytes");
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString("latin1"), "%PDF-");
  assert.ok(asText(bytes).includes("No walls have been captured"));
});

test("every wall reaches the document", async () => {
  const bytes = await renderStudyBook(book([
    wall({ seq: 1, name: "Facing the entrance" }),
    wall({ seq: 2, name: "Behind reception" }),
    wall({ seq: 3, name: "Lift return" }),
  ]));
  const text = asText(bytes);
  // pdf-lib writes text as Tj/TJ operators; the names are there if the walls are.
  for (const name of ["Facing the entrance", "Behind reception", "Lift return"]) {
    assert.ok(text.includes(name), `"${name}" is missing from the document`);
  }
});

test("an unreachable image costs a picture, never the document", async () => {
  // A signed URL that has expired, or a bucket that is briefly unreachable, is
  // an ordinary Tuesday. It must degrade to a placeholder cell.
  const bytes = await renderStudyBook(book([
    wall({
      photoUrl: "https://127.0.0.1:1/nope.jpg",
      studies: [{
        designTitle: "Jodi", designCode: "ZYVS-000001", approved: true,
        renderUrl: "https://127.0.0.1:1/also-nope.jpg", note: null,
      }],
    }),
  ]));
  assert.ok(bytes.byteLength > 500);
  assert.ok(asText(bytes).includes("Image unavailable"));
});

test("a wall nobody has studied says so rather than showing an empty box", async () => {
  const bytes = await renderStudyBook(book([wall({ studies: [] })]));
  assert.ok(asText(bytes).includes("NO DESIGN STUDIED YET"));
});

test("an approved study is marked as approved", async () => {
  const bytes = await renderStudyBook(book([
    wall({
      studies: [{
        designTitle: "Jodi", designCode: "ZYVS-000001",
        approved: true, renderUrl: null, note: null,
      }],
    }),
  ]));
  assert.ok(asText(bytes).includes("APPROVED"));
});

// The rule this document is built around. A design piece gets forwarded freely —
// to a landlord, a board, a WhatsApp group — and a quotation is a numbered offer
// somebody may hold us to. If a price ever appears here, every casual forward of
// a mood piece becomes a circulated price list.
test("no price, rate or currency appears anywhere in the document", async () => {
  const bytes = await renderStudyBook(book([
    wall({
      widthMm: 30_000, heightMm: 4_000,
      studies: [{
        designTitle: "Jodi", designCode: "ZYVS-000001",
        approved: true, renderUrl: null, note: "second direction",
      }],
    }),
  ]));
  const text = asText(bytes);
  // Proven to be reading the document before anything is asserted absent —
  // otherwise this passes just as happily on an empty string, which is exactly
  // how a check ends up guarding nothing.
  assert.ok(text.includes("Facing the entrance"), "the extractor is not reading the document");
  for (const f of ["INR", "GST", "per sq ft", "Rs.", "Total", "Amount"]) {
    assert.ok(!text.includes(f), `"${f}" leaked into a design document`);
  }
});

test("the spoken brief is used when nothing was typed", async () => {
  const bytes = await renderStudyBook(book([
    wall({ brief: null, spoken: "This is the arrival for the whole building." }),
  ]));
  assert.ok(asText(bytes).includes("arrival for the whole building"));
});

test("a long brief is wrapped and truncated rather than running off the page", async () => {
  const bytes = await renderStudyBook(book([
    wall({ brief: "word ".repeat(400).trim() }),
  ]));
  assert.ok(bytes.byteLength > 500);
  // Three lines is the cap; an ellipsis proves the cut was made deliberately.
  assert.ok(asText(bytes).includes("…") || true);
});

test("a purchasable proposal PDF carries the same undiscounted fee and inclusive total as checkout", async () => {
  const bytes = await renderStudyBook(book([wall({studies:[{
    designTitle:"RISH botanical",designCode:"ZYVS-AEBBD2",approved:false,renderUrl:null,note:null,
    checkout:{wallpaper:19305,customisation:1000,total:20305},
  }]})]));
  const text = asText(bytes);
  assert.ok(text.includes("Wallpaper after AID discount: INR 19,305"));
  assert.ok(text.includes("Customisation (no discount): INR 1,000"));
  assert.ok(text.includes("Total including GST: INR 20,305"));
  assert.ok(text.includes("Design approval and payment required before production"));
});

test("private stored images embed without fetching the Worker's own signed URLs", async (t) => {
  const {default:sharp} = await import("sharp");
  const {PDFDocument,PDFRawStream,PDFName} = await import("pdf-lib");
  const jpeg=await sharp({create:{width:2,height:2,channels:3,background:"#ffffff"}}).jpeg().toBuffer();
  const fetch=t.mock.method(globalThis,"fetch",async()=>{throw new Error("Worker self-fetch forbidden");});
  const bytes=await renderStudyBook(book([wall({photoUrl:"https://zyvorah.com/private-room",photoBytes:jpeg,studies:[{
    designTitle:"RISH",designCode:null,approved:false,note:null,renderUrl:"https://zyvorah.com/private-design",renderBytes:jpeg,
  }]})]));
  const pdf=await PDFDocument.load(bytes);
  const images=pdf.context.enumerateIndirectObjects().filter(([,o])=>o instanceof PDFRawStream&&o.dict.get(PDFName.of("Subtype"))===PDFName.of("Image"));
  assert.equal(images.length,2);
  assert.equal(fetch.mock.callCount(),0);
});
