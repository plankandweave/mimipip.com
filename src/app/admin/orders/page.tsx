"use client";

import { isInternalOrder } from "@/lib/internal-orders";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRpc } from "@/lib/admin-rpc";
import { StaffGate, useStaff } from "@/lib/use-staff";
import { formatINR } from "@/lib/pricing";
import { addIstDays, istDateKey } from "@/lib/ist";

// Every order, both channels, one list. The /admin dashboard is the retail
// pipeline (admin_orders) and shows nothing corporate; /account/orders is
// scoped to one customer and /partners/<slug>/orders to one account. This page
// is the global view: retail `orders` and `corporate_orders` unioned by
// admin_orders_list (0121), newest first, filterable and searchable.
//
// Acting on an order otherwise happens on its own surface, which each row links
// to — with ONE exception, at the top of the page: unanswered partner
// cancellation requests. Those had no surface at all. The partner portal could
// raise one (POST /api/corporate/orders/[id]/cancel) and nothing anywhere could
// answer it, so the order sat "Cancellation awaiting confirmation" and the 24 h
// sweep mailed Roheena about it daily, forever, with nothing to click.
// Opened by the Google sign-in on the door and nothing else.

const PAGE_SIZE = 100;

type Row = {
  channel: "retail" | "corporate";
  id: string;
  /** The ZVY number — one series across every channel. Falls back to the
   *  channel's private id only for an order that was never numbered. */
  ref: string;
  /** The channel's own id ("#75", "VS-000090"): shown small under the ZVY so
   *  an old receipt or email can still be matched, never as the name. */
  internal_ref: string;
  status: string;
  payment_status: string;
  total: number | string | null;
  created_at: string;
  party: string | null;
  email: string | null;
  placed_via: string | null;
  item_count: number;
  href: string | null;
  invoice_number: string | null;
  invoice_url: string | null;
};

type Payload = { rows: Row[]; total: number; statuses: string[] };

type CancelRow = {
  id: string;
  order_ref: string;
  status: string;
  print_name: string | null;
  width_mm: number;
  height_mm: number;
  total: number | string | null;
  placed_by_email: string;
  cancel_requested_at: string;
  os_print_order_no: string | null;
  account_name: string | null;
  account_slug: string | null;
};

type Measurement = {
  date_basis: { date: string };
  paid_order_types?: Record<string, { orders: number }>;
  currencies: Record<string, {
    paid: { product: number; tax: number; shipping: number; gross: number };
    refunds: number;
    netCash: number;
    paidOrders: number;
    refundsCount: number;
  }>;
  product_after_refunds: Record<string, { value: number | null; lower_bound: number; upper_bound: number }>;
  counts: { sample_tax_derived_from_inclusive_total?: number; unknown_paid_at: number; invalid_paid_money_excluded: number; invalid_refund_money_excluded: number };
  coverage: { complete: boolean; totals_eligible_for_automated_decisions: boolean; truncation_note: string | null };
  attribution: { by_first_touch: { source: string; medium: string; campaign: string | null; payments: number }[] };
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting payment",
  paid: "Queued",
  draft: "Draft",
  frozen: "Frozen",
  in_production: "Printing",
  printed: "Ready to ship",
  shipped: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
const STATUS_PILL: Record<string, string> = {
  draft: "bg-lavender/50",
  frozen: "bg-sky/50",
  in_production: "bg-peach/60",
  shipped: "bg-peach/60",
  delivered: "bg-sage/60",
  cancelled: "bg-blush/60",
};

function label(status: string): string {
  return STATUS_LABEL[status] ?? status.replace(/_/g, " ");
}

function hoursSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 3_600_000));
}

function waited(iso: string): string {
  const h = hoursSince(iso);
  if (h < 1) return "just now";
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${Math.floor(h / 24)} days`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" });
}

/**
 * The unanswered cancellation requests, and the two buttons that answer them.
 *
 * Both answers are legitimate and both end the alert — the point is that a
 * decision gets RECORDED. "Stopped it" kills the order; "already printing"
 * leaves it running and tells the partner it is coming. Refusing to decide is
 * the only outcome that keeps mailing.
 */
function CancellationQueue() {
  const [rows, setRows] = useState<CancelRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await adminRpc("admin_cancellations_list");
    if (error) { setErr(error.message); return; }
    setErr(null);
    setRows((data ?? []) as CancelRow[]);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function resolve(row: CancelRow, outcome: "cancelled" | "declined") {
    const verb = outcome === "cancelled"
      ? `Stop ${row.order_ref} and mark it cancelled?`
      : `Let ${row.order_ref} run — tell them it was too late to stop?`;
    if (!window.confirm(verb)) return;
    setBusy(row.id);
    const { error } = await adminRpc("admin_resolve_cancellation", {
      p_order_id: row.id, p_outcome: outcome, p_by: null,
    });
    setBusy(null);
    if (error) { setErr(error.message); return; }
    // Drop it locally rather than refetching — the answer is now recorded and
    // the row can no longer come back from admin_cancellations_list.
    setRows((prev) => (prev ?? []).filter((r) => r.id !== row.id));
  }

  if (!rows || rows.length === 0) return err ? <p className="mt-4 text-sm text-blush">{err}</p> : null;

  return (
    <div className="mt-6 rounded-[18px] border-2 border-peach/70 bg-peach/15 p-4">
      <h2 className="font-display text-base font-bold">
        Cancellation requests ({rows.length})
      </h2>
      <p className="mt-1 text-xs text-slate">
        A partner asked us to stop these. Until one of the two buttons is pressed the
        order counts as needing attention and the 24 h sweep keeps mailing about it.
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-[12px] bg-surface px-3 py-2 text-sm">
            <span className="font-semibold">{r.order_ref}</span>
            <span className="text-slate">{r.account_name ?? r.placed_by_email}</span>
            <span className="text-xs text-slate">{r.print_name ?? "Untitled"}</span>
            <span className="text-xs text-slate">
              asked {waited(r.cancel_requested_at)} ago
              {r.os_print_order_no ? ` · on the machine as ${r.os_print_order_no}` : " · not yet with production"}
            </span>
            <span className="ml-auto flex gap-2">
              <button
                disabled={busy === r.id}
                onClick={() => void resolve(r, "cancelled")}
                className="btn btn-primary h-8 px-3 text-[0.7rem] disabled:opacity-40"
              >
                Stopped it
              </button>
              <button
                disabled={busy === r.id}
                onClick={() => void resolve(r, "declined")}
                className="btn btn-ghost h-8 px-3 text-[0.7rem] disabled:opacity-40"
              >
                Too late — it prints
              </button>
            </span>
          </li>
        ))}
      </ul>
      {err ? <p className="mt-3 text-sm text-blush">{err}</p> : null}
    </div>
  );
}

function MeasurementSummary() {
  const [date, setDate] = useState(() => addIstDays(istDateKey(), -1));
  const [report, setReport] = useState<Measurement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/measurement/orders?date=${encodeURIComponent(date)}`, {
        cache: "no-store",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "report_failed");
      setReport(body as Measurement);
      setError(null);
    } catch {
      setReport(null);
      setError("The paid-order report could not be read.");
    } finally {
      setLoading(false);
    }
  }, [date]);

  return (
    <section className="mt-6 rounded-[18px] border border-edge bg-surface p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold">Paid-order measurement</h2>
          <p className="mt-1 text-xs text-slate">IST payment and processed-refund activity, with incomplete data kept out of the totals.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            aria-label="Measurement date"
            value={date}
            disabled={loading}
            onChange={(e) => {
              setReport(null);
              setDate(e.target.value);
            }}
            className="h-9 rounded-[10px] border border-edge px-3 text-sm disabled:opacity-50"
          />
          <button onClick={() => void load()} disabled={loading} className="btn btn-ghost h-9 px-4 text-[0.72rem] disabled:opacity-40">
            {loading ? "Reading…" : "Read report"}
          </button>
        </div>
      </div>
      {error ? <p className="mt-3 text-sm text-blush">{error}</p> : null}
      {report ? (
        <div className="mt-4 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">Report for {report.date_basis.date} · IST</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(report.currencies).map(([currency, row]) => (
              <div key={currency} className="rounded-[14px] bg-cloud p-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate">{currency} · {row.paidOrders} paid</p>
                <p className="mt-1 font-semibold">Gross {row.paid.gross.toLocaleString("en-IN")} · cash net {row.netCash.toLocaleString("en-IN")}</p>
                <p className="mt-1 text-xs text-slate">Product {row.paid.product.toLocaleString("en-IN")} · tax {row.paid.tax.toLocaleString("en-IN")} · shipping {row.paid.shipping.toLocaleString("en-IN")} · refunds {row.refunds.toLocaleString("en-IN")}</p>
                {report.product_after_refunds[currency]?.value === null && row.refundsCount > 0 ? (
                  <p className="mt-1 text-xs text-slate">Net product is unknown; bound {report.product_after_refunds[currency].lower_bound.toLocaleString("en-IN")}–{report.product_after_refunds[currency].upper_bound.toLocaleString("en-IN")}</p>
                ) : null}
              </div>
            ))}
          </div>
          {report.paid_order_types ? (
            <p className="text-sm text-charcoal">
              External samples: {report.paid_order_types.external_sample?.orders ?? 0} · External retail walls/art: {report.paid_order_types.external_retail?.orders ?? 0} · Owner validations: {report.paid_order_types.internal_owner?.orders ?? 0} · Corporate: {report.paid_order_types.corporate?.orders ?? 0}.
              <span className="block mt-1 text-xs text-slate">Paid counts use payment time. Samples and owner validations are separate from acquired retail orders. Cash totals above include all categories; cancellations are not refunds.</span>
            </p>
          ) : null}
          <p className={`text-xs ${report.coverage.totals_eligible_for_automated_decisions ? "text-slate" : "text-blush"}`}>
            {report.coverage.totals_eligible_for_automated_decisions
              ? "Coverage complete for this day. Currency buckets remain separate."
              : `Not eligible for automated decisions · ${report.counts.unknown_paid_at} paid order(s) have unknown payment time · ${report.counts.invalid_paid_money_excluded + report.counts.invalid_refund_money_excluded} invalid money row(s) excluded.`}
            {report.coverage.truncation_note ? ` ${report.coverage.truncation_note}` : ""}
          </p>
          {(report.counts.sample_tax_derived_from_inclusive_total ?? 0) > 0 ? (
            <p className="text-xs text-slate">Sample product value and GST are derived from the GST-inclusive total for {report.counts.sample_tax_derived_from_inclusive_total} legacy sample payment(s) recorded with zero tax. Gross cash and refunds are unchanged.</p>
          ) : null}
          {report.attribution.by_first_touch.length ? (
            <p className="text-xs text-slate">
              Derived first touch: {report.attribution.by_first_touch.slice(0, 5).map((r) => `${r.source}/${r.medium}${r.campaign ? `/${r.campaign}` : ""} (${r.payments})`).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default function AllOrdersPage() {
  const staff = useStaff();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [channel, setChannel] = useState<"all" | "retail" | "corporate">("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const load = useCallback(
    async (opts: { channel: string; status: string; q: string; page: number }) => {
      // No setState before the await — the effect below calls this directly.
      const { data: d, error: e } = await adminRpc("admin_orders_list", {
        p_channel: opts.channel,
        p_status: opts.status,
        p_q: opts.q || null,
        p_limit: PAGE_SIZE,
        p_offset: opts.page * PAGE_SIZE,
      });
      if (e) {
        setError(e.message === "unauthorized" ? "You're not signed in." : e.message);
        setData(null);
        setLoading(false);
        return;
      }
      setError(null);
      setData(d as Payload);
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    // The sign-in is confirmed after mount, so fetching here is the only
    // option — same pattern as the other admin surfaces.
    if (staff !== "in") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void load({ channel, status, q: query, page });
  }, [staff, channel, status, query, page, load]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const value = useMemo(
    () => rows.reduce((sum, r) => sum + Number(r.total ?? 0), 0),
    [rows],
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  function reset(next: () => void) {
    setPage(0);
    next();
  }

  if (staff !== "in") return <StaffGate state={staff} title="All orders" />;

  return (
    <div className="container-x py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">All orders</h1>
          <p className="mt-1 text-xs text-slate">
            {data ? `${data.total} order${data.total === 1 ? "" : "s"} · ${formatINR(value)} on this page` : "Loading…"}
            {" · retail and corporate, newest first"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setLoading(true);
              void load({ channel, status, q: query, page });
            }}
            className="btn btn-ghost h-9 px-4 text-[0.72rem]"
          >
            Refresh
          </button>
        </div>
      </div>

      <CancellationQueue />
      <MeasurementSummary />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {(["all", "retail", "corporate"] as const).map((c) => (
          <button
            key={c}
            onClick={() => reset(() => setChannel(c))}
            className={`rounded-full border px-4 py-2 text-xs font-semibold capitalize ${
              channel === c ? "border-charcoal bg-charcoal text-white" : "border-edge text-slate hover:border-charcoal"
            }`}
          >
            {c}
          </button>
        ))}
        <select
          value={status}
          onChange={(e) => reset(() => setStatus(e.target.value))}
          className="h-10 rounded-[10px] border border-edge bg-surface px-3 text-sm outline-none focus:border-charcoal"
        >
          <option value="all">All statuses</option>
          {(data?.statuses ?? []).map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            reset(() => setQuery(q.trim()));
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ref, customer, email, invoice"
            className="h-10 w-64 rounded-[10px] border border-edge bg-surface px-3 text-sm outline-none focus:border-charcoal"
          />
          <button className="btn btn-ghost h-10 px-4 text-[0.72rem]">Search</button>
        </form>
      </div>

      {error ? <p className="mt-4 text-sm text-blush">{error}</p> : null}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate">
              <th className="py-2 pr-3">Ref</th>
              <th className="py-2 pr-3">Channel</th>
              <th className="py-2 pr-3">Customer</th>
              <th className="py-2 pr-3">Placed</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Items</th>
              <th className="py-2 pr-3 text-right">Total</th>
              <th className="py-2 pr-3">Invoice</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.channel}:${r.id}`} className="border-t border-edge align-top">
                <td className="py-2 pr-3 font-semibold">
                  {r.href ? (
                    <a href={r.href} className="underline underline-offset-2">
                      {r.ref}
                    </a>
                  ) : (
                    r.ref
                  )}
                  {r.internal_ref && r.internal_ref !== r.ref ? (
                    <div className="text-xs font-normal text-slate">{r.internal_ref}</div>
                  ) : null}
                </td>
                <td className="py-2 pr-3 text-slate">
                  {r.channel === "retail" ? (isInternalOrder(r.email) ? "Internal / owner" : r.placed_via === "sample" ? "Retail sample" : "Retail") : r.placed_via || "Corporate"}
                </td>
                <td className="py-2 pr-3">
                  {r.party || "—"}
                  {r.email && r.email !== r.party ? (
                    <div className="text-xs text-slate">{r.email}</div>
                  ) : null}
                </td>
                <td className="py-2 pr-3 text-slate">{when(r.created_at)}</td>
                <td className="py-2 pr-3">
                  <span className={`rounded-full px-3 py-1 text-xs ${STATUS_PILL[r.status] ?? "bg-edge/40"}`}>
                    {label(r.status)}
                  </span>
                </td>
                <td className="py-2 pr-3 text-slate">{r.item_count}</td>
                <td className="py-2 pr-3 text-right">{formatINR(Number(r.total ?? 0))}</td>
                <td className="py-2 pr-3 text-slate">
                  {r.invoice_number ? (
                    r.invoice_url ? (
                      <a href={r.invoice_url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                        {r.invoice_number}
                      </a>
                    ) : (
                      r.invoice_number
                    )
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-sm text-slate">
                  No orders match that filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <div className="mt-5 flex items-center gap-3 text-xs text-slate">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="btn btn-ghost h-9 px-4 text-[0.72rem] disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {page + 1} of {pages}
          </span>
          <button
            disabled={page + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="btn btn-ghost h-9 px-4 text-[0.72rem] disabled:opacity-40"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
