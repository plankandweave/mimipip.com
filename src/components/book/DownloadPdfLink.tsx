"use client";

import { useEffect, useRef, useState } from "react";
import { gaEvent } from "@/lib/ga";

/**
 * The case-study "Download PDF" control.
 *
 * A client component only so it can fire a GA4 `file_download` event on the way
 * out — GA4's own enhanced-measurement download tracking keys off the file
 * extension in the href, and ours is `/api/projects/<slug>/download` (no `.pdf`),
 * so it would never auto-fire. The server route logs the same download to
 * first-party site_events; this is the browser half that carries the source and
 * campaign so we can see WHICH traffic downloads studies.
 *
 * The endpoint responds with Content-Disposition: attachment, so the click
 * downloads the file without navigating away — the event has time to send.
 */
export function DownloadPdfLink({ slug }: { slug: string }) {
  const href = `/api/projects/${slug}/download`;
  // The PDF is built on request and takes several seconds before the browser
  // shows anything. With no sign of that, readers clicked again — each study's
  // downloads arrived in threes — so the button says it is working and ignores
  // repeat clicks until the file has had time to arrive.
  const [preparing, setPreparing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <a
      href={href}
      aria-busy={preparing}
      onClick={(e) => {
        if (preparing) {
          e.preventDefault();
          return;
        }
        setPreparing(true);
        timer.current = setTimeout(() => setPreparing(false), 15_000);
        gaEvent("file_download", {
          file_name: `Zyvorah-${slug}.pdf`,
          file_extension: "pdf",
          link_url: href,
          slug,
        });
      }}
      className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-85"
      style={{
        background: "var(--book-ink)",
        color: "var(--book-ground)",
        opacity: preparing ? 0.7 : undefined,
      }}
    >
      {preparing ? "Preparing PDF…" : "Download PDF ↓"}
    </a>
  );
}
