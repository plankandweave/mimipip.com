"use client";
import { useEffect, useRef, useState } from "react";
import WallMockup from "@/components/WallMockup";
import { coverLayout } from "@/lib/visualizer";
import { loadImage } from "@/lib/warp";
import type { Point } from "@/lib/homography";
import type { ProposalConfiguration } from "@/lib/proposal-configuration";

export default function ProposalArtwork({ artUrl, photoUrl, quad, configuration, onReady, onStatus }: {
  artUrl: string; photoUrl: string | null; quad: [Point, Point, Point, Point] | null;
  configuration: ProposalConfiguration; onStatus: (ready: boolean) => void; onReady?: (canvas: HTMLCanvasElement) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const callback = useRef(onReady);
  const [cropped, setCropped] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { callback.current = onReady; }, [onReady]);
  useEffect(() => {
    let alive = true;
    onStatus(false);
    void (async () => {
      try {
        const image = await loadImage(artUrl, true);
        if (!alive || !ref.current || configuration.widthMm <= 0 || configuration.heightMm <= 0) return;
        const canvas = ref.current;
        const aspect = configuration.widthMm / configuration.heightMm;
        canvas.width = Math.max(1, Math.round(1200 * Math.min(1, aspect)));
        canvas.height = Math.max(1, Math.round(1200 / Math.max(1, aspect)));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable");
        const { zoom, cropX, cropY, flipH, flipV } = configuration.placement;
        const { imgW, imgH } = coverLayout(canvas.width, canvas.height, image.naturalWidth / image.naturalHeight, zoom);
        ctx.translate(-cropX * (imgW - canvas.width) + imgW / 2, -cropY * (imgH - canvas.height) + imgH / 2);
        ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        ctx.drawImage(image, -imgW / 2, -imgH / 2, imgW, imgH);
        setError(false);
        onStatus(true);
        if (photoUrl && quad) setCropped(canvas.toDataURL("image/jpeg", .9));
        else callback.current?.(canvas);
      } catch { if (alive) setError(true); }
    })();
    return () => { alive = false; };
  }, [artUrl, photoUrl, quad, configuration, onStatus]);
  return <div className="overflow-hidden rounded-xl border border-edge">
    <canvas ref={ref} aria-label="Saved wallpaper composition" className={photoUrl && quad ? "hidden" : "block h-auto w-full"} />
    {photoUrl && quad && cropped && <WallMockup photoUrl={photoUrl} artUrl={cropped} quad={quad} alt="Proposed design on your wall" className="h-auto w-full" onReady={onReady} />}
    {error && <p role="alert" className="p-3 text-sm text-red-600">The composition could not load. Reload before approving.</p>}
  </div>;
}
