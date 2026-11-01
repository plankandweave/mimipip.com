import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

// Validate a gift-card code at checkout — returns whether it's usable and the
// remaining balance, so the customer sees how much will apply before paying.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? "").trim();
  if (!code) return NextResponse.json({ valid: false }, { status: 400 });

  const { data, error } = await supabase.rpc("gift_card_status", { p_code: code });
  if (error) {
    console.error("gift_card_status failed:", error.message);
    return NextResponse.json({ valid: false }, { status: 500 });
  }
  return NextResponse.json(data as { valid: boolean; balance?: number; status?: string });
}
