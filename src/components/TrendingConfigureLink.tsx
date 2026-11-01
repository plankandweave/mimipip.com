"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { gaEvent } from "@/lib/ga";

/**
 * The one-tap link on a Trending pin (src/lib/trending-pins.ts). A plain link
 * — the whole point is that it is one tap with nothing in the way — that also
 * records the tap, so the pin's conversion can be read against the cart
 * activity that justified it.
 */
export function TrendingConfigureLink({
  href,
  handle,
  placement,
  className,
  children,
  ariaLabel,
}: {
  href: string;
  handle: string;
  /** Where the pin was shown: "home" or the collection handle. */
  placement: string;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <Link
      href={href}
      className={className}
      aria-label={ariaLabel}
      onClick={() => gaEvent("trending_pin_click", { item_id: handle, placement })}
    >
      {children}
    </Link>
  );
}
