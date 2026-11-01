"use client";

import { useState } from "react";

/** Load Razorpay Checkout once — same as the mural checkout does. */
function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

type RazorpayInfo = { razorpayOrderId: string; keyId: string; amount: number };

/**
 * Accept the quotation — by paying, or by simply saying yes.
 *
 * The amount NEVER comes from this component: it is created server-side from
 * the OS's own figure, and the payment is only believed after the server has
 * checked Razorpay's signature. Nothing here can move production on its own.
 */
export default function QuoteActions({
  token, customerName, totalLabel,
}: { token: string; customerName: string | null; totalLabel: string }) {
  const [busy, setBusy] = useState<"pay" | "accept" | null>(null);
  const [done, setDone] = useState<"paid" | "accepted" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function payNow() {
    setBusy("pay"); setErr(null);
    try {
      const r = await fetch(`/api/quote/${token}/pay`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) {
        if (j.error === "already_accepted") { setDone("accepted"); return; }
        if (j.error === "payments_not_configured") { setErr("Online payment isn't available just now — tap “Accept the quotation” and we'll send you payment details."); return; }
        throw new Error(j.error ?? "Could not start the payment");
      }
      const rzp: RazorpayInfo = j.razorpay;
      if (!(await loadRazorpay())) { setErr("Couldn't load the payment window — please try again."); return; }
      const RZP = (window as unknown as { Razorpay: new (o: unknown) => { open: () => void } }).Razorpay;
      new RZP({
        key: rzp.keyId,
        order_id: rzp.razorpayOrderId,
        amount: rzp.amount,
        currency: "INR",
        name: "Zyvorah",
        description: "Made-to-order wallpaper",
        prefill: customerName ? { name: customerName } : undefined,
        theme: { color: "#1a1a1a" },
        handler: async (resp: Record<string, string>) => {
          const v = await fetch(`/api/quote/${token}/pay?verify=1`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(resp),
          });
          const vj = await v.json().catch(() => ({}));
          if (v.ok) { setDone("paid"); if (vj.warning) setNote(vj.warning); }
          else setErr("We couldn't confirm your payment. If money was deducted, email hello@zyvorah.com and we'll sort it out today.");
        },
        modal: { ondismiss: () => setErr("Payment wasn't completed — your quotation is still here whenever you're ready.") },
      }).open();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start the payment");
    } finally { setBusy(null); }
  }

  async function acceptOnly() {
    setBusy("accept"); setErr(null);
    try {
      const r = await fetch(`/api/quote/${token}/accept`, { method: "POST" });
      if (!r.ok) throw new Error("Could not record your acceptance");
      setDone("accepted");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not record your acceptance");
    } finally { setBusy(null); }
  }

  if (done) {
    return (
      <div className="rounded-[18px] border border-edge bg-wash p-6 text-center">
        <p className="font-display text-lg font-bold">
          {done === "paid" ? "Thank you — payment received" : "Thank you — that's confirmed"}
        </p>
        <p className="mt-1.5 text-sm text-slate">
          {note ?? (done === "paid"
            ? "Your walls are now in production. We'll email you as each one is printed and on its way."
            : "We'll be in touch with payment details, and your walls go into production as soon as that's settled.")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button onClick={() => void payNow()} disabled={busy !== null}
        className="btn h-12 w-full text-[0.85rem] disabled:opacity-40">
        {busy === "pay" ? "Opening payment…" : `Accept & pay ${totalLabel}`}
      </button>
      <button onClick={() => void acceptOnly()} disabled={busy !== null}
        className="h-11 w-full rounded-full border border-edge text-[0.8rem] font-semibold text-slate hover:text-charcoal disabled:opacity-40">
        {busy === "accept" ? "Recording…" : "Accept the quotation, pay later"}
      </button>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <p className="text-center text-[11px] text-mist">
        Nothing is printed until you accept. Prices include GST.
      </p>
    </div>
  );
}
