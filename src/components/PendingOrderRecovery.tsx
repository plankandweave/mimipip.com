"use client";
import { useEffect, useState } from "react";

/** Only shown when the open cart is empty; the HTTP-only cart token proves ownership. */
export function PendingOrderRecovery() {
  const [state, setState] = useState<{ path: string | null; status: "loading" | "ready" | "error" }>({ path: null, status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/checkout", { cache: "no-store", signal: controller.signal })
      .then(async res => {
        if (!res.ok) throw new Error("unavailable");
        const data = await res.json();
        if (!controller.signal.aborted) setState({ status: "ready", path: typeof data.resumePath === "string" && /^\/order\/[^/]+$/.test(data.resumePath) ? data.resumePath : null });
      }).catch(() => { if (!controller.signal.aborted) setState({ path: null, status: "error" }); });
    return () => controller.abort();
  }, []);
  if (state.status === "loading") return <p className="text-sm text-slate" role="status">Checking for an unfinished order…</p>;
  if (state.status === "error") return <p className="text-sm text-slate" role="status">We couldn’t check your unfinished order. Refresh to try again.</p>;
  if (!state.path) return <p className="text-sm text-slate">Your cart is empty.</p>;
  return <div className="mx-auto max-w-md rounded-2xl border border-edge p-5">
    <h2 className="text-xl font-semibold">Your order is saved</h2>
    <p className="mt-3 text-sm text-slate">Payment wasn’t completed. Review your order and continue securely without adding your items again.</p>
    <a href={state.path} className="btn mt-5 inline-flex min-h-11 items-center px-6 text-sm">Review order &amp; resume payment</a>
  </div>;
}
