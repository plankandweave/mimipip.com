import { istDateKey } from "@/lib/ist";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabaseAdmin } from "./supabase-admin";
import { exGst } from "./pricing";
import { financialYear, buyerStateCode, gstSplit, sellerGstConfig, type SellerGst } from "./gst";
import { pushInvoiceToOs } from "./os-invoice";
import { toUploadBody } from "./storage-body";
import { docStorageClient } from "./private-doc";
import { SITE_URL } from "./seo";

// Generates the GST TAX INVOICE for an order — called at DISPATCH, not at
// payment. It never runs unless the seller's real GST identity is configured
// (sellerGstConfig), so a tax document with placeholder data can never exist.
// Standard fonts can't encode the ₹ glyph, so amounts are printed as "Rs.".

const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const rs = (n: number) => `Rs. ${money.format(Math.round(n))}`;

type Line = { desc: string; hsnSac: string; qty: number; taxable: number };

/** Trade-partner co-branding mark for the top-right of the invoice. Seller of
 *  record stays Zyvorah/MBPL — this is a small "in partnership with" note,
 *  never a re-skin. logoImage is omitted whenever the partner has no logo, or
 *  the logo couldn't be fetched/embedded (degrades to text-only). */
type PartnerCoBrand = {
  legalName: string;
  logoImage: { bytes: Uint8Array; kind: "png" | "jpg" } | null;
};

type InvoiceData = {
  invoiceNumber: string;
  invoiceDate: string;
  seller: SellerGst;
  buyer: { name: string; gstin: string | null; addressLines: string[]; placeOfSupply: string };
  lines: Line[];
  taxableTotal: number;
  tax: { intra: boolean; cgst: number; sgst: number; igst: number; total: number };
  grandTotal: number;
  /** false when Express dispatch was charged (its own taxable line above) — the summary shouldn't also claim free delivery. */
  deliveryFree: boolean;
  /** Set only for trade orders (orders.trade_partner_id is not null). */
  partner: PartnerCoBrand | null;
};

/** Fetches a partner logo and classifies it as png/jpg by content-type (falling
 *  back to the URL extension). Returns null on any failure — a co-brand logo
 *  must never block invoice generation. */
async function fetchPartnerLogo(url: string): Promise<{ bytes: Uint8Array; kind: "png" | "jpg" } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    const lower = url.toLowerCase().split("?")[0];
    const kind: "png" | "jpg" | null = contentType.includes("png") || lower.endsWith(".png")
      ? "png"
      : contentType.includes("jpeg") || contentType.includes("jpg") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")
        ? "jpg"
        : null;
    if (!kind) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { bytes, kind };
  } catch (e) {
    console.error("gst-invoice: partner logo fetch failed:", e);
    return null;
  }
}

async function buildInvoicePdf(d: InvoiceData): Promise<Uint8Array> {
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
  text("TAX INVOICE", M, y, 16, bold);
  right(`Invoice No: ${d.invoiceNumber}`, R, y + 4, 9, bold);
  right(`Date: ${d.invoiceDate}`, R, y - 9, 9, font, soft);
  y -= 26;

  // Co-branding (trade orders only) — a small mark in the top-right, level
  // with the seller block but on its own column/anchor so it never disturbs
  // the seller block's own (variable-height) layout below.
  if (d.partner) {
    let py = y;
    right(`In partnership with ${d.partner.legalName}`, R, py - 7, 8, font, soft);
    py -= 16;
    if (d.partner.logoImage) {
      try {
        const embedded = d.partner.logoImage.kind === "png"
          ? await doc.embedPng(d.partner.logoImage.bytes)
          : await doc.embedJpg(d.partner.logoImage.bytes);
        const maxW = 64, maxH = 22;
        const scale = Math.min(maxW / embedded.width, maxH / embedded.height, 1);
        const w = embedded.width * scale, h = embedded.height * scale;
        page.drawImage(embedded, { x: R - w, y: py - h, width: w, height: h });
      } catch (e) {
        // Never let a bad logo block the invoice — text-only co-brand mark stands.
        console.error("gst-invoice: partner logo embed failed:", e);
      }
    }
  }

  // Seller
  text(d.seller.legalName, M, y, 11, bold);
  y -= 13;
  for (const l of d.seller.address.split("\n")) { text(l, M, y, 9, font, soft); y -= 11; }
  text(`GSTIN: ${d.seller.gstin}`, M, y, 9, font, soft);
  if (d.seller.stateName) text(`State: ${d.seller.stateName} (${d.seller.stateCode})`, M + 200, y, 9, font, soft);
  y -= 12;
  text(d.seller.email, M, y, 9, font, soft);
  y -= 18;
  line(y); y -= 16;

  // Buyer
  text("BILL TO", M, y, 8, bold, soft); y -= 13;
  text(d.buyer.name || "—", M, y, 10, bold); y -= 12;
  for (const l of d.buyer.addressLines) { if (l) { text(l, M, y, 9, font, soft); y -= 11; } }
  if (d.buyer.gstin) { text(`GSTIN: ${d.buyer.gstin}`, M, y, 9); y -= 11; }
  text(`Place of supply: ${d.buyer.placeOfSupply}`, M, y, 9, font, soft); y -= 18;

  // Table header
  const cX = { n: M, desc: M + 22, hsn: 360, qty: 430, amt: R };
  line(y); y -= 4;
  text("#", cX.n, y - 9, 8, bold, soft);
  text("Description", cX.desc, y - 9, 8, bold, soft);
  text("HSN/SAC", cX.hsn, y - 9, 8, bold, soft);
  text("Qty", cX.qty, y - 9, 8, bold, soft);
  right("Taxable Value", cX.amt, y - 9, 8, bold, soft);
  y -= 14; line(y); y -= 4;

  d.lines.forEach((l, i) => {
    text(String(i + 1), cX.n, y - 10, 9);
    const desc = l.desc.length > 52 ? l.desc.slice(0, 51) + "…" : l.desc;
    text(desc, cX.desc, y - 10, 9);
    text(l.hsnSac, cX.hsn, y - 10, 9);
    text(String(l.qty), cX.qty, y - 10, 9);
    right(rs(l.taxable), cX.amt, y - 10, 9);
    y -= 18;
  });
  line(y); y -= 16;

  // Totals
  const tot = (label: string, val: string, b = false) => {
    text(label, 360, y, 9, b ? bold : font, b ? ink : soft);
    right(val, R, y, 9, b ? bold : font);
    y -= 15;
  };
  tot("Taxable value", rs(d.taxableTotal));
  if (d.tax.intra) {
    tot("CGST @ 9%", rs(d.tax.cgst));
    tot("SGST @ 9%", rs(d.tax.sgst));
  } else {
    tot("IGST @ 18%", rs(d.tax.igst));
  }
  if (d.deliveryFree) tot("Delivery", "Free");
  y -= 2; line(y); y -= 16;
  tot("Total (incl. GST)", rs(d.grandTotal), true);

  y -= 20;
  text("This is a computer-generated tax invoice.", M, y, 8, font, soft); y -= 10;
  text("Prices are GST-inclusive; the tax shown above is the GST component of the total.", M, y, 8, font, soft);

  return doc.save();
}

/** Build + store the GST tax invoice for an order. Returns its URL, or null if
 *  seller GST isn't configured (then no invoice is produced). Idempotent. */
export async function generateGstInvoice(orderId: string): Promise<string | null> {
  // Service role, not the anon key. allocate_invoice_number burns a number from
  // the statutory GST sequence and set_gst_invoice_url writes the tax document
  // pointer; both are SECURITY DEFINER with no internal auth gate, so as anon
  // they were callable straight from the browser key -- enough to punch gaps in
  // an invoice sequence the tax authority expects to be unbroken.
  const sb = supabaseAdmin();
  if (!sb) {
    console.error("gst-invoice: SUPABASE_SERVICE_ROLE_KEY not configured");
    return null;
  }

  const seller = sellerGstConfig();
  if (!seller) {
    console.warn(`[gst-invoice] SELLER_GSTIN not configured — no invoice generated for order ${orderId}`);
    return null;
  }

  const { data: bundle, error: fetchErr } = await sb.rpc("get_order_for_invoice", { p_order_id: orderId });
  if (fetchErr || !bundle) {
    if (fetchErr) console.error("get_order_for_invoice failed:", fetchErr.message);
    return null;
  }
  const { order, items } = bundle as {
    order: {
      order_number: number; gstin: string | null; billing_name: string | null;
      shipping_address: Record<string, string> | null; total: number | string;
      shipping: number | string | null; shipping_speed: string | null;
      notes: string | null; gst_invoice_url: string | null;
      trade_partner_id: string | null; access_token: string | null;
    };
    items: Item[];
  };
  if (order.gst_invoice_url) return order.gst_invoice_url; // already issued

  // Co-branding: get_order_for_invoice returns the full orders row (minus the
  // razorpay signature), so trade_partner_id is already here — no extra order
  // lookup needed. trade_partners itself isn't in that bundle though, and its
  // RLS only allows a partner to read their own row (auth.uid()-scoped), which
  // this service-context call has none of — so the co-brand lookup goes
  // through supabaseAdmin(), same pattern as trade-apply.ts. Best-effort: any
  // failure here must never block the sales invoice itself.
  let partner: PartnerCoBrand | null = null;
  if (order.trade_partner_id) {
    try {
      const admin = supabaseAdmin();
      if (admin) {
        const { data: tp, error: tpErr } = await admin
          .from("trade_partners")
          .select("legal_name, logo_url")
          .eq("id", order.trade_partner_id)
          .maybeSingle();
        if (tpErr) console.error("gst-invoice: trade partner lookup failed:", tpErr.message);
        else if (tp?.legal_name) {
          const logoImage = tp.logo_url ? await fetchPartnerLogo(tp.logo_url) : null;
          partner = { legalName: tp.legal_name, logoImage };
        }
      }
    } catch (e) {
      console.error("gst-invoice: trade partner co-brand lookup failed:", e);
    }
  }

  type Item = {
    product_title: string; material_name: string; quantity: number;
    area_sqft: number; line_total: number; crop_data: { installation?: { total?: number } } | null;
  };

  const raw: { desc: string; hsnSac: string; qty: number; incl: number }[] = [];
  if (items && items.length) {
    for (const it of items as Item[]) {
      const install = Number(it.crop_data?.installation?.total ?? 0);
      const wall = Number(it.line_total) - install;
      raw.push({
        desc: `${it.product_title} — ${it.material_name} (${it.area_sqft} sq ft)`,
        hsnSac: seller.hsnGoods, qty: it.quantity, incl: wall,
      });
      if (install > 0)
        raw.push({ desc: `Professional installation — ${it.product_title}`, hsnSac: seller.sacService, qty: 1, incl: install });
    }
    const shipping = Number(order.shipping ?? 0);
    if (shipping > 0) {
      // `shipping` is the Express surcharge, the ₹1,000 small-order courier
      // (wallpaper orders measuring under 20 sq ft), or both — label by speed
      // so the invoice never claims an Express charge on a standard order.
      raw.push({
        desc:
          order.shipping_speed === "express"
            ? "Express delivery surcharge"
            : "Courier charge (wallpaper order under 20 sq ft)",
        hsnSac: seller.sacService, qty: 1, incl: shipping,
      });
    }
  } else {
    raw.push({ desc: order.notes || "Printed design sample", hsnSac: seller.hsnGoods, qty: 1, incl: Number(order.total) });
  }
  const deliveryFree = Number(order.shipping ?? 0) <= 0;

  const lines: Line[] = raw.map((l) => ({ desc: l.desc, hsnSac: l.hsnSac, qty: l.qty, taxable: exGst(l.incl) }));
  const taxableTotal = lines.reduce((s, l) => s + l.taxable, 0);
  const grandTotal = raw.reduce((s, l) => s + l.incl, 0);
  const gstTotal = grandTotal - taxableTotal;

  const addr = (order.shipping_address ?? {}) as { name?: string; line1?: string; city?: string; state?: string; pincode?: string };
  const buyerState = buyerStateCode(order.gstin, addr.state);
  const tax = gstSplit(gstTotal, seller.stateCode, buyerState);

  const fy = financialYear();
  const { data: numData, error: numErr } = await sb.rpc("allocate_invoice_number", {
    p_order_id: orderId, p_prefix: seller.invoicePrefix, p_fy: fy,
  });
  if (numErr) { console.error("allocate_invoice_number failed:", numErr.message); return null; }
  const invoiceNumber = numData as string;

  const bytes = await buildInvoicePdf({
    invoiceNumber,
    invoiceDate: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }),
    seller,
    buyer: {
      name: order.billing_name || addr.name || "",
      gstin: order.gstin ?? null,
      addressLines: [addr.line1 ?? "", [addr.city, addr.state, addr.pincode].filter(Boolean).join(", ")],
      placeOfSupply: buyerState ? `${buyerState}${addr.state ? " - " + addr.state : ""}` : (addr.state || "—"),
    },
    lines,
    taxableTotal,
    tax,
    grandTotal,
    deliveryFree,
    partner,
  });

  const path = `invoices/${order.order_number}.pdf`;
  const docs = docStorageClient();
  const { error: upErr } = await docs.storage
    .from("order-copies")
    .upload(path, toUploadBody(Buffer.from(bytes), "application/pdf"), { contentType: "application/pdf", upsert: true });
  if (upErr) { console.error("invoice upload failed:", upErr.message); return null; }

  const url = docs.storage.from("order-copies").getPublicUrl(path).data.publicUrl;
  await sb.rpc("set_gst_invoice_url", { p_order_id: orderId, p_url: url });

  // Mirror to the OS → Odoo with the EXACT same invoice number (env-gated,
  // idempotent at the OS end, never blocks dispatch).
  try {
    const o = order as typeof order & { phone?: string | null; email?: string | null };
    await pushInvoiceToOs({
      invoiceNumber,
      sourceRef: `ZYVWEB-${order.order_number}`,
      invoiceDate: istDateKey(),
      taxMode: tax.intra ? "intra" : "inter",
      buyer: {
        name: order.billing_name || addr.name || "",
        phone: o.phone ?? null,
        email: o.email ?? null,
        gstin: order.gstin ?? null,
        address: [addr.line1, addr.city, addr.state, addr.pincode].filter(Boolean).join(", ") || null,
        placeOfSupply: buyerState ? `${buyerState}${addr.state ? " - " + addr.state : ""}` : (addr.state || null),
      },
      lines: raw.map((r, i) => ({ desc: r.desc, hsnSac: r.hsnSac, qty: r.qty, incl: r.incl, taxable: lines[i].taxable })),
      taxableTotal,
      gstTotal,
      grandTotal,
      // The OS stores this and Odoo may open it months later, so it gets the
      // durable per-order route rather than the bucket reference — which is now
      // private — or a signed URL, which would be dead by the time anyone
      // clicks it. Falls back to the reference if the order has no token.
      pdfUrl: order.access_token ? `${SITE_URL}/order/${order.access_token}/doc/invoice` : url,
    });
  } catch (e) {
    console.error("os invoice mirror failed:", e);
  }

  return url;
}
