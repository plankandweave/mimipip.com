import "server-only";

// Real storage behind the installed-wall intake/takedown handlers
// (installed-walls-intake.ts): the service-role Supabase client for the
// installed_wall_photos table (anon can only READ published rows), the public
// media bucket for the bytes, and the catalogue cache bump so product pages
// pick the change up within about a minute.

import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireMediaBucket } from "@/lib/r2-media";
import { MEDIA_BASE } from "@/lib/media-url";
import { bumpCatalogueVersion } from "@/lib/catalogue-cache";
import type { IntakeDeps, InstalledWallRow } from "@/lib/installed-walls-intake";

const COLUMNS =
  "id, os_order_id, product_handle, city, installed_month, r2_key, url, scope, status, approved_at, withdrawn_at";

export function installedWallDeps(): IntakeDeps | null {
  const sb = supabaseAdmin();
  if (!sb) return null;
  return {
    secret: process.env.ZYVORAH_WEBHOOK_TOKEN ?? "",
    now: () => new Date(),
    publicUrl: (key) => `${MEDIA_BASE}/${key}`,
    productIsActive: async (handle) => {
      const { data, error } = await sb.from("products").select("id").eq("handle", handle).eq("status", "active").maybeSingle();
      if (error) throw new Error(`product lookup failed: ${error.message}`);
      return !!data;
    },
    findByOrder: async (osOrderId) => {
      const { data, error } = await sb.from("installed_wall_photos").select(COLUMNS).eq("os_order_id", osOrderId).maybeSingle();
      if (error) throw new Error(`installed_wall_photos read failed: ${error.message}`);
      return (data as InstalledWallRow | null) ?? null;
    },
    upsert: async (row) => {
      const { data, error } = await sb
        .from("installed_wall_photos")
        .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "os_order_id" })
        .select("id")
        .single();
      if (error || !data) throw new Error(`installed_wall_photos upsert failed: ${error?.message ?? "no row"}`);
      return { id: (data as { id: string }).id };
    },
    markWithdrawn: async (osOrderId, at) => {
      const { error } = await sb
        .from("installed_wall_photos")
        .update({ status: "withdrawn", withdrawn_at: at, updated_at: at })
        .eq("os_order_id", osOrderId);
      if (error) throw new Error(`installed_wall_photos withdraw failed: ${error.message}`);
    },
    putObject: async (key, bytes, cacheControl) => {
      const bucket = await requireMediaBucket();
      await bucket.put(key, bytes, { httpMetadata: { contentType: "image/jpeg", cacheControl } });
    },
    deleteObjects: async (keys) => {
      const bucket = await requireMediaBucket();
      await bucket.delete(keys);
    },
    bumpCache: () => bumpCatalogueVersion(),
  };
}
