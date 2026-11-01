import { timingSafeEqual } from "node:crypto";
import { CONCIERGE_TOOLS, searchProducts, listCollections, browseCollection, whatsNew, similarTo, getProductDetails, priceMural, brandInfo, checkOrderStatus } from "@/lib/concierge-tools";
import { CUSTOMER_SERVICE_POLICY, SERVICE_CATALOGUE_TOOLS } from "@/lib/customer-service-policy";
import type { Unit } from "@/lib/pricing";

function authorized(req: Request) {
  const expected = process.env.ZYVORAH_WEBHOOK_TOKEN;
  const supplied = req.headers.get("x-zyvorah-token") ?? "";
  return !!expected && Buffer.byteLength(expected) === Buffer.byteLength(supplied) && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}
export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ policy: CUSTOMER_SERVICE_POLICY, tools: CONCIERGE_TOOLS.filter(t => SERVICE_CATALOGUE_TOOLS.has(t.name)) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (Number(req.headers.get("content-length")) > 16_384) return Response.json({ error: "Too large" }, { status: 413 });
  const text = await req.text();
  if (text.length > 16_384) return Response.json({ error: "Too large" }, { status: 413 });
  let body: { name?: string; input?: Record<string, unknown>; verifiedEmail?: string };
  try { body = JSON.parse(text); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const a = body.input ?? {};
  const limit = Math.max(1, Math.min(8, Math.floor(Number(a.limit) || 6)));
  let result: unknown;
  switch (body.name) {
    case "check_order_status": {
      if (!body.verifiedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.verifiedEmail)) return Response.json({ error: "Verified identity required" }, { status: 403 });
      const number = Number(a.order_number);
      if (!Number.isSafeInteger(number) || number <= 0) return Response.json({ error: "Valid order number required" }, { status: 400 });
      result = await checkOrderStatus(number, body.verifiedEmail); break;
    }
    case "search_products": result = await searchProducts(String(a.query ?? "").slice(0, 300), limit); break;
    case "list_collections": result = await listCollections(a.kind ? String(a.kind) : undefined); break;
    case "browse_collection": result = await browseCollection(String(a.handle ?? ""), limit); break;
    case "whats_new": result = await whatsNew(limit); break;
    case "similar_to": result = await similarTo(String(a.handle ?? ""), limit); break;
    case "get_product": result = (await getProductDetails(String(a.handle ?? "")))?.detail ?? { error: "Product not found" }; break;
    case "price_mural": {
      const width = Number(a.width), height = Number(a.height), unit = String(a.unit ?? "ft");
      if (![width, height].every(n => Number.isFinite(n) && n > 0) || !["ft", "cm", "in"].includes(unit)) return Response.json({ error: "Valid wall dimensions and unit required" }, { status: 400 });
      result = await priceMural(String(a.handle ?? ""), String(a.material_slug ?? ""), width, height, unit as Unit); break;
    }
    case "get_brand_info": result = await brandInfo(Array.isArray(a.topics) ? a.topics.map(String).slice(0, 20) : []); break;
    default: return Response.json({ error: "Tool unavailable" }, { status: 400 });
  }
  return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
}
