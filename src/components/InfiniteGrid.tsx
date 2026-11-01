"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductCardData } from "@/lib/types";
import { ProductCard } from "@/components/ProductCard";
import { CollectionProductCard } from "@/components/CollectionProductCard";
import { BorderStripCard } from "@/components/BorderStripCard";

type ParamValue = string | string[] | boolean | undefined;

/**
 * Product grid that keeps loading the next page as the shopper scrolls, instead
 * of numbered pagination — a "constant scroll down" feed. Renders the initial
 * (server-rendered, SEO-visible) page, then fetches subsequent pages from
 * /api/browse via an IntersectionObserver, prefetching before the shopper hits
 * the bottom so the scroll never stalls. A "Load more" button is the fallback
 * (keyboard users, or if the observer never fires).
 */
export function InfiniteGrid({
  initial,
  total,
  params,
  card,
  gridClassName,
  startPage = 1,
}: {
  initial: ProductCardData[];
  total: number;
  params: Record<string, ParamValue>;
  /** "border" renders the length family's full-width running-strip card. */
  card: "product" | "collection" | "border";
  gridClassName: string;
  startPage?: number;
}) {
  const [items, setItems] = useState<ProductCardData[]>(initial);
  const [page, setPage] = useState(initial.length ? startPage : startPage - 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initial.length === 0 && total > 0);
  const [done, setDone] = useState(initial.length >= total);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    setError(false);
    const next = page + 1;
    try {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === false) continue;
        if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
        else if (v === true) qs.set(k, "1");
        else qs.set(k, v);
      }
      qs.set("page", String(next));
      const res = await fetch(`/api/browse?${qs.toString()}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { cards: ProductCardData[] };
      if (!Array.isArray(data.cards) || (data.cards.length === 0 && items.length === 0 && total > 0)) {
        throw new Error("Catalogue temporarily unavailable");
      }
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.handle));
        const merged = [...prev, ...data.cards.filter((c) => !seen.has(c.handle))];
        setDone(merged.length >= total || data.cards.length === 0);
        return merged;
      });
      setPage(next);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [loading, done, page, params, total, items.length]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || done || error) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, done, error]);

  return (
    <>
      {error && <p role="alert" className="my-6 text-sm text-slate">We couldn’t load these designs. Please retry below; your filters are kept.</p>}
      <div className={gridClassName}>
        {items.map((p) =>
          // A border is a long strip WHEREVER it appears. Colour and room
          // listings select by tag across the whole catalogue, so borders turn
          // up in grids built for wallpaper — and a square crop of a 13:1 strip
          // is an unrecognisable sliver. It takes the full row instead.
          card === "border" || p.measurementType === "length" ? (
            <div key={p.handle} className="col-span-full">
              <BorderStripCard product={p} />
            </div>
          ) : card === "collection" ? (
            <CollectionProductCard key={p.handle} product={p} />
          ) : (
            <ProductCard key={p.handle} product={p} />
          ),
        )}
      </div>

      {!done && (
        <div ref={sentinel} className="mt-12 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="rounded-[12px] border border-edge px-6 py-3 text-sm font-semibold text-slate transition-colors hover:border-charcoal hover:text-charcoal disabled:opacity-50"
          >
            {loading ? "Loading…" : error ? "Retry" : "Load more"}
          </button>
        </div>
      )}
    </>
  );
}
