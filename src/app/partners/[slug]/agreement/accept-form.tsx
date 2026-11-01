"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isValidGstin } from "@/lib/gst";

// The acceptance block under the agreement text. The form IS the signature
// (clause 15): the name typed here, the business it binds, and the tick are
// what /api/corporate/agreement/accept records permanently. Non-admins see
// the document but no pen — the server refuses them too; this is a courtesy,
// not the control.
export default function AgreementAcceptForm({
  slug, canAccept, defaultSignatory, defaultBusiness, signatoryEmail,
}: {
  slug: string;
  canAccept: boolean;
  defaultSignatory: string;
  defaultBusiness: string;
  signatoryEmail: string;
}) {
  const router = useRouter();
  const [signatoryName, setSignatoryName] = useState(defaultSignatory);
  const [businessName, setBusinessName] = useState(defaultBusiness);
  const [gstin, setGstin] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!canAccept) {
    return (
      <div className="mt-10 rounded-[16px] border border-edge bg-wash px-5 py-4 text-sm text-slate">
        Only your account admin can accept this agreement on behalf of the business.
        Ask them to sign in at this page — once they have accepted, the portal opens
        for everyone on the account.
      </div>
    );
  }

  const gstinTrimmed = gstin.trim();
  const gstinOk = !gstinTrimmed || isValidGstin(gstinTrimmed);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!gstinOk) { setErr("That GSTIN doesn't look right — leave it blank to add later."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/corporate/agreement/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signatoryName: signatoryName.trim(),
          businessName: businessName.trim(),
          gstin: gstinTrimmed || undefined,
          accepted,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Something went wrong.");
      router.push(`/partners/${slug}/orders`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const field = "w-full rounded-[12px] border border-edge bg-wash px-4 py-3 text-sm outline-none focus:border-charcoal";

  return (
    <form onSubmit={submit} className="mt-10 rounded-[16px] border border-edge bg-wash p-6">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-mist">Acceptance</h3>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate">Your name (the signatory)</span>
          <input required value={signatoryName} onChange={(e) => setSignatoryName(e.target.value)}
            autoComplete="name" className={`mt-1.5 ${field}`} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate">Business name (who this binds)</span>
          <input required value={businessName} onChange={(e) => setBusinessName(e.target.value)}
            autoComplete="organization" className={`mt-1.5 ${field}`} />
        </label>
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-medium text-slate">GSTIN <span className="text-mist">(optional — you can add it later)</span></span>
        <input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())}
          placeholder="27AAAAA0000A1Z5" maxLength={15} spellCheck={false}
          className={`mt-1.5 ${field} font-mono tracking-wide`} />
        {!gstinOk && (
          <span className="mt-1 block text-xs text-alert">15 characters, e.g. 27AAAAA0000A1Z5 — or leave blank.</span>
        )}
      </label>

      <p className="mt-3 text-xs text-mist">
        Signing as {signatoryEmail} — this email is recorded on the acceptance.
      </p>

      <label className="mt-4 flex items-start gap-3 text-sm text-charcoal">
        <input type="checkbox" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-charcoal" />
        <span>I am authorised to bind this business and accept these terms.</span>
      </label>

      {err && <p className="mt-3 text-sm text-alert">{err}</p>}

      <button type="submit" disabled={busy || !accepted}
        className="btn mt-5 h-12 w-full text-[0.85rem] disabled:opacity-50">
        {busy ? "Recording your acceptance…" : "Accept and enter the portal"}
      </button>
    </form>
  );
}
