"use client";

import { useEffect, useState } from "react";

/**
 * A slim reading-progress rail — the book's only navigation.
 *
 * Deliberately not a page-turn flipbook: those are slow, break on phones, and
 * half these links open on a phone in a car. A quiet rail plus one-idea-per-
 * screen pacing gives the feeling of a book without the cost of pretending to
 * be one, and it tells a skimming reader how much is left.
 */
export function ChapterRail({ chapters }: { chapters: string[] }) {
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const nodes = chapters
      .map((_, i) => document.getElementById(`chapter-${i + 1}`))
      .filter((n): n is HTMLElement => Boolean(n));
    if (nodes.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const idx = nodes.indexOf(e.target as HTMLElement);
            if (idx >= 0) setActive(idx);
          }
        }
      },
      // A band across the middle of the viewport, so the marker tracks what
      // the reader is actually looking at rather than what has just entered.
      { rootMargin: "-45% 0px -45% 0px" },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [chapters]);

  return (
    <nav
      aria-label="Chapters"
      className="book-no-print fixed top-1/2 right-4 z-40 hidden -translate-y-1/2 flex-col gap-2.5 lg:flex"
    >
      {chapters.map((label, i) => (
        <a
          key={label + i}
          href={`#chapter-${i + 1}`}
          className="group flex items-center justify-end gap-2"
          aria-current={active === i ? "true" : undefined}
        >
          <span
            className="pointer-events-none rounded-full px-2 py-0.5 text-[0.65rem] font-semibold whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100"
            style={{ background: "var(--book-ink)", color: "var(--book-ground)" }}
          >
            {label}
          </span>
          <span
            className="h-px transition-all duration-300"
            style={{
              width: active === i ? "26px" : "14px",
              background: active === i ? "var(--book-accent)" : "var(--book-rule)",
            }}
          />
        </a>
      ))}
    </nav>
  );
}
