import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { publicWall } from "@/lib/sonar";
import { looksLikeCode } from "@/lib/sonar-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What a scanned wall says, for the player. No login: the code in the QR is
// the only key, and the answer is a story and its recordings, nothing else.
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  if (!looksLikeCode(code)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const wall = await publicWall(sb, code);
  if (!wall) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ title: wall.title, place: wall.place, campus: wall.campus, kind: wall.kind, languages: wall.languages }, {
    headers: { "Cache-Control": "public, max-age=60", "X-Robots-Tag": "noindex" },
  });
}
