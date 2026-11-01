"use client";

import { useEffect, useState } from "react";
import { ProductCard } from "@/components/ProductCard";
import type { ProductCardData } from "@/lib/types";

/**
 * "Picked for you" — appears only once the visitor's taste profile has enough
 * signal (the API returns [] before that), so the page never shows an empty or
 * generic personalised section. Client-fetched so the page itself stays
 * cacheable. No buttons, no setup — it just starts appearing.
 */
export function ForYouRow({ exclude = [], count = 8, title = "Picked for you", category }: { exclude?: string[]; count?: number; title?: string; category?: string }) {
  const [items, setItems] = useState<ProductCardData[] | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams({ count: String(count) });
    if (exclude.length) qs.set("exclude", exclude.join(","));
    fetch(`/api/for-you?${qs}`)
      .then((r) => r.json())
      // H9 (30 Sep 2026 walkthrough): internal commercial job pages ("Project
      // entrance experience wall" etc.) leaked into recommendations — they're
      // real rows in the same product table, just never meant for a shopper.
      // /api/for-you already hides this row for anyone without real browsing
      // signal (MIN_EVENTS in src/app/api/for-you/route.ts, from the
      // TasteSignal-fed taste profile) — this filter belongs to the row
      // itself, since it's about WHAT shows, not WHETHER the row does.
      .then((d) => setItems((d.items ?? []).filter((p: ProductCardData) => !p.title?.startsWith("Project "))))
      .catch(() => setItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = category ? items?.filter(item => item.category === category) : items;
  if (!shown || shown.length < 4) return null;

  return (
    <section className="container-x py-16">
      <div className="mb-8">
        <p className="caps text-mist">Based on what you&apos;ve been drawn to</p>
        <h2 className="mt-2 text-3xl">{title}</h2>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">
        {shown.map((p) => (
          <ProductCard key={p.handle} product={p} />
        ))}
      </div>
    </section>
  );
}
