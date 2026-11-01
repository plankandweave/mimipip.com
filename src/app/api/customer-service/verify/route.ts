import { requireGatedUser } from "@/lib/auth-server";
export async function POST(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin) return Response.json({ error: "Unexpected origin" }, { status: 403 });
  const { user, blocked } = await requireGatedUser(); if (blocked) return blocked;
  const raw = await req.text();
  if (raw.length > 1024) return Response.json({ error: "Request too large" }, { status: 413 });
  const body = (() => { try { return JSON.parse(raw); } catch { return null; } })();
  if (!/^[a-f0-9]{16}$/.test(body?.token ?? "")) return Response.json({ error: "Invalid verification link" }, { status: 400 });
  const key = process.env.ZYVORAH_WEBHOOK_TOKEN;
  if (!key) return Response.json({ error: "Verification unavailable" }, { status: 503 });
  try {
    const r = await fetch(`${(process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "")}/api/zyvorah/customer-service/verify`, { method: "POST", headers: { "Content-Type": "application/json", "x-zyvorah-token": key }, body: JSON.stringify({ token: body.token, verifiedEmail: user.email, action: body.action === "verify" ? "verify" : "inspect" }), signal: AbortSignal.timeout(10000) });
    return Response.json(r.ok ? await r.json() : { error: "This link has expired or was already used. Ask Shikha for a new link." }, { status: r.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Verification is unavailable. Please try again." }, { status: 503 }); }
}
