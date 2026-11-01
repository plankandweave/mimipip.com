import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { qrSvg } from "@/lib/sonar";
import { looksLikeCode } from "@/lib/sonar-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The wall's QR, as an SVG that prints at any size. Only a wall that exists
// gets one, so a guessed code is not turned into a printable link.
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  if (!looksLikeCode(code)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const { data } = await sb.from("sonar_walls").select("id").eq("code", code).maybeSingle();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  const svg = await qrSvg(code);
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400", "x-robots-tag": "noindex" } });
}
