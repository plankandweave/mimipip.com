import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const revalidate = 300; // 5 min — catalogue changes rarely

// The live design catalogue for the OS Print Desk: every ACTIVE design with a
// clean flat (no-furniture) print image. Returns both a { handle: flatUrl }
// map (back-compat) and a full `catalog` array so the desk lists the real
// store catalogue (hundreds of designs) instead of a frozen hand-curated file.
type Row = { handle: string; code: string | null; title: string; is_seamless: boolean | null; repeat_width_cm: number | string | null; product_images: Array<{ url: string; is_flat: boolean }> };

export async function GET() {
  // Paged: PostgREST returns at most 1,000 rows per request, and a single
  // unpaged select silently stopped there — every active design past the
  // 1,000th title (e.g. KD-005, AA-0052, LA-00069) was missing from the feed,
  // so the OS could not map Amazon/Pepperfry listings of those designs. `handle`
  // breaks title ties so no row is skipped or repeated across page edges.
  const PAGE = 1000;
  const data: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data: batch, error } = await supabase
      .from("products")
      .select("handle, code, title, status, is_seamless, repeat_width_cm, product_images ( url, is_flat )")
      .eq("status", "active").eq("is_service", false)
      .order("title").order("handle")
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json({ ok: false, flats: {}, catalog: [] }, { status: 200 });
    }
    data.push(...((batch ?? []) as Row[]));
    if ((batch ?? []).length < PAGE) break;
  }
  const flats: Record<string, string> = {};
  // `isSeamless` / `repeatWidthCm` are ADDITIVE — every existing field keeps its
  // name and meaning, so an OS build that predates them simply ignores them.
  // They travel together because a tile without its repeat can't be drawn at the
  // right size; the DB check constraint guarantees the pair is never half-set.
  const catalog: Array<{
    sku: string; name: string; handle: string; flatUrl: string; url: string;
    isSeamless: boolean; repeatWidthCm: number | null;
  }> = [];
  for (const p of data) {
    const flat = p.product_images?.find((i) => i.is_flat);
    if (!flat?.url) continue; // only designs we can actually place & print
    flats[p.handle] = flat.url;
    // numeric comes back as a string over PostgREST — coerce here so every
    // consumer gets a number and nobody has to remember to parseFloat.
    const repeat = p.repeat_width_cm == null ? null : Number(p.repeat_width_cm);
    const seamless = p.is_seamless === true && repeat != null && Number.isFinite(repeat);
    catalog.push({
      sku: p.code || p.handle,
      name: p.title,
      handle: p.handle,
      flatUrl: flat.url,
      url: `https://www.zyvorah.com/products/${p.handle}`,
      isSeamless: seamless,
      repeatWidthCm: seamless ? repeat : null,
    });
  }
  return NextResponse.json(
    { ok: true, flats, catalog },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" } },
  );
}
