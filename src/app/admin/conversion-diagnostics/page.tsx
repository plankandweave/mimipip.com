"use client";

import { useEffect, useState } from "react";
import { StaffGate, useStaff } from "@/lib/use-staff";
import type { fetchGaConversionDiagnostics } from "@/lib/ga-data";
import type { fetchNativeConversionDiagnostics } from "@/lib/native-conversion-diagnostics";
import { formatIstDateTime } from "@/lib/ist";

type Report = {
  generatedAt: string;
  ga: Awaited<ReturnType<typeof fetchGaConversionDiagnostics>>;
  native: Awaited<ReturnType<typeof fetchNativeConversionDiagnostics>>;
};

export default function ConversionDiagnostics() {
  const staff = useStaff();
  const [days, setDays] = useState(28);
  const [reload, setReload] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (staff !== "in") return;
    const controller = new AbortController();
    fetch(`/api/admin/conversion-diagnostics?days=${days}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Could not read conversion diagnostics. Refresh or sign in again.");
        return response.json() as Promise<Report>;
      }).then(data => { if (!controller.signal.aborted) setReport(data); }).catch(e => { if (!controller.signal.aborted) setError(String(e.message)); });
    return () => controller.abort();
  }, [staff, days, reload]);
  if (staff !== "in") return <StaffGate state={staff} title="Conversion diagnostics" />;
  const ga = report?.ga;
  const native = report?.native;
  const rolling = native && "rolling30Days" in native ? native.rolling30Days : null;
  return <main className="container-x space-y-6 py-8">
    <h1 className="text-2xl font-semibold">Conversion diagnostics</h1>
    <p className="max-w-3xl text-sm text-slate">Find where shopping stops. Compare recorded cart additions with browser signals, then inspect landing pages and configuration activity. Missing data is shown as unavailable, never as zero.</p>
    <div className="flex flex-wrap items-center gap-3">
      <label>Window <select className="min-h-11 rounded border border-edge px-3" value={days} onChange={e => { setReport(null); setError(""); setDays(Number(e.target.value)); }}>
        <option value={7}>7 days</option><option value={28}>28 days</option><option value={90}>90 days</option>
      </select></label>
      <button className="btn btn-ghost" onClick={() => { setReport(null); setError(""); setReload(n => n + 1); }}>Refresh</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {!error && !report && <p role="status">Reading store records and analytics…</p>}
    {report && <>
      <p className="text-xs text-slate">Read {formatIstDateTime(report.generatedAt)} IST · {report.ga.window.from} to {report.ga.window.to}. GA can lag 48 hours.</p>
      <section className="space-y-3 rounded-2xl border border-edge p-5">
        <h2 className="text-xl font-semibold">Store records</h2>
        {native && "reason" in native && <p role="status">{native.reason}</p>}
        {native && "paidOrders" in native && <>
          <p>Paid retail orders: <strong>{native.paidOrders?.retail ?? "Unavailable"}</strong> · Paid samples: <strong>{native.paidOrders?.samples ?? "Unavailable"}</strong> · Owner validations: {native.paidOrders?.internal ?? "Unavailable"} · Unidentified paid: {native.paidOrders?.unidentified ?? "Unavailable"}</p>
          <p>Concept briefs: {native.conceptBriefsCreatedInWindow ?? "Unavailable"} · Remaining cart lines created in this window: {native.remainingCartLinesCreatedInWindow ?? "Unavailable"}</p>
          <details><summary className="cursor-pointer py-3">Native purchase progress · last 24 hours</summary><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(native.purchaseProgress ?? "Unavailable", null, 2)}</pre></details>
          {(native.errors ?? []).map(message => <p key={message} role="status">{message}</p>)}
          {(native.notes ?? []).map(note => <p key={note} className="text-xs text-slate">{note}</p>)}
        </>}
        <h3 className="font-semibold">Native activity · trailing 30 days to now</h3>
        <p>Server-confirmed cart additions: <strong>{rolling?.cartSignals?.serverConfirmed ?? "Unavailable"}</strong> · Browser-reported additions: <strong>{rolling?.cartSignals?.browserReported ?? "Unavailable"}</strong></p>
        <p>Checkout submissions: {rolling?.commercialEvents?.checkout_start ?? "Unavailable"} · Orders created: {rolling?.commercialEvents?.order_placed ?? "Unavailable"} · Payment events: {rolling?.commercialEvents?.payment_captured ?? "Unavailable"} · Leads captured: {rolling?.commercialEvents?.lead_captured ?? "Unavailable"}</p>
        <p className="text-xs text-slate">These are recorded actions, not distinct shoppers or a sequential funnel; staff activity may be included. Paid retail totals above exclude known owner validations.</p>
        <p>Visitors starting configuration: {String(rolling?.configurationVisitors ?? "Unavailable")} · Visitors with both configuration and cart activity: {String(rolling?.visitorsWithConfigurationAndCart ?? "Unavailable")}</p>
        <details><summary className="cursor-pointer py-3">Cart and checkout failure counts</summary><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(rolling?.failuresByStage ?? "Unavailable", null, 2)}</pre></details>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Browser activity</h2>
        <p className="text-sm text-slate">These are activity counts, not a sequential funnel. New events begin at deployment; they cannot reconstruct old attempts.</p>
        {ga && "reason" in ga && <p>{ga.reason}</p>}
        {ga && "events" in ga && (ga.events ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{ga.events.map(row => <div className="rounded-xl border border-edge p-3" key={row.event}><p className="break-all text-sm">{row.event}</p><p>{row.users} users · {row.count} events</p></div>)}</div> : <p>Event report unavailable.</p>)}
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Landing pages by campaign and device</h2>
        {ga && "coverage" in ga && ga.coverage?.landingMayBeTruncated && <p>Showing the top {ga.coverage?.landingLimit} segments; this is not a complete traffic total.</p>}
        {ga && "landing" in ga && (ga.landing ? <div className="grid gap-3 lg:grid-cols-2">{ga.landing.map((row, i) => <article key={i} className="min-w-0 space-y-2 rounded-xl border border-edge p-4">
          <h3 className="break-all font-semibold">{row.path}</h3>
          <p className="break-words text-sm">{row.sourceMedium} · {row.campaign} · {row.device} · {row.country}</p>
          <p className="text-sm">{row.sessions} sessions · {row.engagedSessions} engaged · {row.addToCarts} adds · {row.checkouts} checkout starts · {row.purchases} purchases</p>
        </article>)}</div> : <p>Landing report unavailable.</p>)}
      </section>
    </>}
  </main>;
}
