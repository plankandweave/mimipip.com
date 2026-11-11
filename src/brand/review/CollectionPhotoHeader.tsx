import Image from "@/components/SiteImage";
import Link from "next/link";
import type { ReactNode } from "react";
import { card, label, type RecordData } from "./data";

// Keep clothing globally familiar and solid-coloured, and hairstyles equally
// contemporary across the cast. Faces carry the diversity of the campaign.
const children = [
  { src: "/collection-kids/jump-coral-v3.webp", action: "jumping with delight" },
  { src: "/collection-kids/leap-cobalt.webp", action: "leaping with a smile" },
  { src: "/collection-kids/dance-yellow.webp", action: "dancing joyfully" },
  { src: "/collection-kids/fly-pink.webp", action: "playing airplane" },
] as const;

const colors = ["#ffd65a", "#91e0d0", "#f7a4ba", "#aaa9ee"] as const;

export function CollectionPhotoHeader({
  handle,
  title,
  description,
  designs,
}: {
  handle: string;
  title: string;
  description?: ReactNode;
  designs: RecordData[];
}) {
  const offset = [...handle].reduce((sum, char) => sum + char.charCodeAt(0), 0) % children.length;
  // Spread the header across a collection's range instead of repeating the
  // first few near-identical colourways in catalogue order.
  const featured = Array.from({ length: Math.min(4, designs.length) }, (_, index) =>
    designs[Math.round(index * (designs.length - 1) / Math.max(1, Math.min(4, designs.length) - 1))]
  );

  return (
    <header className="mb-8" aria-label={`${title} collection`}>
      <div className="mb-5 max-w-3xl">
        <span className="caps text-slate">Mimi Pip collections</span>
        <h1 className="mt-2 text-[clamp(2rem,4vw,3.4rem)] leading-tight">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate">{description}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3" aria-label="Children and designs from this collection">
        {children.map((_, index) => {
          const child = children[(index + offset) % children.length];
          const design = featured[index % featured.length];
          const artwork = design && (card(design).flatHoverImage || design.image);
          return (
            <Link
              key={child.src}
              href={design ? `/products/${design.slug}` : "#collection-designs"}
              className="group relative block aspect-[4/5] min-w-0 overflow-hidden rounded-[16px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal sm:rounded-[20px]"
              style={{ backgroundColor: colors[index] }}
              aria-label={design ? `Explore ${design.name} in ${label(handle)}` : `Explore ${title}`}
            >
              {artwork && <Image src={artwork} alt="" fill sizes="(max-width: 640px) 50vw, 25vw" className="object-cover opacity-70 transition-transform duration-500 group-hover:scale-105" />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/10" />
              <Image src={child.src} alt={`Child ${child.action}`} width={1024} height={1536} sizes="(max-width: 640px) 50vw, 25vw" className="absolute inset-x-0 bottom-0 h-[95%] w-full object-contain object-bottom drop-shadow-[0_8px_12px_rgba(0,0,0,0.18)]" priority={index < 2} />
              {design && <span className="absolute bottom-2 left-2 right-2 rounded-full bg-white/90 px-2 py-1 text-center text-[10px] font-semibold text-charcoal backdrop-blur-sm sm:bottom-3 sm:left-3 sm:right-3 sm:px-3 sm:py-1.5 sm:text-xs">{design.name}</span>}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
