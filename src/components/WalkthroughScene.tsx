"use client";

import { useState } from "react";
import Image from "@/components/SiteImage";
import Link from "next/link";
import { mediaUrl } from "@/lib/project-media";

/**
 * One stop on the Shorelight walkthrough: a full-viewport room held sticky
 * while the page scrolls past it, with the one interaction the whole page
 * exists for — "view the panel", which crossfades the room to the flat
 * artwork that hangs in it, and a shop link that goes straight to that
 * design's product page.
 *
 * The reveal is a state toggle, not a scroll trick, on purpose: it works
 * identically on a phone tap, a mouse click and a keyboard, needs no scroll
 * listeners, and the page's cinematic feel comes entirely from CSS sticky —
 * so the whole experience still works with JavaScript disabled, minus only
 * this crossfade.
 */
export type WalkthroughSceneData = {
  /** Product this wall sells. */
  handle: string;
  /** R2 key of the ambience render. */
  render: string;
  /** R2 key of the flat panel artwork. */
  panel: string;
  /** "01" — the family's number in the programme. */
  number: string;
  /** Family name: "Tide". */
  family: string;
  /** Where you are standing: "The double-height foyer". */
  space: string;
  /** One line about what the wall is doing. */
  line: string;
  /** Night rooms carry their own darkness. */
  dark?: boolean;
  /** First scene eager-loads; the rest are lazy. */
  priority?: boolean;
};

export function WalkthroughScene({ scene }: { scene: WalkthroughSceneData }) {
  const [panel, setPanel] = useState(false);
  return (
    <section className="relative" style={{ height: "160vh" }} data-scene={scene.family}>
      <div className="sticky top-0 h-screen overflow-hidden">
        <div className={`absolute inset-0 transition-opacity duration-700 ${panel ? "opacity-0" : "opacity-100"}`}>
          <Image
            src={mediaUrl(scene.render)}
            alt={`${scene.family} — ${scene.space}`}
            fill
            sizes="100vw"
            className="object-cover"
            priority={scene.priority}
          />
        </div>
        {/* The panel layer sits beneath a quiet dark surround so a portrait
            artwork reads as a sheet, not a stretched fill. */}
        <div
          className={`absolute inset-0 flex items-center justify-center bg-[#141c26] transition-opacity duration-700 ${panel ? "opacity-100" : "opacity-0"}`}
          aria-hidden={!panel}
        >
          <div className="relative h-[86vh] max-w-[88vw]" style={{ aspectRatio: "2/3" }}>
            <Image
              src={mediaUrl(scene.panel)}
              alt={`${scene.family} — the panel artwork`}
              fill
              sizes="60vh"
              className="object-contain"
            />
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent pb-8 pt-24">
          <div className="container-x flex flex-wrap items-end justify-between gap-4 text-white">
            <div className="max-w-xl">
              <p className="caps text-white/80">
                {scene.number} · {scene.family} — {scene.space}
              </p>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-white/95">{scene.line}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                aria-pressed={panel}
                onClick={() => setPanel((v) => !v)}
                className="inline-flex h-11 items-center rounded-full border border-white/50 px-5 text-[0.78rem] font-semibold text-white transition hover:bg-white/10"
              >
                {panel ? "View the room" : "View the panel"}
              </button>
              <Link
                href={`/products/${scene.handle}`}
                className="inline-flex h-11 items-center rounded-full bg-white px-5 text-[0.78rem] font-semibold text-charcoal transition hover:opacity-90"
              >
                Shop this panel →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
