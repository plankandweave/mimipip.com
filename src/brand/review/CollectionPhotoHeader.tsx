import Image from "@/components/SiteImage";
import Link from "next/link";
import type { ReactNode } from "react";
import { card, label, type RecordData } from "./data";

// Keep clothing globally familiar and solid-coloured, and hairstyles equally
// contemporary across the cast. Faces carry the diversity of the campaign.
type ChildPhoto = { src: string; action: string };

const children: readonly ChildPhoto[] = [
  { src: "/collection-kids/jump-coral-v3.webp", action: "jumping with delight" },
  { src: "/collection-kids/leap-cobalt.webp", action: "leaping with a smile" },
  { src: "/collection-kids/dance-yellow.webp", action: "dancing joyfully" },
  { src: "/collection-kids/fly-pink.webp", action: "playing airplane" },
];

const collectionChildren: Record<string, readonly ChildPhoto[]> = {
  "happy-petals": [
    { src: "/collection-kids/happy-petals/twirl-tangerine.webp", action: "twirling among flowers" },
    { src: "/collection-kids/happy-petals/celebrate-turquoise.webp", action: "celebrating joyfully" },
    { src: "/collection-kids/happy-petals/dance-raspberry.webp", action: "dancing among flowers" },
    { src: "/collection-kids/happy-petals/jump-yellow.webp", action: "jumping with delight" },
  ],
  "hush-and-wander": [
    { src: "/collection-kids/hush-and-wander/point-lilac.webp", action: "pointing in wonder" },
    { src: "/collection-kids/hush-and-wander/explore-mint.webp", action: "taking an exploring step" },
    { src: "/collection-kids/hush-and-wander/garden-yellow.webp", action: "discovering a garden creature" },
    { src: "/collection-kids/hush-and-wander/wonder-blue.webp", action: "looking up in wonder" },
  ],
  "playroom-stories": [
    { src: "/collection-kids/playroom-stories/run-blue.webp", action: "running through a story" },
    { src: "/collection-kids/playroom-stories/reach-yellow.webp", action: "reaching toward a kite" },
    { src: "/collection-kids/playroom-stories/explore-green.webp", action: "exploring an imaginary world" },
    { src: "/collection-kids/playroom-stories/build-coral.webp", action: "building an imaginary sandcastle" },
  ],
  hopscotch: [
    { src: "/collection-kids/hopscotch/hop-magenta.webp", action: "hopping on one foot" },
    { src: "/collection-kids/hopscotch/hop-yellow.webp", action: "jumping between squares" },
    { src: "/collection-kids/hopscotch/balance-orange.webp", action: "balancing on one foot" },
    { src: "/collection-kids/hopscotch/land-turquoise.webp", action: "landing from a hop" },
  ],
  "wallpaper-worlds": [
    { src: "/collection-kids/wallpaper-worlds/space-blue.webp", action: "reaching toward imaginary stars" },
    { src: "/collection-kids/wallpaper-worlds/ocean-aqua.webp", action: "playing ocean explorer" },
    { src: "/collection-kids/wallpaper-worlds/dinosaur-green.webp", action: "playing dinosaur" },
    { src: "/collection-kids/wallpaper-worlds/floral-raspberry.webp", action: "twirling in a garden" },
  ],
};

const directoryChildren: readonly ChildPhoto[] = [
  collectionChildren["happy-petals"][0],
  collectionChildren["hush-and-wander"][0],
  collectionChildren["playroom-stories"][1],
  collectionChildren.hopscotch[3],
];

collectionChildren["all-collections"] = directoryChildren;
collectionChildren["collection-directory"] = directoryChildren;

const featuredTitles: Record<string, readonly string[]> = {
  "wallpaper-worlds": ["Cosmic Outpost", "Deep Ocean Wonder", "Mesozoic Valley", "Blossom Sky"],
};

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
  const cast = collectionChildren[handle] ?? children;
  const offset = collectionChildren[handle] ? 0 : [...handle].reduce((sum, char) => sum + char.charCodeAt(0), 0) % children.length;
  // Spread the header across a collection's range instead of repeating the
  // first few near-identical colourways in catalogue order.
  const spread = Array.from({ length: Math.min(4, designs.length) }, (_, index) =>
    designs[Math.round(index * (designs.length - 1) / Math.max(1, Math.min(4, designs.length) - 1))]
  );
  const featured = featuredTitles[handle]
    ? featuredTitles[handle].map((name, index) => designs.find((design) => design.name === name) ?? spread[index]).filter((design): design is RecordData => Boolean(design))
    : handle === "playroom-stories" || handle === "hush-and-wander" ? designs.slice(0, 4) : spread;

  return (
    <header className="mb-8" aria-label={`${title} collection`}>
      <div className="mb-5 max-w-3xl">
        <span className="caps text-slate">Mimi Pip collections</span>
        <h1 className="mt-2 text-[clamp(2rem,4vw,3.4rem)] leading-tight">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate">{description}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3" aria-label="Children and designs from this collection">
        {cast.map((_, index) => {
          const child = cast[(index + offset) % cast.length];
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
