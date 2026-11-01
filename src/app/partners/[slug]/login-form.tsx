"use client";

import Image from "@/components/SiteImage";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Two-step sign in, through one of two doors.
//
// EMAIL is the original: a one-time code to an address on the account's own
// domain. Step 1 answers plainly when a domain is not recognised — for a portal
// whose tenants we onboard by hand, silence hid nothing worth hiding and made a
// real outage look like success.
//
// MOBILE is for accounts whose people are reached on a handset rather than at a
// company inbox — a facilities manager standing in a lift lobby, added to the
// account by their own administrator. It is offered only where the account is
// set up for it, because on every other account no member has a number on file
// and the door would be a dead end that always answers "not set up".
export default function CorporateLogin({
  slug, accountName, emailDomain, logoPath, phoneFirst = false, portfolio = false, returnTo = null,
}: {
  slug: string;
  /** Where to land after signing in (partnerReturnPath, already checked): the
   *  exact store or page the link they tapped was for. */
  returnTo?: string | null;
  accountName: string;
  // Null for a partner with no company domain of their own (a personal email
  // address, granted individually via corporate_members — see migration
  // 0116) — the account's real email_domain is a non-resolvable placeholder
  // that must never be shown as something to sign in "@".
  emailDomain: string | null;
  logoPath: string | null;
  /** Lead with the mobile door. A fact about WHO IS ON the account — whether
   *  anybody has a number on file — and nothing to do with what the portal is
   *  for. LTM is a portfolio account whose people all sign in by email. */
  phoneFirst?: boolean;
  /** This is a wall-design portal rather than a wallpaper print portal
   *  (portfolio_mode). Kept separate from phoneFirst on purpose: the two were
   *  one flag until LTM arrived, and the moment a portfolio account led with
   *  the email door it started describing itself as a reseller's portal. */
  portfolio?: boolean;
}) {
  const router = useRouter();
  const [door, setDoor] = useState<"email" | "phone">(phoneFirst ? "phone" : "email");
  const [step, setStep] = useState<"id" | "code">("id");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** The phone door has turned somebody away. Distinct from `err`, which also
   *  covers a dropped connection — being told to try the other door because the
   *  network blinked would send a client to a door that will not open for them
   *  either. */
  const [rejected, setRejected] = useState(false);

  const byPhone = door === "phone";
  const identifier = byPhone ? phone : email;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const body = byPhone
        ? (step === "id" ? { phone } : { phone, code })
        // The slug rides along so a Zyvorah staff address can sign in to the
        // portal it is standing in — with its own code, to its own inbox. It is
        // never sent on the phone door, where the member row decides the
        // account and a caller may not name one.
        : (step === "id" ? { email, slug } : { email, code });

      const res = await fetch("/api/corporate/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) {
        // 403 on the phone door means the number holds no member row — the one
        // refusal the other door can actually fix. A 429 or a 502 must not
        // offer it, because trying the same person's email would fail too.
        if (byPhone && step === "id" && res.status === 403) setRejected(true);
        throw new Error(j.error ?? "Something went wrong.");
      }
      if (step === "id") setStep("code");
      else {
        const signedInSlug = j.account?.slug ?? slug;
        // Resume the guide only on the account the visitor asked to open.
        const destination = returnTo && signedInSlug === slug ? `/${returnTo}` : "";
        const tab = window.location.hash.slice(1);
        if (destination) router.push(`/partners/${signedInSlug}${destination}`);
        else if (signedInSlug === "vijay-sales" && signedInSlug === slug && ["dashboard", "new", "documents", "stores", "team", "settings"].includes(tab)) {
          const design = new URLSearchParams(window.location.search).get("design");
          router.push(`/partners/${signedInSlug}/orders${design ? `?design=${encodeURIComponent(design)}` : ""}#${tab}`);
        } else router.push(`/partners/${signedInSlug}${destination}`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function switchDoor(to: "email" | "phone") {
    setDoor(to);
    setRejected(false);
    setStep("id");
    setCode("");
    setErr(null);
  }

  return (
    <div className="container-x flex min-h-[80vh] items-center justify-center py-16">
      <div className="w-full max-w-[420px]">
        <div className="rounded-[22px] border border-edge bg-surface p-8 shadow-sm">
          <div className="flex items-center gap-3">
            {logoPath && (
              <Image src={logoPath} alt={accountName} width={44} height={44}
                className="rounded-[10px]" priority />
            )}
            <div>
              <p className="font-display text-lg font-extrabold leading-tight">{accountName}</p>
              <p className="text-xs text-slate">{portfolio ? "Wall design portal" : "Wallpaper print portal"}</p>
            </div>
          </div>

          {/* Somebody opening this link has been sent it and told nothing. One
              line about what the thing IS, before it asks them for anything —
              a sign-in box with no context is where people stop. */}
          {step === "id" && portfolio && (
            <p className="mt-6 rounded-[12px] bg-wash px-4 py-3 text-sm text-slate">
              Photograph your blank walls, say what each one should do, and see
              designs standing on them — from your phone, without anyone visiting.
            </p>
          )}

          <h1 className={`font-display text-2xl font-extrabold ${step === "id" && portfolio ? "mt-5" : "mt-7"}`}>
            {step === "id" ? "Sign in" : "Enter your code"}
          </h1>
          <p className="mt-1.5 text-sm text-slate">
            {step === "code" ? (
              <>We sent a 6-digit code to <strong className="text-charcoal">{identifier}</strong>. It expires in 15 minutes.</>
            ) : byPhone ? (
              <>Enter the mobile number your account administrator added — we&apos;ll text you a one-time code.</>
            ) : emailDomain ? (
              <>Use your @{emailDomain} work email — we&apos;ll send you a one-time code.</>
            ) : (
              <>Use your registered email address — we&apos;ll send you a one-time code.</>
            )}
          </p>
          {step === "id" && !byPhone && (
            <p className="mt-1 text-xs text-mist">Zyvorah staff: use your own work address to design and prepare on this account. Ordering stays with the account&apos;s own team.</p>
          )}

          <form onSubmit={submit} className="mt-6 space-y-3">
            {step === "code" ? (
              <input
                required autoFocus value={code} inputMode="numeric" maxLength={6} autoComplete="one-time-code"
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full rounded-[12px] border border-edge bg-wash px-4 py-3 text-center font-mono text-xl tracking-[0.4em] outline-none focus:border-charcoal"
              />
            ) : byPhone ? (
              <div className="flex items-stretch gap-2">
                <span className="flex items-center rounded-[12px] border border-edge bg-wash px-3 text-sm text-slate">+91</span>
                <input
                  type="tel" required autoFocus value={phone} inputMode="numeric" maxLength={10} autoComplete="tel-national"
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="98765 43210"
                  className="w-full rounded-[12px] border border-edge bg-wash px-4 py-3 text-sm outline-none focus:border-charcoal"
                />
              </div>
            ) : (
              <input
                type="email" required autoFocus value={email} inputMode="email" autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                placeholder={emailDomain ? `you@${emailDomain}` : "you@example.com"}
                className="w-full rounded-[12px] border border-edge bg-wash px-4 py-3 text-sm outline-none focus:border-charcoal"
              />
            )}

            {err && <p className="text-sm text-red-600">{err}</p>}

            {/* A refused number is a DEAD END unless the other door is offered
                properly. The underlined link below is enough to find when you
                are browsing and not enough when you are stuck — and the person
                most likely to be stuck here is one of ours, checking a client's
                account with a number that was never on it. So once the phone
                door has actually refused someone, the way out stops being fine
                print. */}
            {rejected && byPhone && (
              <button type="button" onClick={() => switchDoor("email")}
                className="w-full rounded-[12px] border border-charcoal px-4 py-3 text-sm font-semibold">
                Sign in with an email address instead
              </button>
            )}

            <button type="submit" disabled={busy}
              className="btn h-12 w-full text-[0.85rem] disabled:opacity-50">
              {busy ? "Please wait…" : step === "id" ? "Send me a code" : "Sign in"}
            </button>

            {step === "code" && (
              <button type="button" onClick={() => { setStep("id"); setCode(""); setErr(null); }}
                className="w-full text-center text-xs text-slate underline">
                Use a different {byPhone ? "number" : "email"}
              </button>
            )}

            {/* Staff sign in to a portfolio account by email, so the other door
                stays reachable from both sides rather than being a mode. */}
            {step === "id" && portfolio && (
              <button type="button" onClick={() => switchDoor(byPhone ? "email" : "phone")}
                className="w-full text-center text-xs text-slate underline">
                {byPhone ? "Sign in with an email address instead" : "Sign in with a mobile number instead"}
              </button>
            )}
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-mist">
          Zyvorah · {portfolio ? "wall design" : "made-to-order wallpaper"} for {accountName}
        </p>
      </div>
    </div>
  );
}
