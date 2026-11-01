"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { AuthModal } from "@/components/AuthModal";
import { readList, setWishlist, WISHLIST_KEY } from "@/lib/local-store";
import { mergeWishlists, pushRemoteSave, pushRemoteUnsave } from "@/lib/wishlist-sync";
import { sendTasteSignal } from "@/components/TasteSignal";

/**
 * Everything that happens AROUND a save, in one place, mounted once.
 *
 * The heart itself is deliberately dumb — it toggles a list and announces it
 * (announceSave). This component is what listens:
 *
 *   1. it confirms the save, so a tap that changes one small icon on a busy
 *      grid still reads as "that worked, and here is where it went";
 *   2. it mirrors the save to the customer's account when there is one, and
 *      merges a guest's list into that account the moment they sign in;
 *   3. it asks for the email — ONCE THERE IS SOMETHING TO KEEP. This is the ask
 *      that used to sit in front of the first save and collected nothing (see
 *      WishlistButton). Someone with three saved designs has told us they are
 *      shopping; someone with none has told us nothing, and gating them lost
 *      the save as well as the address.
 *
 * Nothing here blocks a save, and dismissing the invitation costs the customer
 * nothing but the card.
 */

const SAVE_EVT = "zyvorah:saved";
/** Saves before we ask to keep the list. Two is a coincidence; three is a shortlist. */
const ASK_AT = 3;
const SNOOZE_KEY = "zyv_savekeep_snooze";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
const TOAST_MS = 3200;

type SaveDetail = { handle: string; on: boolean; count: number };

/** Called by the heart. Fire-and-forget; nothing depends on a listener existing. */
export function announceSave(detail: SaveDetail) {
  try {
    window.dispatchEvent(new CustomEvent<SaveDetail>(SAVE_EVT, { detail }));
  } catch {
    /* never let the confirmation break the save */
  }
}

function snoozed(): boolean {
  try {
    const t = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    return t > 0 && Date.now() - t < SNOOZE_MS;
  } catch {
    return false;
  }
}

function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()));
  } catch {
    /* private mode — the card comes back next visit, which is acceptable */
  }
}

export function SaveKeeper() {
  const { session, loading, ensureCustomerId } = useAuth();
  const [toast, setToast] = useState<{ count: number } | null>(null);
  const [invite, setInvite] = useState<{ count: number } | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  /** Guards the one-per-sign-in merge against React re-runs and tab focus. */
  const merged = useRef<string | null>(null);
  const askedThisVisit = useRef(false);

  /* ------------------------- 2) the account's copy ------------------------ */

  // Merge on sign-in, whichever door they came through — the nav, checkout, or
  // the invitation below. Runs once per user id.
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid || merged.current === uid) return;
    merged.current = uid;
    let live = true;
    (async () => {
      const customerId = await ensureCustomerId();
      if (!customerId || !live) return;
      const next = await mergeWishlists(customerId, readList(WISHLIST_KEY));
      if (live) setWishlist(next);
    })();
    return () => {
      live = false;
    };
    // ensureCustomerId is recreated each render by AuthProvider and is not a
    // meaningful dependency; the session id is what this reacts to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  /* ---------------------------- 1) and 3) ------------------------------- */

  const onSave = useCallback(
    (detail: SaveDetail) => {
      const { handle, on, count } = detail;

      // Mirror to the account when there is one. Fire-and-forget: the list the
      // customer can see is already correct.
      if (session) {
        void (async () => {
          const customerId = await ensureCustomerId();
          if (!customerId) return;
          if (on) await pushRemoteSave(customerId, handle);
          else await pushRemoteUnsave(customerId, handle);
        })();
      }

      // Only a save is worth confirming; removing something is its own feedback
      // (the heart empties, the row on the wishlist page goes).
      if (!on) return;
      setToast({ count });

      const shouldAsk =
        !session && !loading && count >= ASK_AT && !askedThisVisit.current && !snoozed();
      if (shouldAsk) {
        askedThisVisit.current = true;
        // After the toast, not over it — two overlapping panels for one tap.
        window.setTimeout(() => setInvite({ count }), TOAST_MS + 200);
      }
    },
    [session, loading, ensureCustomerId],
  );

  useEffect(() => {
    const handler = (e: Event) => onSave((e as CustomEvent<SaveDetail>).detail);
    window.addEventListener(SAVE_EVT, handler as EventListener);
    return () => window.removeEventListener(SAVE_EVT, handler as EventListener);
  }, [onSave]);

  // Auto-hide the toast.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  // The invitation was put in front of someone: that is the denominator for
  // "how many of these asks actually earn an address".
  useEffect(() => {
    if (invite) sendTasteSignal("", "save_prompt");
  }, [invite]);

  const dismissInvite = () => {
    setInvite(null);
    snooze();
  };

  return (
    <>
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-[70] -translate-x-1/2"
        >
          <div className="save-toast flex items-center gap-3 rounded-full border border-edge bg-charcoal px-4 py-2.5 text-surface shadow-2xl">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 20s-7-4.35-9.2-8.35C1.3 8.9 2.6 6 5.5 6 7.4 6 8.7 7 12 10c3.3-3 4.6-4 6.5-4 2.9 0 4.2 2.9 2.7 5.65C19 15.65 12 20 12 20Z" />
            </svg>
            <span className="text-[0.82rem] font-semibold">Saved</span>
            <Link
              href="/wishlist"
              className="text-[0.82rem] font-semibold text-surface/80 underline underline-offset-2 hover:text-surface"
            >
              {toast.count === 1 ? "View your list" : `View all ${toast.count}`}
            </Link>
          </div>
        </div>
      )}

      {invite && !session && (
        <div data-nudge="save-keeper" className="fixed bottom-[5.25rem] right-4 z-40 w-[min(340px,calc(100vw-2rem))] rounded-[18px] border border-edge bg-surface p-4 shadow-2xl sm:bottom-5 sm:right-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold text-charcoal">
                Keep these {invite.count} designs
              </p>
              <p className="mt-0.5 text-xs text-slate">
                They&apos;re saved on this device. Add your email and your list follows you
                — to your phone, and to next time.
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <button onClick={() => setAuthOpen(true)} className="btn h-9 px-4 text-[0.78rem]">
                  Keep my list
                </button>
                <button
                  onClick={dismissInvite}
                  className="text-[0.78rem] font-semibold text-slate underline underline-offset-2 hover:text-charcoal"
                >
                  Not now
                </button>
              </div>
            </div>
            <button
              onClick={dismissInvite}
              aria-label="Dismiss"
              className="-m-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-mist hover:text-charcoal"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={() => {
          setAuthOpen(false);
          setInvite(null);
          sendTasteSignal("", "save_identify");
          // The merge runs off the session change in the effect above.
        }}
        reason="keep your saved designs"
      />
    </>
  );
}
