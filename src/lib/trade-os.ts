import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabase-admin";
import { pickFlatImage } from "./queries";
import { isOsSyncConfigured } from "./os-sync";
import { tradeLineCrop, type TradeLinkPaid } from "./trade-link-paid";
import type { ProductImage } from "./types";

// Gets a PAID trade payment-link order into the Magnitude OS — the missing leg
// of the trade program. The end customer pays on Razorpay's page, so the
// webhook is the only place the money is ever seen, and until this existed the
// webhook stopped at mark_trade_order_paid + commission: the order was paid,
// the partner earned, and nothing was ever printed, invoiced or shipped,
// because the OS (the print queue, dispatch and Zoho invoicing) never heard of
// it. The OS's web-order intake already expects exactly this ("retail and
// trade buyers pay Razorpay BEFORE the push") — this module is the caller it
// was waiting for.

const httpUrl = (s: unknown): s is string => typeof s === "string" && /^https?:\/\//i.test(s);

/**
 * Backfill the print crop on any of this order's lines that lack artwork.
 *
 * Catalogue lines take the product's flat (clean, no-furniture) image — the
 * same image the retail configurator and the ordering agent put in
 * crop_data.imageUrl. Own-design lines take custom_image_url when it is a real
 * URL (today the trade_checkout ownership check rejects every own-design line,
 * so this branch is future-proofing, not a live path). Idempotent: a line that
 * already has an imageUrl is left exactly as it is, so retail orders and
 * webhook redeliveries pass through untouched.
 */
export async function ensureTradePrintCrops(admin: SupabaseClient, orderId: string): Promise<void> {
  const { data: items, error } = await admin
    .from("order_items")
    .select("id, product_id, width_cm, height_cm, custom_image_url, crop_data")
    .eq("order_id", orderId);
  if (error) throw new Error(`order_items read failed: ${error.message}`);

  type Line = {
    id: string;
    product_id: string | null;
    width_cm: number | string;
    height_cm: number | string;
    custom_image_url: string | null;
    crop_data: Record<string, unknown> | null;
  };
  const missing = ((items ?? []) as Line[]).filter((it) => !httpUrl(it.crop_data?.["imageUrl"]));
  if (missing.length === 0) return;

  const productIds = [
    ...new Set(missing.filter((it) => !httpUrl(it.custom_image_url) && it.product_id).map((it) => it.product_id as string)),
  ];
  const flats = new Map<string, string>();
  if (productIds.length) {
    const { data: prods } = await admin
      .from("products")
      .select("id, product_images ( url, alt, position, is_featured, is_flat, scene_key )")
      .in("id", productIds);
    for (const p of (prods ?? []) as { id: string; product_images: ProductImage[] }[]) {
      const flat = pickFlatImage(p.product_images ?? []);
      if (flat?.url) flats.set(p.id, flat.url);
    }
  }

  for (const it of missing) {
    const imageUrl = httpUrl(it.custom_image_url) ? it.custom_image_url : flats.get(it.product_id ?? "");
    if (!imageUrl) {
      console.error(`trade-os: line ${it.id} has no design image (product ${it.product_id}) — it will not reach the OS`);
      continue;
    }
    const crop = tradeLineCrop(it.crop_data, imageUrl, Number(it.width_cm), Number(it.height_cm));
    const { error: upErr } = await admin.from("order_items").update({ crop_data: crop }).eq("id", it.id);
    if (upErr) console.error(`trade-os: could not store crop for line ${it.id}:`, upErr.message);
  }
}

export type TradeLinkOutcome = {
  ok: boolean;
  /** true → answer 500 so Razorpay redelivers and the OS push is retried. */
  retry: boolean;
  already: boolean;
  ledgerId: string | null;
  /** The paid order, so the caller can start its production after replying. */
  orderId?: string;
  outcome: string;
};

/**
 * The whole settlement for one payment_link.paid delivery: stamp the order
 * paid (idempotent RPC), then hand it to the OS with the payment attached so
 * it lands PAID over there — the credit gate releases it to print and the
 * payment chaser stays silent (ZVY-20447 is the retail version of that bug).
 *
 * Runs on fresh deliveries AND redeliveries, same shape as
 * handleCorporateCapture: the paid stamp and the ledger insert happen at most
 * once, pushOrderToOs is idempotent on orderRef#lineRef and markSalePaid on
 * the OS only ever heals — so re-running can only retry the push, never
 * double-print or double-pay.
 */
export async function handleTradeLinkPaid(cap: TradeLinkPaid): Promise<TradeLinkOutcome> {
  const admin = supabaseAdmin();
  if (!admin) return { ok: false, retry: true, already: false, ledgerId: null, outcome: "storage_not_configured" };

  const { data, error } = await admin.rpc("mark_trade_order_paid", {
    p_order_number: cap.orderNumber,
    p_payment_link_id: cap.linkId,
    p_razorpay_payment_id: cap.paymentId,
  });
  if (error) {
    console.error("mark_trade_order_paid failed:", error.message);
    return { ok: false, retry: true, already: false, ledgerId: null, outcome: "mark_failed" };
  }
  const result = data as { ok: boolean; already?: boolean; order_id?: string; ledger_id?: string } | null;
  if (!result?.ok || !result.order_id) {
    // A link we did not mint (or an order/link mismatch) — acknowledge rather
    // than make Razorpay redeliver something that can never resolve.
    return { ok: true, retry: false, already: false, ledgerId: null, outcome: "order_not_found" };
  }
  const orderId = result.order_id;

  // Self-healing: the crop backfill runs at order placement too, but the
  // webhook cannot depend on that having succeeded — without an imageUrl the
  // push maps every line to null and sends nothing.
  try {
    await ensureTradePrintCrops(admin, orderId);
  } catch (e) {
    console.error("trade-os: print-crop backfill failed:", e);
  }

  // From here a paid trade order is settled exactly as every other paid
  // order is (AGENTS rule, 8 October 2026: one door, lib/retail-paid.ts): the
  // ZVY number before the push, then the OS push carrying the payment. The
  // print files and the order copy follow after the response
  // (producePaidOrder, run by the webhook), never minted here.
  const { settlePaidOrderReporting } = await import("./retail-paid");
  const { pushed } = await settlePaidOrderReporting(orderId, { paymentReference: cap.paymentId });

  // Only ask Razorpay to redeliver when a retry could actually change the
  // answer: the OS being down heals on redelivery, a dev box with no OS token
  // does not.
  const retry = !pushed && isOsSyncConfigured();
  return {
    ok: true,
    retry,
    already: !!result.already,
    ledgerId: result.ledger_id ?? null,
    orderId,
    outcome: pushed ? "paid_and_pushed" : "paid_push_failed",
  };
}
