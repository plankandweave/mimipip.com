import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { installCompleteEmail } from "@/lib/email-templates";
import { accountForEmail } from "@/lib/corporate-auth";

export const runtime = "nodejs";

// The OS calls this the moment an installer presses Complete in his app —
// for EVERY install-by-us order, whatever channel it came from: zyvorah.com,
// phone, a corporate portal, the desk. All of those share one row in the OS's
// wallpaper_orders table, so the OS is the one universal place to hook this;
// this endpoint deliberately asks the store for nothing in return — no order
// lookup, no dependency on a matching `orders` row existing here at all. That
// is what makes the email fire for an order this store may never have known
// about, not just its own web checkouts.
//
// POST { secret, email, name?, orderRef, designName?, photoUrl, discountCode?, discountPct? }
//
// discountCode/discountPct are optional: the OS omits them on the rare order
// that reached completion without ever getting a code minted at dispatch —
// the thank-you still goes out, just without the code chip.
export async function POST(req: Request) {
  const secret = process.env.ZYVORAH_WEBHOOK_TOKEN;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const supplied = body?.secret;
  if (typeof supplied !== "string" || supplied.length === 0 || supplied !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const orderRef = typeof body?.orderRef === "string" ? body.orderRef.trim() : "";
  const photoUrl = typeof body?.photoUrl === "string" ? body.photoUrl.trim() : "";
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !orderRef || !photoUrl) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const discountCode = typeof body?.discountCode === "string" ? body.discountCode.trim() : "";
  const discountPct = Number(body?.discountPct);
  // Retail-only: a corporate/trade account (Shades, HomeLane, etc.) already buys
  // at its negotiated rate and never redeems this code, so the install-complete
  // thank-you still goes out but without the retail discount chip.
  const account = await accountForEmail(email);
  const hasDiscount = !account && discountCode.length > 0 && Number.isFinite(discountPct) && discountPct > 0;

  const { subject, html } = installCompleteEmail({
    name: typeof body?.name === "string" ? body.name : null,
    orderRef,
    designName: typeof body?.designName === "string" ? body.designName : null,
    photoUrl,
    ...(hasDiscount ? { discountCode, discountPct } : {}),
  });
  const ok = await sendEmail({ to: email, subject, html });
  if (!ok) return NextResponse.json({ error: "send_failed" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
