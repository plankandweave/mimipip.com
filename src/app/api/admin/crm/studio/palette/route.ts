import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { paletteSheetHtml, type PaletteSwatch } from "@/lib/proposal-studio";
import { staffKey } from "@/lib/staff-key";

export const runtime = "nodejs";

// The colour palettes as a sendable file.
//
// The proposal deck deliberately shows a swatch and its name and nothing else —
// hexes and percentages are how the artwork is made, and a client deck is read
// by more people than the client. But the record has to exist, because the
// reasonable request does come: "we're using these colours in other media,
// could you send the palette?" This is the answer to that request, downloaded
// by Roheena and sent by her, rather than a link anyone could stumble on.
//
// Admin-key-gated like every other studio route. Nothing here is public.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = await staffKey(req);
  const id = url.searchParams.get("proposal_id") ?? "";

  const { data: ok, error } = await supabase.rpc("admin_key_ok", { p_key: key });
  if (error || ok !== true) return new Response("Not found", { status: 404 });

  const sb = supabaseAdmin();
  if (!sb) return new Response("Unavailable", { status: 503 });

  const { data: p } = await sb
    .from("crm_proposals").select("id, title, company_id").eq("id", id).maybeSingle();
  if (!p) return new Response("Not found", { status: 404 });

  const [{ data: company }, { data: options }] = await Promise.all([
    sb.from("crm_companies").select("name").eq("id", p.company_id).maybeSingle(),
    sb.from("crm_proposal_options").select("position, title, palette")
      .eq("proposal_id", p.id).order("position"),
  ]);

  const html = paletteSheetHtml({
    proposalTitle: p.title,
    clientName: company?.name ?? "the client",
    options: (options ?? []).map((o) => ({
      position: o.position as number,
      title: (o.title as string) ?? "",
      palette: ((o.palette ?? []) as PaletteSwatch[]),
    })),
  });

  // A filename she can send on without renaming it.
  const slug = (p.title as string)
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "proposal";

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-colour-palettes.html"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
