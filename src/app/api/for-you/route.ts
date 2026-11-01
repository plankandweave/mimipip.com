import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { getProductsByHandles, getFacetVocab } from "@/lib/queries";
import { arrangeByAffinity } from "@/lib/aesthetics";
import { TASTE_COOKIE, mixWithExploration } from "@/lib/taste";

export const runtime = "nodejs";

// Personalised picks for the current visitor. Empty until the profile has
// enough signal (≥3 events) — the storefront then quietly surfaces a
// "Picked for you" row; no buttons, no setup.
const MIN_EVENTS = 3;

export async function GET(req: Request) {
  const store = await cookies();
  const token = store.get(TASTE_COOKIE)?.value;
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ items: [] });

  const { data: profile } = await supabase.rpc("taste_get", { p_token: token });
  const events = (profile as { events?: number } | null)?.events ?? 0;
  if (events < MIN_EVENTS) return NextResponse.json({ items: [] });

  const url = new URL(req.url);
  const count = Math.min(12, Math.max(4, parseInt(url.searchParams.get("count") ?? "8", 10) || 8));
  const exclude = new Set((url.searchParams.get("exclude") ?? "").split(",").filter(Boolean));

  const { data, error } = await supabase.rpc("taste_recs", { p_token: token, p_limit: 60 });
  if (error) {
    console.error("taste_recs failed:", error.message);
    return NextResponse.json({ items: [] });
  }

  const ranked = ((data as { handle: string }[]) ?? [])
    .map((r) => r.handle)
    .filter((h) => !exclude.has(h));

  const picks = mixWithExploration(ranked, count);
  const [items, vocab] = await Promise.all([getProductsByHandles(picks), getFacetVocab()]);
  // keep the mixed order
  const order = new Map(picks.map((h, i) => [h, i]));
  items.sort((a, b) => (order.get(a.handle) ?? 0) - (order.get(b.handle) ?? 0));

  // Taste ranking decides WHICH designs; the row still has to read as one
  // picture per line, so exploration picks don't land a folk mural beside a
  // Bauhaus pastel.
  return NextResponse.json({ items: arrangeByAffinity(items, vocab) });
}
