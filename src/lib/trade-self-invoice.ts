import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabaseAdmin } from "./supabase-admin";
import { financialYear } from "./gst";
import { toUploadBody } from "./storage-body";

// Self-billed commission invoice: the partner is the supplier, Zyvorah/MBPL
// is the recipient — the reverse of the usual GST invoice. Generated ONLY
// once a payout is confirmed processed (trade_ledger.status = 'paid'), never
// earlier, so an invoice can never exist for money that didn't actually move.
// Self-billing requires the supplier's consent — trade_partners.
// self_billing_consent_at, collected at onboarding (Phase 1) — and that is
// stated on the face of the document.
//
// Numbering uses a SEPARATE series from sales invoices (prefix ZYVSB, not
// ZYV) via allocate_invoice_number_by_ref, keyed on `trade-ledger-<id>` so a
// retried call is idempotent. Standard fonts can't encode ₹; amounts print as
// "Rs.".

const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const rs = (n: number) => `Rs. ${money.format(Math.round(n))}`;

type SelfInvoiceData = {
  invoiceNumber: string;
  invoiceDate: string;
  supplier: { legalName: string; pan: string; gstin: string | null };
  orderNumber: number;
  baseExGst: number;
  markupExGst: number;
  commissionPct: number;
  grossCommission: number;
  gstOnCommission: number;
  tdsPct: number;
  tdsAmount: number;
  netPayout: number;
};

async function buildSelfInvoicePdf(d: SelfInvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.06, 0.06, 0.06);
  const soft = rgb(0.42, 0.42, 0.42);
  const M = 42;
  const R = 595 - M;

  const text = (s: string, x: number, y: number, size = 9, f = font, color = ink) =>
    page.drawText(s, { x, y, size, font: f, color });
  const right = (s: string, x: number, y: number, size = 9, f = font, color = ink) =>
    page.drawText(s, { x: x - f.widthOfTextAtSize(s, size), y, size, font: f, color });
  const line = (y: number) => page.drawLine({ start: { x: M, y }, end: { x: R, y }, thickness: 0.6, color: rgb(0.85, 0.85, 0.85) });

  let y = 800;
  text("SELF-BILLED INVOICE", M, y, 16, bold);
  right(`Invoice No: ${d.invoiceNumber}`, R, y + 4, 9, bold);
  right(`Date: ${d.invoiceDate}`, R, y - 9, 9, font, soft);
  y -= 26;

  text(
    "Issued by Zyvorah (Magnitude Business Ventures Pvt Ltd) on behalf of the supplier below, under GST self-invoicing",
    M, y, 8, font, soft,
  );
  y -= 10;
  text("provisions, with the supplier's express written consent recorded at onboarding.", M, y, 8, font, soft);
  y -= 20;
  line(y); y -= 16;

  // Supplier (the trade partner)
  text("SUPPLIER (COMMISSION AGENT)", M, y, 8, bold, soft); y -= 13;
  text(d.supplier.legalName, M, y, 11, bold); y -= 12;
  text(`PAN: ${d.supplier.pan}`, M, y, 9, font, soft); y -= 11;
  if (d.supplier.gstin) {
    text(`GSTIN: ${d.supplier.gstin}`, M, y, 9, font, soft); y -= 11;
  } else {
    text("Not GST-registered (declared at onboarding) — no GST charged on this invoice.", M, y, 9, font, soft); y -= 11;
  }
  y -= 8;

  // Recipient
  text("RECIPIENT", M, y, 8, bold, soft); y -= 13;
  text("Magnitude Business Ventures Pvt Ltd (Zyvorah)", M, y, 10, bold); y -= 12;
  text(`Re: order #${d.orderNumber}`, M, y, 9, font, soft); y -= 18;

  line(y); y -= 4;
  text("Description", M, y - 9, 8, bold, soft);
  right("Amount", R, y - 9, 8, bold, soft);
  y -= 14; line(y); y -= 4;

  const row = (label: string, val: number, b = false) => {
    text(label, M, y - 10, 9, b ? bold : font, b ? ink : soft);
    right(rs(val), R, y - 10, 9, b ? bold : font);
    y -= 18;
  };
  row(`Commission on catalogue base (${d.commissionPct}% of Rs. ${money.format(Math.round(d.baseExGst))})`, Math.round((d.commissionPct / 100) * d.baseExGst));
  if (d.markupExGst > 0) row("Commission on own-design markup (100%, ex-GST)", d.markupExGst);
  y -= 2; line(y); y -= 16;

  row("Gross commission", d.grossCommission, true);
  if (d.gstOnCommission > 0) row("GST @ 18% on commission (supplier remits)", d.gstOnCommission);
  row(`TDS deducted (Sec. 194H, ${d.tdsPct}%)`, -d.tdsAmount);
  y -= 2; line(y); y -= 16;
  row("Net amount paid out", d.netPayout, true);

  y -= 20;
  text("This is a computer-generated self-billed invoice. TDS deducted above will be deposited by Zyvorah and", M, y, 8, font, soft); y -= 10;
  text("reflected in Form 26AS / Form 16A for the relevant quarter.", M, y, 8, font, soft);

  return doc.save();
}

/** Build + store the self-billed commission invoice for a paid ledger entry.
 *  Idempotent — returns the existing invoice if one is already recorded.
 *  Caller must have already confirmed the payout is 'paid' (money moved). */
export async function generateTradeSelfInvoice(
  ledgerId: string,
): Promise<{ number: string; url: string } | null> {
  const admin = supabaseAdmin();
  if (!admin) return null;

  const { data: ledger } = await admin
    .from("trade_ledger")
    .select(
      "id, order_id, trade_partner_id, base_ex_gst, markup_ex_gst, commission_pct, gross_commission, gst_registered, gst_on_commission, tds_pct, tds_amount, net_payout, self_invoice_number, self_invoice_url",
    )
    .eq("id", ledgerId)
    .maybeSingle();
  if (!ledger) return null;
  if (ledger.self_invoice_number && ledger.self_invoice_url) {
    return { number: ledger.self_invoice_number, url: ledger.self_invoice_url };
  }

  const { data: partner } = await admin
    .from("trade_partners")
    .select("legal_name, pan, gstin")
    .eq("id", ledger.trade_partner_id)
    .maybeSingle();
  const { data: order } = await admin.from("orders").select("order_number").eq("id", ledger.order_id).maybeSingle();
  if (!partner || !order) return null;

  const fy = financialYear();
  const { data: numData, error: numErr } = await admin.rpc("allocate_invoice_number_by_ref", {
    p_order_ref: `trade-ledger-${ledgerId}`,
    p_prefix: "ZYVSB",
    p_fy: fy,
  });
  if (numErr || !numData) {
    console.error("trade self-invoice: allocate_invoice_number_by_ref failed:", numErr?.message);
    return null;
  }
  const invoiceNumber = numData as string;

  const bytes = await buildSelfInvoicePdf({
    invoiceNumber,
    invoiceDate: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }),
    supplier: { legalName: partner.legal_name, pan: partner.pan, gstin: partner.gstin },
    orderNumber: order.order_number,
    baseExGst: Number(ledger.base_ex_gst),
    markupExGst: Number(ledger.markup_ex_gst),
    commissionPct: Number(ledger.commission_pct),
    grossCommission: Number(ledger.gross_commission),
    gstOnCommission: Number(ledger.gst_on_commission),
    tdsPct: Number(ledger.tds_pct),
    tdsAmount: Number(ledger.tds_amount),
    netPayout: Number(ledger.net_payout),
  });

  const path = `invoices/trade/${ledgerId}.pdf`;
  const { error: upErr } = await admin.storage
    .from("order-copies")
    .upload(path, toUploadBody(Buffer.from(bytes), "application/pdf"), { contentType: "application/pdf", upsert: true });
  if (upErr) {
    console.error("trade self-invoice upload failed:", upErr.message);
    return null;
  }
  const url = admin.storage.from("order-copies").getPublicUrl(path).data.publicUrl;

  return { number: invoiceNumber, url };
}
