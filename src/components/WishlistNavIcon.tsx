"use client";

import Link from "next/link";
import { useLocalList, WISHLIST_KEY } from "@/lib/local-store";

export function WishlistNavIcon() {
  const list = useLocalList(WISHLIST_KEY);
  const count = list.length;
  return (
    <Link
      href="/wishlist"
      aria-label={count ? `Wishlist (${count})` : "Wishlist"}
      className="relative grid h-10 w-10 place-items-center rounded-full text-charcoal transition-colors hover:bg-wash"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M12 20s-7-4.35-9.2-8.35C1.3 8.9 2.6 6 5.5 6 7.4 6 8.7 7 12 10c3.3-3 4.6-4 6.5-4 2.9 0 4.2 2.9 2.7 5.65C19 15.65 12 20 12 20Z" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-charcoal px-1 text-[0.6rem] font-bold text-surface">
          {count}
        </span>
      )}
    </Link>
  );
}
