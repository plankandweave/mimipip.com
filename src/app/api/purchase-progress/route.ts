import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { TASTE_COOKIE } from "@/lib/taste";
import { isCrawler, uaFamily, VISITOR_TOKEN_RE } from "@/lib/ua";
import { istDateKey } from "@/lib/ist";
import { purchaseStage } from "@/lib/purchase-progress";

export async function POST(req: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return new Response(null, { status: 403, headers });
  const stage = purchaseStage((await req.json().catch(() => null))?.stage);
  if (!stage) return new Response(null, { status: 400, headers });
  if (isCrawler(req.headers.get("user-agent"))) return new Response(null, { status: 204, headers });
  const store = await cookies();
  const visitor = store.get(TASTE_COOKIE)?.value;
  const cart = store.get("zyv_cart")?.value;
  if (!visitor || !VISITOR_TOKEN_RE.test(visitor) || !cart || !VISITOR_TOKEN_RE.test(cart))
    return new Response(null, { status: 409, headers });
  const db = supabaseAdmin();
  if (!db) return new Response(null, { status: 503, headers });
  // No customer input, payment identifiers, order URLs or raw cart tokens.
  // Daily deduplication bounds writes; these are observations, not attempts.
  const key = createHash("sha256").update(`purchase_progress:${visitor}:${cart}:${stage}:${istDateKey()}`).digest("hex");
  const { error } = await db.from("site_events").insert({
    token: visitor, event: "purchase_progress", event_key: key,
    meta: { stage }, is_bot: false, ua_family: uaFamily(req.headers.get("user-agent")),
    emitted_by: "client", token_presented: true, schema_version: 1,
  });
  return new Response(null, { status: error && error.code !== "23505" ? 503 : 204, headers });
}
