import { supabaseBrowser } from "@/lib/supabase-browser";
import type { CropData } from "@/lib/visualizer";

/** The board that auto-saved room-tool looks land in. A customer who wants
 *  per-client/per-room boards still gets them via the explicit "Save to my
 *  board" flow — this one is just the safety net so a preview is never lost. */
export const AUTO_BOARD_NAME = "See it in my room";

/** Surfaces outside the product page only know a handle. Products are publicly
 *  readable when active, so this resolves client-side. */
export async function resolveProductId(handle?: string | null): Promise<string | null> {
  if (!handle) return null;
  const { data } = await supabaseBrowser.from("products").select("id").eq("handle", handle).maybeSingle();
  return data?.id ?? null;
}

/** Find-or-create a board by name for this customer. Name match is how the
 *  auto-board stays a single board across sessions rather than one per visit. */
export async function ensureBoard(customerId: string, name: string): Promise<string> {
  const { data: existing } = await supabaseBrowser
    .from("boards")
    .select("id")
    .eq("customer_id", customerId)
    .eq("name", name)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await supabaseBrowser
    .from("boards")
    .insert({ customer_id: customerId, name })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function uploadBoardImage(customerId: string, imageDataUrl: string): Promise<string> {
  const blob = await (await fetch(imageDataUrl)).blob();
  // Random suffix as well as the timestamp — auto-save can fire twice inside
  // the same millisecond when a customer tries designs quickly.
  const path = `${customerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const up = await supabaseBrowser.storage.from("board-images").upload(path, blob, {
    contentType: "image/jpeg",
  });
  if (up.error) throw up.error;
  return supabaseBrowser.storage.from("board-images").getPublicUrl(path).data.publicUrl;
}

/** image_url is always this bucket's own URL (see uploadBoardImage) — strip
 *  everything up to the bucket segment to get the storage path back. Handles
 *  the signed form too, so a row is still addressable once signed. */
export function pathFromPublicUrl(imageUrl: string): string | null {
  const marker = "/mimipip-board-images/";
  const i = imageUrl.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(imageUrl.slice(i + marker.length).split("?")[0]);
}

/** How long a board preview link stays good. A board page is looked at, not
 *  kept — an hour outlives any single visit. */
const BOARD_URL_TTL = 3600;

/**
 * A viewable URL for a saved board preview.
 *
 * The bucket is private and its read policy is scoped to the owner, so this is
 * signed with the CUSTOMER's own session — the signature only succeeds for
 * someone who could already read the row. Returns null when the object has
 * gone (a superseded tile mid-delete), so callers can skip the tile instead of
 * rendering a broken image.
 */
export async function signBoardImage(imageUrl: string): Promise<string | null> {
  const path = pathFromPublicUrl(imageUrl);
  if (!path) return imageUrl;
  const { data, error } = await supabaseBrowser.storage
    .from("board-images")
    .createSignedUrl(path, BOARD_URL_TTL);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function addBoardItem({
  boardId,
  productId,
  imageUrl,
  crop,
  replaceSameProduct = false,
}: {
  boardId: string;
  productId: string | null;
  imageUrl: string;
  crop: CropData;
  /** Auto-save re-frames the same design in place rather than stacking a new
   *  tile every time the customer nudges the placement. */
  replaceSameProduct?: boolean;
}): Promise<void> {
  let superseded: { id: string; image_url: string }[] = [];
  if (replaceSameProduct && productId) {
    const { data } = await supabaseBrowser
      .from("board_items")
      .select("id, image_url")
      .eq("board_id", boardId)
      .eq("product_id", productId);
    superseded = data ?? [];
  }

  // Insert the new tile before touching the old one — if this throws, the
  // customer keeps the placement they already had rather than losing both.
  const { error } = await supabaseBrowser.from("board_items").insert({
    board_id: boardId,
    product_id: productId,
    image_url: imageUrl,
    crop_data: crop,
  });
  if (error) throw error;

  if (superseded.length) {
    await supabaseBrowser
      .from("board_items")
      .delete()
      .in("id", superseded.map((s) => s.id));
    const paths = superseded.map((s) => pathFromPublicUrl(s.image_url)).filter((p): p is string => p != null);
    if (paths.length) {
      // Best-effort: an orphaned JPEG is a cleanup nit, not worth failing the save over.
      await supabaseBrowser.storage.from("board-images").remove(paths).catch(() => {});
    }
  }
}
