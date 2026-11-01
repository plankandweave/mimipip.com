"use client";
import { useAuthGate } from "@/components/AuthGate";
import { useState } from "react";
export function ShikhaVerify() {
  const { signedIn, promptAuth, authModal } = useAuthGate();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  async function submit() {
    if (!signedIn) { promptAuth("verify your order email for WhatsApp support"); return; }
    setBusy(true);setMessage("");
    try {
      const r = await fetch("/api/customer-service/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: code.trim().toLowerCase(), action: phone ? "verify" : "inspect" }) });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      if (result.phone) {setPhone(result.phone);return;}
      setVerified(true); setCode(""); setMessage("Verified. Return to your Zyvorah WhatsApp conversation and send your order number.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Verification failed."); }
    finally { setBusy(false); }
  }
  return <section className="mx-auto max-w-lg px-5 py-16"><h1 className="font-display text-3xl">Verify your order email</h1><p className="my-5">Sign in with the email used for your order, then enter the verification code Shikha sent in WhatsApp.</p>
    {!verified && <form onSubmit={e=>{e.preventDefault();void submit();}}>
      <label htmlFor="verification-code" className="text-sm">WhatsApp verification code</label>
      <input id="verification-code" autoComplete="off" value={code} disabled={!!phone} maxLength={16} onChange={e=>setCode(e.target.value)} className="mb-5 mt-2 block w-full rounded border p-3" />
      {phone && <p className="mb-5">Connect order access to WhatsApp <strong>+{phone}</strong> for one hour? Continue only if this is your number and you requested support.</p>}
      <button disabled={busy || code.trim().length!==16} className="rounded-full bg-charcoal px-6 py-3 text-white">{busy ? "Checking…" : phone ? "Confirm my number and connect" : "Check code"}</button>
      {phone && <button type="button" className="ml-4 underline" onClick={()=>{setPhone(null);setCode("");}}>Cancel</button>}
    </form>}
    <p role="status" className="mt-5">{message}</p>{authModal}</section>;
}
