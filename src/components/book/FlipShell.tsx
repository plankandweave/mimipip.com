"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The flip book's interaction brain. The spreads themselves are
 * server-rendered children (FlipBook maps data to markup); this shell owns
 * only what needs a browser: the scroller, wheel translation, keyboard,
 * edge arrows and the progress mark.
 *
 * Everything degrades: CSS scroll-snap plus native horizontal scroll work
 * before hydration, so a reader on a slow connection can already swipe or
 * shift-wheel through the book — the same static-first philosophy as
 * BookTopBar.
 *
 * Wheel handling is PAGE-TURN INTENT, not scroll mapping. Continuously
 * writing scrollLeft from deltaY fights mandatory snap's re-snap and
 * jitters; instead a vertical wheel gesture accumulates and, past a
 * threshold, turns exactly one spread, then locks until the scroll settles
 * (`scrollend` where it exists; a timer where Safari hasn't shipped it).
 * Horizontal trackpad swipes pass through untouched — that is native
 * scrolling and the browser already does it perfectly.
 */
export function FlipShell({ children, count }: { children: ReactNode; count: number }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const turning = useRef(false);
  const wheelSum = useRef(0);

  const spreadOffsets = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return [];
    return Array.from(el.querySelectorAll<HTMLElement>("[data-spread]")).map((s) => s.offsetLeft);
  }, []);

  const goTo = useCallback(
    (i: number) => {
      const el = scrollerRef.current;
      if (!el) return;
      const offsets = spreadOffsets();
      const clamped = Math.max(0, Math.min(offsets.length - 1, i));
      const left = offsets[clamped] ?? 0;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      turning.current = true;
      el.scrollTo({ left, behavior: reduced ? "auto" : "smooth" });
      // Smooth scrolling silently stalls in a few environments (embedded
      // panes suspend the animation after a frame or two). Judge the
      // fallback by DISTANCE TO TARGET, not by whether anything moved — a
      // scroll that crept three pixels and died must still be completed.
      window.setTimeout(() => {
        if (Math.abs(el.scrollLeft - left) > 40) el.scrollLeft = left;
      }, 400);
      window.setTimeout(() => { turning.current = false; }, 650);
    },
    [spreadOffsets],
  );

  // Current spread + progress, from scroll position, rAF-throttled.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = el.scrollWidth - el.clientWidth;
        setProgress(max > 0 ? el.scrollLeft / max : 0);
        const offsets = spreadOffsets();
        let i = 0;
        for (let k = 0; k < offsets.length; k++) if (offsets[k] <= el.scrollLeft + el.clientWidth / 3) i = k;
        setIndex(i);
      });
    };
    const onEnd = () => { turning.current = false; };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", onEnd);
    onScroll();
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", onEnd);
    };
  }, [spreadOffsets]);

  // Wheel: vertical intent turns a page; horizontal passes through native.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // trackpad swipe → native
      e.preventDefault();
      if (turning.current) return;
      wheelSum.current += e.deltaY;
      if (Math.abs(wheelSum.current) > 60) {
        const dir = wheelSum.current > 0 ? 1 : -1;
        wheelSum.current = 0;
        const offsets = spreadOffsets();
        let i = 0;
        for (let k = 0; k < offsets.length; k++) if (offsets[k] <= el.scrollLeft + 4) i = k;
        goTo(i + dir);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [goTo, spreadOffsets]);

  // Window-level, not on the scroller: a reader who has clicked nothing yet
  // still expects the arrow keys to turn pages, and focus in a page this
  // sparse is wherever the last click happened to land.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const map: Record<string, () => void> = {
        ArrowRight: () => goTo(index + 1),
        PageDown: () => goTo(index + 1),
        ArrowLeft: () => goTo(index - 1),
        PageUp: () => goTo(index - 1),
        Home: () => goTo(0),
        End: () => goTo(count - 1),
      };
      const run = map[e.key];
      if (run) {
        e.preventDefault();
        run();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goTo, index, count]);

  return (
    <>
      <div className="relative flex-1 flex min-h-0">
        <button
          type="button"
          className="flip-nav flip-nav--prev"
          aria-label="Previous page"
          disabled={index <= 0}
          onClick={() => goTo(index - 1)}
        >
          ←
        </button>
        <div
          ref={scrollerRef}
          className="flip-scroller"
          tabIndex={0}
          role="region"
          aria-roledescription="carousel"
          aria-label="Case study pages"
        >
          {children}
        </div>
        <button
          type="button"
          className="flip-nav flip-nav--next"
          aria-label="Next page"
          disabled={index >= count - 1}
          onClick={() => goTo(index + 1)}
        >
          →
        </button>
        <span className="flip-counter" aria-hidden>
          {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
        </span>
      </div>
      <div className="flip-progress" aria-hidden>
        <span className="flip-progress-mark" style={{ left: `${progress * 100}%` }} />
      </div>
    </>
  );
}
