"use client";

import { useJourneyBrowseLinks, useCanvasJourney } from "./ShoppingJourney";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

import { BrandHomeLink } from "./BrandHomeLink";
import { BrandWordmark } from "./BrandWordmark";
import { ShipToCountry } from "./MarketProvider";

import type { MegaMenuFamily } from "./MegaMenu";
import type { BrowseLink } from "./MobileBrowseRail";

type NavItem = { label: string; href: string };

/**
 * Mobile / tablet navigation, shown below `lg`. It is the only way to reach the
 * four discovery journeys at that width, and on a phone (below `md`, where the
 * header's New and Shop entries drop out too) the only way into the catalogue
 * and photo search as well. Opens a left drawer.
 *
 * Shop is rendered as the tree it is — family, then browse axis, then
 * collection. Flattening it meant sixty entries each reading "Wallpapers &
 * Murals · By Room · …", which is a list pretending to be a hierarchy.
 */
export function MobileNav({
  journeys,
  shop,
  browse,
  homeConcepts = [],
}: {
  journeys: NavItem[];
  homeConcepts?: NavItem[];
  shop: MegaMenuFamily[];
  /** The browse axes, shared with the rail under the header (Header.tsx) —
   *  Wall art's href there is Canvas Art's real destination, never a guess. */
  browse: BrowseLink[];
}) {
  const canvas = useCanvasJourney();
  const journeyDestinations = useJourneyBrowseLinks(journeys);
  const journeyLinks = useJourneyBrowseLinks(browse);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // lock body scroll while the drawer is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const close = () => setOpen(false);
  const openPhotoSearch = () => {
    close();
    // VisualSearch (the header camera) listens for this and opens its modal.
    window.dispatchEvent(new Event("zyvorah:open-visual-search"));
  };

  return (
    <>
      <button
        aria-label="Menu"
        onClick={() => setOpen(true)}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-charcoal transition-colors hover:bg-wash lg:hidden"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm" onClick={close} />
          <div className="absolute inset-y-0 left-0 flex w-[85%] max-w-sm flex-col bg-cloud shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-edge px-5">
              <BrandHomeLink className="shrink-0" onClick={close}>
                <BrandWordmark className="h-6 w-auto" />
              </BrandHomeLink>
              <button
                aria-label="Close menu"
                onClick={close}
                className="grid h-9 w-9 place-items-center rounded-full text-charcoal transition-colors hover:bg-wash"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>

            <nav className="flex flex-1 flex-col overflow-y-auto p-5">
              {/* H7 (30 Sep 2026 first-buyer walkthrough): this drawer opened
                  with 8 big tiles, 6 of them business-sector doors, before a
                  home buyer ever reached a wallpaper. Reordered for the buyer
                  who is actually opening this on a phone: the launch, what's
                  new, then how to shop (by room, then wall art, then the free
                  wall preview) — commercial squeezed into one row, its six
                  sectors listed rather than each taking a full tile. Every
                  sector stays reachable here AND in the footer. */}
{/* 6 Oct 2026: the drawer opened on launch tiles, and by room was the
                  only way to browse it offered — colours, styles, collections
                  and concepts sat in collapsed rows far below. A phone shopper
                  asked "how do I look around?" and found no answer, so the
                  answer now comes first, the same list as the rail under the
                  header. */}
              <p className="caps mb-2 px-1 text-mist">Shop by</p>
              <div className="mb-6 grid grid-cols-2 gap-2">
                {journeyLinks.map((b) => (
                  <Link
                    key={b.label}
                    href={b.href}
                    onClick={close}
                    prefetch={false}
                    className="flex items-center justify-between rounded-xl border border-edge bg-surface px-4 py-3 text-[0.95rem] font-medium text-charcoal transition-colors hover:border-charcoal/40"
                  >
                    {b.label}
                    <span aria-hidden className="text-mist">&rarr;</span>
                  </Link>
                ))}
              </div>
                            <Link
                href="/mati"
                onClick={close}
                className="mb-2 flex items-center justify-between rounded-2xl bg-[#79231a] px-5 py-4 font-display text-[1.05rem] font-semibold text-[#f8f5ef]"
              >
                TAASH · Mati × Zyvorah
                <span aria-hidden>&rarr;</span>
              </Link>
              {/* Nafas's colours, as TAASH's tile wears Sindoor. */}
              <Link
                href="/nafas"
                onClick={close}
                className="mb-2 flex items-center justify-between rounded-2xl bg-[#ffd6e8] px-5 py-4 font-display text-[1.05rem] font-semibold text-[#c20f62]"
              >
                Nafas&rsquo;s Face Parade
                <span aria-hidden>&rarr;</span>
              </Link>
              {/* Same destination as "Preview on my wall" on the homepage —
                  the free on-wall preview, one tap from the menu. */}
              <Link
                href="/see-it-in-my-room"
                onClick={close}
                className="mb-2 flex items-center justify-between rounded-2xl bg-sky px-5 py-4 font-display text-[1.05rem] font-semibold text-charcoal"
              >
                <span>
                  <span className="block">{canvas ? "Preview artwork in my room" : "Try it on my wall"}</span>
                  <span className="mt-1.5 block font-sans text-sm font-normal leading-relaxed text-charcoal/80">
                    {canvas ? "See how your favourite artwork could look in your room." : "See how your favourite wallpaper could look in your room."}
                  </span>
                </span>
                <span aria-hidden className="ml-3 shrink-0">&rarr;</span>
              </Link>
              {/* One row for every commercial audience, rather than six tiles
                  ahead of the home buyer's own journey. /commercial is the
                  hub all of these already feed (see Footer.tsx and
                  src/app/commercial/page.tsx); each sector stays one tap away
                  below it, so nothing that used to have its own tile is lost. */}
              <div className="mb-2 rounded-2xl border border-edge bg-surface px-5 py-4">
                <Link
                  href="/commercial"
                  onClick={close}
                  className="flex items-center justify-between font-display text-[1.05rem] font-semibold text-charcoal"
                >
                  For Businesses
                  <span aria-hidden>&rarr;</span>
                </Link>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-[0.85rem] text-slate">
                  {[
                    { label: "Offices", href: "/office" },
                    { label: "Hospitality", href: "/hospitality" },
                    { label: "Real Estate", href: "/real-estate" },
                    { label: "Retail", href: "/retail" },
                    { label: "Hospitals", href: "/hospitals" },
                    { label: "Shop Concepts", href: "/concepts" },
                  ].map((s) => (
                    <Link key={s.href} href={s.href} onClick={close} className="underline-offset-2 hover:text-charcoal hover:underline">
                      {s.label}
                    </Link>
                  ))}
                </div>
              </div>
              {homeConcepts.length > 0 && <div className="mb-2 rounded-2xl border border-edge px-5 py-4">
                <Link href="/concepts?space=homes" onClick={close} className="font-semibold">Home concepts</Link>
                <div className="mt-3 flex flex-wrap gap-3">
                  {homeConcepts.map(item => <Link key={item.href} href={item.href} onClick={close} className="rounded-full border border-edge px-3 py-2 text-sm">{item.label}</Link>)}
                </div>
              </div>}
              {/* The four discovery journeys — what makes Zyvorah different — up top */}
              <div className="flex flex-col gap-2">
                {/* "Try It on My Wall" above already opens See It in My Room — one door each. */}
                {journeyDestinations.filter((j) => j.href !== "/see-it-in-my-room").map((j) => (
                  <Link
                    key={j.href}
                    href={j.href}
                    onClick={close}
                    className="flex items-center justify-between rounded-2xl bg-cloud px-5 py-4 font-display text-[1.05rem] font-semibold text-charcoal transition-colors hover:bg-edge"
                  >
                    {j.label}
                    <span aria-hidden className="text-mist">&rarr;</span>
                  </Link>
                ))}
                <button
                  onClick={openPhotoSearch}
                  className="flex items-center gap-3 rounded-2xl bg-wash px-5 py-4 text-left font-display text-[1.05rem] font-semibold text-charcoal transition-colors hover:bg-edge"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
                    <circle cx="12" cy="13.5" r="3.4" />
                  </svg>
                  Quick photo match
                </button>
              </div>

              <p className="caps mt-8 mb-2 px-1 text-mist">Shop</p>
              <div className="flex flex-col">
                {shop.map((f) => {
                  return (
                    <div key={f.href} className="border-b border-edge py-1">
                      <Link
                        href={f.href}
                        onClick={close}
                        className="block py-2.5 font-display text-[1.05rem] font-semibold text-charcoal transition-colors hover:text-slate"
                      >
                        {f.title}
                      </Link>
                      {/* Wallpaper's axes collapse — sixty collections open by
                          default would bury Borders, Canvas, Samples and Gift
                          Cards below the fold. */}
                      {f.groups?.map((g) => (
                        <details key={g.title} className="group pl-3">
                          <summary className="flex cursor-pointer list-none items-center justify-between py-2 text-[0.92rem] text-slate">
                            {g.title}
                            <span className="text-mist transition-transform group-open:rotate-45">+</span>
                          </summary>
                          <div className="flex flex-col pb-2 pl-3">
                            {/* prefetch off — same reasoning as MegaMenu: an
                                opened group exposes many collection links at
                                once, and viewport-prefetching them all reads as
                                a scrape burst to edge rate limiting. */}
                            {g.items.map((it) => (
                              <Link key={it.href} href={it.href} onClick={close} prefetch={false} className="py-2 text-[0.92rem] text-slate transition-colors hover:text-charcoal">
                                {it.label}
                              </Link>
                            ))}
                            {g.href && (
                              <Link href={g.href} onClick={close} className="py-2 text-[0.92rem] font-semibold text-charcoal">
                                See all &rarr;
                              </Link>
                            )}
                          </div>
                        </details>
                      ))}
                      {/* The shallower families list their sub-collections flat. */}
                      {f.items?.length ? (
                        <div className="flex flex-col pb-1 pl-3">
                          {f.items.map((it) => (
                            <Link key={it.href} href={it.href} onClick={close} prefetch={false} className="py-2 text-[0.92rem] text-slate transition-colors hover:text-charcoal">
                              {it.label}
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {/* H7: a first-time buyer's practical questions (measuring,
                  installing, delivery, returns) used to live only in the
                  footer, a long scroll down on a phone. */}
              <p className="caps mt-8 mb-2 px-1 text-mist">Help</p>
              <div className="flex flex-col">
                {[
                  { label: "How to Measure", href: "/how-to-measure" },
                  { label: "Installation", href: "/installation" },
                  { label: "Delivery & returns", href: "/shipping-returns" },
                  { label: "FAQ", href: "/faq" },
                  { label: "Contact", href: "/contact" },
                ].map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={close}
                    className="border-b border-edge py-3.5 text-[1.05rem] text-charcoal transition-colors hover:text-slate"
                  >
                    {n.label}
                  </Link>
                ))}
              </div>

              <p className="caps mt-8 mb-2 px-1 text-mist">Account</p>
              <div className="flex flex-col">
                {[
                  { label: "My account", href: "/account" },
                  { label: "Search", href: "/search" },
                  { label: "My orders", href: "/account/orders" },
                  { label: "Saved", href: "/wishlist" },
                  { label: "My boards", href: "/account/boards" },
                  { label: "Cart", href: "/cart" },
                ].map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={close}
                    className="border-b border-edge py-3.5 text-[1.05rem] text-charcoal transition-colors hover:text-slate"
                  >
                    {n.label}
                  </Link>
                ))}
              </div>
              {/* The delivery country, here since 7 October 2026: the strip
                  above the logo that held it is desktop-only now. The shop
                  detects it from the connection, so few ever need this. */}
              <div className="mt-6 border-t border-edge pt-4 text-sm">
                <ShipToCountry />
              </div>
            </nav>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
