import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Quotation } from "./model";
import { priceQuotationDesigns, type QuotationDesign } from "./catalogue-pricing";

/** Refresh immediately before rendering/sending so draft cards follow the live website. */
export async function refreshQuotationCatalogue(q: Quotation): Promise<Quotation> {
  const sb = supabaseAdmin();
  if (!sb) throw new Error("Catalogue unavailable; quotation prices cannot be verified.");
  const handles = [...new Set(q.lines.map((l) => l.productHandle).filter((h): h is string => !!h))];
  const designs: QuotationDesign[] = [];
  if (handles.length) {
    const { data, error } = await sb.from("products").select("handle, title, product_materials(price_per_sqft, available, materials(slug, name, coming_soon))").in("handle", handles).eq("status", "active").eq("category", "wallpaper");
    if (error) throw error;
    for (const p of data ?? []) for (const pm of p.product_materials ?? []) {
      const m = Array.isArray(pm.materials) ? pm.materials[0] : pm.materials;
      if (pm.available && m && !m.coming_soon) designs.push({ handle: p.handle, title: p.title, surfaceSlug: m.slug, surface: m.name, rateInclGst: Number(pm.price_per_sqft) });
    }
  }
  return priceQuotationDesigns(q, designs);
}
