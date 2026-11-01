import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { searchProducts, getProductDetails, priceMural } from "@/lib/concierge-tools";
import { supabase } from "@/lib/supabase";
import { getProductByHandle, pickFlatImage } from "@/lib/queries";
import { areaSqFt, billedSqFt, billedPriceFor, MIN_WALLPAPER_SQFT, fixedSizePrice, matchReadySize, toCm, CM_PER_INCH, type Unit } from "@/lib/pricing";
import type { CropData } from "@/lib/visualizer";

// Discovery (search/product/price) is open for AI shopping agents, but ORDER
// placement spends real resources (print-file generation + fulfilment), so it
// is gated behind a bearer token. Fail-closed: if AGENT_API_TOKEN is unset,
// ordering is disabled entirely (discovery still works). Hand the token only
// to trusted machine callers (the Magnitude Group OS, marketplace connectors).
function orderAuthorized(req: Request): boolean {
  const token = process.env.AGENT_API_TOKEN;
  if (!token) return false;
  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const runtime = "nodejs";
export const maxDuration = 45;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}

// Single function serving the whole agent commerce API (Hobby-plan function
// budget). Routes by path: /api/agent (discovery), /api/agent/search,
// /api/agent/product/{handle}, /api/agent/price, /api/agent/order.
export async function GET(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  const url = new URL(req.url);
  const origin = url.origin;

  if (path.length === 0) {
    return NextResponse.json(
      {
        name: "Zyvorah Commerce API",
        description:
          "Public discovery for Zyvorah's mural wallpaper, murals, canvas wall art and borders. Search and product facts are open. India pricing tools return INR; shoppers outside India receive country-adjusted USD prices with international delivery included on zyvorah.com. Ordering is limited to approved integrations.",
        storefront: `${origin}/collections/wall-art`,
        markets: {
          india: "INR, GST included, free standard delivery",
          international: "USD, country-adjusted, international delivery included; destination duties, taxes and customs excluded",
        },
        materials: ["smooth-matt"],
        access: {
          discovery: "public",
          pricing: "public India-price basis",
          ordering: "approved integrations only; bearer token required",
        },
        openapi: `${origin}/.well-known/zyvorah-commerce-openapi.json`,
        endpoints: {
          search: { method: "GET", url: `${origin}/api/agent/search?q={query}&limit={n}` },
          product: { method: "GET", url: `${origin}/api/agent/product/{handle}` },
          price: { method: "POST", url: `${origin}/api/agent/price`, body: { handle: "string", material_slug: "string", width: "number", height: "number", unit: "ft|cm|in" } },
          order: { method: "POST", url: `${origin}/api/agent/order`, body: { handle: "string", material_slug: "string", width: "number", height: "number", unit: "ft|cm|in", quantity: "number", email: "string" } },
        },
      },
      { headers: CORS },
    );
  }

  if (path[0] === "search") {
    const q = url.searchParams.get("q") ?? "";
    const limit = Math.min(Number(url.searchParams.get("limit")) || 8, 24);
    if (!q.trim()) return NextResponse.json({ error: "missing query 'q'" }, { status: 400, headers: CORS });
    const found = await searchProducts(q, limit);
    return NextResponse.json(
      { query: q, results: found.map((p) => ({ handle: p.handle, title: p.title, fromPricePerSqft: p.fromPricePerSqft, url: `${origin}/products/${p.handle}` })) },
      { headers: CORS },
    );
  }

  if (path[0] === "product" && path[1]) {
    const res = await getProductDetails(path[1]);
    if (!res) return NextResponse.json({ error: "not_found" }, { status: 404, headers: CORS });
    return NextResponse.json(res.detail, { headers: CORS });
  }

  return NextResponse.json({ error: "not_found" }, { status: 404, headers: CORS });
}

export async function POST(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: CORS });

  if (path[0] === "price") {
    if (!body.handle || !body.material_slug) {
      return NextResponse.json({ error: "handle and material_slug required" }, { status: 400, headers: CORS });
    }
    const result = await priceMural(String(body.handle), String(body.material_slug), Number(body.width), Number(body.height), (body.unit as Unit) ?? "ft");
    return NextResponse.json(result, { headers: CORS });
  }

  if (path[0] === "order") {
    if (!orderAuthorized(req)) {
      return NextResponse.json(
        { error: process.env.AGENT_API_TOKEN ? "unauthorized" : "ordering_disabled" },
        { status: process.env.AGENT_API_TOKEN ? 401 : 503, headers: CORS },
      );
    }
    const email = String(body.email ?? "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "valid email required" }, { status: 400, headers: CORS });
    }
    const unit = (body.unit as Unit) ?? "ft";
    const widthCm = toCm(Number(body.width), unit);
    const heightCm = toCm(Number(body.height), unit);
    if (!(widthCm > 0) || !(heightCm > 0)) return NextResponse.json({ error: "invalid dimensions" }, { status: 400, headers: CORS });

    const product = await getProductByHandle(String(body.handle));
    if (!product) return NextResponse.json({ error: "unknown or inactive product" }, { status: 404, headers: CORS });
    const pm = (product.product_materials ?? []).find((m) => m.available && m.materials?.slug === body.material_slug);
    if (!pm?.materials) return NextResponse.json({ error: "material not available" }, { status: 400, headers: CORS });
    if (pm.materials.coming_soon) return NextResponse.json({ error: "material is coming soon" }, { status: 400, headers: CORS });

    const rate = Number(pm.price_per_sqft);
    const qty = Math.max(1, Math.floor(Number(body.quantity) || 1));

    // Fixed-size (canvas/wall-art, or a ready-size wallpaper) has no "wall" to
    // measure — it exists only at the sizes in ready_sizes. Without this, a
    // caller could submit any width/height and this endpoint would happily
    // capture (and print-file-generate) a size that was never configured for
    // print. Snap to the matching ready size (canonical inches, not whatever
    // the caller sent within tolerance) or refuse the order outright.
    const readySizes = product.ready_sizes;
    let orderWidthCm = widthCm;
    let orderHeightCm = heightCm;
    let lineTotal: number;
    if (readySizes?.length) {
      const matched = matchReadySize(readySizes, widthCm / CM_PER_INCH, heightCm / CM_PER_INCH);
      if (!matched) {
        return NextResponse.json(
          {
            error: `"${product.title}" is sold only at fixed sizes, not a custom wall size.`,
            availableSizes: readySizes.map(([w, h]) => `${w} in × ${h} in`),
          },
          { status: 400, headers: CORS },
        );
      }
      orderWidthCm = matched[0] * CM_PER_INCH;
      orderHeightCm = matched[1] * CM_PER_INCH;
      lineTotal = fixedSizePrice(orderWidthCm, orderHeightCm, rate, qty);
    } else {
      lineTotal = billedPriceFor(widthCm, heightCm, rate, qty);
    }
    // Custom wallpaper records its BILLED area (small-order minimums applied)
    // so area × rate reconciles on the order; fixed sizes record the real one.
    const area = readySizes?.length
      ? areaSqFt(orderWidthCm, orderHeightCm)
      : billedSqFt(orderWidthCm, orderHeightCm);
    const measuredArea = areaSqFt(orderWidthCm, orderHeightCm);
    const flat = pickFlatImage(product.product_images ?? []);
    const crop: CropData | null = flat
      ? { imageUrl: flat.url, wallWidthCm: orderWidthCm, wallHeightCm: orderHeightCm, offsetX: 0.5, offsetY: 0.5, zoom: 1 }
      : null;

    const { data, error } = await supabase.rpc("capture_pending_order", {
      p_product_handle: product.handle, p_material_slug: body.material_slug,
      p_width_cm: orderWidthCm, p_height_cm: orderHeightCm, p_area_sqft: area, p_unit_price: rate,
      p_quantity: qty, p_line_total: lineTotal, p_crop_data: crop, p_email: email, p_custom_image_url: null,
      p_placed_via: "agent",
    });
    if (error) return NextResponse.json({ error: "order_failed" }, { status: 502, headers: CORS });
    const result = data as { order_number: number; order_item_id: string };

    // No print file here: this order is captured unpaid, and production starts
    // only when it is paid (lib/retail-paid.ts, from every path that marks an
    // order paid). The crop is stored on the line for that moment.
    // Confirm the size actually captured, not the raw submitted value — for a
    // fixed size those can legitimately differ by up to the match tolerance.
    const wallLabel = readySizes?.length
      ? `${Math.round((orderWidthCm / CM_PER_INCH) * 100) / 100} in × ${Math.round((orderHeightCm / CM_PER_INCH) * 100) / 100} in (fixed size)`
      : `${body.width} × ${body.height} ${unit}`;
    return NextResponse.json(
      {
        ok: true,
        orderNumber: result.order_number,
        product: product.title,
        material: pm.materials.name,
        wall: wallLabel,
        areaSqFt: area,
        quantity: qty,
        totalINR: lineTotal,
        note:
          !readySizes?.length && area > measuredArea
            ? `Order captured at the small-order minimum billing (${MIN_WALLPAPER_SQFT} sq ft / 4 ft print width) — the print itself uses the exact submitted size. Free shipping across India, dispatched in 5–7 working days.`
            : "Order captured. Free shipping across India, dispatched in 5–7 working days.",
      },
      { headers: CORS },
    );
  }

  return NextResponse.json({ error: "not_found" }, { status: 404, headers: CORS });
}
