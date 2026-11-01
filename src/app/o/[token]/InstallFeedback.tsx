"use client";
import { useEffect, useState } from "react";

// Customer-account installation feedback (the preferred path over the
// installer's phone). Appears only once the job is marked installed and no
// feedback has been given. A hard "happy" here is what releases the installer's
// bill on the OS.

type Consent = { site: boolean; social: boolean; at?: string | null };
type Status = { ok: boolean; installed?: boolean; feedbackGiven?: boolean; happy?: boolean | null; consent?: Consent | null; canSharePhoto?: boolean };

export default function InstallFeedback({ token }: { token: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | boolean>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/install/${token}`, { cache: "no-store" })
      .then(r => r.json()).then(j => { if (live) setStatus(j); }).catch(() => {});
    return () => { live = false; };
  }, [token]);

  if (!status?.ok || !status.installed) return null;
  const already = status.feedbackGiven || done !== null;
  // Only a customer who has THEMSELVES confirmed they're happy is asked about
  // their photo. `happy` in the status can also be set from the installer's
  // app, so on load we trust the OS's canSharePhoto (customer-confirmed), and
  // within this visit, the customer's own "happy" tap.
  const happy = done === true || (done === null && status.canSharePhoto === true);

  async function send(happy: boolean) {
    setBusy(true);
    try {
      const r = await fetch(`/api/install/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ happy }),
      });
      if (r.ok) setDone(happy);
    } finally { setBusy(false); }
  }

  return (
    <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-stone-900">How was your installation?</h2>
      {already ? (
        <>
          <p className="mt-2 text-sm text-emerald-700">Thank you — your feedback is recorded.</p>
          {happy && <PhotoConsent token={token} initial={status.consent ?? null} />}
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-stone-500">Your wallpaper has been installed. Let us know you&apos;re happy with the work.</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => void send(true)} disabled={busy}
              className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Happy — thank you
            </button>
            <button onClick={() => void send(false)} disabled={busy}
              className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-600 disabled:opacity-50">
              Not quite
            </button>
          </div>
        </>
      )}
    </section>
  );
}

// The customer's say over a photo of their finished wall. Both boxes start
// unticked; nothing is shared unless they tick and save. The OS holds the
// consent record and Roheena approves every photo before it is published;
// "Stop showing my wall" withdraws it everywhere (the OS takes it down).
function PhotoConsent({ token, initial }: { token: string; initial: Consent | null }) {
  const [saved, setSaved] = useState<Consent | null>(initial);
  const [site, setSite] = useState(false);
  const [social, setSocial] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(next: { site: boolean; social: boolean }) {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch(`/api/install/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: { site: next.site, social: next.site && next.social } }),
      });
      if (r.ok) {
        setSaved({ site: next.site, social: next.site && next.social, at: new Date().toISOString() });
        setSite(false);
        setSocial(false);
        setMessage(next.site ? "Saved — thank you." : "Done — we'll stop showing your wall.");
      } else if (r.status === 404 || r.status === 409) {
        setMessage("Available once your wall is installed and you've told us it's done.");
      } else {
        setMessage("We couldn't save that just now — please try again.");
      }
    } catch {
      setMessage("We couldn't save that just now — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const smallPrint = (
    <p className="mt-2 text-xs text-stone-500">
      We only use the photo of your finished wall, never your name or address — just your city and the month.
      You can change your mind here any time.
    </p>
  );

  return (
    <div className="mt-4 border-t border-stone-100 pt-4">
      <h3 className="text-sm font-semibold text-stone-900">Share your finished wall?</h3>
      {saved?.site ? (
        <>
          <p className="mt-1 text-sm text-stone-600">
            {saved.social
              ? "You're happy for us to show your finished wall on zyvorah.com and on Zyvorah's social pages."
              : "You're happy for us to show your finished wall on zyvorah.com."}
          </p>
          <button onClick={() => void save({ site: false, social: false })} disabled={busy}
            className="mt-3 rounded-xl border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-700 disabled:opacity-50">
            Stop showing my wall
          </button>
          {smallPrint}
        </>
      ) : (
        <>
          <label className="mt-2 flex items-start gap-2 text-sm text-stone-700">
            <input type="checkbox" className="mt-0.5" checked={site} disabled={busy}
              onChange={(e) => { setSite(e.target.checked); if (!e.target.checked) setSocial(false); }} />
            <span>Show my finished wall on zyvorah.com</span>
          </label>
          <label className={`mt-2 flex items-start gap-2 text-sm ${site ? "text-stone-700" : "text-stone-400"}`}>
            <input type="checkbox" className="mt-0.5" checked={social} disabled={busy || !site}
              onChange={(e) => setSocial(e.target.checked)} />
            <span>…and on Zyvorah&apos;s Instagram, YouTube and other social pages</span>
          </label>
          {smallPrint}
          <button onClick={() => void save({ site, social })} disabled={busy || !site}
            className="mt-3 rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            Save
          </button>
        </>
      )}
      {message && <p className="mt-2 text-sm text-stone-600" role="status">{message}</p>}
    </div>
  );
}
