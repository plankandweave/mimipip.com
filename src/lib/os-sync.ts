import { serviceFetch } from '@/brand/service-transport';
const fetch: typeof globalThis.fetch = (input, init) => serviceFetch('os', input, init);
import { textOverlaySchema, type TextOverlay } from "./text-overlay";
import { osBrandForVendor } from "@/lib/lorange-kids";
import { supabase } from "./supabase";
import { isTradeAccountByEmail } from "./trade-auth";
import { paidSampleCards, SAMPLE_CARD_MM, SAMPLE_REFERENCE_MURAL_CM, SAMPLE_UNIT_PRICE } from "./sample-print";
import { assertAllPrintableLines, paidLineAmounts } from "./os-paid-lines";
import type { ShippingOrder } from "./fulfillment/types";

// Pushes every paid wallpaper order into the Magnitude Group OS
// (os.magnitudegroup.in) — the single system of record for the wallpaper
// category. The website is one showroom among many channels; the OS owns the
// central print queue, the universal customer (phone-first), the ZVY
// sales-order series, and downstream Odoo invoicing (Magnitude Brands, per-
// channel billing: this channel bills IGST to the individual customer).
//
// Contract: POST {OS_BASE}/api/zyvorah/web-order with the shared webhook token
// (x-zyvorah-token), the SAME token/base the discount server already uses — so
// this link is live wherever discounts already work, no extra provisioning.
// Each printable line item is sent with its DESIGN image + framing + size; the
// OS auto-approval agent then re-preps it on the Mimaki engine and queues it to
// the hot folder (no human), or parks genuine exceptions for a human. This app
// no longer prepares or hands off print files for web orders — the OS/engine is
// the single print-prep authority.

const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");
const TOKEN = process.env.ZYVORAH_WEBHOOK_TOKEN ?? "";

export function isOsSyncConfigured(): boolean {
  return Boolean(TOKEN);
}

type ManifestItem = {
  orderItemId?: string;
  title?: string;
  qty?: number;
  widthCm?: number | string;
  heightCm?: number | string;
  installType?: string;
  cropData?: {
    textOverlay?: TextOverlay | null;
    personalisation?: { childName: string; fee: number } | null;
    imageUrl?: string;
    concept?: { roomLabel?: string; title?: string };
    offsetX?: number;
    offsetY?: number;
    zoom?: number;
    flipH?: boolean;
    flipV?: boolean;
    /** Set when the customer bought on-site installation (Bengaluru/Mumbai/Pune). */
    installation?: { ratePerSqft: number; total: number } | null;
    /** Doors, windows and large furniture the customer marked (cm from
     *  run-left; sillCm > 0 is a window, which never qualifies). */
    doors?: { widthCm: number; heightCm: number; offsetCm: number; sillCm?: number; kind?: "headboard" }[];
    /** Bill-time exclusion snapshot (lib/openings.ts) — present only when at
     *  least one door QUALIFIED and the customer paid for the reduced area. */
    openingsPlan?: {
      qualifyingDoors?: number[];
      excludedSqft?: number;
      chargeableSqft?: number;
    } | null;
  } | null;
};

type WebOrderItem = {
  textOverlay?: TextOverlay;
  lineRef: string;
  zvy?: string;
  /** The storefront design handle (products.handle). The OS keys the
   *  installed-wall photo it may later push back to
   *  /api/installed-walls/intake on this, so the photo lands on the right
   *  product page. */
  productHandle?: string;
  /** "lorange" for a L'Orange Kids product (osBrandForVendor); absent = Zyvorah. */
  brand?: "lorange";
  designUrl: string;
  designName?: string;
  orderedTitle?: string;
  widthMm: number;
  heightMm: number;
  material: "paste" | "self_adhesive";
  qty: number;
  lineTotalInr?: number;
  /** Website checkout's design rate at purchase, GST included. */
  catalogueRatePerSqft?: number;
  installationTotalInr?: number;
  personalisationTotalInr?: number;
  exclusivityTotalInr?: number;
  /** A paid design sample: the OS previews and prints it as the engine's
   *  two-card A4 sheet (crop + fit, QR, trim guide), not as a wall. */
  sample?: { designHandle: string; materialSlug: string; materialLabel: string; muralWidthCm: number; muralHeightCm: number; sourceUrl: string };
  installByUs?: boolean;
  placement?: { zoom: number; cropX: number; cropY: number; flipH?: boolean; flipV?: boolean };
  /** Qualifying large openings (doors / full-height units) — the engine pins
   *  seams to their edges, prints short strips above, skips full-height panels.
   *  The customer already paid for the reduced area (see chargeableSqft). */
  openings?: { xMm: number; yMm: number; widthMm: number; heightMm: number }[];
  excludedSqft?: number;
  chargeableSqft?: number;
};

/** Map one production-manifest row to the OS web-order line. Returns null for a
 *  non-printable / artwork-less item (nothing for the engine to re-prep). */
function toWebItem(m: ManifestItem): WebOrderItem | null {
  const designUrl = m.cropData?.imageUrl?.trim();
  const widthMm = Math.round(Number(m.widthCm) * 10);
  const heightMm = Math.round(Number(m.heightCm) * 10);
  if (!designUrl || !m.orderItemId || !Number.isFinite(widthMm) || widthMm <= 0 || !Number.isFinite(heightMm) || heightMm <= 0) {
    return null;
  }
  const c = m.cropData!;
  if (c.personalisation?.childName && !c.textOverlay) throw new Error("Legacy name order needs an approved printable name layout");
  // The store's crop model (cover-fit → zoom → normalised pan) is exactly what
  // the print engine consumes as zoom/crop_x/crop_y — send the customer's real
  // framing so the auto-print matches what they signed off on.
  const placement = (c.zoom != null || c.offsetX != null || c.offsetY != null || c.flipH || c.flipV)
    ? {
        zoom: Math.min(8, Math.max(1, Number(c.zoom ?? 1))),
        cropX: Math.min(1, Math.max(0, Number(c.offsetX ?? 0.5))),
        cropY: Math.min(1, Math.max(0, Number(c.offsetY ?? 0.5))),
        ...(c.flipH ? { flipH: true } : {}),
        ...(c.flipV ? { flipV: true } : {}),
      }
    : undefined;
  // Openings excluded at purchase time: forward the QUALIFYING doors from the
  // bill-time snapshot (never re-qualify here — the customer paid against that
  // snapshot). Without this the OS/engine would print the full wall the
  // customer explicitly did not pay for.
  const plan = c.openingsPlan;
  const openings = plan?.qualifyingDoors?.length && (plan.excludedSqft ?? 0) > 0
    ? plan.qualifyingDoors
        .map((i) => c.doors?.[i])
        .filter((d): d is NonNullable<typeof d> => !!d)
        .map((d) => ({
          xMm: Math.round(d.offsetCm * 10),
          yMm: 0,
          widthMm: Math.round(d.widthCm * 10),
          heightMm: Math.round(d.heightCm * 10),
        }))
    : null;
  return {
    ...(c.textOverlay ? { textOverlay: textOverlaySchema.parse(c.textOverlay) } : {}),
    lineRef: m.orderItemId,
    designUrl,
    designName: m.title,
    orderedTitle: [m.cropData?.concept?.roomLabel, m.title].filter(Boolean).join(" · "),
    widthMm,
    heightMm,
    material: m.installType === "self_adhesive" ? "self_adhesive" : "paste",
    qty: Math.max(1, Number(m.qty ?? 1)),
    // Customer bought on-site installation → the OS runs the autonomous
    // installer flow after delivery (Bengaluru/Mumbai/Pune only; the OS gates by city).
    ...(m.cropData?.installation ? { installByUs: true } : {}),
    ...(placement ? { placement } : {}),
    ...(openings?.length
      ? {
          openings,
          ...(plan?.excludedSqft != null ? { excludedSqft: plan.excludedSqft } : {}),
          ...(plan?.chargeableSqft != null ? { chargeableSqft: plan.chargeableSqft } : {}),
        }
      : {}),
  };
}

/**
 * Sends a paid order to the OS website-order endpoint. Idempotent on
 * orderRef#lineRef (the OS dedupes per line), so retries and webhook replays
 * can't duplicate a print. Never throws — payment confirmation must not depend
 * on the OS being reachable; a failed push is retried next time this order's
 * endpoint is hit.
 */
export async function pushOrderToOs(
  o: ShippingOrder,
  /** The verified Razorpay payment behind this push. Checkout money the OS
   *  never hears about books the order as UNPAID over there: the credit gate
   *  parks paid work for a director, and the payment chaser dunned a customer
   *  who had paid the moment a tax invoice went out (ZVY-20447, 2026-09-08).
   *  The verify route has already checked the HMAC before calling this. */
  payment?: { razorpayPaymentId: string },
): Promise<boolean> {
  try {
    if (!isOsSyncConfigured()) return false;

    // Per-item production manifest — the exact design image, framing, dims and
    // material the OS needs to re-prep on the Mimaki without calling back here.
    let items: WebOrderItem[] = [];
    try {
      const { data: manifest } = await supabase.rpc("order_print_manifest", { p_order_id: o.order_id });
      if (Array.isArray(manifest)) {
        items = (manifest as ManifestItem[]).map(toWebItem).filter((x): x is WebOrderItem => x !== null);
      }
    } catch (e) {
      console.error("os-sync manifest lookup failed:", e);
    }

    // A paid design sample has no order_items at all — its design × finish
    // live in sample_print_queue. One A4 line per card, at the flat ₹200 the
    // customer paid, so the OS invoice, courier declaration and board all
    // carry the real figure rather than a per-sqft recalculation.
    if (items.length === 0) {
      const cards = await paidSampleCards(o.order_id);
      items = cards.map((c) => ({
        lineRef: `sample-${c.id}`,
        designUrl: c.master_url,
        designName: c.design_title,
        orderedTitle: `Printed design sample · ${c.material_name}`,
        widthMm: SAMPLE_CARD_MM.width,
        heightMm: SAMPLE_CARD_MM.height,
        material: c.material_slug === "self-adhesive-vinyl" ? "self_adhesive" : "paste",
        qty: 1,
        lineTotalInr: SAMPLE_UNIT_PRICE,
        ...(c.design_handle ? { productHandle: c.design_handle } : {}),
        sample: {
          designHandle: c.design_handle,
          materialSlug: c.material_slug,
          materialLabel: c.material_name,
          muralWidthCm: SAMPLE_REFERENCE_MURAL_CM.width,
          muralHeightCm: SAMPLE_REFERENCE_MURAL_CM.height,
          // The flat the print master is built from — the OS asks the engine
          // for the build if the master is not there when the desk previews.
          sourceUrl: c.master_url,
        },
      }));
    }

    if (items.length === 0) {
      console.error(`os-sync: order ${o.order_number} has no printable items with artwork — nothing pushed`);
      return false;
    }

    // The database snapshots the price and design at checkout. A later price
    // change must never alter the OS invoice for an already paid order. The
    // order discount is stored once, so split the paid goods total across its
    // saved lines; never let the OS fall back to a material-based rate when a
    // money lookup fails.
    let shippingInr: number | undefined;
    const wallLines = items.filter((it) => !it.sample);
    if (wallLines.length > 0) {
      const [{ data: rawLines, error: linesError }, { data: rawOrder, error: orderError }] = await Promise.all([
        supabase.from("order_items")
          .select("id, zvy, product_id, line_total, unit_price_per_sqft, crop_data")
          .eq("order_id", o.order_id),
        supabase.from("orders")
          .select("subtotal, discount, shipping, total")
          .eq("id", o.order_id).maybeSingle(),
      ]);
      if (linesError || orderError || !rawLines || !rawOrder) throw new Error("Cannot read paid website order price snapshots");
      type SavedLine = { id: string; zvy: string | null; product_id: string | null; line_total: number | string; unit_price_per_sqft: number | string | null; crop_data: ManifestItem["cropData"] & { exclusivity?: { fee?: number } } };
      const lines = rawLines as SavedLine[];
      // A mixed basket may include a service or non-wall product that this
      // print-only OS endpoint cannot invoice. Do not silently omit its paid
      // amount or mislabel it as wallpaper.
      assertAllPrintableLines(lines.map((line) => line.id), wallLines.map((line) => line.lineRef));
      const productIds = [...new Set(lines.map((r) => r.product_id).filter((x): x is string => !!x))];
      const { data: rawProducts, error: productsError } = productIds.length
        ? await supabase.from("products").select("id, handle, category, vendor").in("id", productIds)
        : { data: [], error: null };
      if (productsError) throw new Error("Cannot read paid website order design handles");
      if ((rawProducts ?? []).some((p: { category: string }) => p.category !== "wallpaper")) {
        throw new Error("Paid website basket contains a non-wallpaper product");
      }
      const handleById = new Map((rawProducts ?? []).map((p: { id: string; handle: string }) => [p.id, p.handle]));
      const brandById = new Map((rawProducts ?? []).map((p: { id: string; vendor: string | null }) => [p.id, osBrandForVendor(p.vendor)]));
      const savedById = new Map(lines.map((line) => [line.id, line]));
      const paid = paidLineAmounts(lines.map((line) => ({
        id: line.id,
        lineTotal: line.line_total,
        installationTotal: line.crop_data?.installation?.total,
        personalisationTotal: line.crop_data?.personalisation?.fee,
        exclusivityTotal: line.crop_data?.exclusivity?.fee,
      })), rawOrder as { subtotal: number | string; discount: number | string; shipping: number | string; total: number | string });
      shippingInr = Number(rawOrder.shipping);
      items = items.map((it) => {
        if (it.sample) return it;
        const saved = savedById.get(it.lineRef);
        const amount = paid.get(it.lineRef);
        if (!saved || !amount) throw new Error(`Missing paid website order line ${it.lineRef}`);
        const handle = saved.product_id ? handleById.get(saved.product_id) : undefined;
        const brand = saved.product_id ? brandById.get(saved.product_id) : undefined;
        const rate = Number(saved.unit_price_per_sqft);
        return {
          ...it,
          ...(saved.zvy ? { zvy: saved.zvy } : {}),
          ...(handle ? { productHandle: handle } : {}),
          ...(brand ? { brand } : {}),
          ...(Number.isFinite(rate) && rate > 0 ? { catalogueRatePerSqft: rate } : {}),
          ...amount,
        };
      });
    }
    // The order-level design: the first line's. Most web orders are one wall.
    const orderProductHandle = items.find((it) => it.productHandle)?.productHandle;

    // WHO PAYS THE COURIER. "To-pay" is about the FREIGHT charge only — the
    // goods are always paid for before anything ships; nothing here is COD.
    // Freight is prepaid by us on retail e-commerce deliveries and TO-PAY on
    // everything else — every reseller, every corporate account (Roheena
    // 2026-08-12, restated 2026-09-02 and 2026-09-09). The OS derives that
    // from order.source, and a source of "website" means paid — but a trade
    // partner who checks out on zyvorah.com IS a website order that must
    // still ship to-pay. Sending them under their own channel is what lets
    // the OS tell the two apart: "trade" sits on the to-pay side of its
    // table, so the docket is booked right and the packing sticker reads
    // FREIGHT TO-PAY. Two ways an order is a reseller's: it carries a
    // trade_partner_id (a payment-link order — the email on it is the END
    // customer's, so the email check can never see the partner behind it), or
    // its email belongs to a trade account (a partner buying through the
    // retail cart). Resolved here, not from a session, because this runs
    // after payment — often from a webhook with no session at all.
    //
    // The same read carries what the customer actually PAID — the grand
    // total, not the subtotal the top-level amountInr has always carried
    // (that field labels the board and must not change meaning under
    // existing orders).
    let paidTotal: number | null = null;
    let partnerOrder = false;
    try {
      const { data: row } = await supabase
        .from("orders").select("total, trade_partner_id").eq("id", o.order_id).maybeSingle();
      const r = row as { total?: number | null; trade_partner_id?: string | null } | null;
      paidTotal = typeof r?.total === "number" ? r.total : null;
      partnerOrder = r?.trade_partner_id != null;
    } catch (e) {
      console.error("os-sync: could not read order total/partner:", e);
    }
    const tradeBuyer = partnerOrder || (await isTradeAccountByEmail(o.email));

    const res = await fetch(`${OS_BASE}/api/zyvorah/web-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-zyvorah-token": TOKEN,
      },
      body: JSON.stringify({
        orderRef: `ZYVWEB-${o.order_number}`,
        ...(orderProductHandle ? { productHandle: orderProductHandle } : {}),
        ...(tradeBuyer ? { channel: "trade" } : {}),
        customer: {
          name: o.shipping_address?.name || "Zyvorah customer",
          phone: o.phone || undefined,
          email: o.email || undefined,
          address: o.shipping_address
            ? [o.shipping_address.line1, o.shipping_address.city, o.shipping_address.state, o.shipping_address.pincode, o.shipping_address.country]
                .filter(Boolean).join(", ")
            : undefined,
          city: o.shipping_address?.city || undefined,
          // The OS books the courier (at print time, not payment), and a
          // courier API needs these as separate fields. Send them structured
          // rather than leaving the OS to parse them back out of `address`.
          pincode: o.shipping_address?.pincode || undefined,
          state: o.shipping_address?.state || undefined,
          country: o.shipping_address?.country || undefined,
          countryCode: o.shipping_address?.countryCode || undefined,
        },
        amountInr: o.subtotal,
        ...(shippingInr != null ? { shippingInr } : {}),
        ...(payment
          ? { payment: { razorpayPaymentId: payment.razorpayPaymentId, ...(paidTotal != null ? { amountInr: paidTotal } : {}) } }
          : {}),
        package: { lengthMm: 1400, diameterMm: 75 },
        items,
      }),
    });
    if (!res.ok) throw new Error(`os web-order ${res.status}: ${await res.text()}`);
    return true;
  } catch (e) {
    console.error(`OS_SYNC_HOLD: paid website order ${o.order_number} (${o.order_id}) needs retry/reconciliation:`, e instanceof Error ? e.message : e);
    return false;
  }
}
