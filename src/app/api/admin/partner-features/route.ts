import { supabaseAdmin } from "@/lib/supabase-admin";
import { staffKey } from "@/lib/staff-key";
import {
  partnerCapabilities,
  validateCapabilities,
} from "@/lib/partner-capabilities";
export const dynamic = "force-dynamic";
async function admin(req: Request) {
  const sb = supabaseAdmin();
  if (!sb) throw new Error("503:Unavailable");
  const key = await staffKey(req);
  const { data: ok } = key
    ? await sb.rpc("admin_key_ok", { p_key: key })
    : { data: false };
  if (!ok) throw new Error("401:unauthorized");
  return sb;
}
function failure(e: unknown) {
  const msg = e instanceof Error ? e.message : "Invalid features";
  return Response.json(
    { error: msg.replace(/^\d{3}:/, "") },
    { status: /^\d{3}:/.test(msg) ? Number(msg.slice(0, 3)) : 400 },
  );
}
export async function GET(req: Request) {
  try {
    const sb = await admin(req);
    const { data, error } = await sb
      .from("corporate_accounts")
      .select("id,name,slug,capabilities")
      .eq("active", true)
      .order("name");
    if (error) throw new Error(error.message);
    return Response.json({
      accounts: (data ?? []).map((a) => ({
        ...a,
        capabilities: partnerCapabilities(a),
      })),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(req: Request) {
  try {
    const sb = await admin(req);
    const body = await req.json();
    if (typeof body.accountId !== "string") throw new Error("Account required");
    const caps = validateCapabilities(body.capabilities);
    const { data: a } = await sb
      .from("corporate_accounts")
      .select("id,slug,capabilities")
      .eq("id", body.accountId)
      .single();
    if (!a) throw new Error("Account not found");
    if (
      a.slug === "homelane" &&
      (!caps.catalogue ||
        !caps.customSizing ||
        !caps.poRequiredRelease ||
        caps.artworkUpload ||
        caps.customLibrary ||
        !caps.purchaseApproval ||
        caps.dispatchPromiseDays !== 7)
    )
      throw new Error(
        "HomeLane requires catalogue-only artwork, purchasing, PO release and seven calendar days",
      );
    // Keep every accepted/current private workspace gated even if an onboarding box is cleared later.
    const { count, error: countError } = await sb
      .from("partner_private_confirmations")
      .select("id", { head: true, count: "exact" })
      .eq("account_id", a.id);
    if (countError) throw new Error("Could not verify account workflow");
    if ((count ?? 0) > 0 && !caps.poRequiredRelease)
      throw new Error(
        "PO release cannot be disabled after private confirmations exist",
      );
    const { error } = await sb
      .from("corporate_accounts")
      .update({ capabilities: caps })
      .eq("id", a.id);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true, capabilities: caps });
  } catch (e) {
    return failure(e);
  }
}
