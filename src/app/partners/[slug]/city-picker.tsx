"use client";

import Image from "@/components/SiteImage";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TIER1_CITIES } from "@/lib/tier1-cities";

// The step after the code, on every sign-in to a portal held to the tier-1
// list (HomeLane). Orders from this sign-in can only be delivered in the city
// chosen here, so it is asked plainly and offers only the seven — there is no
// "Other" and nothing to type.
export default function CityPicker({
  accountName, logoPath, current, next,
}: {
  accountName: string;
  logoPath: string | null;
  /** The city already chosen, when the person came here to change it. */
  current: string | null;
  /** Where to go once a city is saved. A local path the server chose. */
  next: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function choose(city: string) {
    setErr(null);
    setBusy(city);
    try {
      const res = await fetch("/api/corporate/session/city", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Something went wrong.");
      router.push(next);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(null);
    }
  }

  return (
    <div className="container-x flex min-h-[80vh] items-center justify-center py-16">
      <div className="w-full max-w-[420px]">
        <div className="rounded-[22px] border border-edge bg-surface p-8 shadow-sm">
          <div className="flex items-center gap-3">
            {logoPath && (
              <Image src={logoPath} alt={accountName} width={44} height={44}
                className="rounded-[10px]" priority />
            )}
            <div>
              <p className="font-display text-lg font-extrabold leading-tight">{accountName}</p>
              <p className="text-xs text-slate">Wallpaper print portal</p>
            </div>
          </div>

          <h1 className="mt-7 font-display text-2xl font-extrabold">Choose your city</h1>
          <p className="mt-1.5 text-sm text-slate">
            Orders you place in this sign-in can only be delivered in the city you choose.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-2">
            {TIER1_CITIES.map(({ city }) => (
              <button key={city} type="button" disabled={busy !== null} onClick={() => choose(city)}
                aria-pressed={current === city}
                className={`rounded-[12px] border px-4 py-3 text-left text-sm font-semibold transition-colors disabled:opacity-50 ${
                  current === city ? "border-charcoal bg-wash" : "border-edge hover:border-charcoal"
                }`}>
                {busy === city ? "Saving…" : city}
              </button>
            ))}
          </div>

          {err && <p className="mt-4 text-sm text-red-600">{err}</p>}

          {current && (
            <button type="button" disabled={busy !== null} onClick={() => router.push(next)}
              className="mt-5 w-full text-center text-xs text-slate underline">
              Keep {current}
            </button>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-mist">
          Zyvorah · made-to-order wallpaper for {accountName}
        </p>
      </div>
    </div>
  );
}
