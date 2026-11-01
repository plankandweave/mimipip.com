"use client";

import { useState } from "react";
import { SubscribeDisclosure } from "@/components/SubscribeDisclosure";
import { conversionSignUp } from "@/lib/conversions";

/** The store's own newsletter list, tagged `lorange-kids` so the brand's first
 *  collection can be announced to exactly the parents who asked for it. */
export function LorangeSignup() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "busy" || state === "done") return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setState("error");
      return;
    }
    setState("busy");
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "newsletter", email: email.trim(), source: "lorange-kids" }),
      });
      setState(res.ok ? "done" : "error");
      if (res.ok) conversionSignUp({ method: "newsletter", user: { email: email.trim() } });
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return <p className="mt-6 text-[0.95rem] text-[color:var(--rust-dark)]">Thank you — we’ll write when the first collection arrives.</p>;
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-6 max-w-md">
      <div className="flex items-center overflow-hidden rounded-full border border-[color:var(--line)] bg-[#fffdf8]">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === "error") setState("idle");
          }}
          aria-label="Email address"
          placeholder="Your email"
          className="h-12 flex-1 bg-transparent px-5 text-sm outline-none"
        />
        <button type="submit" disabled={state === "busy"} className="lorange-btn mr-1.5 min-h-0 py-2 disabled:opacity-50">
          {state === "busy" ? "…" : "Tell me"}
        </button>
      </div>
      {state === "error" && <p className="mt-2 text-xs text-[color:var(--muted)]">Please enter a valid email and try again.</p>}
      <SubscribeDisclosure className="text-center" />
    </form>
  );
}
