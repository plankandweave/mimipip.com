import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse } from "next/server";
import { currentCorporateSession } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchOsStatuses } from "@/lib/corporate-os";
import { AT_PRINTER_MESSAGE, orderNosAtPrinter, partnerMayRequestCancel } from "@/lib/cancel-window";

export const dynamic = "force-dynamic";

// A corporate customer can REQUEST a cancellation, never perform one, and only
// while production can prove nothing of the wall is at the printer
// (lib/cancel-window.ts). The page hides the link otherwise; this is the same
// check, so an old tab or a hand-made request gets the same answer.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  // Agreement gate (0095): no mutations on an account that has not signed.
  if (session.agreementPending) {
    return NextResponse.json({ error: "agreement_required" }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { id } = await ctx.params;
  const { data: row } = await sb.from("corporate_orders")
    .select("id, status, cancel_requested_at, cancel_outcome, os_order_id, os_print_order_no")
    .eq("id", id).eq("account_id", session.account.id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const os = typeof row.os_order_id === "number" ? (await fetchOsStatuses([row.os_order_id]))[row.os_order_id] : undefined;
  let atPrinter: Set<string>;
  try {
    atPrinter = await orderNosAtPrinter(sb, [row.os_print_order_no, os?.printOrderNo]);
  } catch (e) {
    console.error("cancel request: printer check failed:", e);
    return NextResponse.json({ error: "We could not check production just now — try again in a minute." }, { status: 503 });
  }
  if (!row.cancel_requested_at && !row.cancel_outcome && !partnerMayRequestCancel(row, os, atPrinter)) {
    return NextResponse.json({ error: AT_PRINTER_MESSAGE }, { status: 409 });
  }
  // Once the desk has answered (0128) the question is closed — either the order
  // is cancelled, or it was already on the printer and is coming. Re-raising it
  // would only put the order back in the escalation mail with the same answer
  // waiting to be given again.
  const { data, error } = await sb.from("corporate_orders")
    .update({ cancel_requested_at: new Date().toISOString() })
    .eq("id", id)
    .eq("account_id", session.account.id)    // never touch another tenant's row
    .is("cancel_resolved_at", null)
    .select("id");
  if (error) return NextResponse.json({ error: "Could not flag it." }, { status: 500 });
  if (!data?.length) {
    return NextResponse.json(
      { error: "We've already answered a cancellation request on this order — talk to us at hello@zyvorah.com." },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
