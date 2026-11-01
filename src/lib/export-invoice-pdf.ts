import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatMarketMoney, type CurrencyCode } from "./markets";
import type { SellerGst } from "./gst";

// The drawing half of the commercial (export) invoice — no database, no
// storage, so it can be rendered from a fixture. lib/export-invoice.ts owns
// the order lookup, numbering and upload.

export type ExportLine = { desc: string; hsn: string; qty: number; unit: number; amount: number };

export type ExportInvoiceData = {
  invoiceNumber: string;
  invoiceDate: string;
  seller: SellerGst & { iec: string | null; lut: string | null };
  consignee: { name: string; addressLines: string[]; country: string; phone: string | null; email: string | null };
  currency: CurrencyCode;
  lines: ExportLine[];
  goodsTotal: number;
  delivery: number;
  grandTotal: number;
  destinationCountry: string;
  parcel: { tubes: number; lengthMm: number; diameterMm: number; weightKg: number | null };
  paymentRef: string | null;
};

/** Printed wall art on canvas or self-adhesive film is printed matter, not
 *  wallpaper — customs classifies them apart. */
export function hsnFor(materialSlug: string | null | undefined, seller: SellerGst): string {
  const s = (materialSlug ?? "").toLowerCase();
  if (s.includes("canvas") || s.includes("self-adhesive") || s.includes("self_adhesive")) return process.env.EXPORT_HSN_PRINTED_ART?.trim() || "4911";
  return seller.hsnGoods;
}

/** Spread the USD goods total the buyer actually paid across the lines in
 *  proportion to their INR value; the last line absorbs the rounding so the
 *  column always sums to the total on the receipt. */
export function allocateGoods(items: { line_total: number; quantity: number }[], goodsTotal: number): { unit: number; amount: number }[] {
  const inrTotal = items.reduce((s, it) => s + Number(it.line_total), 0);
  let allocated = 0;
  return items.map((it, i) => {
    const last = i === items.length - 1;
    const amount = last
      ? Math.round((goodsTotal - allocated) * 100) / 100
      : inrTotal > 0
        ? Math.round((goodsTotal * Number(it.line_total)) / inrTotal * 100) / 100
        : 0;
    allocated += amount;
    const qty = Math.max(1, Number(it.quantity) || 1);
    return { unit: Math.round((amount / qty) * 100) / 100, amount };
  });
}

export async function buildExportInvoicePdf(d: ExportInvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.06, 0.06, 0.06);
  const soft = rgb(0.42, 0.42, 0.42);
  const M = 42;
  const R = 595 - M;
  const money = (n: number) => formatMarketMoney(n, d.currency);

  const text = (s: string, x: number, y: number, size = 9, f = font, color = ink) =>
    page.drawText(s, { x, y, size, font: f, color });
  const right = (s: string, x: number, y: number, size = 9, f = font, color = ink) =>
    page.drawText(s, { x: x - f.widthOfTextAtSize(s, size), y, size, font: f, color });
  const line = (y: number) => page.drawLine({ start: { x: M, y }, end: { x: R, y }, thickness: 0.6, color: rgb(0.85, 0.85, 0.85) });

  let y = 800;
  text("COMMERCIAL INVOICE", M, y, 16, bold);
  right(`Invoice No: ${d.invoiceNumber}`, R, y + 4, 9, bold);
  right(`Date: ${d.invoiceDate}`, R, y - 9, 9, font, soft);
  y -= 14;
  text("Export of goods from India", M, y, 9, font, soft);
  y -= 20;

  // Exporter
  text("EXPORTER", M, y, 8, bold, soft); y -= 13;
  text(d.seller.legalName, M, y, 11, bold); y -= 13;
  for (const l of d.seller.address.split("\n")) { text(l, M, y, 9, font, soft); y -= 11; }
  text(`GSTIN: ${d.seller.gstin}`, M, y, 9, font, soft);
  if (d.seller.iec) text(`IEC: ${d.seller.iec}`, M + 200, y, 9, font, soft);
  y -= 12;
  text(d.seller.email, M, y, 9, font, soft);
  y -= 18;
  line(y); y -= 16;

  // Consignee
  text("CONSIGNEE / BUYER", M, y, 8, bold, soft); y -= 13;
  text(d.consignee.name || "—", M, y, 10, bold); y -= 12;
  for (const l of d.consignee.addressLines) { if (l) { text(l, M, y, 9, font, soft); y -= 11; } }
  text(d.consignee.country, M, y, 9, bold); y -= 11;
  if (d.consignee.phone) { text(`Phone: ${d.consignee.phone}`, M, y, 9, font, soft); y -= 11; }
  if (d.consignee.email) { text(`Email: ${d.consignee.email}`, M, y, 9, font, soft); y -= 11; }
  y -= 7;

  // Shipment facts, two columns
  const facts: [string, string][] = [
    ["Country of origin", "India"],
    ["Country of final destination", d.destinationCountry],
    ["Terms of delivery", "DAP (Incoterms 2020) — import duties and taxes at destination payable by consignee"],
    ["Terms of payment", d.paymentRef ? `Paid in full in advance (Razorpay ${d.paymentRef})` : "Paid in full in advance"],
    ["Currency", d.currency],
    ["Packages", `${d.parcel.tubes} × rigid tube, ${d.parcel.lengthMm} × ${d.parcel.diameterMm} mm${d.parcel.weightKg != null ? ` · chargeable weight ${d.parcel.weightKg} kg` : ""}`],
  ];
  for (const [k, v] of facts) {
    text(k, M, y, 8, bold, soft);
    text(v, M + 150, y, 8.5);
    y -= 12;
  }
  y -= 6;

  // Table header
  const cX = { n: M, desc: M + 22, hsn: 318, qty: 372, unit: 448, amt: R };
  line(y); y -= 4;
  text("#", cX.n, y - 9, 8, bold, soft);
  text("Description of goods", cX.desc, y - 9, 8, bold, soft);
  text("HS code", cX.hsn, y - 9, 8, bold, soft);
  text("Qty", cX.qty, y - 9, 8, bold, soft);
  right("Unit price", cX.unit, y - 9, 8, bold, soft);
  right("Amount", cX.amt, y - 9, 8, bold, soft);
  y -= 14; line(y); y -= 4;

  d.lines.forEach((l, i) => {
    text(String(i + 1), cX.n, y - 10, 9);
    const desc = l.desc.length > 58 ? l.desc.slice(0, 57) + "…" : l.desc;
    text(desc, cX.desc, y - 10, 9);
    text(l.hsn, cX.hsn, y - 10, 9);
    text(String(l.qty), cX.qty, y - 10, 9);
    right(money(l.unit), cX.unit, y - 10, 9);
    right(money(l.amount), cX.amt, y - 10, 9);
    y -= 18;
  });
  line(y); y -= 16;

  // Totals
  const tot = (label: string, val: string, b = false) => {
    text(label, 340, y, 9, b ? bold : font, b ? ink : soft);
    right(val, R, y, 9, b ? bold : font);
    y -= 15;
  };
  tot("Value of goods", money(d.goodsTotal));
  tot("International delivery", d.delivery > 0 ? money(d.delivery) : "Included");
  tot("GST (IGST)", "Nil — export of goods");
  y -= 2; line(y); y -= 16;
  tot(`Total (${d.currency})`, money(d.grandTotal), true);

  y -= 18;
  const foot = [
    d.seller.lut
      ? `Supply meant for export under Letter of Undertaking (${d.seller.lut}) without payment of integrated tax.`
      : "Supply meant for export without payment of integrated tax (zero-rated supply under the IGST Act).",
    "Goods are made to order and printed in India. Declared value is the price actually paid by the consignee.",
    "Import duties, customs brokerage and local taxes in the destination country are not included and are payable by the consignee.",
    "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
  ];
  for (const l of foot) { text(l, M, y, 8, font, soft); y -= 10; }

  y -= 26;
  text(`For ${d.seller.legalName}`, R - 170, y, 9, bold); y -= 30;
  text("Authorised signatory", R - 170, y, 8, font, soft);

  return doc.save();
}
