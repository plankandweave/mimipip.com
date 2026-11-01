import { createHash, randomUUID } from "node:crypto";
import {
  privateWorkspaceSession,
  workspaceError,
} from "@/lib/partner-private-auth";
import { validatePoDocument } from "@/lib/partner-document-validation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { caUpload } from "@/lib/corporate-art-store";
export const dynamic = "force-dynamic";
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const s = await privateWorkspaceSession(true);
    const sb = supabaseAdmin();
    if (!sb) return Response.json({ error: "Unavailable" }, { status: 503 });
    const { id } = await ctx.params;
    const { data: c } = await sb
      .from("partner_private_confirmations")
      .select("id,status,po_sha256,po_number")
      .eq("id", id)
      .eq("account_id", s.account.id)
      .maybeSingle();
    if (!c) throw new Error("Confirmation not found");
    const form = await req.formData();
    const file = form.get("file");
    const number = String(form.get("poNumber") ?? "").trim();
    if (!number || number.length > 120) throw new Error("Enter the PO number");
    if (!(file instanceof File)) throw new Error("Attach the PO document");
    if (file.size > 20 * 1024 * 1024)
      return Response.json({ error: "PO limit is 20 MB" }, { status: 413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const valid = await validatePoDocument(bytes, file.type);
    const sha = createHash("sha256").update(bytes).digest("hex");
    if (c.po_sha256) {
      if (c.po_sha256 === sha && c.po_number === number)
        return Response.json({ ok: true, confirmationId: id });
      throw new Error("PO already accepted; receipt is immutable");
    }
    if (c.status !== "confirmed_awaiting_po")
      throw new Error(
        "This confirmation was superseded. Confirm the current selections before attaching a PO.",
      );
    const path = `partner-workspace/${s.account.id}/po/${id}/${sha}-${randomUUID()}.${valid.extension}`;
    const up = await caUpload(path, bytes, {
      contentType: valid.mime,
      upsert: false,
    });
    if (up.error)
      throw new Error("Could not store the PO. Nothing has been released.");
    const { error } = await sb.rpc("partner_accept_po", {
      p_account: s.account.id,
      p_confirmation: id,
      p_number: number,
      p_path: path,
      p_sha: sha,
      p_mime: valid.mime,
      p_actor: s.email,
    });
    if (error) throw new Error(error.message);
    // Durable scheduled worker owns transfer. Upload never falls back to staff.
    return Response.json({
      ok: true,
      confirmationId: id,
      status: "release_pending",
    });
  } catch (e) {
    return workspaceError(e);
  }
}
