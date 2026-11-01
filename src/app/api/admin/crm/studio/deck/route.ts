import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { studioDownload } from "@/lib/proposal-studio";
import { staffKey } from "@/lib/staff-key";

export const runtime = "nodejs";

// Preview of a studio deck for the admin's iframe, before it becomes a
// presentation. Served under the same opaque-origin sandbox as the portal's
// frame route (see /p/[token]/frame): the HTML was written by a model from
// client-supplied inputs, and the rule is the same as for uploads — nothing
// rendered in this product runs same-origin with zyvorah.com.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = await staffKey(req);
  const id = url.searchParams.get("proposal_id") ?? "";
  const which = url.searchParams.get("which") === "reviewed" ? "reviewed" : "composed";

  const { data: ok, error } = await supabase.rpc("admin_key_ok", { p_key: key });
  if (error || ok !== true) return new Response("Not found", { status: 404 });

  const sb = supabaseAdmin();
  if (!sb) return new Response("Unavailable", { status: 503 });
  const { data: p } = await sb
    .from("crm_proposals").select("deck_path, reviewed_deck_path").eq("id", id).maybeSingle();
  const path = which === "reviewed" ? p?.reviewed_deck_path : p?.deck_path;
  if (!path) return new Response("Not found", { status: 404 });

  const html = await studioDownload(path);
  return new Response(new Uint8Array(html), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "sandbox allow-scripts allow-popups",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
