"use client";
import { withServicePage } from "@/brand/service-page";

import { SubscribeDisclosure } from "@/components/SubscribeDisclosure";
import { useState } from "react";
import { formatINR } from "@/lib/pricing";
import { GIFT_DESIGNS } from "@/lib/gift-card-designs";
import { useMarket } from "@/components/MarketProvider";
import Link from "next/link";

const PRESETS = [1000, 2000, 5000, 10000];
type RazorpayInfo = { razorpayOrderId: string; keyId: string; amount: number };

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

function GiftCardPage() {
  const { market, ready } = useMarket();
  const [amount, setAmount] = useState(2000);
  const [custom, setCustom] = useState("");
  const [design, setDesign] = useState("birthday");
  const [f, setF] = useState({ purchaserName: "", purchaserEmail: "", recipientName: "", recipientEmail: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ code: string | null; pending: boolean } | null>(null);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const value = custom ? Math.min(50000, Math.max(0, Math.floor(Number(custom) || 0))) : amount;
  // Preview via the same image route the email uses — so what's previewed is
  // exactly what's delivered (same font, layout and brand alignment).
  const cardUrl = (dgn: string, to?: string) =>
    `/api/gift-card/image?design=${encodeURIComponent(dgn)}&amount=${encodeURIComponent(formatINR(value))}` +
    (to?.trim() ? `&to=${encodeURIComponent(to.trim())}` : "");
  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const valid =
    value >= 500 &&
    validEmail.test(f.purchaserEmail) &&
    (!f.recipientEmail || validEmail.test(f.recipientEmail));

  const buy = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/gift-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value, design, ...f }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError("Something went wrong — please try again.");
        return;
      }
      const rzp: RazorpayInfo | null = data.razorpay ?? null;
      if (rzp) {
        const ready = await loadRazorpay();
        if (!ready) {
          setError("Couldn't load the payment window — please try again.");
          return;
        }
        const RZP = (window as unknown as { Razorpay: new (o: unknown) => { open: () => void } }).Razorpay;
        const rp = new RZP({
          key: rzp.keyId,
          order_id: rzp.razorpayOrderId,
          amount: rzp.amount,
          currency: "INR",
          name: "Zyvorah",
          description: `Gift card · ${formatINR(value)}`,
          prefill: { name: f.purchaserName, email: f.purchaserEmail },
          theme: { color: "#1a1a1a" },
          handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            const v = await fetch("/api/gift-card/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(resp),
            });
            const vd = await v.json();
            if (v.ok) setDone({ code: vd.code ?? null, pending: false });
            else setError("We couldn't confirm your payment. If money was deducted, email hello@zyvorah.com.");
          },
          modal: { ondismiss: () => setError("Payment wasn't completed. Your gift card is saved as pending.") },
        });
        rp.open();
        return;
      }
      // No gateway configured — captured as pending.
      setDone({ code: null, pending: true });
    } catch {
      setError("Couldn't reach the store just now — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const field = "h-12 w-full rounded-[14px] border border-edge bg-surface px-4 outline-none focus:border-charcoal";

  if (done) {
    return (
      <div className="container-x py-16">
        <div className="mx-auto max-w-lg text-center">
          <div className="mb-8 overflow-hidden rounded-[18px] shadow-xl ring-1 ring-edge">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cardUrl(design, f.recipientName)}
              alt="Your gift card"
              className="block w-full"
            />
          </div>
          <h1 className="font-display text-2xl font-bold">Gift card {done.pending ? "reserved" : "purchased"} ✦</h1>
          {done.pending ? (
            <p className="mt-3 text-sm text-slate">
              Your gift card is saved. We&apos;ll email a secure payment link, and the code once it&apos;s paid.
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm text-slate">
                {f.recipientEmail && f.recipientEmail.trim().toLowerCase() !== f.purchaserEmail.trim().toLowerCase()
                  ? `Payment received. We've emailed the gift code straight to ${f.recipientEmail}.`
                  : "Payment received. We've emailed you the gift code — here it is too:"}
              </p>
              {done.code && (
                <p className="mt-4 inline-block rounded-[14px] bg-wash px-6 py-4 font-display text-2xl font-extrabold tracking-wider">
                  {done.code}
                </p>
              )}
              <p className="mt-4 text-xs text-mist">Redeemable at checkout, across every design. Keep it safe.</p>
            </>
          )}
        </div>
      </div>
    );
  }


  // Gift cards are issued and redeemed in rupees: the value, the Razorpay
  // charge and the cart they are spent in are all INR. Selling one for dollars
  // would hand an overseas buyer a balance that shifts against them between
  // purchase and redemption, so the offer is India-only until it is priced
  // properly in each market. Held until `ready` so the India shopper — who is
  // most of this page's traffic — never sees it flicker closed and open.
  if (ready && market.countryCode !== "IN") {
    return (
      <div className="container-x py-16">
        <div className="mx-auto max-w-lg text-center">
          <h1 className="text-[clamp(1.8rem,3.4vw,2.4rem)] leading-tight">Gift cards</h1>
          <p className="mt-4 text-slate">
            Zyvorah gift cards are issued in Indian Rupees and can be redeemed only on orders
            delivered within India, so we cannot sell one for delivery to {market.countryName} yet.
          </p>
          <p className="mt-3 text-slate">
            Every design ships worldwide with international delivery included in the price —
            browse the collections, or tell us what you have in mind and we will help.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/collections" className="btn">Shop the collections</Link>
            <Link href="/contact" className="btn btn-ghost">Talk to us</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mx-4 mt-4 rounded-[32px] bg-peach/40 lg:mx-6">
        <div className="container-x py-14 text-center">
          <span className="caps text-slate">Gift card</span>
          <h1 className="mt-3 text-[clamp(2.2rem,4.5vw,3.4rem)] leading-tight">Give the gift of a beautiful wall</h1>
          <p className="mx-auto mt-4 max-w-xl text-slate">
            A Zyvorah gift card is redeemable at checkout across every design — ready to make your own.
          </p>
        </div>
      </div>

      <section className="container-x py-14">
        <div className="mx-auto max-w-lg">
          {/* live preview of the card that will be sent */}
          <div className="mb-8 overflow-hidden rounded-[18px] shadow-xl ring-1 ring-edge">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cardUrl(design, f.recipientName)}
              alt="Your gift card"
              className="block w-full"
            />
          </div>

          <p className="caps mb-3 text-slate">Amount</p>
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((a) => (
              <button
                key={a}
                onClick={() => { setAmount(a); setCustom(""); }}
                className={`rounded-[12px] border-2 py-3 text-sm font-semibold transition-colors ${
                  !custom && amount === a ? "border-charcoal bg-surface" : "border-edge bg-surface hover:border-slate"
                }`}
              >
                {formatINR(a)}
              </button>
            ))}
          </div>
          <input
            className={`${field} mt-3`}
            inputMode="numeric"
            placeholder="Custom amount (₹500–₹50,000)"
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))}
          />

          <p className="caps mb-3 mt-6 text-slate">Choose a card</p>
          <div className="grid grid-cols-3 gap-2.5">
            {GIFT_DESIGNS.map((dg) => (
              <button
                key={dg.id}
                type="button"
                onClick={() => setDesign(dg.id)}
                aria-pressed={design === dg.id}
                className={`overflow-hidden rounded-[10px] border-2 transition-colors ${
                  design === dg.id ? "border-charcoal" : "border-transparent hover:border-edge"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cardUrl(dg.id)} alt={dg.label} className="block w-full" />
                <span className="block bg-surface py-1 text-center text-[0.68rem] font-semibold text-charcoal">{dg.label}</span>
              </button>
            ))}
          </div>

          <p className="caps mb-3 mt-6 text-slate">Recipient (optional)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={field} placeholder="Recipient name" value={f.recipientName} onChange={set("recipientName")} />
            <input className={field} type="email" placeholder="Recipient email" value={f.recipientEmail} onChange={set("recipientEmail")} />
          </div>
          <textarea
            className="mt-3 w-full rounded-[14px] border border-edge bg-surface px-4 py-3 outline-none focus:border-charcoal"
            rows={3}
            placeholder="A message (optional)"
            value={f.message}
            onChange={set("message")}
          />

          <p className="caps mb-3 mt-6 text-slate">Your details</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={field} placeholder="Your name" value={f.purchaserName} onChange={set("purchaserName")} />
            <input className={field} type="email" placeholder="Your email" value={f.purchaserEmail} onChange={set("purchaserEmail")} />
          </div>

          {error && <p className="mt-4 rounded-[12px] bg-blush/50 px-4 py-3 text-sm text-charcoal">{error}</p>}

          <button onClick={buy} disabled={!valid || busy} className="btn mt-6 h-12 w-full text-[0.82rem] disabled:opacity-40">
            {busy ? "Processing…" : `Buy gift card · ${formatINR(value)}`}
          </button>
          {/* Subscribes the buyer only — never the recipient, who saw no notice. */}
          <SubscribeDisclosure className="text-center" />
          <p className="mt-2 text-center text-xs text-mist">Secure payment via Razorpay · redeemable at checkout</p>
        </div>
      </section>
    </div>
  );
}

export default withServicePage("payments", "Gift cards are not available yet", GiftCardPage);
