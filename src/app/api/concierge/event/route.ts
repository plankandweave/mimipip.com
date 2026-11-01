import { NextResponse } from "next/server";
import { clientEvent } from "@/lib/concierge-events";
import { recordConciergeEvent } from "@/lib/concierge-store";
import { isCrawler } from "@/lib/ua";

// Before sign-in by design. Public intake accepts only a small allowlisted
// event schema; browser claims can never impersonate server-confirmed events.
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if ((origin && origin !== new URL(req.url).origin) || req.headers.get("sec-fetch-site") === "cross-site")
    return new Response(null, { status: 403 });
  if (isCrawler(req.headers.get("user-agent"))) return new Response(null, { status: 204 });
  const raw = await req.text();
  if (raw.length > 2048) return new Response(null, { status: 413 });
  let payload;
  try { payload = clientEvent(JSON.parse(raw)); } catch { payload = null; }
  if (!payload) return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  const saved = await recordConciergeEvent(payload, payload.event, payload, "client", payload.id);
  return new Response(null, { status: saved ? 204 : 503 });
}
