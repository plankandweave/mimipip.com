"use client";

import { useCanvasJourney } from "./ShoppingJourney";

/**
 * "See it on your own wall first" — a quiet text link under the product
 * page's Buy now, opening the Room Visualizer (the configurator listens for
 * `zyv:open-visualizer`).
 *
 * It replaces the large "Not sure how it will look on your wall?" card that
 * sat between the gallery and the title: on a phone that card pushed the
 * design's name and price off the first screen, and the WhatsApp launcher sat
 * on its heading (founder, 8 October 2026: "from a customer point of view").
 * The first screen now reads picture, name, price, one button; the preview is
 * still one tap away, before any size is entered.
 *
 * A link, not a button (9 October 2026): tapped before the page's scripts
 * have loaded it goes to /see-it-in-my-room?design=<handle>, whose upload
 * tile works without any script and which opens this design once the photo
 * is in. Once hydrated the click is intercepted and the visualiser opens in
 * place, as before.
 */
export function SeeOnWallLink({ handle, className = "" }: { handle: string; className?: string }) {
  const canvas = useCanvasJourney();
  return (
    <a
      href={`/see-it-in-my-room?design=${encodeURIComponent(handle)}`}
      onClick={(e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("zyv:open-visualizer"));
      }}
      className={`inline-flex min-h-11 items-center justify-center gap-2 text-sm font-semibold text-charcoal underline underline-offset-4 ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 7h3l2-2h6l2 2h3v12H4z" />
        <circle cx="12" cy="13" r="3.5" />
      </svg>
      {canvas ? "Preview this artwork in your room" : "See it on your own wall first"}
    </a>
  );
}
