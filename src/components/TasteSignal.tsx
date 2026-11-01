"use client";

import { useEffect } from "react";
import { gaEvent, gaViewItem } from "@/lib/ga";
import { metaViewContent } from "@/lib/meta-pixel";
import { visitorReady } from "@/lib/visitor-ready";

/**
 * Invisible taste-signal beacon. Mounted on a product page it records a "view"
 * for that design (once per mount, fire-and-forget) — the raw material for the
 * "Picked for you" personalisation. Renders nothing.
 */
export function TasteSignal({
  handle,
  title,
  action = "view",
}: {
  handle: string;
  /** the design's real title — GA reports items by name, not by handle */
  title?: string;
  action?: string;
}) {
  useEffect(() => {
    // Keep the historical 3-second interest signal, but expose arrivals too:
    // a shopper leaving before that gate is precisely the loss we must see.
    if (action === "view") gaEvent("product_arrival", { item_id: handle });
    const t = setTimeout(() => {
      void visitorReady().then(() =>
        fetch("/api/taste/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle, action }),
          keepalive: true,
        }).catch(() => {}),
      );
      // small delay so instant bounces don't count as interest
      // Same 3s "genuine interest" gate for both channels: Meta's ViewContent
      // seeds catalogue retargeting, and an instant bounce is not interest.
      if (action === "view") {
        gaViewItem(handle, title);
        metaViewContent({ handle, title });
      }
    }, 3000);
    return () => clearTimeout(t);
  }, [handle, title, action]);

  return null;
}

/** Imperative helper for event-driven signals (save / cart / visualize). */
export function sendTasteSignal(handle: string, action: string) {
  try {
    void visitorReady().then(() =>
      fetch("/api/taste/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, action }),
        keepalive: true,
      }).catch(() => {}),
    );
  } catch {
    /* never let telemetry break the UI */
  }
}
