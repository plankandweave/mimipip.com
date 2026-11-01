"use client";

import { useState } from "react";

/**
 * The purchase order, captured where it is actually raised.
 *
 * Everything about the money is decided server-side; this component sends two
 * strings and nothing else. The PO number is required — approving without one
 * would just be a slower "send to print", and the whole point is that the walls
 * carry the PO from the moment they exist.
 */
export default function PoApproval({
  token, defaultName, totalLabel, walls,
}: { token: string; defaultName: string; totalLabel: string; walls: number }) {
  const [poNumber, setPoNumber] = useState("");
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ groupRef?: string | null; poNumber?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function approve() {
    // Said before the button is pressed, next to the button — not as an error
    // that appears only after a round trip.
    if (!poNumber.trim()) { setErr("Enter your purchase order number to approve."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/corporate/quotes/${token}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poNumber: poNumber.trim(), approvedByName: name.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not approve the quotation");
      setDone({ groupRef: j.groupRef, poNumber: j.poNumber ?? poNumber.trim() });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not approve the quotation");
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-[18px] border border-edge bg-wash p-6 text-center">
        <p className="font-display text-lg font-bold">Approved — thank you</p>
        <p className="mt-1.5 text-sm text-slate">
          {walls} wall{walls === 1 ? "" : "s"} placed against <strong>PO {done.poNumber}</strong>
          {done.groupRef ? <> as project <span className="font-mono text-xs">{done.groupRef}</span></> : null}.
          The PO number carries through to the invoice.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[18px] border border-edge bg-surface p-5">
      <p className="text-sm font-semibold">Raise the PO, then approve</p>
      <p className="mt-1 text-xs text-slate">
        Enter the purchase order number you have raised for {totalLabel}. The walls go to print against it.
      </p>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <label className="block">
          <span className="caps text-[10px] text-mist">Purchase order number</span>
          <input value={poNumber} onChange={(e) => { setPoNumber(e.target.value); setErr(null); }}
            placeholder="PO/2026/0142" maxLength={60}
            className="mt-1 w-full rounded-[10px] border border-edge bg-surface px-3 py-2.5 text-sm" />
        </label>
        <label className="block">
          <span className="caps text-[10px] text-mist">Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Who is approving" maxLength={80}
            className="mt-1 w-full rounded-[10px] border border-edge bg-surface px-3 py-2.5 text-sm" />
        </label>
      </div>

      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      <button onClick={() => void approve()} disabled={busy}
        className="btn mt-4 h-12 w-full text-[0.85rem] disabled:opacity-40">
        {busy ? "Sending to print…" : `Approve & send to print — ${walls} wall${walls === 1 ? "" : "s"}`}
      </button>

      <p className="mt-2.5 text-center text-[11px] text-mist">
        This is a made-to-order print. Once approved it cannot be cancelled or changed.
      </p>
    </div>
  );
}
