"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * The product page's next step, pinned to the bottom of a phone screen until
 * the wall builder itself is on screen.
 *
 * On a phone the builder ("Create your wall") starts well over a screen down,
 * past the gallery, title and price. The inline "Measure & price my wall"
 * button sits under the price, which on a real iPhone is a short scroll below
 * the first screen once Safari's own bars take their share (founder, 6 October
 * 2026: put it on the first screen). This bar is that button, always on
 * screen, and it steps aside the moment the builder's card scrolls into view,
 * so it can never cover the builder's own Continue or Add to cart.
 *
 * It publishes its height as --configure-bar-h, which the WhatsApp launcher
 * adds to its lift. Its own variable, not the builder's --sticky-cta-h: the
 * builder's ResizeObserver writes that one (0 while its bar is hidden) and
 * the two writers raced, leaving the launcher over this bar's right end.
 */
export function MobileConfigureBar({ targetId, children }: { targetId: string; children: ReactNode }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const phone = window.matchMedia("(max-width: 1023px)");
    let frame = 0;
    const update = () => {
      frame = 0;
      // Shown while the builder is still BELOW the screen; gone once any of
      // it is on screen or it has been scrolled past.
      const top = target.getBoundingClientRect().top;
      setShown(phone.matches && top > window.innerHeight - 40);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    phone.addEventListener("change", update);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      phone.removeEventListener("change", update);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [targetId]);

  useEffect(() => {
    const root = document.documentElement;
    if (!shown) return;
    // 4.5rem: the bar's height. The builder's sticky bars measure theirs; this
    // one is fixed-height, so a constant is exact.
    root.style.setProperty("--configure-bar-h", "4.5rem");
    // The bar carries its own WhatsApp button, so the floating launcher steps
    // aside while it is up (globals.css, html[data-configure-bar]).
    root.dataset.configureBar = "on";
    return () => {
      root.style.removeProperty("--configure-bar-h");
      delete root.dataset.configureBar;
    };
  }, [shown]);

  return (
    <div
      aria-hidden={!shown}
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-cloud/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md transition-transform duration-300 lg:hidden ${
        shown ? "" : "pointer-events-none translate-y-full"
      }`}
    >
      {children}
    </div>
  );
}
