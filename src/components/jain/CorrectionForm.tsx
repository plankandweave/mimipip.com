"use client";
import { useRef, useState } from "react";
export function CorrectionForm() {
  const id = useRef<string | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [receipt, setReceipt] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "busy") return;
    const data = Object.fromEntries(new FormData(e.currentTarget));
    id.current ??= crypto.randomUUID();
    setState("busy");
    try {
      const response = await fetch("/api/jain-correction", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, submissionId: id.current }) });
      const result = await response.json();
      if (!response.ok) throw new Error("save failed");
      setReceipt(result.reference); setState("done");
    } catch { setState("error"); }
  }
  const field = "mt-2 w-full rounded-xl border border-edge bg-surface px-4 py-3 text-base";
  if (state === "done") return <p role="status" className="mt-6 rounded-xl bg-sage/40 p-5">Thank you. Your suggestion has been saved for review. Reference: {receipt}.</p>;
  return <form onSubmit={submit} className="mt-6 grid gap-4 text-sm">
    <label>Your name<input name="name" autoComplete="name" maxLength={120} required className={field} /></label>
    <label>Email<input name="email" type="email" autoComplete="email" maxLength={254} required className={field} /></label>
    <label>Design name or page URL<input name="design" maxLength={300} className={field} placeholder="Optional — which artwork does this concern?" /></label>
    <label>Your correction or guidance<textarea name="message" rows={5} minLength={10} maxLength={4000} required className={field} /></label>
    <label>Supporting reference<input name="reference" maxLength={500} className={field} placeholder="Optional source, text or reference URL" /></label>
    <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
    <p className="text-xs text-slate">We use these details to review your suggestion and respond if needed.</p>
    {state === "error" && <p role="alert">We could not save your suggestion. Please try again; your text is still here.</p>}
    <button disabled={state === "busy"} className="btn min-h-12 justify-self-start px-6">{state === "busy" ? "Saving…" : "Submit correction"}</button>
  </form>;
}
