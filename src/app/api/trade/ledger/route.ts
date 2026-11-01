import { NextResponse } from "next/server";
import { requireTradePartner } from "@/lib/trade-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { signDoc } from "@/lib/private-doc";

export const runtime = "nodejs";

// Partner earnings/ledger read for the Phase 5 dashboard (/account/trade).
// Every Phase 1-4 trade route reads/writes exclusively through
// supabaseAdmin() (service role) even where an anon-role RLS self-read
// policy would technically allow a browser client through (trade_ledger's
// "self read" policy from 0071) — this keeps every /api/trade/* route on one
// consistent auth path (requireTradePartner() + service role), so this route
// follows suit rather than being the first trade route to use the anon
// client.
export async function GET() {
  const { partner, blocked } = await requireTradePartner();
  if (blocked) return blocked;

  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const { data: rows, error } = await admin
    .from("trade_ledger")
    .select(
      "id, order_id, status, gross_commission, gst_on_commission, tds_amount, net_payout, self_invoice_url, created_at, paid_at",
    )
    .eq("trade_partner_id", partner.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("trade ledger list failed:", error.message);
    return NextResponse.json({ error: "list_failed" }, { status: 500 });
  }

  const ledgerRows = rows ?? [];

  // Order numbers are looked up separately (rather than a PostgREST embed)
  // to keep this route's query shape as plain and predictable as the rest of
  // the trade routes' straight .from().select() calls.
  const orderIds = [...new Set(ledgerRows.map((r) => r.order_id).filter(Boolean))];
  const orderNumberById = new Map<string, number>();
  if (orderIds.length > 0) {
    const { data: orders } = await admin.from("orders").select("id, order_number").in("id", orderIds);
    for (const o of orders ?? []) orderNumberById.set(o.id, o.order_number);
  }

  // Self-invoices sit in the private order-copies bucket. A partner's own
  // commission terms are exactly what must not be readable by URL alone, so
  // each row is signed for this response rather than handed out as a path.
  const ledger = await Promise.all(
    ledgerRows.map(async (r) => ({
      id: r.id,
      orderId: r.order_id,
      orderNumber: orderNumberById.get(r.order_id) ?? null,
      status: r.status,
      grossCommission: r.gross_commission,
      gstOnCommission: r.gst_on_commission,
      tdsAmount: r.tds_amount,
      netPayout: r.net_payout,
      selfInvoiceUrl: await signDoc(r.self_invoice_url),
      createdAt: r.created_at,
      paidAt: r.paid_at,
    })),
  );

  const totalPaidNetPayout = ledger
    .filter((r) => r.status === "paid")
    .reduce((sum, r) => sum + Number(r.netPayout), 0);

  return NextResponse.json({ ledger, totalPaidNetPayout });
}
