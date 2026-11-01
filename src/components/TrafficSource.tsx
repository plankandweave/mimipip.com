"use client";

import { useEffect } from "react";
import { markVisitorReady } from "@/lib/visitor-ready";
import { sendTraffic, trafficPayload, type TrafficPayload } from "@/lib/traffic-beacon";

let pending: Promise<void> | null = null;
let original: TrafficPayload | null = null;

/** Keep the original landing on retries; only acknowledge a successful write. */
export function TrafficSource() {
  useEffect(() => {
    if (window.location.pathname.startsWith("/trace/") || window.location.pathname.startsWith("/walk/")) { markVisitorReady(); return; }
    if (pending) return;
    try {
      if (sessionStorage.getItem("zyv_src_v2")) { markVisitorReady(); return; }
      const saved = sessionStorage.getItem("zyv_src_pending");
      if (saved) {
        const candidate = JSON.parse(saved) as TrafficPayload;
        if (candidate && typeof candidate.requestId === "string" && typeof candidate.landing === "string" && typeof candidate.referrer === "string") original = candidate;
      }
    } catch { /* Storage may be unavailable; in-memory attribution still works. */ }
    try {
      original ??= trafficPayload(window.location.href, document.referrer || "", crypto.randomUUID());
    } catch {
      // Older browsers without randomUUID must still be able to shop.
      markVisitorReady();
      return;
    }
    try { sessionStorage.setItem("zyv_src_pending", JSON.stringify(original)); } catch { /* private mode */ }
    pending = sendTraffic(original).then(ok => {
      if (!ok) return;
      try {
        sessionStorage.setItem("zyv_src_v2", "1");
        sessionStorage.removeItem("zyv_src_pending");
      } catch { /* private mode */ }
    }).finally(() => { pending = null; }).finally(markVisitorReady);
  }, []);
  return null;
}
