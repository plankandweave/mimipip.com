import { internalTokenOk } from "@/lib/site-batch";
import {
  privateWorkspaceSession,
  workspaceError,
} from "@/lib/partner-private-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { caDownload } from "@/lib/corporate-art-store";
export const dynamic = "force-dynamic";
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const service = internalTokenOk(req);
    const session = service ? null : await privateWorkspaceSession();
    const sb = supabaseAdmin();
    if (!sb) return new Response("Unavailable", { status: 503 });
    const { id } = await ctx.params;
    let q = sb
      .from("partner_private_confirmations")
      .select("po_path,po_mime,po_accepted_at")
      .eq("id", id)
      .not("po_accepted_at", "is", null);
    if (session) q = q.eq("account_id", session.account.id);
    const { data: c } = await q.maybeSingle();
    if (!c?.po_path) return new Response("PO not found", { status: 404 });
    const { data, error } = await caDownload(c.po_path);
    if (error || !data)
      return new Response("Could not open PO", { status: 502 });
    return new Response(data, {
      headers: {
        "Content-Type": c.po_mime,
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline; filename=purchase-order",
      },
    });
  } catch (e) {
    return workspaceError(e);
  }
}
