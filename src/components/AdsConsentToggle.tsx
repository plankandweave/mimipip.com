"use client";

import { useEffect, useState } from "react";
import { ADS_CONSENT_LABEL } from "@/lib/ads-consent";

/**
 * The signed-in customer's own switch for ads personalisation (Customer Match).
 * DPDP s.6(4): withdrawing must be as easy as giving — so the same place that
 * shows the choice changes it, in one click, either way.
 */
export function AdsConsentToggle() {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/consent/ads")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { granted?: boolean } | null) => setGranted(d?.granted === true))
      .catch(() => setGranted(false));
  }, []);

  const change = async (next: boolean) => {
    setBusy(true);
    setFailed(false);
    const res = await fetch("/api/consent/ads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ granted: next, source: "account" }),
    }).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as { granted?: boolean } | null) : null;
    setBusy(false);
    if (body && typeof body.granted === "boolean") setGranted(body.granted);
    else setFailed(true);
  };

  return (
    <div className="mt-6 rounded-[18px] border border-edge p-5">
      <p className="font-display text-base font-semibold">Ads personalisation</p>
      <label className="mt-2 flex cursor-pointer items-start gap-2.5 text-xs text-slate">
        <input
          type="checkbox"
          checked={granted === true}
          disabled={granted === null || busy}
          onChange={(e) => change(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-charcoal"
        />
        <span>
          {ADS_CONSENT_LABEL}{" "}
          <a href="/privacy#personalised-ads" className="underline">How this works</a>
        </span>
      </label>
      {failed && <p className="mt-2 text-xs text-charcoal/80">Couldn&apos;t save that just now. Please try again.</p>}
    </div>
  );
}
