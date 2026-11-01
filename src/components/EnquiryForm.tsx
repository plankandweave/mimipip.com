"use client";

import { SubscribeDisclosure } from "@/components/SubscribeDisclosure";
import { useState } from "react";
import { conversionLead } from "@/lib/conversions";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Reusable enquiry form (Commercial projects, Bespoke design, …). Posts to the
 * existing /api/forms "contact" handler with a topic, folding the organisation
 * and phone into the message so no new backend is needed.
 */
export function EnquiryForm({
  topic,
  orgLabel = "Company / organisation (optional)",
  detailsPlaceholder = "Tell us about your project — spaces, rough wall sizes, timeline…",
  submitLabel = "Send enquiry",
}: {
  topic: string;
  orgLabel?: string;
  detailsPlaceholder?: string;
  submitLabel?: string;
}) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", org: "", details: "" });
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "busy") return;
    if (!EMAIL_RE.test(form.email) || form.details.trim().length < 2) {
      setState("error");
      return;
    }
    setState("busy");
    const meta = [form.org && `Organisation: ${form.org}`, form.phone && `Phone: ${form.phone}`]
      .filter(Boolean)
      .join("\n");
    const message = (meta ? meta + "\n\n" : "") + form.details.trim();
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "contact", topic, name: form.name, email: form.email, message }),
      });
      setState(res.ok ? "done" : "error");
      if (res.ok) {
        conversionLead({ leadType: "enquiry", topic, user: { email: form.email, phone: form.phone } });
      }
    } catch {
      setState("error");
    }
  };

  const field = "h-12 w-full rounded-[14px] border border-edge bg-surface px-4 outline-none focus:border-charcoal";

  if (state === "done") {
    return (
      <p className="rounded-[14px] bg-sage/50 px-5 py-4 text-sm text-charcoal">
        Thanks — your enquiry is in. Our team will be in touch within one working day. ✦
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input className={field} placeholder="Your name" value={form.name} onChange={set("name")} />
        <input className={field} placeholder="Phone (optional)" value={form.phone} onChange={set("phone")} />
      </div>
      {/* Consent for the follow-up call (src/lib/voice-followup.ts): said
          where the number is given, before it is given. */}
      <p className="text-xs text-charcoal/70">We may call or WhatsApp you about your enquiry. Our assistant may be an AI; reply STOP anytime.</p>
      <input className={field} type="email" placeholder="Email" value={form.email} onChange={set("email")} />
      <input className={field} placeholder={orgLabel} value={form.org} onChange={set("org")} />
      <textarea
        className="w-full rounded-[14px] border border-edge bg-surface px-4 py-3 outline-none focus:border-charcoal"
        rows={5}
        placeholder={detailsPlaceholder}
        value={form.details}
        onChange={set("details")}
      />
      {state === "error" && <p className="text-xs text-charcoal/80">Please enter a valid email and a few words about your project.</p>}
      <button type="submit" disabled={state === "busy"} className="btn h-12 px-6 text-[0.82rem]">
        {state === "busy" ? "Sending…" : submitLabel}
      </button>
      <SubscribeDisclosure />
    </form>
  );
}
