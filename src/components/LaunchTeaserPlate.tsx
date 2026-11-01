"use client";

import Image from "@/components/SiteImage";
import { useCallback, useRef } from "react";

/**
 * THE PLATE UNDER SMOKE.
 *
 * The teaser shows one detail of a collection that is a week away, and it has
 * to show it without spending it. So the image is never presented: it sits
 * under a heavy blur and a wash of the page's own limestone, and the reader
 * moves a soft lens across it.
 *
 * The lens NEVER resolves the artwork. Outside it the blur is 34px — colour
 * and mass, no motif. Inside it the blur is 9px, which is enough to tell that
 * there is a block print with oxblood in it and not enough to read what the
 * print is. A lens that sharpened to zero would just be a slower way of
 * publishing the image early, which is the one thing this band must not do.
 *
 * It is not a hover gate. The lens has a resting position at the centre, so a
 * reader on a phone — where there is no pointer at all — gets exactly the same
 * composition, minus the moving. Nothing is behind the interaction; the
 * interaction only decides which part of the smoke thins.
 */
export function LaunchTeaserPlate({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);

  // The pointer is written straight to CSS custom properties rather than to
  // React state: this fires on every mousemove, and re-rendering a next/image
  // subtree at pointer rate would drop frames on the one band of the homepage
  // that is supposed to feel unhurried. rAF-coalesced, so several moves inside
  // one frame cost one write.
  const track = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = frame.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.setProperty("--lens-x", `${x}%`);
      el.style.setProperty("--lens-y", `${y}%`);
    });
  }, []);

  // Leaving returns the lens to its resting place rather than freezing it
  // wherever the cursor happened to exit — a lens abandoned against an edge
  // reads as a stuck element.
  const rest = useCallback(() => {
    const el = frame.current;
    if (!el) return;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    el.style.setProperty("--lens-x", "50%");
    el.style.setProperty("--lens-y", "46%");
  }, []);

  // A soft-edged hole. The stops matter more than the radius: a hard edge is a
  // spotlight (a UI affordance), a long fade is smoke parting (a material).
  const lensMask =
    "radial-gradient(circle 150px at var(--lens-x) var(--lens-y), #000 0%, rgba(0,0,0,0.92) 30%, rgba(0,0,0,0.45) 58%, transparent 78%)";

  return (
    <div
      ref={frame}
      onPointerMove={track}
      onPointerLeave={rest}
      className="relative aspect-[4/5] overflow-hidden lg:aspect-auto lg:min-h-[440px]"
      style={{
        // Resting position: centred horizontally, a little above centre, which
        // is where a reader's eye lands first in a wide band.
        ["--lens-x" as string]: "50%",
        ["--lens-y" as string]: "46%",
        backgroundColor: "#cdbfa7",
      }}
    >
      {/* The smoke. Scaled past the frame because a blur this heavy samples
          transparent pixels at the edges and would otherwise draw a pale
          border around the whole plate. */}
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 1024px) 100vw, 50vw"
        className="scale-110 object-cover"
        style={{ filter: "blur(34px) saturate(0.92) brightness(0.78)" }}
        priority={false}
      />

      {/* What the lens lets through. Same picture, less smoke — decorative,
          because the layer underneath already carries the alt text and a
          screen reader announcing the same image twice is noise. */}
      <Image
        src={src}
        alt=""
        aria-hidden
        fill
        sizes="(max-width: 1024px) 100vw, 50vw"
        className="scale-[1.06] object-cover"
        style={{
          filter: "blur(9px) saturate(1.05) brightness(0.88)",
          WebkitMaskImage: lensMask,
          maskImage: lensMask,
        }}
      />

      {/* The wash. Limestone pulled over the whole plate so the image reads as
          pigment seen through the page rather than a photograph that happens
          to be out of focus — and thinned inside the lens so the glass has
          something to do besides sharpen. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            // Half the wash it used to be, and warmer. At 0.30–0.46 the
            // limestone veil lifted the whole plate toward white; Roheena
            // wants the smoke DARK, so the veil now only feathers the lens
            // edge instead of lightening the plate (5 September).
            "radial-gradient(circle 170px at var(--lens-x) var(--lens-y), rgba(235,220,194,0.05) 0%, rgba(235,220,194,0.14) 55%, rgba(235,220,194,0.22) 100%)",
        }}
      />

      {/* Rustic grain. Turbulence at a coarse frequency, multiplied over the
          top: it gives the smoke a tooth, so at a glance the plate looks like
          ink sunk into laid paper instead of a CSS blur. Inline SVG, so it
          costs no request. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.22] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")",
          backgroundSize: "220px 220px",
        }}
      />

      {/* The glass itself: one hairline ring, no chrome. Without it the thin
          patch reads as a smudge in the image rather than as something the
          reader is holding. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle 158px at var(--lens-x) var(--lens-y), transparent 0%, transparent 82%, rgba(90,76,58,0.10) 92%, rgba(90,76,58,0.16) 97%, transparent 100%)",
        }}
      />
    </div>
  );
}
