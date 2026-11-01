// Named collection previews and deliberate collection selections approved for
// the Collections directory, 29 October 2026. Other discovery stays default.
import { religionCatalogue } from "./supabase";
import { cachedCatalogue } from "./catalogue-cache";
import { getCollectionCards } from "./queries";

const collections: Record<string, { tag: string; faith: string; category?: string }> = {
  "canvas-dwadasha": { tag: "Dwadasha", faith: "hinduism", category: "canvas" },
  "canvas-landscapes": { tag: "Landscape", faith: "hinduism", category: "canvas" },
  "limited-edition": { tag: "Limited Edition", faith: "hinduism" },
  dwadasha: { tag: "Dwadasha", faith: "hinduism" },
  "divine-darshan": { tag: "Divine Darshan", faith: "hinduism" },
  "sanatan-dharam": { tag: "Sanatan Dharam", faith: "hinduism" },
  "jain-temples": { tag: "Jain Temples", faith: "jainism" },
  "jain-temple-walls": { tag: "Jain Temple Walls", faith: "jainism" },
  "jain-temple-ceilings": { tag: "Jain Temple Ceilings", faith: "jainism" },
};
export const isNamedFaithCollection = (handle: string) => Object.hasOwn(collections, handle);

export const getNamedFaithCards = cachedCatalogue("named-faith-collection-cards", async (handle: string) => {
  if (!isNamedFaithCollection(handle)) return [];
  const selection = collections[handle];
  let query = religionCatalogue().from("products")
    .select("handle, member:product_tags!inner(tag)")
    .eq("status", "active").eq("is_service", false)
    .eq("religion", selection.faith).eq("member.tag", selection.tag);
  if (selection.category) query = query.eq("category", selection.category);
  const { data, error } = await query.order("aesthetic_rank", { ascending: true, nullsFirst: false }).order("handle");
  if (error) throw error;
  return (await getCollectionCards((data ?? []).map(p => p.handle), undefined, "scene", true))
    .filter(card => card.image && !card.imageIsFlat);
});
