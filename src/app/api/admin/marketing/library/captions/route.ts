import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { hasServiceRole, serviceClient } from "@/lib/marketing/db";
import { readCaptions } from "@/lib/marketing/film-captions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A film's captions as stored, for the Library card. Staff only: they sit in
// the private Library bucket until the film is cleared and published.
// GET ?id=<uuid>
export async function GET(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return notStaff();
  if (!hasServiceRole()) return NextResponse.json({ error: "Marketing storage is unavailable" }, { status: 503 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const { data: row, error } = await serviceClient().from("marketing_asset_library").select("id,captions_key").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "That film is not in the library." }, { status: 404 });
  const vtt = await readCaptions((row.captions_key as string | null) ?? null).catch(() => null);
  return NextResponse.json({ id, vtt }, { headers: { "cache-control": "private, no-store" } });
}
