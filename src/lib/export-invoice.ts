import { supabaseAdmin } from "./supabase-admin";
import { sellerGstConfig, financialYear, type SellerGst } from "./gst";
import { countryName, type CurrencyCode } from "./markets";
import { allocateGoods, buildExportInvoicePdf, hsnFor, type ExportLine } from "./export-invoice-pdf";
import { toUploadBody } from "./storage-body";
import { docStorageClient } from "./private-doc";

// The dispatch-time document for an order that was PRESENTED and PAID in USD.
//
// checkout/route.ts deliberately issues no order copy to a USD buyer: the
// order-copy and GST-invoice renderers are INR/GST documents, and handing one
// to someone who paid $312 would contradict the Razorpay receipt. It promised
// instead that "international orders wait for the dispatch-time export
// invoice, generated from the recorded presentment data" — and until this
// file, nothing generated it. A US parcel left with no commercial invoice for
// customs and the buyer got no document at all.
//
// This is that invoice: one page, in the buyer's currency, drawn from the
// presentment snapshot checkout saved into orders.notes (goods, delivery,
// total, package, chargeable weight) so it can never disagree with what was
// charged. Export of goods from India is zero-rated, so it carries no GST
// split — it states the LUT reference when one is configured, and always
// states that duties and taxes at destination are the consignee's (DAP).
//
// Same storage path and same orders.gst_invoice_url slot as the GST invoice,
// so the order page, the concierge and the dispatch email find it exactly
// where they already look. Idempotent: an order that has a document keeps it.

export type Presentment = {
  marketCountry?: string;
  presentmentCurrency?: CurrencyCode;
  presentmentGoods?: number;
  presentmentDelivery?: number;
  presentmentTotal?: number;
  customsIncluded?: boolean;
  package?: { lengthMm?: number; diameterMm?: number; tubes?: number };
  chargeableWeightKg?: number;
};

/** The presentment checkout recorded on the order, or null when the notes
 *  field holds something else (a sample order's description, free text). */
export function parsePresentment(notes: string | null | undefined): Presentment | null {
  if (!notes) return null;
  try {
    const p = JSON.parse(notes) as Presentment;
    return p && typeof p === "object" && p.presentmentCurrency ? p : null;
  } catch {
    return null;
  }
}

export function isInternationalPresentment(p: Presentment | null): p is Presentment & { presentmentCurrency: "USD" } {
  return p?.presentmentCurrency === "USD";
}

type Item = {
  product_title: string;
  material_name: string;
  material_slug?: string | null;
  quantity: number;
  area_sqft: number;
  width_cm?: number | null;
  height_cm?: number | null;
  line_total: number;
};

/** Build + store the commercial (export) invoice for an order presented in
 *  USD. Returns its URL, or null when the order is not international, seller
 *  identity isn't configured, or the document could not be produced. Idempotent. */
export async function generateExportInvoice(orderId: string): Promise<string | null> {
  // Service role, not the anon key: these SECURITY DEFINER RPCs have no
  // internal auth gate, so as anon they were reachable from the browser key.
  const sb = supabaseAdmin();
  if (!sb) {
    console.error("export-invoice: SUPABASE_SERVICE_ROLE_KEY not configured");
    return null;
  }

  const gst = sellerGstConfig();
  if (!gst) {
    console.warn(`[export-invoice] seller identity (SELLER_*) not configured — no invoice generated for order ${orderId}`);
    return null;
  }
  const seller = {
    ...gst,
    iec: process.env.SELLER_IEC?.trim() || null,
    lut: process.env.SELLER_LUT?.trim() || null,
  };

  const { data: bundle, error: fetchErr } = await sb.rpc("get_order_for_invoice", { p_order_id: orderId });
  if (fetchErr || !bundle) {
    if (fetchErr) console.error("get_order_for_invoice failed:", fetchErr.message);
    return null;
  }
  const { order, items } = bundle as {
    order: {
      order_number: number; billing_name: string | null; email: string | null; phone: string | null;
      shipping_address: Record<string, string> | null; notes: string | null; gst_invoice_url: string | null;
      razorpay_payment_id?: string | null;
    };
    items: Item[];
  };
  if (order.gst_invoice_url) return order.gst_invoice_url; // already issued

  const presentment = parsePresentment(order.notes);
  if (!isInternationalPresentment(presentment)) return null;

  const addr = (order.shipping_address ?? {}) as {
    name?: string; line1?: string; line2?: string; city?: string; state?: string; pincode?: string; country?: string; countryCode?: string;
  };
  const destinationCode = presentment.marketCountry || addr.countryCode || "US";
  const destination = addr.country || countryName(destinationCode);

  const goodsTotal = Number(presentment.presentmentGoods ?? 0);
  const delivery = Number(presentment.presentmentDelivery ?? 0);
  const grandTotal = Number(presentment.presentmentTotal ?? goodsTotal + delivery);

  const rows = (items ?? []).filter((it) => Number(it.line_total) > 0 || Number(it.quantity) > 0);
  const alloc = allocateGoods(rows, goodsTotal);
  const lines: ExportLine[] = rows.map((it, i) => {
    const size = it.width_cm && it.height_cm ? ` ${it.width_cm} × ${it.height_cm} cm` : "";
    return {
      desc: `${it.product_title} — ${it.material_name}${size} (${it.area_sqft} sq ft)`,
      hsn: hsnFor(it.material_slug, gst),
      qty: Math.max(1, Number(it.quantity) || 1),
      unit: alloc[i].unit,
      amount: alloc[i].amount,
    };
  });
  if (!lines.length) {
    console.error(`[export-invoice] order ${order.order_number} has no line items`);
    return null;
  }

  const fy = financialYear();
  const prefix = process.env.EXPORT_INVOICE_PREFIX?.trim() || `${gst.invoicePrefix}-EXP`;
  const { data: numData, error: numErr } = await sb.rpc("allocate_invoice_number", {
    p_order_id: orderId, p_prefix: prefix, p_fy: fy,
  });
  if (numErr) { console.error("allocate_invoice_number failed:", numErr.message); return null; }
  const invoiceNumber = numData as string;

  const bytes = await buildExportInvoicePdf({
    invoiceNumber,
    invoiceDate: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }),
    seller,
    consignee: {
      name: order.billing_name || addr.name || "",
      addressLines: [addr.line1 ?? "", addr.line2 ?? "", [addr.city, addr.state, addr.pincode].filter(Boolean).join(", ")],
      country: destination,
      phone: order.phone ?? null,
      email: order.email ?? null,
    },
    currency: presentment.presentmentCurrency,
    lines,
    goodsTotal,
    delivery,
    grandTotal,
    destinationCountry: destination,
    parcel: {
      tubes: Number(presentment.package?.tubes ?? 1) || 1,
      lengthMm: Number(presentment.package?.lengthMm ?? 1400) || 1400,
      diameterMm: Number(presentment.package?.diameterMm ?? 75) || 75,
      weightKg: typeof presentment.chargeableWeightKg === "number" ? presentment.chargeableWeightKg : null,
    },
    paymentRef: order.razorpay_payment_id ?? null,
  });

  const path = `invoices/${order.order_number}.pdf`;
  const docs = docStorageClient();
  const { error: upErr } = await docs.storage
    .from("order-copies")
    .upload(path, toUploadBody(Buffer.from(bytes), "application/pdf"), { contentType: "application/pdf", upsert: true });
  if (upErr) { console.error("export invoice upload failed:", upErr.message); return null; }

  const url = docs.storage.from("order-copies").getPublicUrl(path).data.publicUrl;
  await sb.rpc("set_gst_invoice_url", { p_order_id: orderId, p_url: url });
  return url;
}
