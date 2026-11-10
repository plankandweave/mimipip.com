"use client";

import { useRef, useState } from "react";
import { conversionSignUp } from "@/lib/conversions";
import type { SignUpMethod } from "@/lib/ga";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { formatMobile, toE164, toIndianMobile } from "@/lib/phone";
import { verifyEmailCode } from "@/lib/email-code";

/**
 * One-time-code sign-in, by email or by mobile.
 *
 * Two doors, one account. Codes are minted server-side and delivered over
 * Resend or 2Factor (see /api/auth) rather than through Supabase's own capped
 * senders; verification runs through Supabase Auth on the client either way, so
 * both doors end in the same ordinary session.
 *
 * A mobile number that already belongs to an account is sent back to that
 * account's email instead of opening a second one — /api/auth/check-phone
 * decides, and the reason it matters is written up there.
 *
 * The two "and also…" steps are asymmetric on purpose. Signing in by email leads
 * to an optional, skippable mobile step: the email is what unlocks the feature.
 * Signing in by mobile leads to a REQUIRED email step, because the gate on the
 * AI features wants a confirmed address and a phone-only account has none.
 */

type Stage =
  | "email" // ask for an address
  | "code" // enter the emailed code
  | "sms" // ask for a mobile
  | "smsCode" // enter the texted code
  | "collectEmail" // signed in by mobile, now needs an address
  | "collectEmailCode" // …and the code proving it
  | "phone"; // signed in by email, optional mobile

export function AuthModal({
  open,
  onClose,
  onSuccess,
  reason,
  emailOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Short phrase completing "Verify your email to …" — e.g. "keep your saved designs". */
  reason?: string;
  /** Private presentation access needs only a verified email. */
  emailOnly?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<Stage>("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when the address belongs to a partner account: the modal stops asking
   *  for a code and points at the portal that owns this person instead. */
  const [partnerDoor, setPartnerDoor] = useState<{ portal: string; accountName: string } | null>(null);
  /** Set when a mobile turned out to belong to an existing account, so the email
   *  step can explain why it moved the customer there. */
  const [divertedFrom, setDivertedFrom] = useState<string | null>(null);
  /** A sign-up is reported at most once per opening of this modal, whichever
   *  of the four exits the customer leaves by. */
  const signUpReported = useRef(false);

  if (!open) return null;

  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const digits = toIndianMobile(phone);

  const go = (next: Stage) => {
    setStage(next);
    setCode("");
    setError(null);
  };

  /** POST helper: returns the parsed body, or null after setting the error. */
  const post = async <T,>(path: string, payload: unknown): Promise<T | null> => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    const body = (await res.json().catch(() => null)) as
      | (T & { error?: string; code?: string; portal?: string; accountName?: string })
      | null;
    if (!res.ok) {
      if (body?.code === "partner_domain" && body.portal) {
        setPartnerDoor({ portal: body.portal, accountName: body.accountName ?? "your company" });
      }
      setError(body?.error ?? "Something went wrong. Please try again.");
      return null;
    }
    return body;
  };

  /* ------------------------------ email door ----------------------------- */

  const sendCode = async () => {
    const addr = email.trim().toLowerCase();
    if (!EMAIL_RE.test(addr)) {
      setError("Enter a valid email address.");
      return;
    }
    if (await post("request-code", { email: addr })) go("code");
  };

  const verify = async () => {
    const token = code.trim();
    if (token.length < 6) {
      setError("Enter the code we emailed you.");
      return;
    }
    setBusy(true);
    setError(null);

    const addr = email.trim().toLowerCase();
    if (!(await verifyEmailCode(addr, token))) {
      setBusy(false);
      setError("That code didn't work — check it, or send a new one.");
      return;
    }
    setBusy(false);
    await afterSignIn();
  };

  /* ------------------------------ mobile door ---------------------------- */

  const sendSms = async () => {
    if (!digits) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    // Ask first whether this number is already somebody's account. If it is, the
    // code goes to their email and they keep the one identity they have.
    const route = await post<{ route?: string; hint?: string }>("check-phone", { phone: digits });
    if (!route) return;
    if (route.route === "email") {
      setDivertedFrom(route.hint ?? null);
      go("email");
      return;
    }
    if (await post("request-sms", { phone: digits })) go("smsCode");
  };

  const verifySms = async () => {
    const token = code.trim();
    if (token.length < 4) {
      setError("Enter the code we texted you.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabaseBrowser.auth.verifyOtp({
      phone: toE164(digits),
      token,
      type: "sms",
    });
    setBusy(false);
    if (verifyError) {
      setError("That code didn't work — check it, or send a new one.");
      return;
    }
    await afterSignIn();
  };

  /* ------------------------- shared post-sign-in ------------------------- */

  /**
   * Link the customer record + attach the browsing history we already have.
   * Guest hearts need no migration: the zyv_taste cookie is unchanged by signing
   * in, so every pre-login save already logged against it in site_events becomes
   * this customer's history the moment the token is linked. The local heart list
   * stays valid too.
   */
  /**
   * The ONE way out of this modal once the customer is in.
   *
   * A brand-new account always needs an email (mobile door) or is offered a
   * mobile (email door), so `afterSignIn` below returns early into one of
   * those steps — which is how every new sign-up used to leave without ever
   * being counted: 26 accounts were created in the 28 days to 27 Sep 2026 and
   * GA4 recorded zero `sign_up`. Every exit now goes through here, and the ref
   * keeps a customer who passes two steps from counting twice.
   */
  const finishSignUp = (method: SignUpMethod) => {
    if (!signUpReported.current) {
      signUpReported.current = true;
      conversionSignUp({ method, user: { email: email.trim() || null, phone: digits || null } });
    }
    onSuccess();
  };

  const afterSignIn = async () => {
    const done = await post<{ needsPhone?: boolean; needsEmail?: boolean }>("complete", {
      // The feature they were reaching for, recorded as the provenance of the
      // consent shown on the email step.
      source: reason ?? null,
    });
    if (!done) return;
    if (emailOnly) return finishSignUp("email_otp");
    if (done?.needsEmail) return go("collectEmail");
    if (done?.needsPhone) return go("phone");
    // A customer whose account is already complete: no extra step to take.
    // Secondary in Ads, one per click, so a returning customer re-signing in
    // costs nothing but a count. `method` records which door they used.
    finishSignUp(digits && !email ? "mobile_otp" : "email_otp");
  };

  /* ---------------- email capture, after a mobile sign-in ---------------- */

  const sendCollectCode = async () => {
    const addr = email.trim().toLowerCase();
    if (!EMAIL_RE.test(addr)) {
      setError("Enter a valid email address.");
      return;
    }
    if (await post("email-code", { email: addr })) go("collectEmailCode");
  };

  const verifyCollectCode = async () => {
    const token = code.trim();
    if (token.length < 6) {
      setError("Enter the code we emailed you.");
      return;
    }
    const ok = await post("email-verify", {
      email: email.trim().toLowerCase(),
      code: token,
      source: reason ?? null,
    });
    if (!ok) return;
    // The JWT still carries no address until it refreshes; force it now so the
    // gated routes see a confirmed email on the very next call rather than
    // bouncing the customer straight back into this modal.
    await supabaseBrowser.auth.refreshSession();
    // Reached only from the mobile door — the email step exists because that
    // is how they signed in.
    finishSignUp("mobile_otp");
  };

  /* -------------------------- optional mobile ---------------------------- */

  const savePhone = async () => {
    if (!digits) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    if (await post("phone", { phone: digits })) finishSignUp("email_otp");
  };

  /* -------------------------------- copy --------------------------------- */

  const heading = {
    email: "Verify your email",
    code: "Enter your code",
    sms: "Sign in with your mobile",
    smsCode: "Enter your code",
    collectEmail: "Add your email",
    collectEmailCode: "Enter your code",
    phone: "Add your mobile",
  }[stage];

  const blurb = {
    email: divertedFrom
      ? `That number is already on an account, so we'll send the code to ${divertedFrom} instead.`
      : reason
        ? `We'll email you a one-time code so you can ${reason}. No password needed.`
        : "We'll email you a one-time code — no password needed.",
    code: `Sent to ${email.trim().toLowerCase()}. It may take a moment to arrive.`,
    sms: reason
      ? `We'll text you a one-time code so you can ${reason}. No password needed.`
      : "We'll text you a one-time code — no password needed.",
    smsCode: `Sent to +91 ${formatMobile(digits)}. It may take a moment to arrive.`,
    collectEmail: "We need an address to send your order updates and designs to.",
    collectEmailCode: `Sent to ${email.trim().toLowerCase()}. It may take a moment to arrive.`,
    phone: "Optional — so we can reach you about your designs and order updates.",
  }[stage];

  const cta = {
    email: "Email me a code",
    code: "Verify",
    sms: "Text me a code",
    smsCode: "Verify",
    collectEmail: "Email me a code",
    collectEmailCode: "Verify",
    phone: "Save & continue",
  }[stage];

  const primary = {
    email: sendCode,
    code: verify,
    sms: sendSms,
    smsCode: verifySms,
    collectEmail: sendCollectCode,
    collectEmailCode: verifyCollectCode,
    phone: savePhone,
  }[stage];

  const isCodeStage = stage === "code" || stage === "smsCode" || stage === "collectEmailCode";
  const isEmailStage = stage === "email" || stage === "collectEmail";

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-charcoal/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        className="w-[min(400px,100%)] rounded-[24px] bg-cloud p-6 shadow-2xl ring-1 ring-edge"
      >
        <p className="font-display text-lg font-bold">{heading}</p>
        <p className="mt-1 text-xs text-slate">{blurb}</p>

        <div className="mt-4">
          {isEmailStage ? (
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && primary()}
              className="h-12 w-full rounded-[14px] border border-edge bg-surface px-4 outline-none focus:border-charcoal"
            />
          ) : isCodeStage ? (
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              // The emailed code from admin.generateLink is 8 digits (not the 6 a
              // "code" usually implies) and the texted one is 6 — cap generously
              // above both rather than hardcoding either, in case they change,
              // and let verification itself be the real validator.
              placeholder={stage === "smsCode" ? "123456" : "12345678"}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 12))}
              onKeyDown={(e) => e.key === "Enter" && primary()}
              className="h-12 w-full rounded-[14px] border border-edge bg-surface px-4 text-center text-lg tracking-widest outline-none focus:border-charcoal"
            />
          ) : (
            <>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                autoFocus
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && primary()}
                className="h-12 w-full rounded-[14px] border border-edge bg-surface px-4 outline-none focus:border-charcoal"
              />
            </>
          )}
        </div>

        {!emailOnly && (isEmailStage || stage === "sms") && (
          <div className="mt-3 space-y-3 text-xs text-slate">
            <p>Signing in creates your MimiPip account. Order and account messages are separate from marketing.</p>

          </div>
        )}

        {error && <p className="mt-3 text-xs text-charcoal/80">{error}</p>}
        {partnerDoor && (
          <a
            href={partnerDoor.portal}
            className="btn mt-3 block w-full text-center"
          >
            Open the {partnerDoor.accountName} portal →
          </a>
        )}

        <div className="mt-5 flex gap-3">
          <button
            onClick={stage === "phone" ? () => finishSignUp("email_otp") : onClose}
            className="btn btn-ghost h-11 flex-1 text-[0.78rem]"
          >
            {/* Only the optional mobile step is skippable. collectEmail is not:
                without an address the account cannot be reached or gated. */}
            {stage === "phone" ? "Skip" : "Cancel"}
          </button>
          <button onClick={primary} disabled={busy} className="btn h-11 flex-1 text-[0.78rem]">
            {busy ? "Please wait…" : cta}
          </button>
        </div>


        {/* Door switch — offered only on the first step, and never once a code is
            already in flight or the customer is signed in. */}
        {!emailOnly && stage === "email" && !divertedFrom && (
          <button
            onClick={() => go("sms")}
            className="mt-3 text-xs font-semibold text-slate underline underline-offset-2 hover:text-charcoal"
          >
            Use my mobile instead
          </button>
        )}
        {stage === "sms" && (
          <button
            onClick={() => go("email")}
            className="mt-3 text-xs font-semibold text-slate underline underline-offset-2 hover:text-charcoal"
          >
            Use my email instead
          </button>
        )}

        {isCodeStage && (
          <button
            onClick={() => go(stage === "smsCode" ? "sms" : stage === "code" ? "email" : "collectEmail")}
            className="mt-3 text-xs font-semibold text-slate underline underline-offset-2 hover:text-charcoal"
          >
            {stage === "smsCode" ? "Use a different number" : "Use a different email"}
          </button>
        )}
      </div>
    </div>
  );
}
