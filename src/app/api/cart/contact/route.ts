import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { toIndianMobile } from "@/lib/phone";
import { autoSubscribe } from "@/lib/subscribe";

export const runtime = "nodejs";

const COOKIE = "zyv_cart";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Attaches contact details to the visitor's open cart (the "Mandate contact
// capture before cart save" intelligence decision): an abandoned cart is no
// longer anonymous, so recovery outreach is actually possible.
export async function POST(req: Request) {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "no_cart" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const name = String(body?.name ?? "").trim().slice(0, 120);

  const validEmail = EMAIL_RE.test(email) ? email : null;
  const validPhone = toIndianMobile(body?.phone) || null;
  if (!validEmail && !validPhone) {
    return NextResponse.json({ error: "need_email_or_phone" }, { status: 400 });
  }

  const { error } = await supabase.rpc("cart_set_contact", {
    p_session_token: token,
    p_email: validEmail,
    p_phone: validPhone,
    p_name: name || null,
  });
  if (error) {
    console.error("cart_set_contact failed:", error.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  // The Save button carries the subscribe line (SubscribeDisclosure).
  if (validEmail) await autoSubscribe(validEmail, "cart");
  return NextResponse.json({ ok: true });
}
