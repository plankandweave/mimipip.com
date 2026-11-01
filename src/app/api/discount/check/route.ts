import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { checkDiscount } from "@/lib/discounts";
import { currentBuyerIsTradeAccount } from "@/lib/trade-auth";

export const runtime = "nodejs";

// Cart/checkout ask here whether a discount code is good before payment.
// lib/discounts.ts asks both authorities: this store for a creator
// collaboration code (personal to an email, optionally to named designs, up
// to 100%), and the OS for everything else. This route is advisory UI;
// /api/checkout re-runs exactly the same check with the email and the cart
// it is about to order, so a forged answer here buys nothing.
//
// The email is optional: the cart page asks before one is typed, and a
// personal code then previews as valid with whose it is ("personal to
// p•••a@…"); checkout refuses it for anyone else.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code) return NextResponse.json({ valid: false, reason: "unknown_code" });
  const email = typeof body?.email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email.trim()) ? body.email.trim() : null;

  // The designs in this visitor's cart, so a code limited to named designs
  // can say so now rather than at "Place order".
  let cartHandles: string[] | null = null;
  const cartToken = (await cookies()).get("zyv_cart")?.value;
  if (cartToken) {
    const { data } = await supabase.rpc("cart_get", { p_session_token: cartToken });
    const items = (data as { items?: { handle?: string | null }[] } | null)?.items ?? [];
    cartHandles = items.map((it) => it.handle).filter((h): h is string => typeof h === "string" && h.length > 0);
  }

  const decision = await checkDiscount(code, {
    email,
    cartHandles,
    isTradeAccount: await currentBuyerIsTradeAccount(),
  });
  // collaborationId is internal; everything else the page may show.
  if (decision.valid) {
    const { collaborationId: _internal, ...shown } = decision;
    void _internal;
    return NextResponse.json(shown);
  }
  return NextResponse.json(decision);
}
