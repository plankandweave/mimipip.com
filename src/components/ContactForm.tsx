"use client";
import { withServicePage } from "@/brand/service-page";

import { SubscribeDisclosure } from "@/components/SubscribeDisclosure";
import { useState } from "react";
import { conversionLead } from "@/lib/conversions";

/**
 * `initialMessage` lets a page hand the visitor a form that already knows
 * what they clicked — a developer arriving from "Use this in your project"
 * on a design page should not have to retype which design. It seeds the
 * field only; the visitor can rewrite every word of it.
 */
function ConnectedContactForm({ initialMessage = "" }: { initialMessage?: string }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: initialMessage });
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "busy") return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email) || form.message.trim().length < 2) {
      setState("error");
      return;
    }
    setState("busy");
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "contact", ...form }),
      });
      setState(res.ok ? "done" : "error");
      if (res.ok) {
        conversionLead({ leadType: "contact", user: { email: form.email, phone: form.phone || undefined } });
      }
    } catch {
      setState("error");
    }
  };

  const field = "h-12 w-full rounded-[14px] border border-edge bg-surface px-4 outline-none focus:border-charcoal";

  if (state === "done") {
    return (
      <p className="mt-8 rounded-[14px] bg-sage/50 px-5 py-4 text-sm text-charcoal">
        Thanks — your message is in. We reply the same working day, Monday to Saturday.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-3">
      <input className={field} placeholder="Your name" value={form.name} onChange={set("name")} />
      <input className={field} type="email" placeholder="Email" value={form.email} onChange={set("email")} />
      {/* Optional, but most people who write here want a call: the number
          rides with the message into the CRM task (lib/lead-intake). */}
      <input className={field} type="tel" inputMode="tel" autoComplete="tel" placeholder="Mobile / WhatsApp (optional, for a call back)" value={form.phone} onChange={set("phone")} />
      <textarea
        className="w-full rounded-[14px] border border-edge bg-surface px-4 py-3 outline-none focus:border-charcoal"
        rows={5}
        placeholder="How can we help?"
        value={form.message}
        onChange={set("message")}
      />
      {state === "error" && <p className="text-xs text-charcoal/80">Please enter a valid email and a message.</p>}
      <button type="submit" disabled={state === "busy"} className="btn h-12 px-6 text-[0.82rem]">
        {state === "busy" ? "Sending…" : "Send message"}
      </button>
      <SubscribeDisclosure />
    </form>
  );
}

export const ContactForm = withServicePage("database", "Contact form coming soon", ConnectedContactForm);
