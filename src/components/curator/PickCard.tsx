"use client";

import { useState } from "react";
import Image from "@/components/SiteImage";
import Link from "next/link";
import { RoomVisualizer } from "@/components/RoomVisualizer";
import { SaveToBoard } from "@/components/SaveToBoard";
import { useAuthGate } from "@/components/AuthGate";
import { billedPriceFor, CM_PER_FOOT, MIN_PRINT_WIDTH_FT, MIN_WALLPAPER_SQFT } from "@/lib/pricing";
import { useMarket } from "@/components/MarketProvider";
import type { CropData } from "@/lib/visualizer";
import type { ZPick } from "./types";

export function PickCard({
  pick,
  lead,
  dims,
}: {
  pick: ZPick;
  lead?: boolean;
  dims: { widthFt: number; heightFt: number } | null;
}) {
  const { money } = useMarket();
  const [vizOpen, setVizOpen] = useState(false);
  // The placement the customer aligned, kept so it can be saved to a board —
  // this card used to drop the composite on the floor (onApply was a no-op).
  const [placed, setPlaced] = useState<{ composite: string; crop: CropData } | null>(null);
  const [saveBoardOpen, setSaveBoardOpen] = useState(false);
  const { gate, authModal } = useAuthGate();
  const widthFt = dims?.widthFt ?? 10;
  const heightFt = dims?.heightFt ?? 8;
  // The curator promises an EXACT price and deep-links straight to the
  // configurator, so it must price on the same billed basis (min 4 ft print
  // width, min 20 sq ft) — raw area × rate would under-quote a small wall and
  // the configurator would then show a higher number than the card clicked.
  const exactPrice =
    pick.fromPricePerSqft != null && dims
      ? billedPriceFor(widthFt * CM_PER_FOOT, heightFt * CM_PER_FOOT, pick.fromPricePerSqft)
      : null;
  const atMinimum = dims ? widthFt * heightFt < MIN_WALLPAPER_SQFT || widthFt < MIN_PRINT_WIDTH_FT : false;
  const price =
    exactPrice != null
      ? `${money(exactPrice)} for your ${widthFt}×${heightFt} ft wall${atMinimum ? " (at our minimum billing)" : ""}`
      : pick.fromPricePerSqft != null
        ? `from ${money(pick.fromPricePerSqft)}/sq ft`
        : "sized to your wall";

  const configureHref = dims ? `${pick.url}?w=${widthFt}&h=${heightFt}` : pick.url;

  return (
    <article className={`card flex flex-col overflow-hidden rounded-[24px] border border-edge ${lead ? "sm:flex-row" : ""}`}>
      <div className={`relative bg-wash ${lead ? "aspect-[4/3] sm:aspect-auto sm:min-h-[380px] sm:w-[58%]" : "aspect-[4/3]"}`}>
        {pick.flatUrl && (
          <Image src={pick.flatUrl} alt={pick.flatAlt} fill className="object-cover" sizes="(max-width: 640px) 100vw, 50vw" />
        )}
      </div>
      <div className={`flex flex-col gap-3 p-6 ${lead ? "sm:max-w-[440px] sm:justify-center" : ""}`}>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[1.15rem] font-semibold text-charcoal">{pick.title}</h3>
          <span className="whitespace-nowrap text-xs text-mist">{price}</span>
        </div>
        <p className="text-[0.95rem] leading-relaxed text-slate">{pick.rationale}</p>
        <div className="mt-1 flex flex-wrap gap-3">
          {pick.flatUrl && (
            <button className="btn btn-ghost" onClick={() => gate("see this on your own wall", () => setVizOpen(true))}>
              {placed ? "Edit placement" : "See it on your wall"}
            </button>
          )}
          {placed && (
            <button className="btn btn-ghost" onClick={() => setSaveBoardOpen(true)}>
              Save to my board
            </button>
          )}
          <Link href={configureHref} className="btn">
            Configure &amp; add to cart
          </Link>
          <Link href={`${pick.url}?sample=1`} className="btn btn-ghost">
            Order a sample
          </Link>
        </div>
      </div>
      {pick.flatUrl && (
        <RoomVisualizer
          open={vizOpen}
          onClose={() => setVizOpen(false)}
          imageUrl={pick.flatUrl}
          imageAlt={pick.flatAlt}
          productHandle={pick.handle}
          wallWidthCm={widthFt * CM_PER_FOOT}
          wallHeightCm={heightFt * CM_PER_FOOT}
          wallLabel="Your wall"
          initial={null}
          onApply={(crop, composite) => {
            if (composite) setPlaced({ composite, crop });
            setVizOpen(false);
          }}
        />
      )}

      {placed && (
        <SaveToBoard
          open={saveBoardOpen}
          onClose={() => setSaveBoardOpen(false)}
          productId={null}
          productHandle={pick.handle}
          imageDataUrl={placed.composite}
          crop={placed.crop}
        />
      )}

      {authModal}
    </article>
  );
}
