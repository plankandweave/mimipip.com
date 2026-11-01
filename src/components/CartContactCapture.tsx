"use client";

import { SubscribeDisclosure } from "@/components/SubscribeDisclosure";
import { useEffect, useState } from "react";

const FLAG = "zyv:cart-contact";

/**
 * The moment something lands in the cart, capture where to send the quote —
 * executes the approved "Mandate contact capture before cart save"
 * intelligence decision. Asks once per device, right at peak intent, and
 * writes to the cart itself (cart_set_contact) so an abandoned cart is never
 * anonymous again and recovery outreach becomes possible.
 */
export function CartContactCapture({ active }: { active: boolean }) {
  const [given, setGiven] = useState(true); // assume given until checked, avoids a flash
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setGiven(localStorage.getItem(FLAG) === "1");
    } catch {
      setGiven(false);
    }
  }, []);

  if (!active || given) return null;

  if (saved) {
    return (
      <p className="mt-3 rounded-[12px] bg-sage/40 px-4 py-3 text-xs text-charcoal">
        Saved — your quote and fitting guide are safe with us.
      </p>
    );
  }

  const save = async () => {
    const v = value.trim();
    if (!v || busy) return;
    setBusy(true);
    setError(null);
    const isEmail = v.includes("@");
    try {
      const res = await fetch("/api/cart/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEmail ? { email: v } : { phone: v }),
      });
      if (!res.ok) {
        setError("That doesn't look like an email or a 10-digit mobile number — mind checking it?");
        return;
      }
      try {
        localStorage.setItem(FLAG, "1");
      } catch {
        /* private mode — the cart row still has it */
      }
      setSaved(true);
    } catch {
      setError("Couldn't save that just now — please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-[14px] bg-wash p-4">
      <p className="text-xs font-semibold text-charcoal">Your WhatsApp number</p>
      <p className="mt-0.5 text-[0.7rem] leading-relaxed text-slate">
        So we can check your wall size with you before printing and keep this price for you if you
        step away. An email works too.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          autoComplete="tel"
          aria-label="WhatsApp number or email"
          placeholder="98xxxxxxxx or you@example.com"
          className="h-11 min-w-0 flex-1 rounded-[10px] border border-edge bg-surface px-3 text-base outline-none focus:border-charcoal"
        />
        <button
          onClick={save}
          disabled={busy || !value.trim()}
          className="h-11 rounded-[10px] bg-charcoal px-4 text-xs font-semibold text-surface disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p className="mt-2 text-[0.7rem] text-slate">{error}</p>}
      <SubscribeDisclosure />
    </div>
  );
}
