"use client";

import { useState } from "react";
import "./new-york-gallery.css";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { newYorkImage } from "@/lib/new-york-collection";

export function NewYorkDesignGallery({ slug, place, settings }: {
  slug: string; place: string; settings: readonly string[];
}) {
  const [scene, setScene] = useState(1);
  return (
    <div data-new-york-gallery={slug}>
      <figure>
        <div className="relative aspect-[3/2] overflow-hidden rounded-[4px] bg-[#e8e1d4]">
          <Image src={newYorkImage(slug, scene)} alt={`${place} New York mural — ${settings[scene - 1]}`}
            fill sizes="(max-width: 1024px) 100vw, 70vw" className="object-contain object-bottom" />
        </div>
        <figcaption className="mt-5 flex items-baseline justify-between gap-4 text-sm text-slate" aria-live="polite">
          <span className="ny-room-name text-xl md:text-2xl">{settings[scene - 1]}</span><span className="shrink-0">{scene} / 3</span>
        </figcaption>
      </figure>
      <div className="mt-6 grid grid-cols-3 gap-4 md:gap-6" aria-label={`Three settings for ${place}`}>
        {settings.map((setting, index) => (
          <button key={setting} type="button" onClick={() => setScene(index + 1)}
            aria-pressed={scene === index + 1} aria-label={`Show ${place}: ${setting}`}
            className="group min-h-10 self-start text-left focus-visible:outline-2 focus-visible:outline-offset-4">
            <Image src={newYorkImage(slug, index + 1)} alt="" width={480} height={320}
              sizes="(max-width: 1024px) 30vw, 22vw" className="aspect-[3/2] w-full object-contain object-bottom" />
            <span className={`ny-room-name mt-3 block border-b pb-3 text-sm leading-snug transition-colors sm:text-lg ${scene === index + 1 ? "border-charcoal/60 text-charcoal" : "border-transparent text-slate group-hover:border-charcoal/25"}`}>{setting}</span>
          </button>
        ))}
      </div>
      <details className="mt-6 border-t border-charcoal/15 pt-4">
        <summary className="min-h-10 cursor-pointer py-2 text-sm">Explore the flat artwork</summary>
        <Image src={newYorkImage(slug, "flat")} alt={`${place} — complete flat New York mural artwork`}
          width={1536} height={1024} sizes="(max-width: 1024px) 100vw, 70vw" className="mt-4 h-auto w-full" />
        <Link href={`/products/new-york-${slug}`} prefetch={false} className="mt-3 inline-block text-sm underline underline-offset-4">
          Choose your wall size and finish
        </Link>
      </details>
    </div>
  );
}
