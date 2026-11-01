import { supabase } from "./supabase";
import { cachedCatalogue } from "./catalogue-cache";
import { LORANGE_VENDOR } from "./lorange-kids";

/**
 * Every live L'Orange Kids design, newest first. The shop lists whatever this
 * returns, so a design appears the moment its row is active with the brand's
 * vendor name — and an empty answer is the honest "first collections are on
 * their way", never a filler of Zyvorah designs dressed as the sister brand.
 */
export const getLorangeHandles = cachedCatalogue("lorange-kids-handles", async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from("products")
    .select("handle")
    .eq("vendor", LORANGE_VENDOR)
    .eq("status", "active")
    .eq("is_service", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as { handle: string }[]) ?? []).map((r) => r.handle);
}, 300);
