"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="text-amber-500" aria-hidden>
      {"★★★★★".slice(0, full)}
      <span className="text-mist">{"★★★★★".slice(full)}</span>
    </span>
  );
}

/** Compact live rating shown near the product title; links to the reviews section. */
export function RatingSummary({ handle }: { handle: string }) {
  const [data, setData] = useState<{ count: number; average: number } | null>(null);

  useEffect(() => {
    supabaseBrowser.rpc("product_rating", { p_handle: handle }).then(({ data }) => {
      if (data) setData(data as { count: number; average: number });
    });
  }, [handle]);

  if (!data || data.count === 0) {
    // Render nothing — "No reviews yet" directly under the title told a
    // nervous first-time buyer that nobody has bought this design (Roheena,
    // 30 Sep 2026 walkthrough). The reviews section further down the page
    // still carries its own "write a review" form for a verified buyer.
    return null;
  }
  return (
    <a href="#reviews" className="flex items-center gap-1 text-sm">
      <Stars value={data.average} />
      <span className="ml-1 text-slate">
        {data.average.toFixed(1)} · {data.count} {data.count === 1 ? "review" : "reviews"}
      </span>
    </a>
  );
}
