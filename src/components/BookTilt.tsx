"use client";

import { useCallback, useRef } from "react";

/**
 * The book follows the hand.
 *
 * The keepsake edition is sold as an object, and an object you can move is more
 * believable than a photograph of one — so the render tilts with the pointer,
 * as if picked up and turned a little toward the light. The three-quarter
 * perspective is already painted into the image; this rotates it on top of
 * that. The travel is +/-15 degrees across the frame and +/-10 up and down —
 * enough that crossing the picture turns the book rather than nudging it. The
 * first pass was half that and read as a wobble: too small to be handling, big
 * enough to look like a bug. Nothing is behind the interaction and nothing depends on it:
 * on touch devices the book simply stands still, exactly as before.
 *
 * Pointer position is written to CSS custom properties, not React state — this
 * fires per mousemove, and re-rendering an image subtree at pointer rate is a
 * dropped frame waiting to happen. rAF-coalesced, same as the teaser lens.
 */
export function BookTilt({ children }: { children: React.ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);

  const move = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = frame.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.setProperty("--book-ry", `${(px * 30).toFixed(2)}deg`);
      el.style.setProperty("--book-rx", `${(-py * 20).toFixed(2)}deg`);
    });
  }, []);

  // Let go and it settles back upright — a book left tilted against a corner
  // reads as a stuck element, not a handled one.
  const rest = useCallback(() => {
    const el = frame.current;
    if (!el) return;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    el.style.setProperty("--book-ry", "0deg");
    el.style.setProperty("--book-rx", "0deg");
  }, []);

  return (
    <div ref={frame} onPointerMove={move} onPointerLeave={rest} className="book-tilt">
      <div className="book-tilt-inner">{children}</div>
    </div>
  );
}
