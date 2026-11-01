import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { TASTE_COOKIE } from "@/lib/taste";
import { getShopConcept } from "@/lib/shop-concepts";
import { isCrawler, uaFamily, VISITOR_TOKEN_RE } from "@/lib/ua";
import { istDateKey } from "@/lib/ist";
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const handle = body?.handle;
  if (typeof handle !== "string" || !handle.length || handle.length > 120)
    return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
  // A shoppable concept (the case-study builder) reports its concept slug, not
  // a design handle, so its row lines up with case_study_download and the
  // concept cart_add. Only a real concept may claim that.
  const concept = body?.concept === true;
  if (concept && !getShopConcept(handle))
    return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
  const token = (await cookies()).get(TASTE_COOKIE)?.value;
  if (isCrawler(req.headers.get("user-agent"))) return new Response(null, { status: 204 });
  if (!token || !VISITOR_TOKEN_RE.test(token))
    return NextResponse.json({ error: "visitor_not_ready" }, { status: 409 });
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "measurement_unavailable" }, { status: 503 });
  // Once per visitor/design/day. This is browser-reported interaction, not money.
  const eventKey = createHash("sha256")
    .update(
      `configuration_start:${token}:${handle}:${istDateKey()}`,
    )
    .digest("hex");
  const { error } = await db.from("site_events").insert({
    token,
    event: "configuration_start",
    product_handle: handle,
    meta: concept ? { concept: true } : null,
    event_key: eventKey,
    is_bot: false,
    ua_family: uaFamily(req.headers.get("user-agent")),
    emitted_by: "client",
    token_presented: true,
    schema_version: 1,
  });
  return new Response(null, {
    status: error && error.code !== "23505" ? 503 : 204,
  });
}
