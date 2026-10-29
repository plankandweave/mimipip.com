import { NextResponse } from "next/server";
import { textOverlaySchema } from "@/lib/text-overlay";
import { renderTextOverlay } from "@/lib/text-overlay-server";

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 4000) return NextResponse.json({ error: "Text is too long." }, { status: 400 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid text." }, { status: 400 }); }
  const parsed = textOverlaySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const r = await renderTextOverlay(parsed.data);
    return new Response(await r.arrayBuffer(), { headers: { "content-type": "image/png", "cache-control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Preview unavailable." }, { status: 503 });
  }
}

