"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/components/AuthProvider";
import { usePartner } from "@/components/PartnerProvider";
import { AuthModal } from "@/components/AuthModal";

/**
 * The one client-side pattern for "this feature needs a verified email".
 *
 * Browsing stays completely open — this only wraps the actions that cost us
 * money to run (the room visualiser and the other AI features). The matching
 * server-side enforcement is requireGatedUser() in src/lib/auth-server, because
 * a client check alone is decoration.
 *
 * Saving a design is deliberately NOT one of these: it used to be, and the wall
 * collected neither saves nor email addresses (see WishlistButton). A gate
 * belongs in front of a cost, not in front of a shopper's own shortlist.
 *
 * Usage:
 *   const { gate, authModal } = useAuthGate();
 *   <button onClick={() => gate("see this on your wall", doRender)} />
 *   {authModal}
 *
 * The pending action re-runs automatically once verification succeeds, so the
 * customer's click isn't lost to the interruption.
 */
export function useAuthGate() {
  const { session: retail, loading: retailLoading } = useAuth();
  // A partner's person has proved their work address at the portal door; the
  // heart and the design tools must not demand a second, retail identity.
  const { partner, loading: partnerLoading } = usePartner();
  const session = retail ?? partner;
  const loading = retailLoading || partnerLoading;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>();
  const pending = useRef<(() => void) | null>(null);
  // Set when gate() is called before the session check has resolved — the
  // decision is deferred to the effect below rather than guessed, because
  // guessing "signed in" while loading let anonymous visitors straight
  // through if they acted before the auth check finished (e.g. clicking
  // immediately after a page load or direct navigation).
  const [awaiting, setAwaiting] = useState<{ why: string; action: () => void } | null>(null);

  const gate = useCallback(
    (why: string, action: () => void): void => {
      if (session) {
        action();
        return;
      }
      if (loading) {
        setAwaiting({ why, action });
        return;
      }
      pending.current = action;
      setReason(why);
      setOpen(true);
    },
    [session, loading],
  );

  useEffect(() => {
    if (loading || !awaiting) return;
    const { why, action } = awaiting;
    setAwaiting(null);
    if (session) {
      action();
    } else {
      pending.current = action;
      setReason(why);
      setOpen(true);
    }
  }, [loading, session, awaiting]);

  /** Open the prompt directly — for a 401 coming back from a gated route. */
  const promptAuth = useCallback((why?: string) => {
    setReason(why);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    pending.current = null;
    setOpen(false);
  }, []);

  const succeed = useCallback(() => {
    setOpen(false);
    const action = pending.current;
    pending.current = null;
    action?.();
  }, []);

  // Portalled to <body>, and swallowing clicks, because the heart lives inside
  // the product card's <Link> — without this, every click in the modal (even
  // typing into the email field) would also navigate to the product page.
  // A portal alone isn't enough: React events bubble through the component tree,
  // not the DOM tree, so the stopPropagation wrapper is doing the real work.
  // No mounted flag needed: `open` only flips on a click, which is always after
  // hydration, so the server and first client render always agree on `null`.
  const authModal =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <AuthModal open onClose={close} onSuccess={succeed} reason={reason} />
          </div>,
          document.body,
        )
      : null;

  return { gate, promptAuth, authModal, signedIn: Boolean(session), loading };
}

/** True when a gated route turned us away — pair with promptAuth(). */
export function isAuthRequired(res: Response, body?: unknown): boolean {
  if (res.status !== 401) return false;
  const code = (body as { code?: string } | null)?.code;
  return code === undefined || code === "auth_required";
}
