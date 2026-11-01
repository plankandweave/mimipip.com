"use client";

import { useState } from "react";

const REASON_MSG: Record<string, string> = {
  in_production: "This order has already started printing, so it can no longer be cancelled.",
  at_printer: "This order is already in production, so it can no longer be cancelled.",
  window_closed: "The 12-hour cancellation window has passed, so this order can no longer be cancelled.",
  not_found: "We couldn't find this order.",
  error: "Something went wrong — please email hello@zyvorah.com.",
};

export function CancelOrderButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  const cancel = async () => {
    if (state === "busy") return;
    if (!confirm("Cancel this order? If it was paid, your refund will be processed automatically.")) return;
    setState("busy");
    try {
      const res = await fetch("/api/order/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await res.json();
      if (d.ok) {
        setState("done");
        setMsg("Your order has been cancelled. If it was paid, your refund is on its way.");
      } else {
        setState("error");
        setMsg(REASON_MSG[d.reason] ?? "This order can no longer be cancelled.");
      }
    } catch {
      setState("error");
      setMsg("Couldn't reach the server — please try again.");
    }
  };

  if (state === "done") {
    return <p className="rounded-[12px] bg-sage/50 px-4 py-3 text-sm text-charcoal">{msg}</p>;
  }

  return (
    <div>
      <button
        onClick={cancel}
        disabled={state === "busy"}
        className="btn btn-ghost text-sm disabled:opacity-50"
      >
        {state === "busy" ? "Cancelling…" : "Cancel this order"}
      </button>
      {state === "error" && msg && <p className="mt-2 text-xs text-charcoal/80">{msg}</p>}
    </div>
  );
}
