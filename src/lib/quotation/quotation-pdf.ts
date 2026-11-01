import type { PDFImage } from "pdf-lib";
import { Doc, HAIR, INK, M, MIST, RIGHT, SAGE, SLATE, WIDTH, longDate, wrap, type BrandAssets } from "./pdf-kit";
import { lineAmount, lineSize, quotationTotals, termsFor, type PartTotals, type Quotation, type QuotationPart } from "./model";
import { partLabel, partName, partReference } from "./numbering";
import { requireMaterialSpec } from "./material-specs";
import { formatInr, formatRate, formatSqft } from "./words";
import { MAGNITUDE_BRANDS, issuerLine } from "./issuers";
import { MBPL_BANK, MBPL_UPI_ID } from "../mbpl-payment";

/**
 * ONE of the two quotation documents as a file, in Zyvorah's own design.
 *
 * A quotation leaves as two PDFs under one reference (Roheena, 6 October
 * 2026): the SUPPLY quotation, issued by Magnitude Brands Private Limited
 * for the printed wallcovering delivered to site, and the INSTALLATION
 * quotation, issued by Magnitude Spaces Private Limited for fitting it. Each
 * is the shape of the tax invoice its company will raise, and each prints
 * its company's legal name, GSTIN, PAN, CIN and registered office — the
 * customer registers each company as a vendor and deducts TDS against each
 * PAN, so neither identity may be missing from either document.
 *
 * Page one says what is being quoted and for whom, then THE WALLS, one by
 * one: the picture of the artwork on that wall (or the wall today), its
 * measurement, and what it comes to on this document — the sequence the
 * Vijay Sales proposals read in (Roheena, 6 October 2026: "we add an image,
 * then the measurement, then the quotation"). Then this document's pricing
 * per material, GST on top, the total in a sage panel with the amount in
 * words under it; the materials (supply) or what the customer prepares
 * (installation); the terms; who issues it; and the signature. Each
 * document names the other, without its figures, so a reader holding one
 * knows the other exists.
 *
 * Pictures arrive as bytes (`pictures`, keyed by line seq) so this stays a
 * pure function of its inputs; store.ts reads them from the private store.
 */

const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

/** Who signs: the same person on both documents. */
export type QuotationSignatory = {
  signatory: string;
  role: string;
  email: string;
  phone: string;
  site: string;
};

export const DEFAULT_SIGNATORY: QuotationSignatory = {
  signatory: "Roheena Nagpal",
  role: "Zyvorah",
  email: "hello@zyvorah.com",
  phone: "+91 74999 16485",
  site: "zyvorah.com",
};

export async function renderQuotationPdf(
  q: Quotation,
  part: QuotationPart,
  assets: BrandAssets,
  opts: { pictures?: Map<number, Uint8Array>; signatory?: QuotationSignatory } = {},
): Promise<Uint8Array> {
  const signatory = opts.signatory ?? DEFAULT_SIGNATORY;
  const pictures = opts.pictures;
  const t = quotationTotals(q);
  const totals: PartTotals | null = part === "supply" ? t.supply : t.install;
  if (!totals) throw new Error(`quotation ${q.number}: nothing is installed, so there is no installation quotation`);
  const issuer = totals.issuer;
  const other: PartTotals | null = part === "supply" ? t.install : t.supply;
  const label = partLabel(q.number, q.revision, part);
  const docName = partName(part);
  const doc = await Doc.create(assets, { title: `${docName} ${label} — ${q.preparedFor.organisation}`, subject: docName });
  const f = doc.f;
  /** Later pages carry the reference in the running header, as the original did. */
  const later = `${docName} · ${label}`;
  const name = (key: string) => requireMaterialSpec(key).shortName;

  doc.newPage(docName);

  // ── Title block ────────────────────────────────────────────────────────
  doc.kicker(`${docName} · ${partReference(q.number, part)} · Rev. ${q.revision}`, M, doc.y);
  doc.y -= 22;
  const title = part === "supply" ? q.title : `Installation of ${q.title.charAt(0).toLowerCase()}${q.title.slice(1)}`;
  for (const line of wrap(title, f.displayHeavy, 22, WIDTH)) {
    doc.text(line, M, doc.y, 22, f.displayHeavy, INK);
    doc.y -= 28;
  }
  doc.y -= 4;
  doc.text(`Issued by ${issuer.legalName}`, M, doc.y, 9.5, f.semibold, INK);
  doc.y -= 13;
  doc.text(`GSTIN ${issuer.gstin}  ·  PAN ${issuer.pan}`, M, doc.y, 8.5, f.regular, SLATE);
  doc.y -= 24;

  // ── Prepared for | reference ──────────────────────────────────────────
  const top = doc.y;
  doc.kicker("Prepared for", M, top);
  let ly = top - 18;
  doc.text(q.preparedFor.organisation, M, ly, 10.5, f.semibold, INK); ly -= 15;
  if (q.preparedFor.site) { doc.text(q.preparedFor.site, M, ly, 10, f.regular, INK); ly -= 15; }
  if (q.preparedFor.attention) { doc.text(`Attn: ${q.preparedFor.attention}`, M, ly, 10, f.regular, SLATE); ly -= 15; }

  const rx = M + WIDTH * 0.47;
  const labelW = 78;
  const valueW = RIGHT - rx - labelW;
  let ry = top;
  const meta: [string, string][] = [
    ["Reference", label],
    ["Date", longDate(q.dateKey)],
    ["Valid until", longDate(q.validUntil)],
  ];
  if (q.measurementSource) meta.push(["Measurements", `As per measurements taken by ${q.measurementSource}. Final, no further measurement.`]);
  if (other) meta.push([part === "supply" ? "Installation" : "Supply", `${partReference(q.number, other.kind)}, ${other.issuer.legalName}`]);
  for (const [k, v] of meta) {
    doc.text(k, rx, ry, 9, f.regular, SLATE);
    const lines = wrap(v, f.semibold, 9.5, valueW);
    lines.forEach((line, i) => doc.text(line, rx + labelW, ry - i * 12, 9.5, f.semibold, INK));
    ry -= 15 + (lines.length - 1) * 12;
  }
  doc.y = Math.min(ly, ry) - 22;

  // ── The walls: picture, measurement, price ───────────────────────────
  // Each wall is quoted the way the Vijay Sales proposals are read (Roheena,
  // 6 October 2026): the picture of the artwork on that wall — or the wall
  // as it stands — then its measurement, then what it comes to on THIS
  // document. The installation document lists only the walls we install (a
  // material we do not fit, canvas say, is supply-only); supply lists all.
  const lines = part === "supply" ? q.lines : q.lines.filter((l) => totals.lines.some((p) => p.material === l.material));
  const PIC_W = 200;
  const PIC_H = 134;
  const GAP = 18;
  const rateOf = (material: string) => {
    const r = q.rates.find((x) => x.material === material)!;
    return part === "supply" ? r.supplyExGst : r.installExGst!;
  };
  doc.ensure(90, later);
  doc.text(part === "supply" ? "The walls" : "The walls we install", M, doc.y, 13, f.display, INK);
  doc.y -= 14;
  doc.y -= 4;
  for (const line of lines) {
    const pic = pictures?.get(line.seq) ?? null;
    let img: PDFImage | null = null;
    if (pic) {
      try {
        img = isPng(pic) ? await doc.pdf.embedPng(pic) : await doc.pdf.embedJpg(pic);
      } catch {
        img = null; // an unreadable picture costs the picture, never the document
      }
    }
    const scale = img ? Math.min(PIC_W / img.width, PIC_H / img.height) : 0;
    const pw = img ? img.width * scale : 0;
    const ph = img ? img.height * scale : 0;
    const tx = img ? M + PIC_W + GAP : M;
    const tw = RIGHT - tx;
    const amount = lineAmount(q, line, part)!;
    const size = lineSize(line);
    const facts = [`${formatSqft(part === "supply" && line.catalogue ? line.catalogue.billableSqft : line.sqft)} sq ft`, size, line.catalogue?.surface ?? name(line.material), part === "supply" && line.catalogue ? `${formatRate(line.catalogue.rateInclGst)} per sq ft incl. GST` : `${formatRate(rateOf(line.material))} per sq ft ex GST`].filter(Boolean).join("  ·  ");
    const nameLines = wrap(`${line.seq}.  ${line.location}${line.bespokeName ? ` — Bespoke – ${line.bespokeName}` : ""}`, f.semibold, 10.5, tw - 90);
    const basisLines = line.basis ? wrap(line.basis, f.regular, 9, tw) : [];
    const captionLines = img && line.picture?.caption ? wrap(line.picture.caption, f.regular, 7.5, PIC_W) : [];
    const textH = nameLines.length * 14 + 14 + basisLines.length * 12;
    const picH = img ? ph + (captionLines.length ? 4 + captionLines.length * 10 : 0) : 0;
    const blockH = Math.max(textH, picH) + 22;
    if (doc.room < blockH) doc.newPage(later);
    const top = doc.y + 9;
    if (img) {
      doc.page.drawImage(img, { x: M, y: top - ph, width: pw, height: ph });
      captionLines.forEach((c, i) => doc.text(c, M, top - ph - 10 - i * 10, 7.5, f.regular, MIST));
    }
    let y = doc.y;
    nameLines.forEach((l, i) => doc.text(l, tx, y - i * 14, 10.5, f.semibold, INK));
    doc.textRight(formatInr(amount), RIGHT, y, 10.5, f.semibold, INK);
    y -= nameLines.length * 14;
    doc.text(facts, tx, y, 8.5, f.regular, SLATE);
    y -= 14;
    basisLines.forEach((l, i) => doc.text(l, tx, y - i * 12, 9, f.regular, INK));
    doc.y -= Math.max(textH, picH) + 10;
    doc.hairline(doc.y + 2, M, RIGHT, HAIR);
    doc.y -= 16;
  }
  doc.y -= 10;

  // ── Pricing: this company's part only ─────────────────────────────────
  const priceCols = { item: M, sqft: M + 300, rate: M + 372, amount: RIGHT };
  const partHeight = 44 + totals.lines.length * 24 + 3 * 15 + 16;
  if (doc.room < Math.min(60 + partHeight, 320)) doc.newPage(later);
  doc.text("Pricing", M, doc.y, 13, f.display, INK);
  doc.y -= 16;
  doc.y -= 2;
  doc.ensure(partHeight, later);
  doc.kicker("Item", M, doc.y);
  doc.kickerRight("Sq ft", priceCols.sqft + 10, doc.y);
  doc.kickerRight("Rate, ex GST", priceCols.rate + 40, doc.y);
  doc.kickerRight("Amount", priceCols.amount, doc.y);
  doc.y -= 7;
  doc.hairline(doc.y, M, RIGHT, MIST);
  doc.y -= 15;
  for (const line of totals.lines) {
    const item = line.kind === "supply"
      ? `Supply: ${line.title ?? name(line.material)}, sized to your wall`
      : `Installation: ${name(line.material)}`;
    const itemLines = wrap(item, f.regular, 9.5, priceCols.sqft - 60 - M);
    if (doc.room < (itemLines.length - 1) * 12 + 70) doc.newPage(later);
    itemLines.forEach((s, i) => doc.text(s, priceCols.item, doc.y - i * 12, 9.5, f.regular, INK));
    doc.textRight(formatSqft(line.sqft), priceCols.sqft + 10, doc.y, 9.5, f.regular, INK);
    doc.textRight(formatRate(line.rateExGst), priceCols.rate + 40, doc.y, 9.5, f.regular, INK);
    doc.textRight(formatInr(line.amount), priceCols.amount, doc.y, 9.5, f.semibold, INK);
    doc.rowEnd(itemLines.length, 12);
  }
  doc.ensure(36, later);
  doc.text("Subtotal", priceCols.item, doc.y, 9.5, f.regular, SLATE);
  doc.textRight(formatInr(totals.subtotal), priceCols.amount, doc.y, 9.5, f.regular, INK);
  doc.y -= 15;
  doc.text(`GST at ${Math.round(q.gstRate * 100)}%`, priceCols.item, doc.y, 9.5, f.regular, SLATE);
  doc.textRight(formatInr(totals.gst), priceCols.amount, doc.y, 9.5, f.regular, INK);
  doc.y -= 20;

  // This document's total, in a sage panel, with the amount in words beneath it.
  doc.ensure(84, later);
  const panelH = 56;
  doc.panel(M, doc.y + 8, WIDTH, panelH, SAGE, 12);
  doc.text(`Total ${part === "supply" ? "supply" : "installation"}, including GST`, M + 20, doc.y - 15, 10, f.semibold, INK);
  doc.textRight(formatInr(totals.total), RIGHT - 20, doc.y - 19, 17, f.displayHeavy, INK);
  doc.text(totals.totalInWords, M + 20, doc.y - 35, 8.5, f.regular, SLATE);
  doc.y -= panelH + 10;

  // ── Materials (supply) / site preparation (installation), then terms ──
  const LEAD = 12.8;
  const section = (heading: string, items: string[]) => {
    if (!items.length) return;
    const first = doc.measure(items[0], WIDTH - 18, 9.5, f.regular, LEAD);
    doc.ensure(36 + first, later);
    doc.text(heading, M, doc.y, 11, f.display, INK);
    doc.y -= 17;
    for (const item of items) {
      const h = doc.measure(item, WIDTH - 18, 9.5, f.regular, LEAD);
      if (doc.room < h) doc.newPage(later);
      doc.text("—", M, doc.y, 9.5, f.regular, SLATE);
      const y0 = doc.y;
      wrap(item, f.regular, 9.5, WIDTH - 18).forEach((s, i) => doc.text(s, M + 18, y0 - i * LEAD, 9.5, f.regular, INK));
      doc.y -= h + 2;
    }
    doc.y -= 7;
  };
  if (part === "supply") {
    section("Materials", q.materialNotes.map((m) => m.text));
    // With no installation by us, the customer's own installer needs the
    // preparation list, so it rides the supply document instead.
    if (!other) section(`Site preparation by ${q.preparedFor.organisation}`, q.sitePrep);
  } else {
    section(`Site preparation by ${q.preparedFor.organisation}`, q.sitePrep);
  }
  section("Terms", termsFor(q, part));

  // ── Issued by: this company, as on its tax invoice ────────────────────
  // Kept on one page with the signature under it: the identity the customer
  // registers and the hand that offers it belong together.
  doc.ensure(130, later);
  doc.text("Issued by", M, doc.y, 11, f.display, INK);
  // How to pay, on the document Magnitude Brands issues only: the account is
  // that company's, and the installation quotation is another company's
  // (Roheena, 29 October 2026: some customers pay by bank transfer). It is a
  // column beside the company's numbers, so the quotation stays the two pages
  // she signed off.
  if (issuer.gstin === MAGNITUDE_BRANDS.gstin) {
    const cx = M + 190;
    doc.text("How to pay", cx, doc.y, 11, f.display, INK);
    const pay: [string, string][] = [
      ["Bank", `${MBPL_BANK.bankName}, ${MBPL_BANK.branch}`],
      ["Transfer", `A/c ${MBPL_BANK.accountNumber} · IFSC ${MBPL_BANK.ifsc}`],
      ["UPI / GPay", MBPL_UPI_ID],
      ["Reference", partReference(q.number, part)],
    ];
    pay.forEach(([k, v], i) => {
      const yy = doc.y - 16 - (i === 0 ? 0 : 13 + (i - 1) * 12);
      doc.text(k, cx, yy, 8.5, f.regular, SLATE);
      doc.text(v, cx + 52, yy, 8.5, f.semibold, INK);
    });
  }
  doc.y -= 16;
  doc.text(issuer.legalName, M, doc.y, 9.5, f.semibold, INK);
  doc.y -= 13;
  const ids: [string, string][] = [["GSTIN", issuer.gstin], ["PAN", issuer.pan], ["CIN", issuer.cin]];
  for (const [k, v] of ids) {
    doc.text(k, M, doc.y, 8.5, f.regular, SLATE);
    doc.text(v, M + 44, doc.y, 8.5, f.semibold, INK);
    doc.y -= 12;
  }
  doc.text("Registered office", M, doc.y, 8.5, f.regular, SLATE);
  const addr = wrap(issuer.address, f.regular, 8.5, WIDTH - 96);
  addr.forEach((line, i) => doc.text(line, M + 96, doc.y - i * 12, 8.5, f.regular, INK));
  doc.y -= addr.length * 12 + 10;

  // ── Signature ─────────────────────────────────────────────────────────
  doc.hairline(doc.y + 6, M, M + 120, HAIR);
  doc.y -= 12;
  doc.text(signatory.signatory, M, doc.y, 10, f.semibold, INK);
  doc.y -= 14;
  doc.text(signatory.role, M, doc.y, 9, f.regular, SLATE);
  doc.y -= 14;
  doc.text(`${signatory.email} · ${signatory.phone} · ${signatory.site}`, M, doc.y, 8.5, f.regular, SLATE);

  // Every page's footer names the issuing company with its GSTIN and PAN,
  // so a page forwarded on its own still says who is offering what.
  doc.footerNote = issuerLine(issuer);

  return doc.finish();
}
