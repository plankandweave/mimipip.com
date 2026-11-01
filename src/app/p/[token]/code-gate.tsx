"use client";

import { useState } from "react";

// The real gate, used when a presentation has require_code on.
//
// The code goes to the address the deck was ADDRESSED to, never to one typed
// here — that is the whole difference from the box on the original Outcreate
// page, where any string opened the document. Forwarding the link does not
// forward the inbox.

export function CodeGate({
  token, email, title,
}: {
  token: string;
  email: string;
  title: string;
}) {
  const [stage, setStage] = useState<"start" | "code">("start");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Shown as r••••a@ltimindtree.com: enough for the right person to recognise
  // their own address, not enough to harvest it from a leaked link.
  const masked = (() => {
    const [user, domain] = email.split("@");
    if (!domain) return email;
    const head = user.slice(0, 1);
    const tail = user.length > 1 ? user.slice(-1) : "";
    return `${head}${"•".repeat(Math.max(1, user.length - 2))}${tail}@${domain}`;
  })();

  const request = async () => {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/p/${token}/code`, { method: "POST" });
    setBusy(false);
    if (res.ok) setStage("code");
    else setErr("Couldn't send the code just now. Try again in a moment.");
  };

  const verify = async () => {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/p/${token}/code`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setBusy(false);
    if (res.ok) window.location.reload();
    else setErr("That code didn't match, or it has expired.");
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[#FAFAF8] px-6">
      <div className="w-full max-w-[420px]">
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[#6B5D4F]">
          Zyvorah for Workplaces
        </span>
        <h1 className="mt-5 text-2xl font-semibold text-[#2D2D2D]">{title}</h1>

        {stage === "start" ? (
          <>
            <p className="mt-3 text-sm leading-relaxed text-[#6B6B6B]">
              This proposal was prepared for one person. We&apos;ll email a code to{" "}
              <strong className="text-[#2D2D2D]">{masked}</strong> to open it.
            </p>
            <button
              onClick={request}
              disabled={busy}
              className="mt-6 w-full rounded-[3px] bg-[#2D2D2D] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Sending…" : "Email me the code"}
            </button>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-[#6B6B6B]">
              We&apos;ve sent a six-digit code to {masked}. It expires in fifteen minutes.
            </p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && code.length === 6 && verify()}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="mt-6 w-full rounded-[3px] border border-[#E0E0E0] bg-white px-4 py-3 text-center text-lg tracking-[0.3em] outline-none focus:border-[#8C7B6B]"
            />
            <button
              onClick={verify}
              disabled={busy || code.length !== 6}
              className="mt-3 w-full rounded-[3px] bg-[#2D2D2D] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Checking…" : "Open the proposal"}
            </button>
          </>
        )}

        {err && <p className="mt-3 text-xs text-[#6B5D4F]">{err}</p>}
      </div>
    </div>
  );
}
