"use client";

import { SubscribeDisclosure } from "@/components/SubscribeDisclosure";
import { useState } from "react";
import { conversionSignUp } from "@/lib/conversions";

export function NewsletterForm() {
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
        body: JSON.stringify({ type: "newsletter", email: email.trim(), source: "footer" }),
      });
      setState(res.ok ? "done" : "error");
      if (res.ok) {
        conversionSignUp({ method: "newsletter", user: { email: email.trim() } });
      }
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <p className="mt-6 max-w-xs rounded-full bg-sage/50 px-5 py-3 text-sm text-charcoal">
        Thanks — you&apos;re on the list. ✦
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 max-w-xs">
      <div className="flex items-center overflow-hidden rounded-full border border-edge bg-surface">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === "error") setState("idle");
          }}
          placeholder="Email for our weekly letter"
          className="h-12 flex-1 bg-transparent px-5 text-sm outline-none placeholder:text-mist"
        />
        <button
          type="submit"
          disabled={state === "busy"}
          className="mr-1.5 rounded-full bg-charcoal px-5 py-2 text-[0.72rem] font-semibold text-surface disabled:opacity-50"
        >
          {state === "busy" ? "…" : "Join"}
        </button>
      </div>
      {state === "error" && (
        <p className="mt-2 pl-2 text-xs text-charcoal/70">Please enter a valid email and try again.</p>
      )}
      <SubscribeDisclosure className="pl-2" />
    </form>
  );
}
