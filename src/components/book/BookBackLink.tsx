"use client";

import Link from "next/link";

/**
 * The case study's way back. A shopper who arrived from a design page must be
 * able to return to THAT design, not only to the projects index (Roheena,
 * 7 October 2026: "there's no back button"). So when the previous page was on
 * this site, the link steps back in history; otherwise — a shared link, a
 * search result — it goes to the index. It is a real link either way, so it
 * still works as static HTML before hydration.
 */
export function BookBackLink({ href, label }: { href: string; label: string }) {
  function onClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    try {
      const from = document.referrer ? new URL(document.referrer) : null;
      if (from && from.origin === window.location.origin && window.history.length > 1) {
        event.preventDefault();
        window.history.back();
      }
    } catch { /* fall through to the index */ }
  }
  return (
    <Link
      href={href}
      onClick={onClick}
      className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold transition-opacity hover:opacity-70"
      style={{ color: "var(--book-ink)" }}
    >
      <span aria-hidden="true">←</span> Back<span className="sr-only"> to {label}</span>
    </Link>
  );
}
