import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { currentStaff } from "@/lib/staff-access";
import { addIstDays, istDateKey, istMidnight } from "@/lib/ist";
import {
  aggregateMeasurement,
  paidOrderBreakdown,
  dedupeRefunds,
  type PaidRecord,
  type RefundRecord,
  validDateKey,
} from "@/lib/measurement-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DbRow = Record<string, unknown>;

const money = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

function retail(row: DbRow): PaidRecord {
  const total = money(row.total);
  const tax = money(row.tax);
  const shipping = money(row.shipping);
  return {
    family: "retail",
    email: typeof row.email === "string" ? row.email : null,
    placedVia: typeof row.placed_via === "string" ? row.placed_via : null,
    id: String(row.id),
    currency: typeof row.currency === "string" ? row.currency.toUpperCase() : null,
    total,
    tax,
    shipping,
    // This is the order's collected goods component after discounts. It avoids
    // restating pre-discount subtotal as revenue.
    product: total !== null && tax !== null && shipping !== null ? money(total - tax - shipping) : null,
  };
}

function corporate(row: DbRow): PaidRecord {
  const total = money(row.total);
  const product = money(row.amount);
  const tax = money(row.gst_amount);
  const reconciles = total !== null && product !== null && tax !== null
    && Math.abs(total - product - tax) < 0.011;
  return {
    family: "corporate",
    id: String(row.id),
    // Corporate checkout is an INR Razorpay contract; no conversion occurs here.
    currency: "INR",
    total,
    tax,
    shipping: 0, // Corporate frozen totals have no shipping component in this contract.
    product: reconciles ? product : null,
  };
}

function sourceBreakdown(events: DbRow[]) {
  const buckets = new Map<string, { source: string; medium: string; campaign: string | null; payments: number; event_value_inr: number }>();
  for (const event of events) {
    const meta = (event.meta && typeof event.meta === "object" ? event.meta : {}) as Record<string, unknown>;
    const first = (meta.first_touch && typeof meta.first_touch === "object" ? meta.first_touch : {}) as Record<string, unknown>;
    const source = typeof first.source === "string" && first.source ? first.source : "unknown";
    const medium = typeof first.medium === "string" && first.medium ? first.medium : "unknown";
    const campaign = typeof first.campaign === "string" && first.campaign ? first.campaign : null;
    const key = `${source}\u0000${medium}\u0000${campaign ?? ""}`;
    const bucket = buckets.get(key) ?? { source, medium, campaign, payments: 0, event_value_inr: 0 };
    bucket.payments += 1;
    const eventValue = money(event.value_inr);
    if (eventValue !== null) bucket.event_value_inr = Math.round((bucket.event_value_inr + eventValue) * 100) / 100;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => b.event_value_inr - a.event_value_inr || b.payments - a.payments);
}

export async function GET(req: Request) {
  const noStore = { "Cache-Control": "private, no-store" };
  // Two callers, two proofs: a machine still presents x-intel-key, while the
  // /admin/orders desk presents the staff Google sign-in — there is no key in
  // the browser any more for it to send.
  const key = req.headers.get("x-intel-key") || "";
  const allowed = key
    ? (await supabase.rpc("intel_key_ok", { p_key: key })).data === true
    : !!(await currentStaff(req));
  if (!allowed) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });

  const url = new URL(req.url);
  const date = url.searchParams.get("date") || addIstDays(istDateKey(), -1);
  if (!validDateKey(date)) {
    return NextResponse.json({ error: "date must be a valid YYYY-MM-DD IST calendar date" }, { status: 400, headers: noStore });
  }
  const from = istMidnight(date).toISOString();
  const to = istMidnight(addIstDays(date, 1)).toISOString();
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "reporting_not_configured" }, { status: 503, headers: noStore });

  const [retailPaid, corporatePaid, retailUnknown, corporateUnknown, refundsCanonical, refundsHistorical, paymentEvents, coverageRows] =
    await Promise.all([
      admin.from("orders")
        .select("id,currency,total,tax,shipping,email,placed_via", { count: "exact" })
        .in("payment_status", ["paid", "refunded"]).gte("paid_at", from).lt("paid_at", to).limit(10000),
      admin.from("corporate_orders")
        .select("id,total,amount,gst_amount", { count: "exact" })
        .in("payment_status", ["paid", "refunded"]).gte("paid_at", from).lt("paid_at", to).limit(10000),
      admin.from("orders")
        .select("id,currency,total,tax,shipping,email,placed_via", { count: "exact" })
        .in("payment_status", ["paid", "refunded"]).is("paid_at", null)
        .gte("created_at", from).lt("created_at", to).limit(10000),
      admin.from("corporate_orders")
        .select("id,total,amount,gst_amount", { count: "exact" })
        .in("payment_status", ["paid", "refunded"]).is("paid_at", null)
        .gte("created_at", from).lt("created_at", to).limit(10000),
      admin.from("payment_refunds")
        .select("refund_id,payment_id,amount,currency,provider_status,processed_at", { count: "exact" })
        .eq("provider_status", "processed").not("processed_at", "is", null)
        .gte("processed_at", from).lt("processed_at", to).limit(10000),
      admin.from("site_events")
        .select("subject,value_inr,meta,created_at", { count: "exact" })
        .eq("event", "refund").gte("created_at", from).lt("created_at", to).limit(10000),
      admin.from("site_events")
        .select("subject,value_inr,meta", { count: "exact" })
        .eq("event", "payment_captured").gte("created_at", from).lt("created_at", to).limit(10000),
      admin.from("admin_config").select("k,v")
        .in("k", ["measurement_paid_at_coverage_start", "measurement_refund_coverage_start"]),
    ]);

  const queries = [retailPaid, corporatePaid, retailUnknown, corporateUnknown, refundsCanonical, refundsHistorical, paymentEvents, coverageRows];
  const failed = queries.find((q) => q.error);
  if (failed?.error) {
    console.error("[measurement-report] read failed:", failed.error.message);
    return NextResponse.json({ error: "report_read_failed" }, { status: 500, headers: noStore });
  }
  const truncated = queries.some((q) => (q.count ?? 0) > (q.data?.length ?? 0));

  const canonicalById = new Map<string, PaidRecord>();
  for (const row of (retailPaid.data ?? []) as DbRow[]) canonicalById.set(`retail:${row.id}`, retail(row));
  for (const row of (corporatePaid.data ?? []) as DbRow[]) canonicalById.set(`corporate:${row.id}`, corporate(row));
  const unknownById = new Map<string, PaidRecord>();
  for (const row of (retailUnknown.data ?? []) as DbRow[]) unknownById.set(`retail:${row.id}`, retail(row));
  for (const row of (corporateUnknown.data ?? []) as DbRow[]) unknownById.set(`corporate:${row.id}`, corporate(row));

  const canonicalRefunds: RefundRecord[] = ((refundsCanonical.data ?? []) as DbRow[]).map((r) => ({
    refundId: String(r.refund_id),
    paymentId: typeof r.payment_id === "string" ? r.payment_id : null,
    currency: typeof r.currency === "string" ? r.currency.toUpperCase() : null,
    amount: r.amount,
    coverage: "provider_processed",
  }));
  const historicalRefundRows = (refundsHistorical.data ?? []) as DbRow[];
  const historicalRefunds: RefundRecord[] = historicalRefundRows.filter((r) => {
    const meta = (r.meta && typeof r.meta === "object" ? r.meta : {}) as Record<string, unknown>;
    return meta.razorpay_event === "refund.processed";
  }).map((r) => {
    const meta = (r.meta && typeof r.meta === "object" ? r.meta : {}) as Record<string, unknown>;
    return {
      refundId: String(r.subject),
      paymentId: typeof meta.payment_id === "string" ? meta.payment_id : null,
      currency: "INR", // value_inr is explicitly stored in rupees; this is not a conversion.
      amount: r.value_inr,
      coverage: "historical_event",
    };
  });
  const unconfirmedHistoricalRefunds = historicalRefundRows.length - historicalRefunds.length;

  const refunds = dedupeRefunds(canonicalRefunds, historicalRefunds);
  const report = aggregateMeasurement({
    canonicalPaid: [...canonicalById.values()],
    unknownPaidAt: [...unknownById.values()],
    refunds,
  });

  const refundPaymentIds = [...new Set(refunds.map((r) => r.paymentId).filter((v): v is string => !!v))];
  let retailRefundLinks: DbRow[] = [];
  let corporateRefundLinks: DbRow[] = [];
  if (refundPaymentIds.length) {
    const [retailLinks, corporateLinks] = await Promise.all([
      admin.from("orders").select("id,razorpay_payment_id").in("razorpay_payment_id", refundPaymentIds).limit(10000),
      admin.from("corporate_orders").select("id,razorpay_payment_id").in("razorpay_payment_id", refundPaymentIds).limit(10000),
    ]);
    if (retailLinks.error || corporateLinks.error) {
      console.error("[measurement-report] refund linkage failed:", retailLinks.error?.message || corporateLinks.error?.message);
      return NextResponse.json({ error: "report_read_failed" }, { status: 500, headers: noStore });
    }
    retailRefundLinks = (retailLinks.data ?? []) as DbRow[];
    corporateRefundLinks = (corporateLinks.data ?? []) as DbRow[];
  }
  const retailPaymentIds = new Set(retailRefundLinks.map((r) => String(r.razorpay_payment_id)));
  const corporatePaymentIds = new Set(corporateRefundLinks.map((r) => String(r.razorpay_payment_id)));
  const coverage = new Map(((coverageRows.data ?? []) as { k: string; v: string }[]).map((r) => [r.k, r.v]));
  const paidCoverageStart = Date.parse(coverage.get("measurement_paid_at_coverage_start") ?? "");
  const refundCoverageStart = Date.parse(coverage.get("measurement_refund_coverage_start") ?? "");
  const beginsAfterCoverage = Number.isFinite(paidCoverageStart) && Number.isFinite(refundCoverageStart)
    && Date.parse(from) >= paidCoverageStart && Date.parse(from) >= refundCoverageStart;
  const unknownCurrency = Object.prototype.hasOwnProperty.call(report.currencies, "UNKNOWN");
  const currencyCount = Object.keys(report.currencies).length;
  const hasUnallocatedRefund = report.counts.refunds > 0;
  const unlinkedRefunds = refunds.filter((r) => !r.paymentId || (!retailPaymentIds.has(r.paymentId) && !corporatePaymentIds.has(r.paymentId))).length;
  const accountingCoverageComplete = !truncated && beginsAfterCoverage
    && report.counts.unknown_paid_at === 0
    && report.counts.invalid_paid_money_excluded === 0
    && report.counts.invalid_refund_money_excluded === 0;

  return NextResponse.json({
    ok: true,
    date_basis: { timezone: "Asia/Kolkata", date, from, to, paid: "orders.paid_at", refunds: "verified refund.processed webhook time; historical processed-event time" },
    ...report,
    paid_order_types: paidOrderBreakdown([...canonicalById.values()]),
    attribution: {
      basis: "derived payment_captured events with stored first_touch; not canonical accounting revenue",
      by_first_touch: sourceBreakdown((paymentEvents.data ?? []) as DbRow[]),
      event_count: paymentEvents.data?.length ?? 0,
    },
    coverage: {
      complete: !truncated,
      accounting_coverage_complete: accountingCoverageComplete,
      totals_eligible_for_automated_decisions: accountingCoverageComplete
        && !unknownCurrency && currencyCount <= 1 && !hasUnallocatedRefund && unlinkedRefunds === 0,
      canonical_capture_started_at: {
        paid_at: Number.isFinite(paidCoverageStart) ? new Date(paidCoverageStart).toISOString() : null,
        refunds: Number.isFinite(refundCoverageStart) ? new Date(refundCoverageStart).toISOString() : null,
      },
      canonical_paid_in_dated_totals: canonicalById.size,
      excluded_paid_with_unknown_time_created_that_day: unknownById.size,
      unconfirmed_historical_refund_events_excluded: unconfirmedHistoricalRefunds,
      note: "Unknown paid timestamps are counted and valued separately, never assigned to order creation time or included in dated paid totals.",
      truncation_note: truncated ? "At least one source exceeded the 10,000-row safety cap; totals are partial and ineligible for automated decisions." : null,
      refund_linkage: {
        retail: refunds.filter((r) => r.paymentId && retailPaymentIds.has(r.paymentId)).length,
        corporate: refunds.filter((r) => r.paymentId && corporatePaymentIds.has(r.paymentId)).length,
        unlinked_or_unknown: unlinkedRefunds,
      },
    },
  }, { headers: noStore });
}
