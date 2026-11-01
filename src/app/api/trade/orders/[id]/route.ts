import { NextResponse } from "next/server";
import { requireTradePartner } from "@/lib/trade-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// Next.js 16 — route params are Promise-wrapped (see AGENTS.md).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { partner, blocked } = await requireTradePartner();
  if (blocked) return blocked;

  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const { id } = await ctx.params;

  const { data: order, error } = await admin
    .from("orders")
    .select(
      "id, order_number, status, payment_status, email, phone, gstin, billing_name, shipping_address, subtotal, shipping, markup_total, total, trade_partner_id, payment_link_url, payment_link_id, courier, awb, tracking_url, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("trade order detail failed:", error.message);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  if (!order || order.trade_partner_id !== partner.id) {
    // Same 403 whether the order doesn't exist or belongs to another
    // partner — never confirm existence of an order that isn't theirs.
    return NextResponse.json({ error: "not_found" }, { status: 403 });
  }

  const { data: items, error: itemsError } = await admin
    .from("order_items")
    .select(
      "id, product_title, material_name, width_cm, height_cm, area_sqft, unit_price_per_sqft, quantity, line_total, custom_image_url, crop_data",
    )
    .eq("order_id", id)
    .order("created_at", { ascending: true });

  if (itemsError) {
    console.error("trade order items lookup failed:", itemsError.message);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }

  return NextResponse.json({ order, items: items ?? [] });
}
