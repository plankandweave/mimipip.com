import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse, after } from "next/server";
import { canAdministerAccount, currentCorporateSession, recordAudit } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadBatch } from "@/lib/site-batch";
import { POST as driveBatch } from "../drive/route";

export const dynamic = "force-dynamic";

// POST → "Release to design". The one human act between a store employee's
// submission and money being spent.
//
// Admin-only and session-only, deliberately. Allocation reads every wall photo
// with Opus and composition renders every band; the person who measured the
// store may be a contractor on a personal email address who was forwarded a
// link. This is where a named person at the partner takes responsibility for
// acting on their measurements.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await currentCorporateSession();
  if (!session || !canAdministerAccount(session)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace." }, { status: 403 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const loaded = await loadBatch(sb, id);
  if (!loaded || loaded.batch.account_id !== session.account.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (loaded.batch.status !== "collecting") {
    return NextResponse.json({
      error: `This survey is already ${loaded.batch.status}.`,
    }, { status: 409 });
  }
  if (!loaded.walls.length) {
    return NextResponse.json({ error: "Nothing has been measured yet." }, { status: 400 });
  }

  // Conditional, so two admins tapping at once release it once and the pipeline
  // runs once.
  const { data: claimed } = await sb.from("corporate_site_batches")
    .update({ released_at: new Date().toISOString(), released_by_email: session.email })
    .eq("id", id).is("released_at", null)
    .select("id").maybeSingle();
  if (!claimed) {
    return NextResponse.json({ ok: true, alreadyReleased: true });
  }

  void recordAudit(session, "site_batch.release", { type: "site_batch", id }, {
    walls: loaded.walls.length,
    measuredBy: loaded.batch.created_by,
    source: loaded.batch.source,
  });

  // Hand off to the worker. It does one step and re-arms; if that chain drops on
  // a cold start the cron picks the batch up within a couple of minutes.
  //
  // IN-PROCESS, not over HTTP. The site is a Cloudflare Worker, and a Worker
  // fetching its own zone is fragile (see the approve route, fixed the same way
  // in PR #356). The drive route is built to be invoked in-process — it presents
  // the shared bridge token so its own auth (internalTokenOk) still gates it,
  // and its response is best-effort here because the cron re-arms a dropped
  // chain regardless.
  const bridgeToken = process.env.ZYVORAH_WEBHOOK_TOKEN;
  if (bridgeToken) {
    after(() => {
      const dreq = new Request(new URL(`/api/corporate/site-batch/${id}/drive`, req.url), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-zyvorah-token": bridgeToken },
      });
      void driveBatch(dreq, { params: Promise.resolve({ id }) })
        .catch((e) => console.error("[release] drive kick failed:", id, e));
    });
  } else {
    console.error("[release] ZYVORAH_WEBHOOK_TOKEN unset — the cron will have to pick this up");
  }

  return NextResponse.json({
    ok: true,
    message: "Released. The proposal will arrive by email when it is ready.",
  });
}
