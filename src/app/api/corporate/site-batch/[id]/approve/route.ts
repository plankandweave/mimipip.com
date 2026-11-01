import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse } from "next/server";
import { currentCorporateSession, isAccountAdmin } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadBatch } from "@/lib/site-batch";
import { storeForBatch, wallsStillOpen, wallsToApprove } from "@/lib/site-batch-rules";
import { POST as placeBatchOrder } from "@/app/api/corporate/orders/batch/route";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST → THE approval. A partner admin, in their own session, approves the
// whole store; this builds the project lines from the composed masters and
// places them through the SAME batch-order route their team uses by hand —
// same pricing, same GSTIN profile, same OS push, same audit. Deliberately a
// pass-through and not a re-implementation: an approval must not be able to
// order anything their normal ordering could not.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await currentCorporateSession();
  // Either team may release a wall to production (Roheena, 19 Aug 2026):
  // the partner's own admins, or our staff acting for them. Approval is still
  // ATTRIBUTED — approved_by_email records whoever actually ticked it.
  if (!session || (!isAccountAdmin(session) && !session.staff)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace." }, { status: 403 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const loaded = await loadBatch(sb, id);
  if (!loaded || loaded.batch.account_id !== session.account.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!["proposed", "ordered"].includes(loaded.batch.status)) {
    return NextResponse.json({ error: `Batch is ${loaded.batch.status} — nothing to approve.` }, { status: 409 });
  }
  // Per-wall approval (Roheena 2026-08-18): the approver walks the store on
  // screen and releases wall by wall; each approval is real — that wall goes
  // to production immediately. No seqs = every wall of the CLIENT'S drawing
  // still unordered. A wall Zyvorah suggested is an offer, never part of
  // "all remaining": it is released only when its seq is named
  // (site-batch-rules.ts, pinned by its tests).
  const body = await req.json().catch(() => ({})) as { seqs?: number[]; materialSlug?: string };
  const seqs = Array.isArray(body.seqs) ? body.seqs.map(Number).filter(Number.isFinite) : [];
  const composed = wallsToApprove(loaded.walls, seqs).filter((w) => (w.art_json ?? []).length > 0);
  if (!composed.length) return NextResponse.json({ error: "No composed walls in this batch." }, { status: 409 });

  // A website-priced account prices per material, and a measured wall carries no
  // material choice — so orders/batch refused every line with "choose a material
  // to price it". That refusal landed AFTER the whole AI pipeline had run and
  // right at the moment of approval, which is the worst place to discover it.
  // Ask for the material here, up front, and say so plainly.
  const materialSlug = typeof body.materialSlug === "string" && body.materialSlug.trim()
    ? body.materialSlug.trim() : null;
  const { data: acc } = await sb.from("corporate_accounts")
    .select("pricing_mode").eq("id", session.account.id).single();
  if ((acc?.pricing_mode as string) === "website" && !materialSlug) {
    return NextResponse.json({
      error: "Choose the material for this store before approving — your account is priced per material.",
      needs: "materialSlug",
    }, { status: 400 });
  }

  const lines = composed.flatMap((w) => (w.art_json ?? []).map((p, i, arr) => ({
    designUrl: p.url,
    designWpx: p.width, designHpx: p.height,
    widthMm: p.widthMm, heightMm: w.height_mm,
    printName: arr.length > 1 ? `${w.name} · piece ${i + 1}/${arr.length}` : w.name,
    ...(materialSlug ? { materialSlug } : {}),
  })));

  const state = loaded.batch.state || "Maharashtra";
  // GSTIN is a STATE fact and comes from the state profile. The delivery address
  // is a PLACE fact and comes from the store.
  //
  // These used to be the same row, and corporate_state_profiles is
  // UNIQUE (account_id, state) — so the second showroom in a state inherited
  // the first one's street address. Vijay Sales' Maharashtra row says
  // PRABHADEVI, MUMBAI; the live batch is Pune Bhosari. Approving it shipped
  // Bhosari's wallpaper to Prabhadevi.
  //
  // Order of preference for the address: the store record, then whatever the
  // batch itself captured on site, then the state profile as a last resort for
  // batches that predate corporate_stores.
  const { data: profile } = await sb.from("corporate_state_profiles")
    .select("gstin, address_line, city, pincode, contact_name, contact_phone")
    .eq("account_id", session.account.id).eq("state", state).single();
  // A batch keyed in without its store (EBD Gurgaon, 25 October 2026) carries
  // only a typed address with no PIN, and the order route refuses it. The
  // account's own saved store for that showroom is found by name and linked
  // once, so its address and PIN go on the order (storeForBatch says when).
  let storeId = loaded.batch.store_id;
  if (!storeId) {
    const { data: stores } = await sb.from("corporate_stores")
      .select("id, name, state").eq("account_id", session.account.id).eq("active", true);
    const found = storeForBatch(loaded.batch, (stores ?? []) as { id: string; name: string; state: string | null }[]);
    if (found) {
      storeId = found.id;
      await sb.from("corporate_site_batches").update({ store_id: storeId }).eq("id", id);
    }
  }
  const { data: store } = storeId
    ? await sb.from("corporate_stores")
        .select("name, address_line, city, pincode, contact_name, contact_phone")
        .eq("id", storeId).single()
    : { data: null };

  // IN-PROCESS, not over HTTP. This used to `fetch()` its own public URL, which
  // works on next dev and Vercel but not on Cloudflare: a Worker fetching its
  // own zone loops and times out (522), the body is not JSON, and every
  // approval died with the generic "Order placement failed — nothing was
  // approved" (Vijay Sales, 15 Sep 2026). Calling the handler directly keeps
  // the single-road guarantee — same auth, pricing, GST profile and OS push —
  // and the session cookie is read from the request context we are already in.
  const res = await placeBatchOrder(new Request(new URL("/api/corporate/orders/batch", req.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lines, state,
      gstin: profile?.gstin ?? null,
      shipAddress: store?.address_line ?? loaded.batch.ship_address ?? profile?.address_line ?? null,
      shipCity: store?.city ?? loaded.batch.ship_city ?? profile?.city ?? null,
      shipPincode: store?.pincode ?? profile?.pincode ?? null,
      shipContactName: store?.contact_name ?? profile?.contact_name ?? null,
      shipContactPhone: store?.contact_phone ?? profile?.contact_phone ?? null,
      poNumber: loaded.batch.title.slice(0, 60),
    }),
  }));
  const placed = await res.json().catch(() => ({})) as Record<string, unknown> & { error?: string; groupRef?: string };
  if (!res.ok) {
    // Say WHY — a bare "failed" hides the material / GSTIN / permission
    // refusal the order route just gave us, and that refusal is the fix.
    return NextResponse.json({
      error: placed.error
        ? `Order placement failed — nothing was approved. ${placed.error}`
        : `Order placement failed — nothing was approved (HTTP ${res.status}).`,
    }, { status: res.status });
  }

  for (const w of composed) {
    await sb.from("corporate_site_batch_walls").update({ status: "ordered" }).eq("id", w.id);
  }
  // The store is ordered once every wall of the client's drawing is; a
  // suggestion they did not take up does not hold it open.
  const { data: leftRows } = await sb.from("corporate_site_batch_walls")
    .select("id, seq, status, suggested").eq("batch_id", id);
  const left = wallsStillOpen((leftRows ?? []) as { seq: number; status: string; suggested: boolean | null }[]);
  await sb.from("corporate_site_batches").update({
    ...(left.length ? {} : { status: "ordered" }),
    approved_by_email: session.email,
    approved_at: new Date().toISOString(),
    group_ref: loaded.batch.group_ref ?? placed.groupRef ?? null,
  }).eq("id", id);
  return NextResponse.json({ ok: true, ...placed });
}
