"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { recordPageView } from "@/lib/visits";

// Registers the service worker and invites installing zyvorah.com as an app.
// On Chromium (Android/desktop) it captures beforeinstallprompt and shows a
// one-tap "Install app" card; on iOS Safari (which has no prompt API) it shows
// the "Share → Add to Home Screen" hint. Never shown once installed.
//
// WHEN (founder, 6 October 2026): never on a shopper's first visit — the card
// used to land 2.5 s into it, over the hero, before they had seen a single
// design. From the second visit on it comes back once EVERY visit, DWELL_MS
// in and only once they have scrolled past the first screen, so it never sits
// over the hero; closing it puts it away for the rest of that visit only. A
// visit is counted by src/lib/visits.ts (30 minutes without a page view ends one).
//
// Product pages are quiet, as they are for SignInInvite: the card is fixed to
// the bottom of the screen, which on a phone is exactly where the wall
// builder's Continue and Add to cart live. On 5 October 2026 the live flow
// check had to swipe this card away on every phone product page before it
// could reach the builder's footer. A shopper mid-wall is not the moment.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** The first visit the card may appear on. */
const FIRST_VISIT_SHOWN = 2;
const DWELL_MS = 8_000;
/** The visit number the shopper last closed the card on. */
const DISMISSED_KEY = "zyv_pwa_dismissed_visit";

function dismissedOn(): number {
  try {
    return Number(localStorage.getItem(DISMISSED_KEY)) || 0;
  } catch {
    return 0;
  }
}

function isStandalone(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true)
  );
}

// Product pages for the reason above; the rest because a shopper paying,
// measuring or in their account is mid-task — the paths SignInInvite keeps.
const QUIET_PATHS = ["/products", "/checkout", "/cart", "/order", "/account", "/measure", "/concepts", "/studio", "/admin", "/partners", "/vijay-sales"];

export function AppInstall() {
  const pathname = usePathname();
  const quiet = QUIET_PATHS.some((p) => pathname?.startsWith(p));
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [open, setOpen] = useState(false);

  // Register the service worker (installability requires one with a fetch handler).
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* SW is a progressive enhancement — ignore failures */
      });
    }
  }, []);

  // Every page view feeds the visit count, quiet pages included — a visit
  // that is all product pages is still a visit. null until counted (and if
  // storage is blocked, so a private window never sees the card).
  const [visit, setVisit] = useState<number | null>(null);
  useEffect(() => {
    try {
      setVisit(recordPageView(localStorage, Date.now()));
    } catch {
      /* storage blocked — leave the visit uncounted */
    }
  }, [pathname]);

  // Capture what the platform offers; nothing opens from here.
  useEffect(() => {
    if (isStandalone()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault(); // stop Chrome's own mini-infobar; we show our own card
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const onInstalled = () => {
      setOpen(false);
      setDeferred(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    // iOS Safari never fires beforeinstallprompt — offer the manual hint instead.
    const ua = window.navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /^((?!chrome|crios|fxios|edgios).)*safari/i.test(ua);
    if (isIOS && isSafari) setIosHint(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Open once per visit, from the second visit on. Keyed on the visit NUMBER,
  // so navigating within a visit does not restart the timer.
  const canOffer = deferred !== null || iosHint;
  useEffect(() => {
    if (visit === null || visit < FIRST_VISIT_SHOWN || !canOffer) return;
    if (isStandalone() || dismissedOn() === visit) return;
    // One card at a time: on a phone this and SignInInvite are both
    // full-width at the bottom and would stack. If another nudge is up when
    // the dwell ends, wait another dwell rather than skip the visit.
    // And never over the hero (founder, 6 October 2026): after the dwell it
    // also waits until the shopper is scrolled past the first screen. Checked
    // at the moment it would open, not once, because by then they may have
    // moved to a new page and be back at its top.
    let t: ReturnType<typeof setTimeout>;
    const pastFirstScreen = () => window.scrollY > window.innerHeight;
    const onScroll = () => {
      if (!pastFirstScreen()) return;
      window.removeEventListener("scroll", onScroll);
      tryOpen();
    };
    const tryOpen = () => {
      if (document.querySelector("[data-nudge]")) t = setTimeout(tryOpen, DWELL_MS);
      else if (!pastFirstScreen()) window.addEventListener("scroll", onScroll, { passive: true });
      else setOpen(true);
    };
    t = setTimeout(tryOpen, DWELL_MS);
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", onScroll);
    };
  }, [visit, canOffer]);

  const dismiss = () => {
    setOpen(false);
    if (visit === null) return;
    try {
      localStorage.setItem(DISMISSED_KEY, String(visit));
    } catch {
      /* private mode — fine */
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    setDeferred(null);
    setOpen(false);
  };

  if (quiet || !open || (!deferred && !iosHint)) return null;

  // On a phone every bottom card sits ABOVE the WhatsApp button (bottom-right,
  // 48px tall at 1.25rem): at full width beside it they covered it.
  return (
    <div data-nudge="app-install" className="fixed bottom-[5.25rem] left-4 z-40 w-[min(340px,calc(100vw-2rem))] rounded-[18px] border border-edge bg-surface p-4 shadow-2xl sm:bottom-5 sm:left-5">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/api/brand/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-[12px]" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold text-charcoal">Get the Zyvorah app</p>
          {iosHint ? (
            <p className="mt-0.5 text-xs text-slate">
              Tap the <span className="font-semibold">Share</span> icon, then{" "}
              <span className="font-semibold">Add to Home Screen</span> to install.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-slate">
              Install it on your phone for one-tap access — your walls, saved and ready.
            </p>
          )}
          {!iosHint && (
            <button
              onClick={install}
              className="btn mt-2.5 h-9 px-4 text-[0.78rem]"
            >
              Install app
            </button>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="-m-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-mist hover:text-charcoal"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}
