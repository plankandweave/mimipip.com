"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ONE tap: the "Yes, show me" button in the email is the yes (Roheena,
// 5 October 2026 — "you have to find a way to make it one-click").
//
// The yes is recorded by this script once the page is open on a real screen,
// never by the request for the page. That matters because mail security
// scanners open every link in a message before the person sees it, and a
// consent a scanner gave is no consent at all. So the script insists on:
//   - a real, non-automated browser (navigator.webdriver is false);
//   - the tab being visible, and still visible after a short dwell — a
//     prefetch or a background render never satisfies this;
//   - the request being made by this page, same origin (Sec-Fetch-Site:
//     same-origin, checked server side).
// Anything that fails those sees the manual button instead, which is also
// the fallback when the automatic save fails. The thank-you shows an Undo.
const DWELL_MS = 1200;

const post = (path: string, token: string) =>
  fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((b: { ok?: boolean } | null) => b?.ok === true)
    .catch(() => false);

export function YesButton({ token }: { token: string }) {
  const [state, setState] = useState<"confirming" | "manual" | "busy" | "done" | "undone" | "failed">("confirming");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Visible now AND still visible after the dwell: a background render or a
    // prefetch never reaches the request.
    const visibleAtStart = document.visibilityState === "visible";
    const t = setTimeout(async () => {
      const human = !navigator.webdriver && visibleAtStart && document.visibilityState === "visible";
      setState(human && (await post("/api/consent/ads/grant", token)) ? "done" : "manual");
    }, DWELL_MS);
    return () => clearTimeout(t);
  }, [token]);

  const agree = async () => {
    setState("busy");
    setState((await post("/api/consent/ads/grant", token)) ? "done" : "failed");
  };

  const undo = async () => {
    const ok = await fetch(`/api/consent/ads/withdraw?token=${encodeURIComponent(token)}`, { method: "POST" })
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) setState("undone");
  };

  if (state === "confirming") {
    return <p className="mt-8 text-slate">Confirming…</p>;
  }
  if (state === "done") {
    return (
      <div className="mt-8">
        <p className="text-lg text-charcoal">Thank you. You&apos;ll start to see our new designs within a few days.</p>
        <Link href="/new" className="btn mt-6 text-sm">See what&apos;s new</Link>
        <p className="mt-6 text-xs text-slate">
          Changed your mind?{" "}
          <button type="button" onClick={undo} className="underline">Undo</button>
        </p>
      </div>
    );
  }
  if (state === "undone") {
    return <p className="mt-8 text-charcoal">Done. We won&apos;t use your details for ads.</p>;
  }
  return (
    <div className="mt-8 flex flex-col items-center gap-4">
      <button type="button" onClick={agree} disabled={state === "busy"} className="btn w-full max-w-xs justify-center py-4 text-base">
        {state === "busy" ? "Saving…" : "Yes, show me"}
      </button>
      <Link href="/" className="text-xs text-slate underline">No, thank you</Link>
      {state === "failed" && (
        <p className="w-full text-xs text-charcoal/80">
          That link didn&apos;t work. Please sign in and use the switch on your account page instead.
        </p>
      )}
    </div>
  );
}
