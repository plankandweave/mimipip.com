import { serviceFetch } from '@/brand/service-transport';
const fetch: typeof globalThis.fetch = (input, init) => serviceFetch('os', input, init);
// Install details for an order, read from the Magnitude Group OS at the moment
// an email is composed. The OS owns the installer roster and both OTPs; this
// app deliberately keeps NO copy — an OTP is a work-authorisation secret, so it
// is fetched, rendered into the one email, and never written to our database.
//
// Contract: GET {OS_BASE}/api/zyvorah/o/{access_token}/install-brief with the
// shared x-zyvorah-token secret — the SAME token os-sync.ts already uses. It
// returns the fitter (installerName, installerPhone) and the START code
// (startOtp), minting the code on first ask and returning it unchanged
// thereafter, so the code we put in the dispatch email keeps working.
//
// It is deliberately NOT the public /install route the order page uses: the
// installer's own app holds that same pageToken, and the START code only proves
// he physically reached the customer for as long as he cannot see it himself.
//
// The FINISH/closure code is never fetched here. It is issued by the OS only
// when the installer marks the job complete — that is the customer's
// satisfaction gate, and it releases his payment.
//
// Everything is optional: if the OS is unreachable or hasn't assigned anyone
// yet, the emails simply drop those lines and still explain what to expect. An
// email must never fail because the OS is down.

const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");
const TOKEN = process.env.ZYVORAH_WEBHOOK_TOKEN ?? "";

export type InstallBrief = {
  installerName?: string | null;
  installerPhone?: string | null;
  startOtp?: string | null;
};

export async function fetchInstallBrief(accessToken: string | null | undefined): Promise<InstallBrief | null> {
  if (!accessToken || !TOKEN) return null;
  try {
    const r = await fetch(`${OS_BASE}/api/zyvorah/o/${encodeURIComponent(accessToken)}/install-brief`, {
      cache: "no-store",
      headers: { "x-zyvorah-token": TOKEN },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as InstallBrief & { ok?: boolean };
    if (j?.ok === false) return null;
    return {
      installerName: j.installerName ?? null,
      installerPhone: j.installerPhone ?? null,
      startOtp: j.startOtp ?? null,
    };
  } catch {
    return null; // never block an email on the OS
  }
}
