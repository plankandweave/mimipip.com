import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ShippingOrder } from "@/lib/fulfillment/types";
import type { CropData } from "@/lib/visualizer";
import type { OrderCopyItem } from "@/lib/order-copy";
import { shippingLineFor } from "@/lib/shipping";

/**
 * NO ORDER IS AN ORDER UNTIL IT IS PAID (Roheena, 8 October 2026).
 *
 * Until this module, "Place order" did the work of a sale before any money
 * moved: checkout minted the production ZVY number, queued the ~200 MP print
 * masters and rendered the order copy, all for an order whose payment window
 * might be closed fifty seconds later. ZVY-20489 (#82, a founder's test, the
 * window dismissed, nothing paid) was a production-numbered order with print
 * files and an order copy, and the admin list called it "Order placed".
 *
 * The production work now starts from ONE place, called by every way an
 * order becomes paid:
 *   - /api/razorpay/verify       (the browser came back from Razorpay)
 *   - /api/webhooks/razorpay     (it did not — the UPI app hop lost the tab)
 *   - lib/paid-without-gateway   (a gift card or collaboration covered it all)
 *
 * The webhook is the one that mattered most. It used to mark the order paid
 * and stop: no number, no print files, no OS push, no founder's note — so a
 * customer whose browser never came back had paid for a wall nobody would
 * ever make. Every step below is idempotent, so the verify and the webhook
 * racing for the same payment cannot double anything.
 */

/**
 * The steps that must happen before anyone is told the order exists: the
 * ZVY number (before the OS push, or the OS mints its own and the two
 * disagree for ever), a sample order's cards, and the OS push carrying the
 * payment. Awaited by the caller. Never throws; returns the headline ZVY.
 */
export async function settlePaidOrder(
  orderId: string,
  opts: { paymentReference: string; shipping?: ShippingOrder | null },
): Promise<string | null> {
  return (await settlePaidOrderReporting(orderId, opts)).zvy;
}

/**
 * settlePaidOrder, also saying whether the OS took the order. A caller that
 * can be asked again — the Razorpay webhook for a trade payment link, which
 * answers 500 so Razorpay redelivers — needs to know the push failed; every
 * step stays idempotent, so a redelivery can only heal.
 */
export async function settlePaidOrderReporting(
  orderId: string,
  opts: { paymentReference: string; shipping?: ShippingOrder | null },
): Promise<{ zvy: string | null; pushed: boolean }> {
  let zvy: string | null = null;
  let pushed = false;
  try {
    const { ensureOrderZvy } = await import("@/lib/order-number");
    zvy = await ensureOrderZvy(orderId);
  } catch (e) {
    console.error(`zvy at payment failed for ${orderId}:`, e);
  }

  // A sample order's cards become pushable once paid — before the OS push,
  // which reads them in place of order_items. A no-op for any other order.
  try {
    const { activateSampleCards } = await import("@/lib/sample-print");
    const activated = await activateSampleCards(orderId);
    if (activated) console.log(`order ${orderId}: ${activated} sample card(s) activated`);
  } catch (e) {
    console.error("sample card activation failed:", e);
  }

  // Paid → the Magnitude Group OS, carrying the payment so it books the sale
  // as settled. Env-gated, idempotent on the order ref, never blocking.
  try {
    const { loadShippingOrder } = await import("@/lib/paid-without-gateway");
    const shipping = opts.shipping ?? (await loadShippingOrder(orderId));
    if (shipping) {
      const { pushOrderToOs } = await import("@/lib/os-sync");
      const synced = await pushOrderToOs(shipping, { razorpayPaymentId: opts.paymentReference });
      pushed = synced;
      if (!synced) console.error(`OS_SYNC_HOLD: paid order ${orderId} was not handed to the OS; retry or reconcile before fulfilment`);
    } else {
      console.error(`paid order ${orderId}: could not load its shipping payload for the OS`);
    }
  } catch (e) {
    console.error("OS sync hook failed:", e);
  }
  return { zvy, pushed };
}

/**
 * The slow production artefacts, run after the response: a print file for
 * every line that has none yet, and the order copy (which carries the ZVY,
 * so it can only be drawn once the order is paid and numbered).
 */
export async function producePaidOrder(orderId: string): Promise<void> {
  await queueMissingPrintFiles(orderId);
  await buildOrderCopyIfMissing(orderId);
}

type ManifestItem = {
  orderItemId: string;
  widthCm: number;
  heightCm: number;
  materialSlug: string | null;
  cropData: CropData | null;
  printStatus: string | null;
};

/** Queue every printable line short of 'generated'. Idempotent per line. */
export async function queueMissingPrintFiles(orderId: string): Promise<number> {
  try {
    const { supabase } = await import("@/lib/supabase");
    const { data: manifest } = await supabase.rpc("order_print_manifest", { p_order_id: orderId });
    const missing = ((manifest ?? []) as ManifestItem[]).filter(
      (it) => it.printStatus !== "generated" && it.cropData && it.materialSlug,
    );
    if (!missing.length) return 0;
    const { queuePrintFile } = await import("@/lib/media-client");
    for (const it of missing) {
      try {
        await queuePrintFile({
          orderItemId: it.orderItemId,
          crop: it.cropData!,
          widthCm: it.widthCm,
          heightCm: it.heightCm,
          materialSlug: it.materialSlug!,
        });
      } catch (e) {
        console.error(`print queue failed for item ${it.orderItemId} (order ${orderId}):`, e);
      }
    }
    return missing.length;
  } catch (e) {
    console.error("print guard failed:", e);
    return 0;
  }
}

/** Parse the presentment JSON checkout writes into orders.notes. */
function orderNotes(raw: unknown): { marketCountry?: string; tradeAccount?: boolean } {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  try {
    return JSON.parse(String(raw)) ?? {};
  } catch {
    return {};
  }
}

/** Render the order copy once — skipped when one exists, and for an
 *  international order, whose document is the export invoice at dispatch. */
export async function buildOrderCopyIfMissing(orderId: string): Promise<void> {
  const db = supabaseAdmin();
  if (!db) return;
  try {
    const { data: o } = await db
      .from("orders")
      .select("order_number, zvy, shipping, shipping_speed, notes, trade_partner_id, order_copy_url, status")
      .eq("id", orderId)
      .maybeSingle();
    if (!o || o.order_copy_url) return;
    const notes = orderNotes(o.notes);
    if (notes.marketCountry && notes.marketCountry !== "IN") return;

    const { data: rows } = await db
      .from("order_items")
      .select("product_title, material_name, width_cm, height_cm, area_sqft, quantity, line_total, crop_data, preview_url, materials(slug), products(handle)")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    if (!rows?.length) return;

    type Row = {
      product_title: string; material_name: string; width_cm: number; height_cm: number;
      area_sqft: number; quantity: number; line_total: number; crop_data: CropData | null;
      preview_url: string | null;
      materials: { slug: string | null } | { slug: string | null }[] | null;
      products: { handle: string | null } | { handle: string | null }[] | null;
    };
    const items: OrderCopyItem[] = (rows as unknown as Row[]).map((r) => {
      const m = Array.isArray(r.materials) ? r.materials[0] : r.materials;
      return {
        productTitle: r.product_title,
        materialName: r.material_name,
        materialSlug: m?.slug ?? undefined,
        widthCm: Number(r.width_cm),
        heightCm: Number(r.height_cm),
        areaSqft: Number(r.area_sqft),
        quantity: Number(r.quantity),
        lineTotal: Number(r.line_total),
        crop: r.crop_data,
        previewUrl: r.preview_url,
      };
    });
    const wallpaperLines = (rows as unknown as Row[]).filter((r) => {
      const p = Array.isArray(r.products) ? r.products[0] : r.products;
      return p?.handle !== "bespoke-customisation";
    }).length;
    const { buildCartOrderCopyPdfRemote } = await import("@/lib/order-copy-remote");
    await buildCartOrderCopyPdfRemote(
      orderId,
      o.order_number,
      o.zvy,
      items,
      shippingLineFor(Number(o.shipping ?? 0), o.shipping_speed, wallpaperLines),
      Boolean(o.trade_partner_id) || notes.tradeAccount === true,
    );
  } catch (e) {
    console.error(`order copy at payment failed for ${orderId}:`, e);
  }
}

/**
 * Production, then the customer's confirmation email — in that order, so the
 * email can link the order copy it describes. The copy is given a short head
 * start, never a veto: a slow renderer must not cost the customer the email
 * that tells her we have her money (the note links the copy when it is ready
 * and simply omits the line when it is not).
 */
export async function produceThenNotify(orderId: string, headStartMs = 10_000): Promise<void> {
  await Promise.race([
    producePaidOrder(orderId),
    new Promise<void>((resolve) => setTimeout(resolve, headStartMs)),
  ]);
  try {
    const { sendFounderNote } = await import("@/lib/founder-email");
    await sendFounderNote(orderId);
  } catch (e) {
    console.error("founder note failed:", e);
  }
}

/**
 * Spend the gift card reserved against a part-paid order — once. Verify and
 * the webhook both reach here for the same payment, and apply_gift_card is
 * not idempotent (it deducts every time it is called), so the reservation is
 * CLAIMED first: only the call whose update clears the code applies it.
 */
export async function spendReservedGift(orderId: string): Promise<void> {
  const db = supabaseAdmin();
  if (!db) return;
  try {
    const { data: o } = await db.from("orders").select("pending_gift_code").eq("id", orderId).maybeSingle();
    const code = (o as { pending_gift_code?: string | null } | null)?.pending_gift_code;
    if (!code) return;
    const { data: claimed } = await db
      .from("orders")
      .update({ pending_gift_code: null })
      .eq("id", orderId)
      .eq("pending_gift_code", code)
      .select("id");
    if (!claimed?.length) return; // the other path got there first
    const { error } = await db.rpc("apply_gift_card", { p_order_id: orderId, p_code: code });
    if (error) console.error(`gift ${code} on paid order ${orderId} failed:`, error.message);
  } catch (e) {
    console.error("gift apply on payment failed:", e);
  }
}
