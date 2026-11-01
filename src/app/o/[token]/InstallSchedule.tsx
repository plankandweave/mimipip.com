"use client";
import { useEffect, useState } from "react";
import { formatIstDate } from "@/lib/ist";

// Customer-facing appointment confirmation. The installer proposes a date
// (order date + 7) and a time slot; the customer confirms it here — or picks a
// different slot — and it's booked. Both sides' timestamps are the audit trail.

type SlotOption = { value: string; label: string };
type Status = {
  ok: boolean; installerName?: string | null; installDate?: string | null;
  slot?: string | null; slotLabel?: string | null; slotProposed?: boolean; slotConfirmed?: boolean;
  slotOptions?: SlotOption[];
};

const fmtDate = (iso?: string | null) =>
  iso ? formatIstDate(iso, { weekday: "long", day: "numeric", month: "long" }) : "";

export default function InstallSchedule({ token }: { token: string }) {
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/install/${token}`, { cache: "no-store" }).then(r => r.json()).then(j => { if (live) setS(j); }).catch(() => {});
    return () => { live = false; };
  }, [token]);

  if (!s?.ok || !s.slotProposed) return null;
  const isConfirmed = s.slotConfirmed || confirmed !== null;
  const shownSlot = confirmed ?? s.slot ?? null;
  const shownLabel = confirmed ? (s.slotOptions?.find(o => o.value === confirmed)?.label ?? confirmed) : s.slotLabel;

  async function pick(slot: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/install/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slot }),
      });
      if (r.ok) setConfirmed(slot);
    } finally { setBusy(false); }
  }

  return (
    <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-stone-900">Your installation appointment</h2>
      <p className="mt-1 text-sm text-stone-500">
        {s.installerName ?? "Our installer"} will fit your wallpaper on <b>{fmtDate(s.installDate)}</b>.
      </p>
      {isConfirmed ? (
        <p className="mt-3 text-sm text-emerald-700 font-medium">Confirmed for {fmtDate(s.installDate)} at {shownLabel}. See you then!</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-stone-600">Pick the time that suits you — tap to confirm:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(s.slotOptions ?? []).map(o => (
              <button key={o.value} onClick={() => void pick(o.value)} disabled={busy}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${shownSlot === o.value ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-stone-200 text-stone-700"}`}>
                {o.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-stone-400">Tapping a time confirms your booking for that slot.</p>
        </>
      )}
    </section>
  );
}
