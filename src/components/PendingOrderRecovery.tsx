"use client";
import { useEffect, useState } from "react";

/** Mimi Pip's payment session belongs to the existing Cloudflare checkout. */
export function PendingOrderRecovery() {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    try {
      setPending(!!sessionStorage.getItem('mimipip-checkout-started') && !!sessionStorage.getItem('mimipip-checkout-session'));
    } catch { /* Storage can be unavailable in private browsing. */ }
  }, []);
  if (!pending) return <p className="text-sm text-slate">Your cart is empty.</p>;
  return <div className="mx-auto max-w-md rounded-2xl border border-edge p-5">
    <h2 className="text-xl font-semibold">Check your recent order</h2>
    <p className="mt-3 text-sm text-slate">Return to checkout to check whether your payment completed.</p>
    <a href="/checkout" className="btn mt-5 inline-flex min-h-11 items-center px-6 text-sm">Review your order</a>
  </div>;
}
