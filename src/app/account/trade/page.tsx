"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { AuthModal } from "@/components/AuthModal";
import { formatINR } from "@/lib/pricing";

// Trade partner dashboard. Phase 1 shipped this as a thin status-only page;
// Phase 5 extends it in place for status === 'active' with orders, earnings
// (ledger), invoice downloads and a read-only profile — every other status
// (draft/verifying/rejected/suspended) keeps its original Phase 1 handling
// untouched below.

/** The live corporate portal this same email can use, when the trade row was
 *  superseded rather than cut off. */
type MovedTo = { slug: string; name: string };

type PartnerStatus = {
  id: string;
  status: string;
  legal_name: string;
  entity_type: string;
  pan: string | null;
  gstin: string | null;
  gst_declared_none: boolean;
  bank_masked: string | null;
  penny_drop_status: string | null;
  commission_pct: number;
  markup_cap_pct: number;
  tds_pct: number;
  rejection_reason: string | null;
} | null;

type TradeOrder = {
  id: string;
  order_number: number;
  status: string;
  payment_status: string;
  email: string;
  phone: string | null;
  subtotal: number;
  shipping: number;
  markup_total: number;
  total: number;
  payment_link_url: string | null;
  created_at: string;
};

type LedgerRow = {
  id: string;
  orderId: string;
  orderNumber: number | null;
  status: string;
  grossCommission: number;
  gstOnCommission: number;
  tdsAmount: number;
  netPayout: number;
  selfInvoiceUrl: string | null;
  createdAt: string;
  paidAt: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Application started",
  verifying: "Verifying",
  active: "Active",
  rejected: "Application rejected",
  suspended: "Suspended",
};

const LEDGER_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  paying: "Paying",
  paid: "Paid",
  failed: "Failed",
};

const LEDGER_STATUS_PILL: Record<string, string> = {
  pending: "bg-lavender/60",
  paying: "bg-sky/50",
  paid: "bg-sage/60",
  failed: "bg-blush/60",
};

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export default function TradeDashboardPage() {
  const { session, loading } = useAuth();
  const [authDismissed, setAuthDismissed] = useState(false);
  const [partner, setPartner] = useState<PartnerStatus>(null);
  const [fetched, setFetched] = useState(false);
  // Derived rather than effect-driven, to avoid a synchronous setState call
  // in the effect body below (react-hooks/set-state-in-effect).
  const authOpen = !loading && !session && !authDismissed;

  const [orders, setOrders] = useState<TradeOrder[] | null>(null);
  const [ordersError, setOrdersError] = useState(false);
  const [ledger, setLedger] = useState<LedgerRow[] | null>(null);
  const [totalPaid, setTotalPaid] = useState(0);
  const [ledgerError, setLedgerError] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Set only when this same email opens a live corporate portal — i.e. the
  // partner was MOVED, not cut off. See /api/trade/status.
  const [movedTo, setMovedTo] = useState<MovedTo | null>(null);

  useEffect(() => {
    if (loading || !session) return;
    fetch("/api/trade/status")
      .then((r) => r.json())
      .then((j: { partner: PartnerStatus; movedTo?: MovedTo | null }) => {
        setPartner(j.partner);
        setMovedTo(j.movedTo ?? null);
      })
      .finally(() => setFetched(true));
  }, [session, loading]);

  useEffect(() => {
    if (loading || !session || partner?.status !== "active") return;
    fetch("/api/trade/orders")
      .then((r) => {
        if (!r.ok) throw new Error("orders_failed");
        return r.json();
      })
      .then((j: { orders: TradeOrder[] }) => setOrders(j.orders))
      .catch(() => setOrdersError(true));
    fetch("/api/trade/ledger")
      .then((r) => {
        if (!r.ok) throw new Error("ledger_failed");
        return r.json();
      })
      .then((j: { ledger: LedgerRow[]; totalPaidNetPayout: number }) => {
        setLedger(j.ledger);
        setTotalPaid(j.totalPaidNetPayout);
      })
      .catch(() => setLedgerError(true));
  }, [session, loading, partner?.status]);

  async function copyLink(orderId: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(orderId);
      setTimeout(() => setCopiedId((c) => (c === orderId ? null : c)), 2000);
    } catch {
      // Clipboard access can fail silently (permissions, insecure context) —
      // nothing useful to do beyond leaving the link visible to copy by hand.
    }
  }

  const isActive = partner?.status === "active";

  return (
    <div className="container-x py-10">
      <div className={`mx-auto ${isActive ? "max-w-4xl" : "max-w-lg"}`}>
        <span className="caps text-slate">Account</span>
        <h1 className="mt-1 font-display text-2xl font-bold">AID Partner</h1>

        {!session && !loading && (
          <p className="mt-4 text-sm text-slate">
            <button onClick={() => setAuthDismissed(false)} className="underline underline-offset-2">Log in</button>{" "}
            to see your trade account.
          </p>
        )}

        {session && fetched && !partner && (
          <div className="mt-6 rounded-[18px] bg-wash p-6">
            <p className="text-sm text-slate">You haven&apos;t applied to the trade partner program yet.</p>
            <Link href="/account/trade/apply" className="btn mt-4 inline-flex h-11 px-6 text-[0.8rem]">Apply now</Link>
          </div>
        )}

        {partner && (
          <div className="mt-6 rounded-[18px] border border-edge p-6">
            <div className="flex items-center justify-between">
              <p className="font-display text-base font-semibold">{partner.legal_name}</p>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-charcoal ${
                  partner.status === "active"
                    ? "bg-sage/60"
                    : partner.status === "rejected"
                      ? "bg-blush/60"
                      : "bg-lavender/60"
                }`}
              >
                {STATUS_LABEL[partner.status] ?? partner.status}
              </span>
            </div>
            <p className="mt-1 text-xs capitalize text-slate">{partner.entity_type} account</p>

            {partner.status === "active" && (
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-[12px] bg-wash p-3">
                  <p className="text-lg font-bold">{partner.commission_pct}%</p>
                  <p className="text-[0.62rem] uppercase tracking-wide text-mist">Commission</p>
                </div>
                <div className="rounded-[12px] bg-wash p-3">
                  <p className="text-lg font-bold">{partner.markup_cap_pct}%</p>
                  <p className="text-[0.62rem] uppercase tracking-wide text-mist">Markup cap</p>
                </div>
                <div className="rounded-[12px] bg-wash p-3">
                  <p className="text-lg font-bold">{partner.tds_pct}%</p>
                  <p className="text-[0.62rem] uppercase tracking-wide text-mist">TDS</p>
                </div>
              </div>
            )}

            {(partner.status === "draft" || partner.status === "verifying") && (
              <Link href="/account/trade/apply" className="btn mt-4 inline-flex h-11 px-6 text-[0.8rem]">
                Continue application
              </Link>
            )}

            {partner.status === "rejected" && (
              <>
                {partner.rejection_reason && (
                  <p className="mt-3 text-sm text-slate">{partner.rejection_reason}</p>
                )}
                <Link href="/account/trade/apply" className="btn mt-4 inline-flex h-11 px-6 text-[0.8rem]">
                  Re-apply
                </Link>
              </>
            )}

            {partner.status === "suspended" && (
              movedTo ? (
                <>
                  <p className="mt-3 text-sm text-slate">
                    Your account has moved to the {movedTo.name} partner portal — that&apos;s where
                    you order now, at your partner pricing. Nothing has been cut off.
                  </p>
                  <Link href={`/partners/${movedTo.slug}`} className="btn mt-4 inline-flex h-11 px-6 text-[0.8rem]">
                    Go to your portal
                  </Link>
                </>
              ) : (
                <p className="mt-3 text-sm text-slate">
                  Contact <a href="mailto:hello@zyvorah.com" className="underline underline-offset-2">hello@zyvorah.com</a> for details.
                </p>
              )
            )}
          </div>
        )}

        {isActive && (
          <>
            {/* Orders */}
            <div className="mt-8">
              <h2 className="font-display text-lg font-bold">Orders</h2>
              {ordersError && <p className="mt-2 text-sm text-slate">Couldn&apos;t load your orders. Try refreshing.</p>}
              {!ordersError && orders === null && <p className="mt-2 text-sm text-slate">Loading…</p>}
              {orders && orders.length === 0 && (
                <p className="mt-2 rounded-[14px] bg-wash p-4 text-sm text-slate">
                  No orders yet — place one from your trade dashboard when the order form is live.
                </p>
              )}
              {orders && orders.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead>
                      <tr className="text-[0.62rem] uppercase tracking-wide text-mist">
                        <th className="pb-2 pr-3 font-semibold">Order</th>
                        <th className="pb-2 pr-3 font-semibold">Status</th>
                        <th className="pb-2 pr-3 font-semibold">Payment</th>
                        <th className="pb-2 pr-3 font-semibold">Markup</th>
                        <th className="pb-2 pr-3 font-semibold">Total</th>
                        <th className="pb-2 font-semibold">Payment link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id} className="border-t border-edge">
                          <td className="py-2 pr-3 font-semibold text-charcoal">#{o.order_number}</td>
                          <td className="py-2 pr-3 capitalize text-slate">{o.status}</td>
                          <td className="py-2 pr-3 capitalize text-slate">{o.payment_status}</td>
                          <td className="py-2 pr-3 text-slate">
                            {o.markup_total > 0 ? formatINR(o.markup_total) : "—"}
                          </td>
                          <td className="py-2 pr-3 font-semibold text-charcoal">{formatINR(o.total)}</td>
                          <td className="py-2">
                            {o.payment_link_url ? (
                              o.payment_status === "paid" ? (
                                <span className="text-mist">Paid</span>
                              ) : (
                                <button
                                  onClick={() => copyLink(o.id, o.payment_link_url!)}
                                  className="rounded-full border border-edge px-3 py-1 text-[0.68rem] font-semibold text-charcoal hover:border-slate"
                                >
                                  {copiedId === o.id ? "Copied ✓" : "Copy link"}
                                </button>
                              )
                            ) : (
                              <span className="text-mist">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Earnings / ledger */}
            <div className="mt-8">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-bold">Earnings</h2>
                <p className="text-xs text-slate">
                  Paid out to date: <span className="font-semibold text-charcoal">{formatINR(totalPaid)}</span>
                </p>
              </div>
              {ledgerError && <p className="mt-2 text-sm text-slate">Couldn&apos;t load your earnings. Try refreshing.</p>}
              {!ledgerError && ledger === null && <p className="mt-2 text-sm text-slate">Loading…</p>}
              {ledger && ledger.length === 0 && (
                <p className="mt-2 rounded-[14px] bg-wash p-4 text-sm text-slate">
                  Commission shows up here as soon as an order is paid.
                </p>
              )}
              {ledger && ledger.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead>
                      <tr className="text-[0.62rem] uppercase tracking-wide text-mist">
                        <th className="pb-2 pr-3 font-semibold">Order</th>
                        <th className="pb-2 pr-3 font-semibold">Status</th>
                        <th className="pb-2 pr-3 font-semibold">Gross</th>
                        <th className="pb-2 pr-3 font-semibold">GST</th>
                        <th className="pb-2 pr-3 font-semibold">TDS</th>
                        <th className="pb-2 pr-3 font-semibold">Net payout</th>
                        <th className="pb-2 font-semibold">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map((l) => (
                        <tr key={l.id} className="border-t border-edge">
                          <td className="py-2 pr-3 font-semibold text-charcoal">
                            {l.orderNumber != null ? `#${l.orderNumber}` : "—"}
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-charcoal ${LEDGER_STATUS_PILL[l.status] ?? "bg-wash"}`}
                            >
                              {LEDGER_STATUS_LABEL[l.status] ?? l.status}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-slate">{formatINR(l.grossCommission)}</td>
                          <td className="py-2 pr-3 text-slate">{formatINR(l.gstOnCommission)}</td>
                          <td className="py-2 pr-3 text-slate">−{formatINR(l.tdsAmount)}</td>
                          <td className="py-2 pr-3 font-semibold text-charcoal">{formatINR(l.netPayout)}</td>
                          <td className="py-2 text-slate">{dateLabel(l.paidAt ?? l.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Downloads — self-billed invoices only; the annual TDS summary is
                admin-only (accountant-facing), never shown to the partner. */}
            <div className="mt-8">
              <h2 className="font-display text-lg font-bold">Downloads</h2>
              {ledger && ledger.filter((l) => l.selfInvoiceUrl).length === 0 && (
                <p className="mt-2 text-sm text-slate">
                  Self-billed commission invoices appear here once a payout is confirmed.
                </p>
              )}
              {ledger && ledger.filter((l) => l.selfInvoiceUrl).length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {ledger
                    .filter((l) => l.selfInvoiceUrl)
                    .map((l) => (
                      <li key={l.id}>
                        <a
                          href={l.selfInvoiceUrl!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm underline underline-offset-2"
                        >
                          Self-billed invoice — order #{l.orderNumber ?? "—"} ({dateLabel(l.paidAt ?? l.createdAt)})
                        </a>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            {/* Profile — read-only. A bank-change / re-penny-drop flow is out
                of scope for this phase; contact support to change bank
                details for now. */}
            <div className="mt-8 mb-4">
              <h2 className="font-display text-lg font-bold">Profile</h2>
              <dl className="mt-3 grid gap-x-6 gap-y-2 rounded-[14px] bg-wash p-4 text-xs sm:grid-cols-2">
                <ProfileField label="Legal name" value={partner.legal_name} />
                <ProfileField label="Entity type" value={partner.entity_type} className="capitalize" />
                <ProfileField label="PAN" value={partner.pan ?? "—"} />
                <ProfileField
                  label="GSTIN"
                  value={partner.gstin ?? (partner.gst_declared_none ? "Not registered" : "—")}
                />
                <ProfileField label="Bank account" value={partner.bank_masked ?? "—"} />
                <ProfileField
                  label="Bank verification"
                  value={partner.penny_drop_status === "completed" ? "Verified" : (partner.penny_drop_status ?? "—")}
                  className="capitalize"
                />
                <ProfileField label="Commission" value={`${partner.commission_pct}%`} />
                <ProfileField label="Markup cap" value={`${partner.markup_cap_pct}%`} />
              </dl>
              <p className="mt-2 text-[0.68rem] text-mist">
                To change your bank details, contact{" "}
                <a href="mailto:hello@zyvorah.com" className="underline underline-offset-2">hello@zyvorah.com</a> —
                self-service bank changes (with re-verification) are coming in a future update.
              </p>
            </div>
          </>
        )}
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthDismissed(true)} onSuccess={() => setAuthDismissed(true)} />
    </div>
  );
}

function ProfileField({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <dt className="text-[0.62rem] font-semibold uppercase tracking-wide text-mist">{label}</dt>
      <dd className={`text-charcoal ${className ?? ""}`}>{value}</dd>
    </div>
  );
}
