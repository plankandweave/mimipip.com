"use client";

import { useEffect } from "react";
import Link from "next/link";

// A chunk load failure is not a bug in the page — it is a tab that was opened
// before a deploy asking for a hashed JS file the new deploy has replaced.
// Every deploy triggers it for anyone with the site already open, and it lands
// here as a blank "something went wrong" even though one reload fixes it.
const CHUNK_ERROR =
  /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;
// A timestamp, not a flag: we recover by reloading, but if the chunk is
// genuinely gone (not just stale) the reload would error again, so we only
// auto-reload when we have not already done so in the last few seconds. One
// self-heal, never a loop.
const RELOAD_AT = "zyv:chunk-reload-at";
const RELOAD_COOLDOWN_MS = 10_000;

/**
 * Route error boundary — so an unexpected client error (a bad upload, a flaky
 * response) shows a calm recovery screen instead of a completely blank page.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("App error:", error);

    const isChunk = error?.name === "ChunkLoadError" || CHUNK_ERROR.test(error?.message ?? "");
    if (!isChunk) return;
    let last = 0;
    try { last = Number(sessionStorage.getItem(RELOAD_AT)) || 0; } catch { /* storage blocked */ }
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return; // already tried — don't loop
    try { sessionStorage.setItem(RELOAD_AT, String(Date.now())); } catch { /* storage blocked */ }
    window.location.reload();
  }, [error]);

  return (
    <div className="container-x flex min-h-[60vh] flex-col items-center justify-center gap-5 py-20 text-center">
      <h1 className="text-2xl font-semibold text-charcoal">Something went wrong on our end.</h1>
      <p className="max-w-md text-slate">
        Sorry about that — please try again. If it keeps happening, email{" "}
        <a href="mailto:hello@zyvorah.com" className="underline underline-offset-2 hover:text-charcoal">hello@zyvorah.com</a>.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button onClick={reset} className="btn">Try again</button>
        <Link href="/" className="btn btn-ghost">Back to home</Link>
      </div>
    </div>
  );
}
