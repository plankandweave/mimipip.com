"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * "Added to your cart" — the answer to pressing Add to cart.
 *
 * Before this, a successful add changed nothing but the cart badge in the
 * header, which on a phone is scrolled off the top of the page: the buyer
 * pressed the button and saw nothing happen (30 Sep 2026 walkthrough).
 *
 * A bottom sheet on a phone, a small panel bottom-right on a desktop. It is a
 * NON-modal dialog: the page behind stays usable, nothing is trapped, and it
 * says what was added (design, size, price) so the customer can check the
 * line before they go to checkout. Focus moves to it on open (so a screen
 * reader hears it), Escape or "Keep browsing" closes it, and focus returns to
 * wherever the customer was — the Add to cart button.
 *
 * Portalled to <body> because the configurator's own wrappers clip and hide
 * floating children (globals.css `.guided-extras`, `.guided-footer`).
 */
export function AddedToCartSheet({
  open,
  onClose,
  title,
  size,
  detail,
  price,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  size: string;
  detail: string;
  price: string;
  /** Under the buttons: the "where should we send this" capture, so the one
   *  moment a shopper is most likely to leave a number is on screen. */
  children?: ReactNode;
}) {
  const checkoutRef = useRef<HTMLAnchorElement | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  // Held in a ref so the effect below runs on open/close only. Parents pass an
  // inline arrow; keyed on it, every parent re-render would re-grab focus.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    checkoutRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // Only hand focus back if it is still inside the sheet (or lost to
      // <body>) — never yank it from somewhere the customer has since moved.
      const active = document.activeElement;
      if (!active || active === document.body || active.closest("[data-added-sheet]")) {
        returnTo.current?.focus({ preventScroll: true });
      }
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-added-sheet
      role="dialog"
      aria-modal="false"
      aria-labelledby="added-sheet-title"
      aria-describedby="added-sheet-line"
      // z-[60]: above the concierge launcher (z-50), which would otherwise sit
      // on the sheet's buttons at the bottom-right.
      className="fixed inset-x-0 bottom-0 z-[60] rounded-t-[22px] border-t border-edge bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[22rem] sm:rounded-[22px] sm:border"
    >
      <div className="flex items-start justify-between gap-3">
        <p id="added-sheet-title" className="flex items-center gap-2 font-semibold">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-charcoal">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" />
            <path d="m5.5 8 1.8 1.8 3.2-3.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Added to your cart
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate hover:bg-wash hover:text-charcoal"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div id="added-sheet-line" className="mt-3 flex items-start justify-between gap-3 text-sm">
        <span className="min-w-0">
          <span className="block truncate font-medium text-charcoal">{title}</span>
          <span className="block text-xs text-slate">{[size, detail].filter(Boolean).join(" · ")}</span>
        </span>
        <span className="shrink-0 font-semibold tabular-nums">{price}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={onClose} className="btn btn-ghost h-11 text-[0.8rem]">
          Keep browsing
        </button>
        <Link ref={checkoutRef} href="/checkout" className="btn h-11 text-[0.8rem]">
          Checkout
        </Link>
      </div>
      {children}
    </div>,
    document.body,
  );
}

