"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRpc } from "@/lib/admin-rpc";
import { StaffGate, useStaff } from "@/lib/use-staff";
import { formatINR } from "@/lib/pricing";
import { financialYear } from "@/lib/gst";

// AID Partners program admin (Phase 5): partner roster + KYC detail +
// manual suspend/reactivate, a read-only payout monitor, and the TDS report
// for the accountant. The RPCs underneath are SECURITY DEFINER and still check
// the database key themselves — the server supplies it from the Google
// sign-in, so nothing here carries one.
// RPCs live in supabase/migrations/0076_trade_admin_rpcs.sql.


type PartnerStatus = "draft" | "verifying" | "active" | "rejected" | "suspended";

type PartnerRow = {
  id: string;
  status: PartnerStatus;
  entity_type: string;
  legal_name: string;
  pan: string;
  gstin: string | null;
  commission_pct: number;
  markup_cap_pct: number;
  rejection_reason: string | null;
  created_at: string;
};

type PartnerFull = {
  id: string;
  customer_id: string;
  status: PartnerStatus;
  entity_type: string;
  legal_name: string;
  pan: string;
  pan_name: string | null;
  pan_verified_at: string | null;
  gstin: string | null;
  gst_declared_none: boolean;
  gstin_verified_at: string | null;
  entity_docs: { path: string; label?: string }[];
  bank_masked: string | null;
  rzpx_contact_id: string | null;
  rzpx_fund_account_id: string | null;
  penny_drop_status: string | null;
  penny_drop_verified_name: string | null;
  logo_url: string | null;
  proof_type: string | null;
  proof_ref: string | null;
  proof_verdict: { passed?: boolean; [k: string]: unknown } | null;
  self_billing_consent_at: string | null;
  tc_accepted_at: string | null;
  commission_pct: number;
  markup_cap_pct: number;
  tds_pct: number;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

type KycEvent = {
  id: string;
  event_type: string;
  ok: boolean;
  detail: unknown;
  created_at: string;
};

type DetailLedgerRow = {
  id: string;
  order_id: string;
  order_number: number | null;
  status: string;
  gross_commission: number;
  gst_on_commission: number;
  tds_amount: number;
  net_payout: number;
  retry_count: number;
  failed_reason: string | null;
  self_invoice_url: string | null;
  created_at: string;
  paid_at: string | null;
};

type PartnerDetail = {
  partner: PartnerFull;
  kyc_events: KycEvent[];
  ledger: DetailLedgerRow[];
};

type MonitorRow = {
  id: string;
  order_id: string;
  order_number: number | null;
  trade_partner_id: string;
  partner_legal_name: string;
  status: string;
  gross_commission: number;
  gst_on_commission: number;
  tds_amount: number;
  net_payout: number;
  retry_count: number;
  failed_reason: string | null;
  self_invoice_url: string | null;
  created_at: string;
  paid_at: string | null;
};

type TdsRow = {
  trade_partner_id: string;
  legal_name: string;
  pan: string;
  orders: number;
  gross_commission: number;
  gst_on_commission: number;
  tds_amount: number;
  net_paid: number;
};

const PARTNER_STATUS_PILL: Record<PartnerStatus, string> = {
  draft: "bg-wash",
  verifying: "bg-lavender/60",
  active: "bg-sage/60",
  rejected: "bg-blush/60",
  suspended: "bg-sky/50",
};
const PARTNER_STATUS_LABEL: Record<PartnerStatus, string> = {
  draft: "Draft",
  verifying: "Verifying",
  active: "Active",
  rejected: "Rejected",
  suspended: "Suspended",
};
const PARTNER_FILTERS: (PartnerStatus | "all")[] = ["all", "draft", "verifying", "active", "rejected", "suspended"];

const LEDGER_STATUS_PILL: Record<string, string> = {
  pending: "bg-lavender/60",
  paying: "bg-sky/50",
  paid: "bg-sage/60",
  failed: "bg-blush/60",
};
const LEDGER_FILTERS: (string | "all")[] = ["all", "pending", "paying", "paid", "failed"];

function age(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export default function TradeAdminPage() {
  const staff = useStaff();
  const [error, setError] = useState<string | null>(null);

  // Partners
  const [partners, setPartners] = useState<PartnerRow[] | null>(null);
  const [partnerFilter, setPartnerFilter] = useState<PartnerStatus | "all">("all");
  const [openPartnerId, setOpenPartnerId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PartnerDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busyPartnerId, setBusyPartnerId] = useState<string | null>(null);

  // Payout monitor
  const [monitorRows, setMonitorRows] = useState<MonitorRow[] | null>(null);
  const [monitorFilter, setMonitorFilter] = useState<string>("all");
  const [monitorError, setMonitorError] = useState<string | null>(null);

  // TDS report
  const [fy, setFy] = useState(() => financialYear());
  const [tdsRows, setTdsRows] = useState<TdsRow[] | null>(null);
  const [tdsError, setTdsError] = useState<string | null>(null);
  const [tdsBusy, setTdsBusy] = useState(false);

  const loadPartners = useCallback(async () => {
    const { data, error: e } = await adminRpc("admin_trade_partners_list");
    if (e) {
      setError(e.message === "unauthorized" ? "You're not signed in." : e.message);
      setPartners(null);
      return;
    }
    setError(null);
    setPartners((data ?? []) as PartnerRow[]);
  }, []);

  const loadMonitor = useCallback(async (status: string) => {
    const { data, error: e } = await adminRpc("admin_trade_ledger_list", {
      p_status: status === "all" ? null : status,
    });
    if (e) {
      setMonitorError(e.message === "unauthorized" ? "You're not signed in." : e.message);
      setMonitorRows(null);
      return;
    }
    setMonitorError(null);
    setMonitorRows((data ?? []) as MonitorRow[]);
  }, []);

  useEffect(() => {
    if (staff === "in") void loadPartners();
  }, [staff, loadPartners]);

  useEffect(() => {
    // Separate effect (rather than folding into the one above) so switching
    // the payout-status filter re-fetches only the monitor, not the partner
    // list too.
    if (staff === "in") void loadMonitor(monitorFilter);
  }, [staff, monitorFilter, loadMonitor]);

  const fetchDetail = useCallback(async (id: string) => {
    setDetail(null);
    setDetailError(null);
    const { data, error: e } = await adminRpc("admin_trade_partner_detail", {
      p_partner_id: id,
    });
    if (e) {
      setDetailError(e.message);
      return;
    }
    setDetail(data as PartnerDetail);
  }, []);

  const openPartner = useCallback(
    async (id: string) => {
      if (openPartnerId === id) {
        setOpenPartnerId(null);
        setDetail(null);
        return;
      }
      setOpenPartnerId(id);
      await fetchDetail(id);
    },
    [openPartnerId, fetchDetail],
  );

  const setPartnerStatus = async (id: string, status: "active" | "suspended") => {
    setBusyPartnerId(id);
    const { error: e } = await adminRpc("admin_trade_set_partner_status", {
      p_partner_id: id,
      p_status: status,
    });
    setBusyPartnerId(null);
    if (e) {
      setError(e.message);
      return;
    }
    await loadPartners();
    if (openPartnerId === id) await fetchDetail(id);
  };

  const runTdsReport = async () => {
    setTdsBusy(true);
    setTdsError(null);
    const { data, error: e } = await adminRpc("admin_trade_tds_report", { p_fy: fy });
    setTdsBusy(false);
    if (e) {
      setTdsError(e.message === "unauthorized" ? "You're not signed in." : e.message);
      setTdsRows(null);
      return;
    }
    setTdsRows((data ?? []) as TdsRow[]);
  };

  const shownPartners = useMemo(
    () => (partners ?? []).filter((p) => partnerFilter === "all" || p.status === partnerFilter),
    [partners, partnerFilter],
  );
  const failedCount = useMemo(
    () => (monitorRows ?? []).filter((r) => r.status === "failed").length,
    [monitorRows],
  );

  if (staff !== "in") return <StaffGate state={staff} title="AID Partners admin" />;

  return (
    <div className="container-x py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">AID Partners program</h1>
          <p className="mt-1 text-xs text-slate">
            {partners ? `${partners.length} partner(s)` : "Loading…"}
            {failedCount > 0 && <span className="text-charcoal"> · {failedCount} payout(s) need manual review</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              void loadPartners();
              void loadMonitor(monitorFilter);
            }}
            className="btn btn-ghost h-9 px-4 text-[0.72rem]"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="mt-4 rounded-[12px] bg-blush/40 px-4 py-3 text-sm text-charcoal">{error}</p>}

      {/* ── Partners ─────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-bold">Partners</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {PARTNER_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setPartnerFilter(f)}
              className={`rounded-full px-3.5 py-1.5 text-[0.72rem] font-semibold transition-colors ${
                partnerFilter === f ? "bg-charcoal text-surface" : "bg-wash text-slate hover:text-charcoal"
              }`}
            >
              {f === "all" ? "All" : PARTNER_STATUS_LABEL[f]}
            </button>
          ))}
        </div>

        {partners && shownPartners.length === 0 && (
          <p className="mt-5 rounded-[14px] bg-wash p-4 text-sm text-slate">Nothing in this status.</p>
        )}

        <div className="mt-4 space-y-3">
          {shownPartners.map((p) => {
            const isOpen = openPartnerId === p.id;
            return (
              <div key={p.id} className="overflow-hidden rounded-[18px] border border-edge bg-surface">
                <button
                  onClick={() => void openPartner(p.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left hover:bg-wash/60"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-sm font-bold">{p.legal_name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-charcoal ${PARTNER_STATUS_PILL[p.status]}`}
                      >
                        {PARTNER_STATUS_LABEL[p.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate">
                      {p.pan} · {p.gstin ?? "no GSTIN"} · {p.commission_pct}% commission · {p.markup_cap_pct}% markup cap
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-mist">{age(p.created_at)} ago {isOpen ? "▲" : "▼"}</span>
                </button>

                {isOpen && (
                  <div className="border-t border-edge px-5 py-5">
                    {detailError && <p className="text-sm text-charcoal">{detailError}</p>}
                    {!detailError && !detail && <p className="text-sm text-slate">Loading…</p>}
                    {detail && detail.partner.id === p.id && (
                      <>
                        <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
                          <Field label="Entity type" value={detail.partner.entity_type} />
                          <Field label="PAN name" value={detail.partner.pan_name ?? "—"} />
                          <Field label="PAN verified" value={detail.partner.pan_verified_at ? "Yes" : "No"} />
                          <Field
                            label="GSTIN"
                            value={detail.partner.gstin ?? (detail.partner.gst_declared_none ? "Declared not registered" : "—")}
                          />
                          <Field label="Bank account" value={detail.partner.bank_masked ?? "—"} />
                          <Field label="Penny drop" value={detail.partner.penny_drop_status ?? "—"} />
                          <Field label="Proof type" value={detail.partner.proof_type ?? "—"} />
                          <Field label="Proof passed" value={detail.partner.proof_verdict?.passed ? "Yes" : "No"} />
                          <Field label="Self-billing consent" value={detail.partner.self_billing_consent_at ? "Yes" : "No"} />
                          <Field label="T&C accepted" value={detail.partner.tc_accepted_at ? "Yes" : "No"} />
                          <Field label="TDS %" value={`${detail.partner.tds_pct}%`} />
                          {detail.partner.rejection_reason && (
                            <Field label="Rejection reason" value={detail.partner.rejection_reason} />
                          )}
                        </dl>

                        {/* KYC audit trail */}
                        <div className="mt-5">
                          <p className="caps mb-2 text-mist">KYC audit trail</p>
                          {detail.kyc_events.length === 0 && <p className="text-xs text-mist">No events logged.</p>}
                          <div className="space-y-1.5">
                            {detail.kyc_events.map((e) => (
                              <div key={e.id} className="flex items-center gap-2 rounded-[10px] bg-wash px-3 py-2 text-xs">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase ${e.ok ? "bg-sage/60" : "bg-blush/60"}`}
                                >
                                  {e.ok ? "OK" : "Failed"}
                                </span>
                                <span className="font-semibold text-charcoal">{e.event_type}</span>
                                <span className="ml-auto text-mist">{age(e.created_at)} ago</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Ledger */}
                        <div className="mt-5">
                          <p className="caps mb-2 text-mist">Ledger</p>
                          {detail.ledger.length === 0 && <p className="text-xs text-mist">No ledger rows yet.</p>}
                          {detail.ledger.length > 0 && (
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[520px] text-left text-xs">
                                <thead>
                                  <tr className="text-[0.6rem] uppercase tracking-wide text-mist">
                                    <th className="pb-1.5 pr-3 font-semibold">Order</th>
                                    <th className="pb-1.5 pr-3 font-semibold">Status</th>
                                    <th className="pb-1.5 pr-3 font-semibold">Net payout</th>
                                    <th className="pb-1.5 font-semibold">Date</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detail.ledger.map((l) => (
                                    <tr key={l.id} className="border-t border-edge">
                                      <td className="py-1.5 pr-3 font-semibold text-charcoal">
                                        {l.order_number != null ? `#${l.order_number}` : "—"}
                                      </td>
                                      <td className="py-1.5 pr-3">
                                        <span
                                          className={`rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase ${LEDGER_STATUS_PILL[l.status] ?? "bg-wash"}`}
                                        >
                                          {l.status}
                                        </span>
                                      </td>
                                      <td className="py-1.5 pr-3 text-charcoal">{formatINR(l.net_payout)}</td>
                                      <td className="py-1.5 text-slate">{age(l.paid_at ?? l.created_at)} ago</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {/* Suspend / reactivate — manual only, never draft/verifying/rejected */}
                        <div className="mt-5 flex flex-wrap gap-2 border-t border-edge pt-4">
                          {p.status === "active" && (
                            <button
                              disabled={busyPartnerId === p.id}
                              onClick={() => setPartnerStatus(p.id, "suspended")}
                              className="rounded-[10px] border border-blush px-4 py-2 text-xs font-semibold text-charcoal hover:border-charcoal disabled:opacity-50"
                            >
                              {busyPartnerId === p.id ? "Saving…" : "Suspend"}
                            </button>
                          )}
                          {p.status === "suspended" && (
                            <button
                              disabled={busyPartnerId === p.id}
                              onClick={() => setPartnerStatus(p.id, "active")}
                              className="btn h-9 px-4 text-xs disabled:opacity-50"
                            >
                              {busyPartnerId === p.id ? "Saving…" : "Reactivate"}
                            </button>
                          )}
                          {p.status !== "active" && p.status !== "suspended" && (
                            <p className="text-[0.68rem] text-mist">
                              This status is owned by the automatic apply flow — nothing to do here.
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Payout monitor ──────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="font-display text-lg font-bold">Payout monitor</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {LEDGER_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setMonitorFilter(f)}
              className={`rounded-full px-3.5 py-1.5 text-[0.72rem] font-semibold transition-colors ${
                monitorFilter === f ? "bg-charcoal text-surface" : "bg-wash text-slate hover:text-charcoal"
              }`}
            >
              {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {monitorError && <p className="mt-4 text-sm text-charcoal">{monitorError}</p>}
        {!monitorError && monitorRows === null && <p className="mt-4 text-sm text-slate">Loading…</p>}
        {monitorRows && monitorRows.length === 0 && (
          <p className="mt-4 rounded-[14px] bg-wash p-4 text-sm text-slate">Nothing in this status.</p>
        )}
        {monitorRows && monitorRows.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="text-[0.62rem] uppercase tracking-wide text-mist">
                  <th className="pb-2 pr-3 font-semibold">Partner</th>
                  <th className="pb-2 pr-3 font-semibold">Order</th>
                  <th className="pb-2 pr-3 font-semibold">Status</th>
                  <th className="pb-2 pr-3 font-semibold">Net payout</th>
                  <th className="pb-2 pr-3 font-semibold">Retries</th>
                  <th className="pb-2 pr-3 font-semibold">Reason</th>
                  <th className="pb-2 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {monitorRows.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-t border-edge ${r.status === "failed" ? "bg-blush/10" : ""}`}
                  >
                    <td className="py-2 pr-3 font-semibold text-charcoal">{r.partner_legal_name}</td>
                    <td className="py-2 pr-3 text-slate">{r.order_number != null ? `#${r.order_number}` : "—"}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase ${LEDGER_STATUS_PILL[r.status] ?? "bg-wash"} ${r.status === "failed" ? "ring-1 ring-blush" : ""}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-semibold text-charcoal">{formatINR(r.net_payout)}</td>
                    <td className="py-2 pr-3 text-slate">{r.retry_count}</td>
                    <td className="py-2 pr-3 text-slate">{r.failed_reason ?? "—"}</td>
                    <td className="py-2 text-slate">{age(r.paid_at ?? r.created_at)} ago</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── TDS report ───────────────────────────────────────────────────── */}
      <section className="mt-10 mb-10">
        <h2 className="font-display text-lg font-bold">TDS report</h2>
        <p className="mt-1 text-xs text-slate">
          Per-partner 194H rollup for a financial year — for the quarterly TDS deposit and Form 16A prep.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={fy}
            onChange={(e) => setFy(e.target.value)}
            placeholder="2025-26"
            className="h-10 w-32 rounded-[10px] border border-edge bg-surface px-3 text-sm outline-none focus:border-charcoal"
          />
          <button onClick={runTdsReport} disabled={tdsBusy} className="btn h-10 px-5 text-xs disabled:opacity-50">
            {tdsBusy ? "Running…" : "Run report"}
          </button>
        </div>

        {tdsError && <p className="mt-3 text-sm text-charcoal">{tdsError}</p>}
        {tdsRows && tdsRows.length === 0 && (
          <p className="mt-4 rounded-[14px] bg-wash p-4 text-sm text-slate">No paid payouts in {fy}.</p>
        )}
        {tdsRows && tdsRows.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="text-[0.62rem] uppercase tracking-wide text-mist">
                  <th className="pb-2 pr-3 font-semibold">Partner</th>
                  <th className="pb-2 pr-3 font-semibold">PAN</th>
                  <th className="pb-2 pr-3 font-semibold">Orders</th>
                  <th className="pb-2 pr-3 font-semibold">Gross</th>
                  <th className="pb-2 pr-3 font-semibold">GST</th>
                  <th className="pb-2 pr-3 font-semibold">TDS</th>
                  <th className="pb-2 font-semibold">Net paid</th>
                </tr>
              </thead>
              <tbody>
                {tdsRows.map((r) => (
                  <tr key={r.trade_partner_id} className="border-t border-edge">
                    <td className="py-2 pr-3 font-semibold text-charcoal">{r.legal_name}</td>
                    <td className="py-2 pr-3 text-slate">{r.pan}</td>
                    <td className="py-2 pr-3 text-slate">{r.orders}</td>
                    <td className="py-2 pr-3 text-slate">{formatINR(r.gross_commission)}</td>
                    <td className="py-2 pr-3 text-slate">{formatINR(r.gst_on_commission)}</td>
                    <td className="py-2 pr-3 text-slate">{formatINR(r.tds_amount)}</td>
                    <td className="py-2 font-semibold text-charcoal">{formatINR(r.net_paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.65rem] font-semibold uppercase tracking-wide text-mist">{label}</dt>
      <dd className="text-charcoal">{value}</dd>
    </div>
  );
}
