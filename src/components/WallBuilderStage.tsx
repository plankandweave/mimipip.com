"use client";

import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";

/**
 * The product page's left column is shared by two things: the photo gallery
 * (room renders — what sells the design) and the wall builder's live preview
 * (the flat artwork on the customer's wall). The builder's steps live in the
 * right column, so its preview has to be drawn somewhere it does not own.
 *
 * This context is that handshake. The stage publishes a DOM slot; the
 * configurator portals its preview into it and flips `active` when the
 * customer starts building. There is no modal: the builder happens on the
 * page (Roheena, 26 Sep 2026 — "it doesn't jump me into another window").
 *
 * Outside a provider (e.g. Print Your Own) `useWallBuilderStage` returns null
 * and the configurator draws its preview inside its own card instead.
 */
type Stage = {
  active: boolean;
  setActive: (active: boolean) => void;
  slot: HTMLDivElement | null;
};

const StageContext = createContext<Stage | null>(null);
const SlotSetter = createContext<((el: HTMLDivElement | null) => void) | null>(null);

export function WallBuilderProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  return (
    <SlotSetter.Provider value={setSlot}>
      <StageContext.Provider value={{ active, setActive, slot }}>{children}</StageContext.Provider>
    </SlotSetter.Provider>
  );
}

export function useWallBuilderStage() {
  return useContext(StageContext);
}

/** The left column: the gallery until the customer starts building, then the
 *  builder's preview — pinned under the header on phones so the artwork stays
 *  in view while the steps scroll beneath it. */
export function WallBuilderStage({ gallery, isArtwork = false }: { gallery: ReactNode; isArtwork?: boolean }) {
  const stage = useContext(StageContext);
  const setSlot = useContext(SlotSetter);
  const active = stage?.active ?? false;
  // The phone pin sits flush under the sticky site header, whose height
  // varies (announcement bar, wrapped nav) — so it is measured, not guessed.
  // ScrollHeader publishes --header-offset (0 while the header is scrolled
  // away on a phone), which the CSS prefers; this is its fallback.
  const [headerH, setHeaderH] = useState<number | null>(null);
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const measure = () => setHeaderH(header.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);
  // Pinned only while the builder is on screen (6 October 2026): the sticky
  // pin lives in the page grid, which runs on past the builder through the
  // help box, the accordions and "More like this", and the preview followed
  // the shopper the whole way down, covering the Add to cart row and the
  // cards beneath. Once the builder's card has scrolled past, the pin lets
  // go and the preview scrolls away with the page; scrolling back up into
  // the builder pins it again.
  const [parked, setParked] = useState(false);
  useEffect(() => {
    if (!active) { setParked(false); return; }
    const builder = document.getElementById("create-your-wall");
    const stage = document.querySelector<HTMLElement>(".wall-stage");
    if (!builder || !stage) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (window.innerWidth >= 1024) { setParked(false); return; }
      const offset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-offset")) || 0;
      // Past once the builder's bottom edge rises above the pinned block's
      // own bottom — the step card no longer has anything to sit under.
      setParked(builder.getBoundingClientRect().bottom < offset + stage.offsetHeight + 24);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [active]);
  return (
    <div
      className={`wall-stage min-w-0 lg:sticky lg:top-32 lg:self-start ${active && !parked ? "wall-stage-active" : ""}`}
      style={headerH ? ({ "--site-header-h": `${headerH}px` } as CSSProperties) : undefined}
    >
      <div hidden={active}>{gallery}</div>
      <div hidden={!active} className="wall-stage-slot">
        {/* Above the artwork, not on it — a pill over the corner hid part of
            the very picture the customer is judging. */}
        <div className="mb-2 flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => stage?.setActive(false)}
            className="text-xs font-semibold text-slate underline underline-offset-4 hover:text-charcoal"
          >
            ← Back to photos
          </button>
          <span className="text-xs text-mist">{isArtwork ? "Your artwork at scale" : "Your design on your wall"}</span>
        </div>
        <div ref={setSlot} />
      </div>
    </div>
  );
}
