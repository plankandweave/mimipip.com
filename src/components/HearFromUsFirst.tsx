"use client";
import { useState } from "react";
import Link from "next/link";

/** The email sign-up: no pop-up, nothing about a child, and a box the visitor ticks themselves. */
export function HearFromUsFirst({ source, heading = true }: { source: "home" | "footer"; heading?: boolean }) {
  const [email, setEmail] = useState("");
  const [agree, setAgree] = useState(false);
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [problem, setProblem] = useState("");
  if (state === "done") return <p role="status" className="font-semibold">Thank you — your signup is saved.</p>;
  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (state === "busy") return;
    setState("busy"); setProblem("");
    try {
      const r = await fetch("/api/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, agree, source, website }) });
      if (r.ok) { setState("done"); return; }
      setProblem((await r.json()).error || "Please try again in a moment.");
    } catch { setProblem("Please try again in a moment."); }
    setState("idle");
  }
  const id = "signup-" + source;
  return (
    <form onSubmit={join} className="grid max-w-xl gap-3">
      {heading && <h2 className="text-2xl lg:text-3xl">Hear from us first</h2>}
      <p>Discover new wallpapers, floor games and ideas for playful rooms. Sign up for MimiPip news.</p>
      <label className="grid gap-1" htmlFor={id}>Your email
        <input id={id} className="w-full rounded-lg border bg-white p-2" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
      </label>
      {/* Hidden from people; only a form-filling robot completes it. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0" value={website} onChange={e => setWebsite(e.target.value)} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" required className="mt-1" checked={agree} onChange={e => setAgree(e.target.checked)} />
        <span>I agree to emails from MimiPip about new designs and launches. I can leave at any time. <Link className="underline" href="/guides/privacy">Privacy</Link></span>
      </label>
      <button className="btn btn-primary justify-self-start" disabled={state === "busy"}>{state === "busy" ? "Signing you up…" : "Sign up"}</button>
      <p role="status" className="text-sm">{problem}</p>
    </form>
  );
}
