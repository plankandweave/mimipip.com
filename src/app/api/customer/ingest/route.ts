import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

// One central book of customers, whoever took the order.
//
// Orders placed at the desk, over WhatsApp or through a corporate portal live
// in the OS, so those customers never appeared in the store's `customers` table
// — and the brand's engagement emails couldn't see them. The OS calls this on
// every order it creates; the customer lands in the same book as a zyvorah.com
// buyer and receives the same brand sequences, addressed to their segment.
//
// POST { secret, email, name?, phone?, segment?, company?, source? }
//   segment: "basic" (a household) | "b2b" (Vijay Sales, HomeLane, a design firm)
//
// Consent is never manufactured here: upsert_customer_from_os honours an
// existing unsubscribe or hard bounce forever, only fills blank fields, and
// lets a segment escalate to b2b but never fall back to consumer promos.
export async function POST(req: Request) {
  // Same shared secret the OS already uses for the dispatch handoff.
  const osToken = process.env.ZYVORAH_WEBHOOK_TOKEN;
  const adminKey = process.env.INTEL_RPC_KEY;
  if (!osToken) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const supplied = body?.secret;
  if (typeof supplied !== "string" || supplied.length === 0 || supplied !== osToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!adminKey) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("upsert_customer_from_os", {
    p_key: adminKey,
    p_email: email,
    p_name: typeof body?.name === "string" ? body.name : null,
    p_phone: typeof body?.phone === "string" ? body.phone : null,
    p_segment: body?.segment === "b2b" ? "b2b" : "basic",
    p_company: typeof body?.company === "string" ? body.company : null,
    p_source: typeof body?.source === "string" ? body.source : "os",
  });
  if (error) {
    console.error("upsert_customer_from_os failed:", error.message);
    return NextResponse.json({ error: "upsert_failed" }, { status: 500 });
  }
  return NextResponse.json(data ?? { ok: true });
}
