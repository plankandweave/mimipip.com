import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Server-side half of the wishlist.
 *
 * A guest's saves live in localStorage (src/lib/local-store.ts) and that stays
 * true — saving must never wait for an account. Once someone has verified an
 * email, the same list is mirrored into `wishlist_items` so it survives a
 * cleared browser and follows them to their phone, which is the only honest
 * basis on which to ASK for the email in the first place.
 *
 * Every function here fails soft. The wishlist is a convenience, not a
 * transaction: a sync error must leave the local list exactly as the customer
 * left it rather than surface a failure they can do nothing about. That also
 * makes the code safe to deploy before its migration is applied — a missing
 * table is just another failed sync.
 */

/** Handles this customer has saved on the server, newest first. */
export async function fetchRemoteWishlist(customerId: string): Promise<string[]> {
  try {
    const { data, error } = await supabaseBrowser
      .from("wishlist_items")
      .select("product_handle")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return data.map((r) => r.product_handle as string);
  } catch {
    return [];
  }
}

/** Mirror one save. Idempotent: re-saving a design keeps the original date. */
export async function pushRemoteSave(customerId: string, handle: string): Promise<void> {
  try {
    await supabaseBrowser
      .from("wishlist_items")
      .upsert({ customer_id: customerId, product_handle: handle }, {
        onConflict: "customer_id,product_handle",
        ignoreDuplicates: true,
      });
  } catch {
    /* the local list is the customer's copy and is already correct */
  }
}

/** Mirror one un-save. */
export async function pushRemoteUnsave(customerId: string, handle: string): Promise<void> {
  try {
    await supabaseBrowser
      .from("wishlist_items")
      .delete()
      .eq("customer_id", customerId)
      .eq("product_handle", handle);
  } catch {
    /* as above */
  }
}

/**
 * Reconcile the two lists at sign-in and return the merged handle list.
 *
 * A UNION, deliberately, and not a "the server wins" replace: the saves someone
 * made as a guest in this very session are usually the reason they just signed
 * in, and silently dropping them would be the worst possible first act of the
 * account. The cost of a union is that an un-save made on another device can
 * come back if this browser never learned about it — a design reappearing in a
 * list is a smaller harm than a design the customer chose disappearing from it.
 */
export async function mergeWishlists(customerId: string, local: string[]): Promise<string[]> {
  const remote = await fetchRemoteWishlist(customerId);
  const onlyLocal = local.filter((h) => !remote.includes(h));
  if (onlyLocal.length) {
    try {
      await supabaseBrowser.from("wishlist_items").upsert(
        onlyLocal.map((handle) => ({ customer_id: customerId, product_handle: handle })),
        { onConflict: "customer_id,product_handle", ignoreDuplicates: true },
      );
    } catch {
      /* they keep the local list; the next save retries the mirror */
    }
  }
  // Local first: the most recent intent is the one in this browser.
  return [...local, ...remote.filter((h) => !local.includes(h))];
}
