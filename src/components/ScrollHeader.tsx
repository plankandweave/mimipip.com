"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The site header's sticky shell. On a phone (below `md`) it slides away while
 * the shopper scrolls DOWN and comes straight back the moment they scroll UP.
 *
 * Why (6 October 2026): with the shipping strip, the logo row and the Shop by
 * rail, the phone header is ~160px — a fifth of an iPhone screen, held over
 * every page, including the wall builder where the shopper needs the room.
 * Scrolling up is the gesture people already use to look for the menu, so
 * nothing becomes harder to reach.
 *
 * It publishes `--header-offset` on <html>: the header's height while shown,
 * 0 while hidden. Anything sticky below the header (the collection filter bar)
 * sits at `top-[var(--header-offset)]`, so it neither hides under the header
 * nor leaves a gap where the header was.
 */
export function ScrollHeader({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const phone = window.matchMedia("(max-width: 767px)");
    let last = window.scrollY;
    let hide = false;
    let frame = 0;

    const publish = () => root.style.setProperty("--header-offset", `${hide ? 0 : Math.round(el.offsetHeight)}px`);

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      let next = hide;
      if (!phone.matches || y < 120) next = false;
      // Never while something in it is in use: the search field being typed
      // in, an open menu, or the "Ask us" chat panel, which hangs off this
      // header and would be carried off-screen with it.
      else if (
        // Typing only: a tapped rail link keeps focus after navigating, and
        // must not pin the header open on the page it led to.
        (el.contains(document.activeElement) && document.activeElement?.matches("input, textarea, select")) ||
        el.querySelector('[aria-expanded="true"], #zyvorah-concierge')
      ) next = false;
      else if (y > last + 8) next = true;
      else if (y < last - 8) next = false;
      if (Math.abs(y - last) > 8 || y < 120) last = y;
      if (next !== hide) {
        hide = next;
        setHidden(next);
        publish();
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener("scroll", onScroll, { passive: true });
    phone.addEventListener("change", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      phone.removeEventListener("change", update);
      if (frame) cancelAnimationFrame(frame);
      root.style.removeProperty("--header-offset");
    };
  }, []);

  return (
    <header
      ref={ref}
      data-hidden={hidden || undefined}
      className={`${className} transition-transform duration-300 ${hidden ? "-translate-y-full" : ""}`}
    >
      {children}
    </header>
  );
}
