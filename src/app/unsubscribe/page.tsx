"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

/** A mail's link carries a key and still asks for one press, so a mail scanner opening the link leaves nobody off the list. */
export default function Unsubscribe() {
  const [ready, setReady] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState("");
  useEffect(() => { setKey(new URLSearchParams(window.location.search).get("key")); setReady(true); }, []);
  async function leave(e: React.FormEvent) {
    e.preventDefault();
    setProblem("");
    try {
      const r = await fetch("/api/signup/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(key ? { key } : { email }) });
      if (r.ok) { setDone(true); return; }
      setProblem((await r.json()).error || "Please try again in a moment.");
    } catch { setProblem("Please try again in a moment."); }
  }
  return (
    <main className="container-x max-w-xl py-16">
      <h1 className="text-3xl">Leave our email list</h1>
      {done ? <p role="status" className="my-4">Done. You will not hear from us again unless you sign up. <Link className="underline" href="/">Back to MimiPip</Link></p> : (
        <form onSubmit={leave} className="my-6 grid gap-3">
          {!key && <label className="grid gap-1">Your email
            <input className="w-full rounded-lg border bg-white p-2" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
          </label>}
          <button disabled={!ready} className="btn btn-primary justify-self-start">Stop emails</button>
          <p role="status" className="text-sm">{problem}</p>
        </form>
      )}
    </main>
  );
}
