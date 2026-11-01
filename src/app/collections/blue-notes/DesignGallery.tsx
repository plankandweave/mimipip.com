"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { MarketMoney } from "@/components/MarketMoney";
import { useMarket } from "@/components/MarketProvider";
import { marketUrl } from "@/lib/market-seo";
import { BLUE_NOTES_DESIGNS } from "@/lib/blue-notes";

type Design = (typeof BLUE_NOTES_DESIGNS)[number];
export function DesignGallery({ design, rate }: { design: Design; rate: number }) {
  const [selected, setSelected] = useState(0);
  const { market } = useMarket();
  const flat = selected === 3;
  const picture = flat ? design.flat : design.rooms[selected].url;
  const label = flat ? "Artwork" : design.rooms[selected].label;
  const href = marketUrl(`/products/${design.handle}`, market.countryCode);
  return <article className="bn-design" id={design.slug} data-blue-design={design.handle}>
    <div className="bn-design-picture">
      <Link href={href} aria-label={`View ${design.name}`}>
        <Image src={picture} alt={`${design.name} — ${label}`} width={1536} height={1024} sizes="(max-width: 800px) 100vw, 50vw" />
      </Link>
    </div>
    <div className="bn-room-views" aria-label={`Explore ${design.name}`}>
      {design.rooms.map((room, i) => <button key={room.key} aria-pressed={selected === i} onClick={() => setSelected(i)}>{room.label}</button>)}
      <button aria-pressed={flat} onClick={() => setSelected(3)}>Artwork</button>
    </div>
    <div className="bn-design-heading">
      <span className="bn-number">{String(design.number).padStart(2, "0")}</span>
      <h2><Link href={href}>{design.name}</Link></h2>
      <Link href={href} className="bn-design-link" aria-label={`Shop ${design.name}`}><span aria-hidden>↗</span></Link>
    </div>
    <p className="bn-design-rate"><MarketMoney inr={rate} /> / sq ft</p>
  </article>;
}
