"use client";

import { useRef, useState } from "react";
import Link from "next/link";

export type MegaMenuItem = { label: string; href: string };
/** `href` is REQUIRED, not a nicety. A column renders six links ordered by
 *  position, so everything past the sixth is reachable only through the
 *  column's own index page — and a column without one silently swallows every
 *  collection added to it after the sixth. That is how 20 style collections and
 *  a mood collection came to be live and unreachable. Optional here meant
 *  "forgettable", and it was forgotten twice. */
export type MegaMenuGroup = { title: string; href: string; items: MegaMenuItem[] };

/**
 * One product family inside the Shop menu. A family either browses along
 * several axes (Wallpapers & Murals: by room, style, colour, collection) or is
 * a flat list of its sub-collections (Borders & Strips, Canvas Art). Samples and
 * Gift Cards are neither — they are just destinations, and carry no children.
 */
export type MegaMenuFamily = {
  title: string;
  href: string;
  /** Browse axes, for a family with more than one way in. */
  groups?: MegaMenuGroup[];
  /** Sub-collections, for a family with a single flat level. */
  items?: MegaMenuItem[];
};

/**
 * "Shop" — the whole catalogue behind one nav entry, in the shape the shop
 * architecture actually has:
 *
 *   Shop ├ Wallpapers & Murals ├ By Style · By Colour · By Mood · Collections
 *        │                       (By Room lives in the "Homes" audience door,
 *        │                        not here — Shop is where a look is browsed,
 *        │                        Homes is where a home room is browsed)
 *        ├ Borders & Strips    ├ Decorative · Kids' · Floral & Botanical · Geometric
 *        ├ Canvas Art          ├ Abstract · Landscapes · Indian Art · Botanical
 *        ├ Samples
 *        └ Gift Cards
 *
 * The families were briefly top-level peers of "Shop Wallpapers", which read as
 * though a border were a rival to the whole wallpaper catalogue rather than one
 * of three product lines sitting under it.
 */
export function MegaMenu({
  label = "Shop",
  families,
  align = "start",
}: {
  label?: string;
  families: MegaMenuFamily[];
  /** Which edge of the header container the panel card hugs. The panel itself
      always spans the container (see below); this only slides the card inside
      it, so a Shop button on the right of the bar gets a card under itself. */
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };
  const close = () => setOpen(false);

  return (
    /* Deliberately not `relative`: the panel below anchors to the header's page
       container instead, so it stays on screen at every width. It remains a DOM
       child here, so hover in/out still covers button and panel as one. */
    <div onMouseEnter={show} onMouseLeave={hide}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 whitespace-nowrap text-[0.82rem] font-medium text-slate transition-colors hover:text-charcoal"
      >
        {label}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        /* Spans the header container and carries its exact horizontal padding,
           so the card lines up with the page content instead of the viewport
           edge, and can never reach past the screen. */
        <div className="absolute inset-x-0 top-full z-50 px-[clamp(1rem,4vw,3.5rem)] pt-3">
          {/* Five families deep, the panel is taller than a short laptop
              viewport — it scrolls inside itself rather than running off the
              bottom with Gift Cards unreachable. */}
          <div className={`flex max-h-[calc(100vh-8rem)] max-w-[1080px] flex-col gap-6 overflow-y-auto rounded-[20px] border border-edge bg-surface p-6 shadow-xl ${align === "end" ? "ml-auto" : ""}`}>
            {families.map((f) => {
              const hasChildren = Boolean(f.groups?.length || f.items?.length);
              return (
                <div key={f.href} className={hasChildren ? "border-b border-edge pb-5 last:border-0 last:pb-0" : ""}>
                  {/* The family itself is always reachable — its listing page is
                      where every product in the line lives. */}
                  <Link
                    href={f.href}
                    onClick={close}
                    className="font-display text-[0.95rem] font-semibold text-charcoal hover:underline"
                  >
                    {f.title}
                  </Link>

                  {f.groups?.length ? (
                    <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-5">
                      {f.groups.map((g) => (
                        <div key={g.title} className="min-w-0">
                          {/* An axis with an index page is reachable by its own
                              heading too — a shopper reads "Collections" and
                              clicks the word, not the "See all" three inches
                              below the sixth item. */}
                          {g.href ? (
                            <Link href={g.href} onClick={close} className="caps mb-2 block text-mist transition-colors hover:text-charcoal">
                              {g.title}
                            </Link>
                          ) : (
                            <p className="caps mb-2 text-mist">{g.title}</p>
                          )}
                          <div className="flex flex-col gap-1.5">
                            {/* prefetch off: opening the menu makes ~dozens of
                                collection links visible at once, and the default
                                viewport prefetch fires them all — a burst that
                                looks like scraping to any edge rate limit (it
                                403'd a real shopper on 5 Sep). */}
                            {g.items.slice(0, 6).map((it) => (
                              <Link key={it.href} href={it.href} onClick={close} prefetch={false} className="text-[0.8rem] text-slate hover:text-charcoal">
                                {it.label}
                              </Link>
                            ))}
                            {g.href && (
                              <Link href={g.href} onClick={close} className="text-[0.8rem] font-semibold text-charcoal hover:underline">
                                See all &rarr;
                              </Link>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : f.items?.length ? (
                    <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1.5">
                      {f.items.map((it) => (
                        <Link key={it.href} href={it.href} onClick={close} prefetch={false} className="text-[0.8rem] text-slate hover:text-charcoal">
                          {it.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
