"use client";

import { useState } from "react";

/** Copies one bank detail; says so, and says so again if the browser refused. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      className="rounded-full border border-edge px-3 py-1 text-xs text-slate hover:text-charcoal"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState("copied");
        } catch {
          setState("failed");
        }
        setTimeout(() => setState("idle"), 2000);
      }}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : "Copy"}
    </button>
  );
}
