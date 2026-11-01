import { religionCatalogue } from "./supabase";
import { cachedCatalogue } from "./catalogue-cache";
import { RELIGIONS, type ReligionSlug } from "./religion";

// A small identity index, not images or full product rows. Full cards are read
// only for the page being shown, through getCollectionCards's existing cache.
export const getReligionIndex = cachedCatalogue("religion-index", async () => {
  const rows: { handle: string; category: string; religion: string; religious_subject: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await religionCatalogue().from("products")
      .select("handle, category, religion, religious_subject")
      .eq("status", "active").eq("is_service", false).not("religion", "is", null)
      .order("aesthetic_rank", { ascending: true, nullsFirst: false })
      .order("handle").range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows.flatMap((p) => {
    return RELIGIONS.some((r) => r.slug === p.religion)
      ? [{ handle: p.handle, category: p.category, faith: p.religion as ReligionSlug, subject: p.religious_subject }] : [];
  });
});
