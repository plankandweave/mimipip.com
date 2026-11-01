"use client";

import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/CartProvider";
import { canvasJourney, canvasBrowseLinks } from "@/lib/shopping-journey";

const JourneyContext = createContext({ canvas: false, product: false, publish: (_value: { path: string; canvas: boolean }) => {} });

/** Product/collection pages publish their authoritative category; no handle guessing. */
export function ShoppingJourneyProvider({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "/";
  const { items } = useCart();
  const [page, publish] = useState({ path: "", canvas: false });
  const canvas = canvasJourney(path, page, items);
  return <JourneyContext.Provider value={{ canvas, product: path.startsWith("/products/"), publish }}>{children}</JourneyContext.Provider>;
}

export function ShoppingJourney({ canvas }: { canvas: boolean }) {
  const path = usePathname() ?? "/";
  const { publish } = useContext(JourneyContext);
  useLayoutEffect(() => { publish({ path, canvas }); }, [path, canvas, publish]);
  return null;
}

export function useCanvasJourney() { return useContext(JourneyContext).canvas; }
export function useJourneyBrowseLinks<T extends { label: string; href: string }>(links: T[]) {
  const { canvas, product } = useContext(JourneyContext);
  return canvas ? canvasBrowseLinks(links, product) : links;
}

export function JourneyLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const canvas = useCanvasJourney();
  if (canvas && href === "/print-your-own") return null;
  return <Link href={canvas && href === "/design-with" ? "/collections/canvas-art" : href} className={className}>{canvas && href === "/design-with" ? "Find your artwork" : children}</Link>;
}
