"use client";

import { useEffect } from "react";

// The collab & press queue moved into the marketing desk on 27 Sep 2026 — one
// window she opens daily, with whatever needs her on top. This path stays so
// older links (and habit) still land on the queue.
export default function OutreachAdminPage() {
  useEffect(() => {
    window.location.replace("/admin/marketing?tab=collabs");
  }, []);
  return null;
}
