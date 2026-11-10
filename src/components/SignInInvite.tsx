"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { AuthModal } from "@/components/AuthModal";
import { SIGN_IN_DWELL_MS, readBrowseTime } from "@/lib/signin-timing";

// One invitation after 30 seconds of visible browsing, accumulated across routes.
// Signing in hides the invitation, but must not unmount an unfinished AuthModal.
const SNOOZE_KEY = "zyv_signin_snooze";
const BROWSE_KEY = "zyv_signin_browse_ms";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

// Keep account, purchase and private work flows free of competing prompts.
const QUIET_PATHS = [
  "/checkout",
  "/cart",
  "/account",
  "/order",
  "/vijay-sales",
  "/partners",
  // The store measurement form: a person holding a tape measure has no use
  // for a sign-in nudge, and no account to sign in to.
  "/measure",
  // The campus walk: the person holding the phone has no account and is
  // recording, not shopping.
  "/trace",
  // The guest walkthrough link: a prospect walking their own space, with no
  // account and never one.
  "/walk",
  // The talking wall: someone who scanned a QR on a campus wall is listening,
  // not shopping.
  "/sonar",
  // Paid concept pages already ask the shopper to choose rooms, measure and
  // review a purchase. Keep that focused path free of a second sign-in card.
  "/concepts",
  "/studio",
  "/admin",
  "/privacy",
  "/terms",
];

function snoozed(): boolean {
  try {
    const t = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    return t > 0 && Date.now() - t < SNOOZE_MS;
  } catch {
    return false;
  }
}

function remember(): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()));
  } catch {
    /* private mode — fine */
  }
}

export function SignInInvite() {
  const { session, loading } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const elapsed = useRef(0);

  const quiet = QUIET_PATHS.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    if (loading || session || quiet || open || authOpen || snoozed()) return;
    try {
      elapsed.current = Math.max(elapsed.current, readBrowseTime(sessionStorage.getItem(BROWSE_KEY)));
    } catch { /* In-memory timing still works when storage is unavailable. */ }
    let started: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pause = () => {
      clearTimeout(timer);
      if (started !== null) {
        elapsed.current = Math.min(SIGN_IN_DWELL_MS, elapsed.current + performance.now() - started);
        started = null;
        try { sessionStorage.setItem(BROWSE_KEY, String(elapsed.current)); } catch { /* optional */ }
      }
    };
    const show = () => {
      // Wait for another account dialog or saved-design invitation to finish.
      if (document.querySelector('[role="dialog"], [data-nudge="save-keeper"]')) {
        timer = setTimeout(show, 1000);
        return;
      }
      pause();
      setOpen(true);
    };
    const resume = () => {
      pause();
      if (document.visibilityState !== "visible") return;
      started = performance.now();
      timer = setTimeout(show, Math.max(0, SIGN_IN_DWELL_MS - elapsed.current));
    };
    resume();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pagehide", pause);
    window.addEventListener("pageshow", resume);
    return () => {
      pause();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pagehide", pause);
      window.removeEventListener("pageshow", resume);
    };
  }, [pathname, session, loading, quiet, open, authOpen]);

  const dismiss = () => {
    setOpen(false);
    remember();
  };

  if (!authOpen && (!open || loading || session || quiet)) return null;

  return (
    <>
      {!authOpen && !session && <div data-nudge="sign-in" className="fixed bottom-[5.25rem] right-4 z-40 w-[min(340px,calc(100vw-2rem))] rounded-[18px] border border-edge bg-surface p-4 shadow-2xl sm:bottom-5 sm:right-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold text-charcoal">
              Sign in to MimiPip
            </p>
            <p className="mt-0.5 text-xs text-slate">
              Sign in to save your favourite designs and pick up where you left off. Your email is private and is never shown to other visitors.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button onClick={() => setAuthOpen(true)} className="btn h-9 px-4 text-[0.78rem]">
                Sign in
              </button>
              <button
                onClick={dismiss}
                className="text-[0.78rem] font-semibold text-slate underline underline-offset-2 hover:text-charcoal"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="-m-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-mist hover:text-charcoal"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>}

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={() => {
          setAuthOpen(false);
          setOpen(false);
        }}
        reason="save your designs and continue exploring"
      />
    </>
  );
}
