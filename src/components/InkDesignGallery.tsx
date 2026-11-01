"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { inkImage } from "@/lib/ink-collection";

export function InkDesignGallery({ slug, place, settings }: {
  slug: string; place: string; settings: readonly string[];
}) {
  const [scene, setScene] = useState(1);
  return (
    <div data-ink-gallery={slug}>
      <figure>
        <div className="relative aspect-[3/2] overflow-hidden rounded-[4px] bg-[#e8e1d4]">
          <Image src={inkImage(slug, scene)} alt={`${place} ink mural in a ${settings[scene - 1].toLowerCase()}`}
            fill sizes="(max-width: 1024px) 100vw, 70vw" className="object-contain object-bottom" />
        </div>
        <figcaption className="mt-3 flex justify-between gap-4 text-sm text-slate" aria-live="polite">
          <span>{settings[scene - 1]}</span><span className="shrink-0">{scene} / 3</span>
        </figcaption>
      </figure>
      <div className="mt-4 grid grid-cols-3 gap-3" aria-label={`Three settings for ${place}`}>
        {settings.map((setting, index) => (
          <button key={setting} type="button" onClick={() => setScene(index + 1)}
            aria-pressed={scene === index + 1} aria-label={`Show ${place}: ${setting}`}
            className={`rounded-sm border p-1 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 ${scene === index + 1 ? "border-charcoal" : "border-transparent hover:border-mist"}`}>
            <Image src={inkImage(slug, index + 1)} alt="" width={480} height={320}
              sizes="(max-width: 1024px) 30vw, 22vw" className="aspect-[3/2] w-full object-contain object-bottom" />
            <span className="mt-2 block text-[11px] leading-snug sm:text-xs">{setting}</span>
          </button>
        ))}
      </div>
      <details className="mt-6 border-t border-charcoal/15 pt-4">
        <summary className="cursor-pointer text-sm">Explore the flat artwork</summary>
        <Image src={inkImage(slug, "flat")} alt={`${place} — complete flat ink mural artwork`}
          width={1536} height={1024} sizes="(max-width: 1024px) 100vw, 70vw" className="mt-4 h-auto w-full" />
        <Link href={`/products/ink-${slug}`} prefetch={false} className="mt-3 inline-block text-sm underline underline-offset-4">
          Choose your wall size and finish
        </Link>
      </details>
    </div>
  );
}
