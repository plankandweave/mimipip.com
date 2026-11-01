import { requireGatedUser } from "@/lib/auth-server";

/** Authenticated same-origin proxy. Provider credentials never reach the browser. */
export async function POST(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin) return Response.json({ error: "Unexpected origin" }, { status: 403 });
  const { user, blocked } = await requireGatedUser();
  if (blocked) return blocked;
  const token = process.env.ZYVORAH_WEBHOOK_TOKEN;
  if (!token) return Response.json({ error: "Calling is unavailable. Please use our text concierge." }, { status: 503 });
  const text = await req.text();
  if (text.length > 65_536) return Response.json({ error: "Request too large" }, { status: 413 });
  let body: { sdp?: unknown; callId?: unknown; action?: unknown };
  try { body = JSON.parse(text); } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  const action = body.action === "end" ? "end" : "start";
  if (action === "start" && (typeof body.sdp !== "string" || !body.sdp.startsWith("v=0"))) return Response.json({ error: "Invalid call offer" }, { status: 400 });
  try {
    const r = await fetch(`${(process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "")}/api/zyvorah/customer-service/voice/${action}`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-zyvorah-token": token },
      body: JSON.stringify({ sdp: body.sdp, callId: body.callId, customerId: user.id, verifiedEmail: user.email }),
      signal: AbortSignal.timeout(25_000), cache: "no-store",
    });
    if (!r.ok) return Response.json({ error: "Calling is unavailable. Please use our text concierge." }, { status: r.status === 429 ? 429 : 503 });
    return Response.json(await r.json(), { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Unable to connect. Please try again." }, { status: 503 }); }
}
