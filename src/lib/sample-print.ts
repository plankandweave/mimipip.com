import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * The print half of a paid ₹200 design sample.
 *
 * A sample order (`orders.placed_via = 'sample'`) has NO order_items: the
 * design and the finish exist as structured values only inside the request
 * that creates it, and after that only as prose in the order note. Every
 * downstream reader — the OS push, the print manifest — works from order_items,
 * so a paid sample used to vanish after payment: money taken, nothing on the
 * production board (order #77, 2026-09-19, the first real customer sample).
 *
 * `sample_print_queue` is the structured record. One row per design × finish,
 * written 'unpaid' when the order is created (the only moment the selection is
 * known) and flipped to 'pending' by payment. The OS push reads it in place of
 * the manifest. The RPCs and table were migrated in August; this is the app
 * code that finally uses them.
 */

export const SAMPLE_UNIT_PRICE = 200;

/** A card is A4. The OS/engine print it as a wall of this size — the design
 *  cover-fitted to the sheet, which is the "what am I buying" card. */
export const SAMPLE_CARD_MM = { width: 210, height: 297 };

/** The mural a card is nominally a window of — the 8 × 8 ft feature wall the
 *  sample copy quotes. Recorded on the row for the day the engine's 1:1 card
 *  style rides along on a paying job; not used by the A4 push. */
export const SAMPLE_REFERENCE_MURAL_CM = { width: 243.84, height: 243.84 };

/** Customer-facing finish name (SAMPLE_FINISHES) → the material slug the
 *  factory stocks. The one place the two vocabularies meet. */
const FINISH_TO_SLUG: Record<string, string> = {
  "Soft Matte": "smooth-matt",
  "Smooth Matte (Self-Adhesive)": "self-adhesive-vinyl",
};

export type SampleCardRow = {
  id: string;
  order_number: number | null;
  design_handle: string;
  design_title: string;
  master_url: string;
  material_slug: string;
  material_name: string;
  status: string;
};

/**
 * Queue one card per finish as the sample order is CREATED. Rows land 'unpaid'
 * and are ignored by the OS push until payment activates them, so queueing
 * early can never produce a free print. Idempotent on (order, design, material)
 * inside the RPC. A failure here must not cost the customer the order — the
 * note still carries the selection for a person to work from.
 */
export async function enqueueSampleCards(params: {
  orderId: string;
  orderNumber: number;
  designHandle: string;
  designTitle: string;
  finishes: string[];
}): Promise<{ queued: number; skipped: string[] }> {
  const { orderId, orderNumber, designHandle, designTitle, finishes } = params;

  const { data: product } = await supabase
    .from("products")
    .select("id, product_images!inner(url, is_flat)")
    .eq("handle", designHandle)
    .eq("product_images.is_flat", true)
    .maybeSingle();
  const flatUrl = (product as { product_images?: { url: string }[] } | null)?.product_images?.[0]?.url;
  if (!flatUrl) {
    console.error(`sample order ${orderNumber}: no flat image for ${designHandle}`);
    return { queued: 0, skipped: finishes };
  }

  // Start the print master now — a Real-ESRGAN cascade that takes minutes —
  // so it is ready by the time the desk previews the card. The card is the
  // one print a customer inspects from 30 cm, and the web flat is 9 DPI at
  // 8 ft. Deliberately not awaited: the order must never wait on it.
  void import("./print-master")
    .then(({ warmPrintMaster }) => warmPrintMaster(designHandle))
    .catch(() => {});

  let queued = 0;
  const skipped: string[] = [];
  for (const finish of finishes) {
    const slug = FINISH_TO_SLUG[finish];
    if (!slug) {
      console.error(`sample order ${orderNumber}: finish "${finish}" has no material slug`);
      skipped.push(finish);
      continue;
    }
    const { error } = await supabase.rpc("enqueue_sample_card", {
      p_order_id: orderId,
      p_order_number: orderNumber,
      p_design_handle: designHandle,
      p_design_title: designTitle,
      p_master_url: flatUrl,
      p_material_slug: slug,
      p_material_name: finish,
      p_crop_x: 0.5,
      p_crop_y: 0.5,
      p_mural_width_cm: SAMPLE_REFERENCE_MURAL_CM.width,
      p_mural_height_cm: SAMPLE_REFERENCE_MURAL_CM.height,
    });
    if (error) {
      console.error(`enqueue_sample_card failed (order ${orderNumber}, ${finish}):`, error.message);
      skipped.push(finish);
      continue;
    }
    queued++;
  }
  return { queued, skipped };
}

/** Payment cleared → the order's cards become pushable. Only ever moves
 *  unpaid → pending, so a replayed confirmation cannot resurrect a card that
 *  was already printed or cancelled. Returns the number activated. */
export async function activateSampleCards(orderId: string): Promise<number> {
  const { data, error } = await supabase.rpc("activate_sample_cards", { p_order_id: orderId });
  if (error) {
    console.error("activate_sample_cards failed:", error.message);
    return 0;
  }
  return Number(data ?? 0);
}

/** The paid cards of an order, for the OS push. The table has no RLS policies,
 *  so this needs the service role; without it there are simply no cards. */
export async function paidSampleCards(orderId: string): Promise<SampleCardRow[]> {
  const admin = supabaseAdmin();
  if (!admin) return [];
  const { data, error } = await admin
    .from("sample_print_queue")
    .select("id, order_number, design_handle, design_title, master_url, material_slug, material_name, status")
    .eq("order_id", orderId)
    .neq("status", "unpaid")
    .order("created_at");
  if (error) {
    console.error("sample_print_queue read failed:", error.message);
    return [];
  }
  return (data ?? []) as SampleCardRow[];
}
