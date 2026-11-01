"use client";

import { useEffect, useState } from "react";
import { ProductCard } from "@/components/ProductCard";
import type { ProductCardData } from "@/lib/types";

/**
 * Hydrates a list of handles into cards (via /api/products) and renders a
 * heading + responsive grid. Renders nothing until at least one handle
 * resolves, so empty states never flash. Used by recently-viewed & wishlist.
 */
export function ProductRow({
  handles,
  heading,
  emptyText,
  category,
}: {
  handles: string[];
  heading?: string;
  emptyText?: string;
  category?: string;
}) {
  const [products, setProducts] = useState<ProductCardData[] | null>(null);

  useEffect(() => {
    if (!handles.length) {
      setProducts([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/products?handles=${encodeURIComponent(handles.join(","))}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        // preserve the incoming handle order
        const order = new Map(handles.map((h, i) => [h, i]));
        const list = ((d.products as ProductCardData[]) ?? []).sort(
          (a, b) => (order.get(a.handle) ?? 0) - (order.get(b.handle) ?? 0),
        );
        setProducts(list);
      })
      .catch(() => !cancelled && setProducts([]));
    return () => {
      cancelled = true;
    };
  }, [handles]);

  if (products === null) return null;
  const shown = category ? products.filter(product => product.category === category) : products;
  if (shown.length === 0) {
    return emptyText ? <p className="py-16 text-center text-sm text-slate">{emptyText}</p> : null;
  }

  return (
    <div>
      {heading && <h2 className="mb-6 text-2xl">{heading}</h2>}
      <div className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">
        {shown.map((p) => (
          <ProductCard key={p.handle} product={p} />
        ))}
      </div>
    </div>
  );
}
