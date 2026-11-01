"use client";

import { useState } from "react";

import { loadRazorpay } from "@/lib/load-razorpay";
import { trackPurchaseProgress } from "@/lib/track-purchase-progress";
import { gaEvent } from "@/lib/ga";

type RazorpayInfo = { razorpayOrderId: string; keyId: string; amount: number; currency: "INR" | "USD" };

/**
 * Pay for an order whose checkout never reached the payment window.
 *
 * The amount comes from the server's copy of the order, never from this
 * component, and the payment is believed only after /api/razorpay/verify has
 * checked Razorpay's signature — the same endpoint the ordinary checkout uses,
 * so a payment collected here is a payment like any other.
 */
export function PayOrderButton({ token, amountLabel }: { token: string; amountLabel: string }) {
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pay() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/order/${token}/pay`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        void trackPurchaseProgress("checkout_request_failed");
        if (j.error === "needs_help" || j.error === "not_payable") {
          setErr(j.detail ?? "This order doesn't need a payment — email hello@zyvorah.com and we'll confirm it.");
          return;
        }
        if (j.error === "payments_unavailable") {
          setErr("Online payment isn't available just now — email hello@zyvorah.com and we'll send you payment details.");
          return;
        }
        throw new Error("Could not start the payment");
      }
      const rzp: RazorpayInfo = j.razorpay;
      if (!(await loadRazorpay())) {
        void trackPurchaseProgress("payment_window_failed");
        gaEvent("payment_window_failed", { reason: "script_unavailable", payment_flow: "recovery" });
        setErr("Couldn't load the payment window — please try again.");
        return;
      }
      const RZP = (window as unknown as {
        Razorpay: new (o: unknown) => {
          open: () => void;
          on: (event: "payment.failed", cb: (resp: { error?: Record<string, unknown> }) => void) => void;
        };
      }).Razorpay;
      const rp = new RZP({
        key: rzp.keyId,
        order_id: rzp.razorpayOrderId,
        amount: rzp.amount,
        currency: rzp.currency,
        name: "Zyvorah",
        description: "Made-to-order wallpaper",
        theme: { color: "#1a1a1a" },
        handler: async (resp: Record<string, string>) => {
          try {
            const v = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(resp),
            });
            if (v.ok) {
              setPaid(true);
              // The page renders the order's status server-side; reload so the
              // timeline shows the order really moving, not this button's memory
              // of it.
              window.location.reload();
            } else {
              void trackPurchaseProgress("payment_verification_failed");
              setErr("We couldn't confirm your payment. If money was deducted, email hello@zyvorah.com and we'll sort it out today.");
            }
          } catch {
            void trackPurchaseProgress("payment_verification_failed");
            gaEvent("payment_verification_failed", { reason: "network", payment_flow: "recovery" });
            setErr("Payment confirmation could not be checked. If money was deducted, do not pay again; contact hello@zyvorah.com.");
          }
        },
        modal: {
          ondismiss: () => {
            void trackPurchaseProgress("payment_window_dismissed");
            setErr("Payment wasn't completed — your order is still here whenever you're ready.");
          },
        },
      });
      // A failure inside the window reports home with Razorpay's own error —
      // the recovery window is where order #89's second silent death happened.
      rp.on("payment.failed", (resp) => {
        void trackPurchaseProgress("payment_failed");
        gaEvent("payment_failed", { code: String(resp?.error?.code ?? ""), reason: String(resp?.error?.reason ?? ""), payment_flow: "recovery" });
        void fetch("/api/payment-failed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderToken: token, error: resp?.error ?? {} }),
          keepalive: true,
        }).catch(() => {});
      });
      rp.open();
      void trackPurchaseProgress("payment_window_opened");
      gaEvent("payment_window_opened", { payment_flow: "recovery" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start the payment");
    } finally {
      setBusy(false);
    }
  }

  if (paid) {
    return <p className="rounded-[12px] bg-sage/50 px-4 py-3 text-sm text-charcoal">Thank you — payment received.</p>;
  }

  return (
    <div>
      <button onClick={() => void pay()} disabled={busy} className="btn h-12 px-6 text-[0.85rem] disabled:opacity-40">
        {busy ? "Opening payment…" : `Pay ${amountLabel}`}
      </button>
      {err && <p className="mt-2 text-sm text-charcoal/80">{err}</p>}
    </div>
  );
}
