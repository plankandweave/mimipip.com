"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "@/components/SiteImage";
import supabaseImageLoader from "@/lib/supabaseImageLoader";
import { useMarket } from "@/components/MarketProvider";

// The tallest the main image is ever allowed to get, so a portrait piece still
// sits inside the viewport next to the configurator instead of pushing it down.
const TALL_CAP = "min(74vh, 720px)";

// Hover magnifier over the main image. The lens shows the SAME rendered crop
// scaled up (a copy of the frame at zoom×, offset so the cursor point sits
// under the lens centre), so cover/contain framing needs no separate math.
// Sourced at 2400px through the Supabase render CDN — which never upscales, so
// it hands back the master at its true size and the lens shows real pixels.
const MAX_ZOOM = 2.6;
// Below this a magnifier isn't worth showing — the reader gets a circle that
// looks the same as what it covers.
const MIN_ZOOM = 1.35;
const LENS = 190; // px diameter
const HIRES_WIDTH = 2400;

// Touch equivalent of the hover lens: press and slide a finger over the image
// and the SAME circular magnifier tracks it live — no tap-to-enter step, lift
// the finger and it's gone. Drawn offset above the actual contact point (not
// centred on it) so the fingertip never covers the thing it's magnifying —
// the same trick iOS uses for its text-selection loupe.
const TOUCH_LENS_OFFSET = 90;

const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

/** True only on a real pointer. Subscribed rather than read once, so plugging in
 *  a mouse on a tablet (or the reverse) flips the magnifier on or off live.
 *  Server snapshot is false — the lens is hover-only, so SSR renders nothing. */
function useHoverCapable() {
  const subscribe = useCallback((onChange: () => void) => {
    const mq = window.matchMedia(HOVER_QUERY);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(HOVER_QUERY).matches,
    () => false,
  );
}

export function ProductGallery({
  images,
  title,
  showActions = true,
  showSample = true,
  fit = "cover",
  fallbackAspect,
}: {
  /** width/height are the master's TRUE measured pixels where known (migration
   *  0060). Supplying them lets the zoom affordance be decided before anything
   *  is downloaded, instead of after the hi-res copy lands. */
  images: { url: string; alt: string | null; width?: number | null; height?: number | null }[];
  title: string;
  /** Hide the sample/visualiser pills — the ProductConfigurator listens for
   *  their events, so pages without it (Borders) must not show them. */
  showActions?: boolean;
  /** Hide JUST the sample pill. Samples are offered on one collection today
   *  (see SAMPLE_COLLECTION_TAGS); the visualiser pill is unaffected, and a
   *  pill whose modal can't open is worse than no pill. */
  showSample?: boolean;
  /** "cover" — the square hero crop every wallpaper uses.
   *  "contain" — the frame takes the ARTWORK's own shape (portrait wall art),
   *  so a piece with a painted border isn't beheaded by a square crop. */
  fit?: "cover" | "contain";
  /** Shape to hold before the image reports its natural size (width / height),
   *  so the frame doesn't resize under the reader. Contain mode only. */
  fallbackAspect?: number;
}) {
  // Samples are an India-only offer (see SampleOrderModal); the CTA must not
  // invite a dollar-priced visitor into a rupee flow they cannot complete.
  const { market } = useMarket();
  const sampleOffered = showSample && market.countryCode === "IN";
  const [active, setActive] = useState(0);
  // Measured per image URL — a gallery can mix a portrait flat with a squarer
  // detail shot, and each should be framed in its own shape.
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const frameRef = useRef<HTMLDivElement | null>(null);
  const list = images.length ? images : [{ url: "", alt: title }];
  const main = list[Math.min(active, list.length - 1)];

  // Magnifier state. `canHover` picks which input drives `lens`: mouse move on
  // desktop, pointer move on touch — either way `lens` is the point on the
  // FRAME currently being sampled, and it being non-null is what shows the
  // circle. `armed` defers the full-size download until the pointer first
  // reaches the frame, so phones and bouncing visitors never pay for it.
  const canHover = useHoverCapable();
  const [armed, setArmed] = useState(false);
  const [lens, setLens] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [overActions, setOverActions] = useState(false);
  // Master pixel dimensions per image URL, read off the loaded hi-res copy.
  // Only consulted where the row carries no recorded width/height.
  const [masters, setMasters] = useState<Record<string, { w: number; h: number }>>({});
  // The frame's own box. Needed before the first pointer event so touch can
  // decide whether zooming is worth offering at all.
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null);

  // Zoom only as far as the master actually has pixels for. The catalogue's
  // artwork runs 1024–2560px wide, so a fixed factor would be a blurry blow-up
  // on the smaller half. Both fits take the SMALLER of the two axis ratios: a
  // square `cover` frame crops a 1536×1024 master down to its 1024 axis, so
  // width alone would claim detail the visible crop doesn't have. Under
  // `contain` the frame already matches the artwork's aspect, so the two ratios
  // agree and min() is simply correct.
  // Recorded dimensions win: they are known at first paint, so the touch
  // affordance never has to appear and then retract once the file lands.
  const master =
    main.width && main.height ? { w: main.width, h: main.height } : masters[main.url];
  const frameW = lens?.w ?? frameSize?.w ?? 0;
  const frameH = lens?.h ?? frameSize?.h ?? 0;
  const trueZoom =
    master && frameW && frameH ? Math.min(master.w / frameW, master.h / frameH) : null;
  // Never scale past what the file holds. MIN_ZOOM decides WHETHER to offer
  // zoom, and must not become a floor that forces one — a 400x300 master on a
  // 520px frame would otherwise be blown up to 1.35x and invent detail, which
  // is exactly the dishonesty the dimension audit exists to prevent.
  const zoom = trueZoom ? Math.min(MAX_ZOOM, trueZoom) : MAX_ZOOM;
  // Nothing left to reveal — don't tease a lens that would only show mush.
  // Unknown (no recorded width/height, nothing loaded yet) is treated as
  // worth offering; the moment the real size lands this flips and the zoom
  // retires itself rather than showing an upscale.
  const worthZooming = trueZoom === null || trueZoom >= MIN_ZOOM;
  // Touch is currently mid-drag — used to hide the CTA row (a thumb dragging
  // near the bottom of the frame shouldn't also land on a button) and to keep
  // the idle "touch & drag" hint from overlapping the live magnifier.
  const touching = !canHover && lens !== null;

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  // Where the magnifier CIRCLE is drawn. Desktop: centred on the cursor, as
  // always. Touch: offset above the actual contact point and clamped so it
  // never pokes outside the frame — the crop shown inside it still samples
  // from the true contact point (`lens.x/y` below), only the circle's own
  // position on screen moves.
  const lensDrawX = lens ? (canHover ? lens.x : clamp(lens.x, LENS / 2, Math.max(LENS / 2, frameW - LENS / 2))) : 0;
  const lensDrawY = lens
    ? canHover
      ? lens.y
      : clamp(lens.y - TOUCH_LENS_OFFSET, LENS / 2, Math.max(LENS / 2, frameH - LENS / 2))
    : 0;

  const contain = fit === "contain";
  const aspect = contain ? (aspects[main.url] ?? fallbackAspect ?? 1) : 1;

  // Read the artwork's own shape off the rendered element. Measured from the
  // DOM rather than an onLoad prop because the hero carries `priority` and is
  // routinely decoded before React hydrates — its load event has already fired
  // and will never fire again, leaving a handler that never runs.
  useEffect(() => {
    const img = frameRef.current?.querySelector("img");
    if (!contain || !img) return;
    const url = main.url;
    let live = true;
    const read = () => {
      if (!live || !img.naturalWidth || !img.naturalHeight) return;
      // Clamp so a freak panorama or a skyscraper can't break the layout.
      const a = Math.min(2, Math.max(0.4, img.naturalWidth / img.naturalHeight));
      setAspects((prev) => (prev[url] === a ? prev : { ...prev, [url]: a }));
    };
    img.addEventListener("load", read);
    // Already loaded (the common case for `priority`) — read it straight away.
    // Deliberately a microtask, not requestAnimationFrame (never fires in a
    // background tab) and not img.decode() (can hang indefinitely on a srcset
    // the browser is still re-evaluating).
    queueMicrotask(read);
    return () => {
      live = false;
      img.removeEventListener("load", read);
    };
  }, [contain, main.url]);
  // Track the frame's box. A plain resize listener rather than ResizeObserver:
  // the box only changes with the viewport or the chosen image, both of which
  // already re-run this, and it re-measures after layout on every dependency.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      setFrameSize((prev) => (prev?.w === r.width && prev?.h === r.height ? prev : { w: r.width, h: r.height }));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [contain, aspect, main.url]);

  // width = cap × aspect, clamped to the column — height then follows the
  // aspect ratio and can never exceed the cap.
  const frameStyle = contain
    ? { aspectRatio: `${aspect}`, width: `calc(${TALL_CAP} * ${aspect})`, maxWidth: "100%" }
    : undefined;

  return (
    <div>
      <div className="flex flex-col-reverse gap-3 md:flex-row">
      {list.length > 1 && (
        // shrink-0 is load-bearing on desktop: this column is a flex item next
        // to the main image's `flex-1`, so without it the image's growth
        // squeezes the column narrower than one thumbnail (64px) and every
        // thumbnail renders clipped down its right edge.
        <div className="flex gap-3 overflow-x-auto md:max-h-[560px] md:w-16 md:shrink-0 md:flex-col md:overflow-x-visible md:overflow-y-auto">
          {list.map((im, i) => (
            <button
              key={i}
              onClick={() => {
                setActive(i);
                // A new image is a new artwork — drop any magnifier left
                // showing from the old one.
                setLens(null);
              }}
              className={`relative aspect-square w-16 shrink-0 overflow-hidden rounded-[14px] border-2 transition-colors ${
                i === active ? "border-charcoal" : "border-edge hover:border-slate"
              }`}
              aria-label={`View image ${i + 1}`}
            >
              {im.url && (
                <Image
                  src={im.url}
                  alt=""
                  fill
                  draggable={false}
                  sizes="128px"
                  className={contain ? "bg-wash object-contain p-1" : "object-cover"}
                />
              )}
            </button>
          ))}
        </div>
      )}
      <div
        ref={frameRef}
        // `flex-1` is a DESKTOP-only instruction. Below md the gallery stacks
        // (flex-col-reverse), where flex-basis:0% zeroes the HEIGHT instead of
        // the width — and `mx-auto` suppresses the cross-axis stretch that
        // would otherwise restore the width, so the frame collapsed to 0x0 and
        // the product image vanished on every phone and on both Fold postures.
        // Take the full column width there and let aspect-square set the height.
        className={`relative mx-auto overflow-hidden rounded-[22px] bg-wash ${contain ? "" : "aspect-square w-full md:w-auto md:flex-1"} ${
          canHover && main.url && worthZooming ? "cursor-zoom-in" : ""
        }`}
        // touch-action is static, not toggled per-touch: a browser decides
        // whether a touch scrolls the page at the START of that touch, before
        // React's state update from pointerdown can take effect, so gating
        // this on "currently dragging" would race and sometimes lose. Any
        // touch that starts on a zoomable image is claimed for the magnifier;
        // scrolling from here on out starts from outside the frame.
        // -webkit-touch-callout/user-select block the phone's OWN long-press
        // handling on the image (Save Image / share sheet on Android and
        // iOS) — without this, holding a finger down to drag the magnifier
        // instead triggers that native menu, which cancels our pointer mid-
        // gesture and reads as the lens "blinking and vanishing".
        style={{
          ...frameStyle,
          ...(!canHover && worthZooming
            ? {
                touchAction: "none" as const,
                WebkitTouchCallout: "none" as const,
                WebkitUserSelect: "none" as const,
                userSelect: "none" as const,
              }
            : null),
        }}
        onContextMenu={(e) => {
          // Backstop for browsers that don't honour touch-callout: without
          // this, a long-press that wins the race against our pointerdown
          // still opens the native image menu. Desktop right-click is left
          // alone — only touch loses it, and only where zoom is on offer.
          if (!canHover && worthZooming) e.preventDefault();
        }}
        onPointerDown={(e) => {
          // Touch only — the hover lens below owns the mouse.
          if (canHover || !main.url || !worthZooming || e.pointerType === "mouse") return;
          const rect = frameRef.current?.getBoundingClientRect();
          if (!rect) return;
          // Captured so the magnifier keeps tracking even if the finger slides
          // a little outside the frame's own box mid-drag.
          frameRef.current?.setPointerCapture(e.pointerId);
          setArmed(true);
          setLens({
            x: clamp(e.clientX - rect.left, 0, rect.width),
            y: clamp(e.clientY - rect.top, 0, rect.height),
            w: rect.width,
            h: rect.height,
          });
        }}
        onPointerMove={(e) => {
          // Only while a touch is actively down on the frame (lens was set by
          // pointerdown above) — an untouched finger hovering nearby (stylus
          // proximity, etc.) shouldn't summon the magnifier.
          if (canHover || !lens || e.pointerType === "mouse") return;
          const rect = frameRef.current?.getBoundingClientRect();
          if (!rect) return;
          setLens({
            x: clamp(e.clientX - rect.left, 0, rect.width),
            y: clamp(e.clientY - rect.top, 0, rect.height),
            w: rect.width,
            h: rect.height,
          });
        }}
        onPointerUp={() => {
          if (canHover) return;
          setLens(null);
        }}
        onPointerCancel={() => {
          if (canHover) return;
          setLens(null);
        }}
        onMouseMove={(e) => {
          if (!canHover || !main.url) return;
          const rect = frameRef.current?.getBoundingClientRect();
          if (!rect) return;
          // Armed here rather than on mouseenter: arriving from a product card
          // often leaves the cursor already inside the frame, and no enter event
          // ever fires for a pointer that never crossed the boundary.
          setArmed(true);
          setLens({ x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width, h: rect.height });
        }}
        onMouseLeave={() => setLens(null)}
      >
        {main.url && (
          <Image
            src={main.url}
            alt={main.alt || title}
            fill
            priority
            draggable={false}
            sizes="(max-width:768px) 100vw, 50vw"
            className={contain ? "object-contain" : "object-cover"}
          />
        )}
        {armed && main.url && (
          <div
            aria-hidden
            className="pointer-events-none absolute z-[5] overflow-hidden rounded-full border-2 border-surface bg-wash shadow-xl transition-opacity duration-100"
            style={{
              width: LENS,
              height: LENS,
              left: lensDrawX - LENS / 2,
              top: lensDrawY - LENS / 2,
              // Inline rather than an opacity-0/100 class pair: the visibility of
              // the lens must not depend on both utilities surviving the CSS scan.
              opacity: lens && !overActions && worthZooming ? 1 : 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- deliberate:
                one fixed hi-res render URL sized to the frame × zoom; next/image's
                srcset picking would fight the exact-width offset math and could
                swap in a smaller candidate mid-hover. */}
            <img
              src={supabaseImageLoader({ src: main.url, width: HIRES_WIDTH, quality: 90 })}
              alt=""
              draggable={false}
              onLoad={(e) => {
                const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                setMasters((prev) =>
                  prev[main.url]?.w === w && prev[main.url]?.h === h
                    ? prev
                    : { ...prev, [main.url]: { w, h } },
                );
              }}
              className={contain ? "object-contain" : "object-cover"}
              style={{
                position: "absolute",
                width: (lens?.w ?? 0) * zoom,
                height: (lens?.h ?? 0) * zoom,
                maxWidth: "none",
                left: -((lens?.x ?? 0) * zoom - LENS / 2),
                top: -((lens?.y ?? 0) * zoom - LENS / 2),
              }}
            />
          </div>
        )}
        {/* Discovery hint — a magnifier isn't obvious on touch the way a cursor
            change is on desktop, so say it up front. Hidden the moment a
            finger actually lands (the magnifier itself takes over as the
            explanation) and suppressed entirely where the master has nothing
            further to give. */}
        {!canHover && !touching && main.url && worthZooming && (
          <div className="pointer-events-none absolute right-3 top-3 z-[7] flex items-center gap-1.5 rounded-full bg-charcoal/75 px-3 py-1.5 text-[0.7rem] font-semibold text-surface backdrop-blur">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
            </svg>
            Touch &amp; drag to zoom
          </div>
        )}
        {/* The actual touch point, so it's clear the circle above (offset up
            so the finger doesn't cover it) is reading from here, not from
            wherever it's drawn. */}
        {!canHover && lens && worthZooming && (
          <div
            aria-hidden
            className="pointer-events-none absolute z-[5] h-2.5 w-2.5 rounded-full border border-surface bg-charcoal/60"
            style={{ left: lens.x - 5, top: lens.y - 5 }}
          />
        )}
        {main.url && showActions && !touching && (
          // Keep the sample shortcut on the image; the room-preview
          // invitation below has space to explain what the customer can try.
          <div
            className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-center gap-2 px-4"
            onMouseEnter={() => setOverActions(true)}
            onMouseLeave={() => setOverActions(false)}
            // Tapping a CTA must not also open the zoom underneath it.
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            {sampleOffered && (
            // A link: tapped before the scripts load it reloads the page with
            // ?sample=1, which opens the sample modal on arrival (autoOpenSample).
            // Hydrated, the click is intercepted and the modal opens in place.
            <a
              href="?sample=1"
              onClick={(e) => {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent("zyv:open-sample"));
              }}
              className="flex min-h-11 items-center rounded-md bg-transparent px-1 text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal"
            >
              <span className="flex items-center gap-1.5 rounded bg-surface/25 px-2 py-1 text-[0.6875rem] font-medium transition-colors hover:bg-surface/40">
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M3 15l5-5 4 4 3-3 6 6" />
              </svg>
              Order a sample of this wallpaper
              </span>
            </a>
            )}
          </div>
        )}
      </div>
      </div>
      {/* The room-preview invitation used to be a card here, between the
          gallery and the title. On a phone it pushed the name and price off
          the first screen, so it is now a text link under Buy now
          (SeeOnWallLink on the product page). */}
    </div>
  );
}
