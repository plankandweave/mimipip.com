import { supabase } from "./supabase";
import { cachedCatalogue } from "./catalogue-cache";
import { NAFAS_DESIGNS } from "./nafas";

/**
 * Which of Nafas's designs are live to buy. The shopfront is driven by
 * lib/nafas and reads correctly before the catalogue has them (RLS hides
 * drafts from the public key, so "not found" means "not live yet"); a design
 * that is not live is shown without a link rather than as a dead one.
 */
export const getNafasLiveHandles = cachedCatalogue("nafas-live-handles", async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from("products")
    .select("handle")
    .eq("status", "active")
    .in("handle", NAFAS_DESIGNS.map((d) => d.handle));
  if (error) throw error;
  return ((data as { handle: string }[]) ?? []).map((r) => r.handle);
}, 300);
