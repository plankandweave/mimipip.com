"use client";

import { useEffect } from "react";
import { initializeMetaPixel } from "@/lib/meta-pixel";

/** Loads the Meta Pixel once per page load; disclosed in the privacy policy. */
export function MetaPixel({ pixelId }: { pixelId?: string }) {
  useEffect(() => {
    if (window.location.pathname.startsWith("/trace/") || window.location.pathname.startsWith("/walk/")) return;
    if (!pixelId || !initializeMetaPixel(pixelId)) return;
    const src = "https://connect.facebook.net/en_US/fbevents.js";
    if (!document.querySelector(`script[src="${src}"]`)) {
      const script = document.createElement("script");
      script.async = true;
      script.src = src;
      document.head.appendChild(script);
    }
    window.fbq?.("track", "PageView");
  }, [pixelId]);
  return null;
}
