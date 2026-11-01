"use client";

import { useRef, useState } from "react";
import Link from "next/link";

import type { MegaMenuItem } from "./MegaMenu";

/**
 * One audience door on the header's left rail — Homes, For Offices, For
 * Hospitality, For Real Estate — as a pill that opens the SPACES inside that
 * audience rather than only a landing page.
 *
 * Homes had this behaviour first (it had no landing page of its own, so its
 * content was always the room collections). The three commercial doors were
 * plain links to their hubs, which hid the thing that actually answers the
 * visitor's question: an office manager is not looking for "offices", they are
 * looking for a meeting room. The spaces are already modelled — WORKSPACES,
 * HOSPITALITY_SPACES, REAL_ESTATE_SPACES — so the rail now reads the same way
 * across all four doors: hover, see the rooms, pick one.
 *
 * The hub is NOT lost to the dropdown: the caps heading and the trailing
 * See-all both link to it, the same two-doors-to-the-index pattern the Shop
 * mega-menu uses for its axis headings.
 *
 * The panel hangs off the button rather than the header container: these pills
 * sit in the left half of a 1440px-capped rail and a ~26rem card cannot reach
 * past the viewport even at the `md` minimum — the spill problem that forced
 * the Shop mega-menu onto the container never arises this side.
 */
export function AudienceMenu({
  label,
  pillClassName,
  heading,
  href,
  items,
  seeAllLabel,
  secondarySection,
  shoppingLinks,
  className,
  align = "left",
}: {
  label: string;
  /** Background utility for the pill — each audience keeps its own colour. */
  pillClassName: string;
  /** Caps heading over the grid, e.g. "By Room" / "By Workspace". */
  heading: string;
  /** The audience hub. Both the heading and the See-all point here. */
  href: string;
  items: MegaMenuItem[];
  seeAllLabel: string;
  shoppingLinks?: MegaMenuItem[];
  /** An optional second way into this audience, e.g. shoppable office concepts. */
  secondarySection?: {
    heading: string;
    href: string;
    items: MegaMenuItem[];
    seeAllLabel: string;
  };
  /** Responsive gating from the rail (each door drops out at its own width). */
  className?: string;
  align?: "left" | "right";
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
  const visibleItems = items.slice(0, 6);
  const remainingItems = items.slice(6);

  return (
    <div className={`relative ${className ?? ""}`} onMouseEnter={show} onMouseLeave={hide}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[0.78rem] font-semibold text-charcoal transition-transform hover:scale-105 ${pillClassName}`}
      >
        {label}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className={`absolute top-full z-50 pt-3 ${align === "right" ? "right-0" : "left-0"}`}>
          <div className="w-[40rem] max-w-[calc(100vw-2rem)] rounded-[20px] border border-edge bg-surface p-5 shadow-xl">
            {shoppingLinks?.length ? (
              <nav aria-label={`${label} shopping`} className="mb-5 flex flex-wrap gap-2 border-b border-edge pb-4">
                {shoppingLinks.map((item) => (
                  <Link key={item.href} href={item.href} onClick={close} prefetch={false} className="inline-flex min-h-10 items-center rounded-full bg-peach/40 px-4 py-2 text-sm font-semibold text-charcoal hover:bg-peach">
                    {item.label}
                  </Link>
                ))}
              </nav>
            ) : null}
            <div className={`grid gap-7 ${secondarySection ? "sm:grid-cols-2" : "max-w-xs"}`}>
              <div>
                <Link href={href} onClick={close} className="caps mb-3 block text-mist transition-colors hover:text-charcoal">
                  {heading}
                </Link>
                <div className="flex flex-col gap-2.5">
                  {visibleItems.map((item) => (
                    <Link key={item.href} href={item.href} onClick={close} prefetch={false} className="text-[0.8rem] text-slate hover:text-charcoal">
                      {item.label}
                    </Link>
                  ))}
                </div>
                {remainingItems.length > 0 ? (
                  <details className="group mt-3">
                    <summary className="cursor-pointer list-none text-[0.8rem] font-semibold text-charcoal hover:underline">
                      {seeAllLabel} <span aria-hidden>&rarr;</span>
                    </summary>
                    <div className="mt-2 flex flex-col gap-2.5">
                      {remainingItems.map((item) => (
                        <Link key={item.href} href={item.href} onClick={close} prefetch={false} className="text-[0.8rem] text-slate hover:text-charcoal">
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </details>
                ) : (
                  <Link href={href} onClick={close} className="mt-3 block text-[0.8rem] font-semibold text-charcoal hover:underline">
                    {seeAllLabel} &rarr;
                  </Link>
                )}
              </div>
              {secondarySection && (
                <div className="border-t border-edge pt-5 sm:border-l sm:border-t-0 sm:pl-7 sm:pt-0">
                  <Link href={secondarySection.href} onClick={close} className="caps mb-3 block text-mist transition-colors hover:text-charcoal">
                    {secondarySection.heading}
                  </Link>
                  {secondarySection.items.length ? (
                    <div className="flex flex-col gap-2.5">
                      {secondarySection.items.map((item) => (
                        <Link key={item.href} href={item.href} onClick={close} prefetch={false} className="text-[0.8rem] text-slate hover:text-charcoal">
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[0.8rem] text-slate">New concepts are on their way.</p>
                  )}
                  <Link href={secondarySection.href} onClick={close} className="mt-3 block text-[0.8rem] font-semibold text-charcoal hover:underline">
                    {secondarySection.seeAllLabel} &rarr;
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
