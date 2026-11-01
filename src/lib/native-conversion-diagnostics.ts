import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { briefOrders } from "./brief-orders";
import { diagnosticWindow, cartSignalCounts } from "./conversion-diagnostics";
import { addIstDays, istMidnight } from "./ist";
import { PURCHASE_STAGES } from "./purchase-progress";

/** Aggregates only: never return customer emails, cart tokens, or failure text. */
export async function fetchNativeConversionDiagnostics(days = 28) {
  const window = diagnosticWindow(days);
  const db = supabaseAdmin();
  if (!db) return { window, available: false as const, reason: "Native reporting is not configured" };
  const from = istMidnight(window.from).toISOString();
  const to = istMidnight(addIstDays(window.to, 1)).toISOString();
  try {
    const [quality, orders, lines, briefs, progress] = await Promise.all([
      db.rpc("storefront_quality_metrics"),
      db.from("orders").select("email,placed_via,payment_status", { count: "exact" })
        .eq("payment_status", "paid").gte("paid_at", from).lt("paid_at", to).limit(1000),
      db.from("cart_items").select("id", { count: "exact", head: true }).gte("created_at", from).lt("created_at", to),
      db.from("concept_briefs").select("id", { count: "exact", head: true }).gte("created_at", from).lt("created_at", to),
      db.from("site_events").select("meta", { count: "exact" }).eq("event", "purchase_progress")
        .eq("is_bot", false).gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).limit(1000),
    ]);
    const metrics = !quality.error && quality.data && typeof quality.data === "object" ? quality.data as Record<string, unknown> : null;
    const events = metrics?.events && typeof metrics.events === "object" ? metrics.events as Record<string, unknown> : null;
    const ordersComplete = !orders.error && orders.count !== null && orders.count === orders.data?.length;
    const paid = ordersComplete ? briefOrders(orders.data ?? []) : null;
    return {
      window, available: !!metrics || ordersComplete || !lines.error || !briefs.error,
      // This existing RPC has a fixed rolling window. Never label it as the
      // requested IST window or compute cross-window conversion percentages.
      rolling30Days: metrics ? {
        window: "Trailing 30 days to report time (not the requested IST window)",
        cartSignals: events ? cartSignalCounts(events) : null,
        commercialEvents: events ? Object.fromEntries(
          ["checkout_start", "order_placed", "payment_captured", "lead_captured"].map(key => [key, Number(events[key] ?? 0)]),
        ) : null,
        configurationVisitors: metrics.configurationVisitors ?? null,
        visitorsWithConfigurationAndCart: metrics.configurationCartVisitors ?? null,
        failuresByStage: metrics.checkoutFailures ?? null,
      } : null,
      paidOrders: paid ? { retail: paid.retail.length, samples: paid.samples.length, internal: paid.owner.length, unidentified: paid.unidentified.length } : null,
      purchaseProgress: !progress.error && progress.count !== null && progress.count === progress.data?.length
        ? Object.fromEntries(PURCHASE_STAGES.map(stage => [stage, progress.data.filter(row => row.meta?.stage === stage).length])) : null,
      remainingCartLinesCreatedInWindow: lines.error ? null : lines.count,
      conceptBriefsCreatedInWindow: briefs.error ? null : briefs.count,
      errors: [
        ...(metrics ? [] : ["Native event aggregate unavailable"]),
        ...(ordersComplete ? [] : ["Paid-order read failed or exceeded its 1,000-row limit"]),
        ...(lines.error ? ["Cart-line count unavailable"] : []),
        ...(briefs.error ? ["Concept-brief count unavailable"] : []),
        ...(progress.error || progress.count !== progress.data?.length ? ["Purchase progress unavailable or exceeded its 1,000-row limit"] : []),
      ],
      notes: [
        "Server cart events are deduplicated by cart/design/material/size; browser events count actions. They need not match exactly.",
        "Cart lines are current surviving rows, not historical adds; removed lines are absent.",
        "Retail paid counts exclude known owner addresses and samples, use paid_at, and are not net of refunds. Corporate orders are outside this report.",
        "Configuration/cart visitor overlap is not ordered and can span visits. Native page_view capture is disabled; use GA for arrivals.",
        "Purchase progress starts 7 October 2026. Browser observations require visitor/cart cookies and are deduplicated per visitor/cart/stage/IST day; they are not attempt counts or proof of payment.",
      ],
    };
  } catch {
    return { window, available: false as const, reason: "Native report could not be read" };
  }
}
