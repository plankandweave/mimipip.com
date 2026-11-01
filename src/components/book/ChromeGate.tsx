"use client";

import { usePathname } from "next/navigation";

/**
 * Suppresses the shop chrome on immersive routes.
 *
 * The case-study book has to read as a design practice's presentation, not a
 * product page — a mega-menu, cart icon and wishlist above it kill exactly the
 * effect the book exists to create. The root layout hard-wires Header/Footer
 * for every route and `Header` is a server component that queries the
 * database, so the cheap, low-risk way to exempt one route family is to gate
 * the render on the pathname here rather than restructure ~90 route folders
 * into a `(site)` group.
 *
 * Books carry their own minimal chrome (wordmark, chapter rail, one call to
 * action), so nothing is lost by hiding this.
 */
const BARE_ROUTES = [/^\/trace(?:\/|$)/, /^\/walk(?:\/|$)/, /^\/collections\/beyond-the-blue\/?$/, /^\/projects\/[^/]+$/, /^\/partners\/vijay-sales(?:\/|$)/, /^\/presentations\/iilm-greater-noida$/];

export function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  if (BARE_ROUTES.some((re) => re.test(pathname))) return null;
  return <>{children}</>;
}
