"use client";

import { usePathname } from "next/navigation";

/**
 * The store wordmark stays unchanged everywhere except the TAASH collection.
 * There, its dot takes the collection's Sindoor red so the shared site chrome
 * belongs to the page's palette without changing the Zyvorah letterforms.
 */
export function BrandWordmark({ className }: { className: string }) {
  const src = "/brand/mimi-pip/full-logo.png";
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="MimiPip" className={className} />;
}
