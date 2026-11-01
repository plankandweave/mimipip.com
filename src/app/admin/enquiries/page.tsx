"use client";

import { useCallback, useEffect, useState } from "react";
import { StaffGate, useStaff } from "@/lib/use-staff";

type Enquiry = { id: string; name: string | null; email: string; topic: string | null; message: string; created_at: string };
export default function EnquiriesPage() {
  const staff = useStaff();
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/enquiries", { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const data = await response.json();
      setRows(data.enquiries);
    } catch { setError("Could not load enquiries. Please refresh or sign in again."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { if (staff === "in") void load(); }, [staff, load]);
  if (staff !== "in") return <StaffGate state={staff} title="Website enquiries" />;
  return <main className="mx-auto max-w-4xl space-y-5 px-4 py-8">
    <div className="flex items-center justify-between gap-4"><h1 className="text-2xl font-semibold">Website enquiries</h1><button className="btn btn-ghost" disabled={busy} onClick={load}>{busy ? "Loading…" : "Refresh"}</button></div>
    <p className="text-sm text-slate">Latest 100 contact and product quote requests, newest first. Each product request includes the design and the visitor’s question. Internal QA entries are labelled in their message; do not contact them.</p>
    {error && <p role="alert">{error}</p>}
    {!busy && !error && !rows.length && <p>No enquiries yet.</p>}
    {rows.map(row => <article key={row.id} className="space-y-2 rounded-2xl border border-edge bg-surface p-5">
      <h2 className="font-semibold">{row.topic || "Website enquiry"}</h2>
      <p className="text-sm">{row.name ? `${row.name} · ` : ""}<a className="underline" href={`mailto:${encodeURIComponent(row.email)}`}>{row.email}</a></p>
      <time className="text-xs text-slate">{new Date(row.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</time>
      <p className="whitespace-pre-wrap break-words text-sm">{row.message}</p>
    </article>)}
  </main>;
}
