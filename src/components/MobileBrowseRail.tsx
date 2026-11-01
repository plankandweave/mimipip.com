"use client";

import { useJourneyBrowseLinks } from "./ShoppingJourney";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { WRAPS_HOST, isWrapsPath } from "@/lib/wraps-paths";

export type BrowseLink = { label: string; href: string };

/**
 * The phone's way into the catalogue, always on screen (below `md`).
 *
 * Above `md` the header carries Homes and the Shop mega-menu; below it both
 * drop out and, until 6 October 2026, a phone visitor saw a logo, a hamburger
 * and a video — no word anywhere saying the shop could be browsed by room,
 * colour, style or collection (founder: "there is no place to even look for
 * the collections, concepts, colours"). This rail puts those axes one tap away
 * on every page, inside the sticky header so it never scrolls out of reach.
 *
 * The first four fit a 360px screen whole; the fifth is cut by the edge on
 * purpose, so the row reads as something you can swipe.
 *
 * Not on the appliance-wraps range (founder, 6 October 2026): its pages have
 * their own appliance sub-nav, and a row of wallpaper axes above it sent a
 * shopper looking at fridge panels off to Rooms and Colours. Hidden by path
 * (known at render, no flicker) and, for the wraps.zyvorah.com home whose
 * address is a bare "/", by host — client-side like StorefrontOnly, because
 * the shop's pages are cached once for every host.
 */
const subscribe = () => () => {};
const onWrapsHost = () => window.location.hostname === WRAPS_HOST;

export function MobileBrowseRail({ links, lead }: { links: BrowseLink[]; lead?: ReactNode }) {
  const journeyLinks = useJourneyBrowseLinks(links);
  const pathname = usePathname();
  const wrapsHost = useSyncExternalStore(subscribe, onWrapsHost, () => false);
  if (links.length === 0 || wrapsHost || isWrapsPath(pathname ?? "")) return null;

  return (
    <nav aria-label="Shop by" className="border-b border-edge md:hidden">
      {/* The right edge fades, so on a 360px screen — where Collections ends
          flush with it — the row still reads as one that scrolls. */}
      <div className="flex items-center">
      {/* The concierge ("Ask us") on a phone: pinned at the rail's start so it
          never scrolls away, now that the strip above the logo is desktop-only. */}
      {lead && <div className="shrink-0 pl-2">{lead}</div>}
      <div className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto px-3 py-2 [mask-image:linear-gradient(to_right,black_85%,transparent)]">
        {journeyLinks.map((l) => {
          const active = pathname === l.href;
          return (
            // prefetch off — like MegaMenu, a rail of nine links in view on
            // every page would otherwise fire nine prefetches per navigation.
            <Link
              key={l.label}
              href={l.href}
              prefetch={false}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[0.82rem] font-medium transition-colors ${
                active
                  ? "border-charcoal bg-charcoal text-cloud"
                  : "border-edge bg-surface text-charcoal hover:border-charcoal/40"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
      </div>
    </nav>
  );
}
