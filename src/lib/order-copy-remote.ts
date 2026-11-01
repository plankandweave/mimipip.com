// Remote twin of buildCartOrderCopyPdf (src/lib/order-copy.ts). That module
// imports sharp, which workerd cannot run, so the app must never call it at
// runtime — the RENDER now happens in the media container (which bundles
// order-copy.ts and runs renderCartOrderCopyPdf there), while the storage
// upload and the set_order_copy_url write stay here, byte-for-byte the same.

import { supabase } from "./supabase";
import { toUploadBody } from "./storage-body";
import { docStorageClient } from "./private-doc";
import { renderOrderCopyRemote } from "./media-client";
import type { OrderCopyItem } from "./order-copy";

/**
 * Multi-item "This is what you ordered." PDF for a cart checkout, uploaded and
 * attached to the retail order. Same signature and behaviour as
 * buildCartOrderCopyPdf — only the PDF bytes come from the media container.
 */
export async function buildCartOrderCopyPdfRemote(
  orderId: string,
  orderNumber: number,
  /** The order's ZVY number — what the customer quotes and what production,
   *  the courier label and the invoice all carry. Null only when the issuer
   *  was unreachable at checkout, and then the internal id stands in. */
  zvy: string | null,
  items: OrderCopyItem[],
  shippingLine: { label: string; amount: number } | null = null,
  freightToPay = false,
): Promise<string> {
  const bytes = await renderOrderCopyRemote(items, {
    reference: zvy ? `Order ${zvy}` : `Order #${orderNumber}`,
    shippingLine,
    freightToPay,
  });
  const path = `${orderId}.pdf`;
  const docs = docStorageClient();
  const up = await docs.storage
    .from("order-copies")
    .upload(path, toUploadBody(Buffer.from(bytes), "application/pdf"), { contentType: "application/pdf", upsert: true });
  if (up.error) throw up.error;
  const { data: pub } = docs.storage.from("order-copies").getPublicUrl(path);
  const url = pub.publicUrl;
  await supabase.rpc("set_order_copy_url", { p_order_id: orderId, p_url: url });
  return url;
}
