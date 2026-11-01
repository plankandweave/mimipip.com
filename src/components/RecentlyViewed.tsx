"use client";

import { useEffect, useState } from "react";
import { recordRecent, readList, RECENT_KEY } from "@/lib/local-store";
import { ProductRow } from "@/components/ProductRow";

/** Drop on a product page: records the view and shows other recent designs. */
export function RecentlyViewed({ currentHandle, category }: { currentHandle: string; category?: string }) {
  const [handles, setHandles] = useState<string[] | null>(null);

  useEffect(() => {
    // Snapshot synchronously BEFORE recording this view, so the strip shows
    // what you saw earlier (excluding the current page) without a race.
    const prior = readList(RECENT_KEY).filter((h) => h !== currentHandle).slice(0, 4);
    setHandles(prior);
    recordRecent(currentHandle);
  }, [currentHandle]);

  if (!handles || handles.length === 0) return null;

  return (
    <section className="container-x py-8">
      <ProductRow category={category} handles={handles} heading="Recently viewed" />
    </section>
  );
}
