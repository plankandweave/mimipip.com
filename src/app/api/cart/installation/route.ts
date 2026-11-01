import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

const COOKIE = "zyv_cart";

/**
 * Remove the professional-installation add-on from every line in the cart.
 * Used when the delivery address turns out to be outside the cities we install
 * in (see src/lib/install-cities.ts) so the customer can continue with just the
 * wallpaper instead of rebuilding their cart.
 */
export async function DELETE() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "no_cart" }, { status: 400 });

  const { data, error } = await supabase.rpc("cart_strip_installation", {
    p_session_token: token,
  });
  if (error) {
    console.error("cart_strip_installation failed:", error.message);
    return NextResponse.json({ error: "strip_failed" }, { status: 400 });
  }
  return NextResponse.json(data);
}
