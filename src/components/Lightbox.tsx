"use client";

import { useCallback, useEffect } from "react";

// Look at one picture properly, then put it back.
//
// Every surface where a photograph is chosen or approved needs the same
// gesture: the grid stays a grid, a tap fills the screen, and a tap returns.
// One component so those surfaces cannot drift into three slightly different
// answers to "how do I see this bigger".
//
// Deliberately not a modal library and deliberately not routed. A wall photo
// opened on a phone in a lift lobby should cost nothing and change no URL —
// pressing back must leave the space you were in, not the picture you opened.

export type LightboxImage = {
  src: string;
  alt: string;
  /** Shown under the image — which wall this is, and how big. */
  caption?: string | null;
};

export default function Lightbox({
  image, onClose,
}: {
  image: LightboxImage | null;
  onClose: () => void;
}) {
  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!image) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    // The page behind must not scroll while a picture is filling the screen —
    // on a phone that reads as the photo sliding away under your thumb.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [image, close]);

  if (!image) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={image.alt}
      onClick={close}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 p-4"
    >
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white backdrop-blur"
      >
        Close
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage
          URL is short-lived and single-use; next/image would proxy and cache it,
          and the optimiser cannot fetch a URL that expires in fifteen minutes. */}
      <img
        src={image.src}
        alt={image.alt}
        // Stop a tap on the photo itself from closing — people pinch and pan
        // here, and a stray touch dismissing the thing you are studying is the
        // one behaviour that makes a viewer feel broken.
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-full object-contain"
      />

      {image.caption && (
        <p className="mt-3 max-w-[60ch] text-center text-sm text-white/80">{image.caption}</p>
      )}
    </div>
  );
}
