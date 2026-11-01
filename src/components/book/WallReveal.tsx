"use client";

import Image from "@/components/SiteImage";
import { useCallback, useRef, useState } from "react";
import { mediaUrl } from "@/lib/project-media";

/**
 * The same camera, twice: the bare architectural frame and the curated wall.
 *
 * This is the load-bearing argument of a case study. The plain frame is a wall
 * every reader already owns — a lift lobby, a blank reception slab — so the
 * reveal is not "look at our mural", it is "look at your wall".
 *
 * Desktop drags a divider; touch taps to cross-fade, because a thin draggable
 * handle is miserable with a thumb and most of these links open on a phone.
 * Both frames render eagerly so the reveal never waits on a network round trip
 * — a reveal that stutters is a reveal that doesn't land.
 */
export function WallReveal({
  plain,
  curated,
  alt,
  priority = false,
  aspect,
}: {
  plain?: string;
  curated: string;
  alt: string;
  priority?: boolean;
  /** CSS aspect-ratio override — see Chapter['aspect']. */
  aspect?: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(55);
  const [dragging, setDragging] = useState(false);
  // Touch has no divider: the whole frame is the control.
  const [touchRevealed, setTouchRevealed] = useState(true);
  const [isTouch, setIsTouch] = useState(false);

  const plainSrc = mediaUrl(plain ?? "");
  const curatedSrc = mediaUrl(curated);

  const moveTo = useCallback((clientX: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const pct = ((clientX - box.left) / box.width) * 100;
    setSplit(Math.min(100, Math.max(0, pct)));
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") { setSplit((s) => Math.max(0, s - 4)); e.preventDefault(); }
    if (e.key === "ArrowRight") { setSplit((s) => Math.min(100, s + 4)); e.preventDefault(); }
    if (e.key === "Enter" || e.key === " ") { setTouchRevealed((v) => !v); e.preventDefault(); }
  };

  // Touch mode collapses the divider entirely rather than sliding it offscreen,
  // so the tap target is the picture and nothing competes with page scroll.
  const clip = isTouch ? (touchRevealed ? 100 : 0) : split;

  // No bare frame for this wall: show the finished plate on its own rather
  // than a comparison with nothing to compare against.
  if (curatedSrc && !plainSrc) {
    return (
      <figure
        className="book-reveal-frame relative m-0 aspect-[16/9] w-full overflow-hidden rounded-[18px]"
        style={aspect ? { aspectRatio: aspect } : undefined}
      >
        <Image
          src={curatedSrc}
          alt={alt}
          fill
          sizes="(max-width: 900px) 100vw, 1400px"
          className="object-cover"
          draggable={false}
          priority={priority}
        />
      </figure>
    );
  }

  if (!plainSrc || !curatedSrc) {
    return (
      <div className="book-reveal-frame flex aspect-video w-full items-center justify-center rounded-[18px] border border-dashed"
           style={{ borderColor: "var(--book-rule)", color: "var(--book-muted)" }}>
        <p className="text-sm">Image pending — set <code>NEXT_PUBLIC_R2_MEDIA_URL</code></p>
      </div>
    );
  }

  return (
    <figure className="book-reveal-frame m-0">
      <div
        ref={frame}
        role="group"
        aria-label={`${alt} — drag or tap to compare the bare wall with the finished mural`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          if (e.pointerType === "touch") {
            setIsTouch(true);
            setTouchRevealed((v) => !v);
            return;
          }
          setIsTouch(false);
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
          moveTo(e.clientX);
        }}
        onPointerMove={(e) => { if (dragging) moveTo(e.clientX); }}
        onPointerUp={(e) => {
          setDragging(false);
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
        onPointerCancel={() => setDragging(false)}
        // A pointerdown that lands on an <img> otherwise starts the browser's
        // native image drag, which swallows the pointermove stream — the
        // divider jumps to the click and then refuses to follow the mouse.
        // `select-none` does not cover this; only cancelling dragstart does.
        onDragStart={(e) => e.preventDefault()}
        className="relative aspect-[16/9] w-full touch-pan-y select-none overflow-hidden rounded-[18px] outline-none focus-visible:ring-2"
        style={{
          cursor: isTouch ? "pointer" : "ew-resize",
          background: "var(--book-accent-soft)",
          ...(aspect ? { aspectRatio: aspect } : {}),
        }}
      >
        {/* The wall as found, underneath. */}
        <Image
          src={plainSrc}
          alt={`${alt} — before`}
          fill
          sizes="(max-width: 900px) 100vw, 1400px"
          className="object-cover"
          draggable={false}
          priority={priority}
          unoptimized={false}
        />

        {/* The curated wall, clipped. On touch this cross-fades instead of
            wiping, because there is no handle to explain a hard edge. */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: isTouch ? undefined : `inset(0 ${100 - clip}% 0 0)`,
            opacity: isTouch ? (touchRevealed ? 1 : 0) : 1,
            transition: dragging
              ? "none"
              : `clip-path var(--book-motion) cubic-bezier(0.4,0,0.2,1), opacity var(--book-motion) ease`,
          }}
        >
          <Image
            src={curatedSrc}
            alt={alt}
            fill
            sizes="(max-width: 900px) 100vw, 1400px"
            className="object-cover"
          draggable={false}
            priority={priority}
          />
        </div>

        {/* Divider. Hidden on touch, and hidden in print — a printed page
            shows the finished wall, not a UI affordance. */}
        {!isTouch && (
          <div
            className="book-no-print pointer-events-none absolute inset-y-0 w-px"
            style={{
              left: `${split}%`,
              background: "rgba(255,255,255,0.9)",
              boxShadow: "0 0 0 1px rgba(0,0,0,0.12)",
              transition: dragging ? "none" : "left var(--book-motion) cubic-bezier(0.4,0,0.2,1)",
            }}
          >
            <span
              className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[0.7rem] font-semibold"
              style={{ background: "rgba(255,255,255,0.94)", color: "var(--book-ink)" }}
              aria-hidden
            >
              ↔
            </span>
          </div>
        )}

        <span
          className="book-no-print absolute bottom-3 left-3 rounded-full px-3 py-1 text-[0.65rem] font-semibold tracking-wide uppercase"
          style={{ background: "rgba(255,255,255,0.9)", color: "var(--book-ink)" }}
        >
          {isTouch ? (touchRevealed ? "Tap for the bare wall" : "Tap to see it curated") : "Drag to compare"}
        </span>
      </div>
    </figure>
  );
}
