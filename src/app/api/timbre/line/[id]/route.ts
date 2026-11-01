import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { lineBytes } from "@/lib/timbre";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A spoken line, playable by anyone who holds its id — the wall a QR points
// at, the demo card. The id is a uuid nobody can guess, the line was spoken
// once and never changes, so the bytes may be cached for a day.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const line = await lineBytes(sb, id);
  if (!line) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new Response(line.bytes, {
    headers: {
      "content-type": "audio/mpeg",
      "content-length": String(line.bytes.byteLength),
      "cache-control": "public, max-age=86400",
      "content-language": line.language,
      "x-robots-tag": "noindex",
    },
  });
}
