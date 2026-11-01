"use client";

import Image from "@/components/SiteImage";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * You asked for one partner's portal while signed in as another.
 *
 * This page used to redirect silently to whatever account the session held,
 * which is fine for a partner (their address resolves to exactly one account,
 * so the redirect is either a no-op or the correction they wanted) but wrong
 * for us: our staff sign into several portals, and a link to a partner's
 * portal would quietly land on whichever one we happened to be signed into
 * last, with nothing on screen to say so. Checking a partner's link therefore
 * showed us the wrong partner and looked like a broken link.
 *
 * So: say which account is open, and offer the switch rather than guessing.
 */
export default function WrongAccount({
  signedInAs, currentName, currentHref, wantedName, wantedSlug, wantedLogo, maySwitch, returnToDocuments = false,
}: {
  returnToDocuments?: boolean;
  signedInAs: string;
  currentName: string;
  currentHref: string;
  wantedName: string;
  wantedSlug: string;
  wantedLogo: string | null;
  /** Only our own staff may hold a session on an account that is not theirs,
   *  so only they are offered the switch. A partner's address resolves to one
   *  account, and signing them out to "switch" would land them right back
   *  where they started — an offer that cannot work is worse than none. */
  maySwitch: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function switchAccount() {
    setBusy(true);
    try {
      await fetch("/api/corporate/logout", { method: "POST" });
    } catch {
      // Even if the sign-out call fails, send them to the sign-in page — it
      // is the place to recover from, and staying here helps nobody.
    }
    const section = window.location.hash.slice(1);
    const resumeWorkspace = wantedSlug === "vijay-sales" && ["dashboard", "new", "documents", "stores", "team", "settings"].includes(section);
    const design = resumeWorkspace ? new URLSearchParams(window.location.search).get("design") : null;
    router.push(`/partners/${wantedSlug}${returnToDocuments ? "?next=documents" : design ? `?design=${encodeURIComponent(design)}` : ""}${resumeWorkspace ? `#${section}` : ""}`);
    router.refresh();
  }

  return (
    <div className="container-x flex min-h-[80vh] items-center justify-center py-16">
      <div className="w-full max-w-[420px]">
        <div className="rounded-[22px] border border-edge bg-surface p-8 shadow-sm">
          <div className="flex items-center gap-3">
            {wantedLogo && (
              <Image src={wantedLogo} alt={wantedName} width={44} height={44}
                className="rounded-[10px]" priority />
            )}
            <div>
              <p className="font-display text-lg font-extrabold leading-tight">{wantedName}</p>
              <p className="text-xs text-slate">Wallpaper print portal</p>
            </div>
          </div>

          <h1 className="mt-7 font-display text-2xl font-extrabold">
            You&apos;re signed in as someone else
          </h1>
          <p className="mt-1.5 text-sm text-slate">
            This link opens the <strong className="text-charcoal">{wantedName}</strong> portal,
            but you are signed in as <strong className="text-charcoal">{signedInAs}</strong> on
            the <strong className="text-charcoal">{currentName}</strong> account.
          </p>

          <div className="mt-6 space-y-3">
            {maySwitch && (
              <button type="button" onClick={() => void switchAccount()} disabled={busy}
                className="btn h-12 w-full text-[0.85rem] disabled:opacity-50">
                {busy ? "Please wait…" : `Sign in to ${wantedName}`}
              </button>
            )}
            <a href={currentHref}
              className={maySwitch
                ? "block w-full text-center text-xs text-slate underline"
                : "btn flex h-12 w-full items-center justify-center text-[0.85rem]"}>
              {maySwitch ? `Stay in ${currentName}` : `Go to your ${currentName} orders`}
            </a>
          </div>

          {!maySwitch && (
            <p className="mt-4 text-xs text-mist">
              If you think you should have access to {wantedName}, reply to the email that
              brought you here and we will sort it out.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
