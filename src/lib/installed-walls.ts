import { supabase } from "@/lib/supabase";
import { cachedCatalogue } from "@/lib/catalogue-cache";
import { formatInstalledMonth } from "@/lib/installed-walls-intake";

// Real photos of finished installs for a design — a genuine wall in a real
// home, never a render. The Magnitude Group OS owns the customer's consent,
// the privacy gate and Roheena's approval, and PUSHES approved photos to
// /api/installed-walls/intake (src/lib/installed-walls-intake.ts), which
// strips the JPEG's metadata and stores one row per OS order in
// installed_wall_photos. A withdrawn consent flips the row to 'withdrawn' and
// deletes the bytes; anon can only ever read 'published' rows (RLS), and this
// asks for them explicitly as well.
//
// Only the CITY and the MONTH are shown — never a name, an address or a day.

export type InstalledWallPhoto = {
  url: string;
  city: string;
  /** "September 2026" — the table only ever stores the first of the month. */
  month: string;
};

export const INSTALLED_WALLS_LIMIT = 6;

// Wrapped in the catalogue cache: the product page is the busiest page on the
// site and these rows change when the OS pushes or withdraws (both bump the
// catalogue version), not when a visitor arrives. A failed read THROWS so an
// outage is not cached as "no photos"; the public wrapper below turns it into
// an empty strip for that one render.
export const readInstalledWallPhotos = cachedCatalogue(
  "installed-wall-photos",
  async (productHandle: string, limit: number): Promise<InstalledWallPhoto[]> => {
    const { data, error } = await supabase
      .from("installed_wall_photos")
      .select("url, city, installed_month")
      .eq("product_handle", productHandle)
      .eq("status", "published")
      .order("installed_month", { ascending: false })
      .order("approved_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`installed_wall_photos(${productHandle}): ${error.message}`);
    const out: InstalledWallPhoto[] = [];
    for (const r of (data ?? []) as { url: string | null; city: string | null; installed_month: string | null }[]) {
      const month = r.installed_month ? formatInstalledMonth(r.installed_month) : null;
      if (r.url && r.city && month) out.push({ url: r.url, city: r.city, month });
    }
    return out;
  },
);

export async function getInstalledWallPhotos(
  productHandle: string,
  limit = INSTALLED_WALLS_LIMIT,
): Promise<InstalledWallPhoto[]> {
  try {
    return await readInstalledWallPhotos(productHandle, Math.min(limit, INSTALLED_WALLS_LIMIT));
  } catch (err) {
    console.error("[installed-walls] read failed:", err);
    return [];
  }
}
