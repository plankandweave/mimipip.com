"use client";

import { useEffect, useRef, useState } from "react";
import { clampOverlayPosition, defaultTextOverlay, textOverlaySchema, type TextOverlay } from "@/lib/text-overlay";

/** Position changes reuse the tile. Text/style changes discard stale previews immediately. */
export function useTextOverlayPreview(overlay: TextOverlay | null) {
  const key = overlay ? JSON.stringify({ ...overlay, companion: undefined, x: 0, y: 0, width: .4, text: overlay.text.trim() }) : "";
  const [result, setResult] = useState({ key: "", url: "", error: "" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!key) return;
    const parsed = textOverlaySchema.safeParse(JSON.parse(key));
    if (!parsed.success) return;
    const abort = new AbortController();
    let url = "";
    const timer = setTimeout(async () => {
      try {
        const r = await fetch("/api/text-overlay", { method: "POST", headers: { "content-type": "application/json" }, body: key, signal: abort.signal });
        if (!r.ok) throw new Error((await r.json()).error || "Preview unavailable.");
        url = URL.createObjectURL(await r.blob());
        const img = new Image(); img.src = url; await img.decode();
        if (!abort.signal.aborted) setResult({ key, url, error: "" });
      } catch (e) {
        if (!abort.signal.aborted) setResult({ key, url: "", error: e instanceof Error ? e.message : "Preview unavailable." });
      }
    }, 350);
    return () => { clearTimeout(timer); abort.abort(); if (url) URL.revokeObjectURL(url); };
  }, [key, retry]);
  return { url: result.key === key ? result.url : "", error: result.key === key ? result.error : "", retry: () => { setResult({ key: "", url: "", error: "" }); setRetry(n => n+1); } };
}

export function TextOverlayLayer({ overlay, url, wallWidthCm, wallHeightCm, onChange }: {
  overlay: TextOverlay; url: string; wallWidthCm: number; wallHeightCm: number; onChange?: (o: TextOverlay) => void;
}) {
  const drag = useRef<{x: number; y: number; ox: number; oy: number; w: number; h: number} | null>(null);
  const move = (x: number, y: number) => onChange?.(clampOverlayPosition(overlay, x, y, wallWidthCm, wallHeightCm));
  return <div role={onChange ? "button" : "img"} tabIndex={onChange ? 0 : undefined}
    aria-label={`${overlay.kind === "cloud" ? "Name cloud" : "Quote"}: ${overlay.text}. Drag to position; arrow keys move it.`}
    className={`absolute z-10 ${onChange ? "cursor-grab rounded-lg focus:outline-2 focus:outline-offset-2 focus:outline-sky-600" : "pointer-events-none"}`}
    style={{ left: `${overlay.x*100}%`, top: `${overlay.y*100}%`, width: `${overlay.width*100}%`, height: `${overlay.width*wallWidthCm/(2*wallHeightCm)*100}%`, touchAction: "none" }}
    onPointerDown={e => {
      if (!onChange) return; e.stopPropagation();
      const r = e.currentTarget.parentElement!.getBoundingClientRect();
      drag.current = {x:e.clientX, y:e.clientY, ox:overlay.x, oy:overlay.y, w:r.width, h:r.height};
      e.currentTarget.setPointerCapture(e.pointerId);
    }}
    onPointerMove={e => { if (!drag.current) return; e.stopPropagation(); const d=drag.current; move(d.ox+(e.clientX-d.x)/d.w, d.oy+(e.clientY-d.y)/d.h); }}
    onPointerUp={e => { e.stopPropagation(); drag.current=null; }} onPointerCancel={() => { drag.current=null; }} onLostPointerCapture={() => { drag.current=null; }}
    onKeyDown={e => { const d: Record<string, number[]> = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}; if (!d[e.key]) return; e.preventDefault(); const step=e.shiftKey?5:1; move(overlay.x+d[e.key][0]*step/wallWidthCm,overlay.y+d[e.key][1]*step/wallHeightCm); }}>
    {/* The engine-rendered tile is also the production renderer's input geometry. */}
    {url && <img src={url} alt="" draggable={false} className="pointer-events-none h-full w-full" />}
  </div>;
}

export function TextOverlayEditor({ value, onChange, cloudAllowed, feeLabel, error, previewReady, retry, companionEditor = false }: {
  value: TextOverlay | null; onChange: (o: TextOverlay | null) => void; cloudAllowed: boolean; feeLabel: string;
  error: string | null; previewReady: boolean; retry: () => void;
  companionEditor?: boolean;
}) {
  const patch = (p: Partial<TextOverlay>) => { if(value) onChange({...value,...p}); };
  return <section id="personalise" className="space-y-3">
    <h3 className="text-base font-semibold">{companionEditor ? "Your quote" : "Make it yours"}</h3>
    {!companionEditor && <p className="mt-1 text-sm text-slate">A name, a favourite quote or words to grow with. Part of your wallpaper.</p>}
    <label className="mt-3 block text-xs font-medium">Personalisation
      <select aria-label={companionEditor ? "Quote option" : "Personalisation"} value={value?.kind ?? "none"} onChange={e => onChange(e.target.value === "none" ? null : defaultTextOverlay(e.target.value as TextOverlay["kind"]))} className="mt-1 h-11 w-full rounded-xl border border-edge bg-surface px-3 text-sm">
        <option value="none">No added text</option>
        {cloudAllowed && <option value="cloud">Name cloud · +{feeLabel}</option>}
        <option value="quote">Your quote · included</option>
      </select>
    </label>
    {value && <div className="mt-4 space-y-3">
      <label className="block text-xs font-medium">{value.kind === "cloud" ? "Child’s name" : "Your quote"}
        <textarea aria-label={value.kind === "cloud" ? "Child’s name" : "Your quote"} rows={value.kind === "cloud" ? 1 : 3} maxLength={value.kind === "cloud" ? 24 : 180} value={value.text}
          onChange={e => patch({text: value.kind === "cloud" ? e.target.value.replaceAll("\n", " ") : e.target.value})}
          placeholder={value.kind === "cloud" ? "Aarav" : "Great things begin with a conversation."} className="mt-1 w-full rounded-xl border border-edge bg-surface p-3 text-sm" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs">Font<select aria-label="Lettering font" value={value.font} onChange={e => patch({font:e.target.value as TextOverlay["font"]})} className="mt-1 h-10 w-full rounded-lg border border-edge bg-surface px-2"><option value="inter">Clean · Inter</option><option value="jakarta">Rounded · Jakarta</option><option value="devanagari">हिन्दी · Noto</option></select></label>
        <label className="text-xs">Alignment<select aria-label="Text alignment" value={value.align} onChange={e => patch({align:e.target.value as TextOverlay["align"]})} className="mt-1 h-10 w-full rounded-lg border border-edge bg-surface px-2"><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select></label>
        <label className="text-xs">Text colour<input aria-label="Text colour" type="color" value={value.color} onChange={e => patch({color:e.target.value})} className="mt-1 block h-10 w-full" /></label>
        <label className="text-xs">{value.kind === "cloud" ? "Cloud colour" : "Background"}<select aria-label="Text background" value={value.background} onChange={e => patch({background:e.target.value})} className="mt-1 h-10 w-full rounded-lg border border-edge bg-surface px-2"><option value="none">No background</option><option value="#fff8ed">Warm white</option><option value="#e0edf5">Soft blue</option><option value="#f6e3e8">Blush</option><option value="#e2eadc">Sage</option><option value="#273746">Ink</option></select></label>
      </div>
      <label className="block text-xs">Size · {Math.round(value.width*100)}% of wall width<input aria-label="Lettering size" type="range" min="12" max="80" step="1" value={value.width*100} onChange={e => patch({width:Number(e.target.value)/100})} className="mt-2 block w-full" /></label>
      <p className="text-sm font-semibold">Position on your wall</p>
      <p className="text-xs text-slate">Drag your {value.kind === "cloud" ? "cloud" : "quote"} directly in the preview. On a keyboard, select it and use the arrow keys. Text fits automatically; line breaks are preserved.</p>
      {error ? <p role="alert" className="text-xs text-alert">{error} <button type="button" onClick={retry} className="underline">Retry preview</button></p> : <p role="status" className="text-xs text-slate">{previewReady ? "Preview ready. Check spelling and position before approving." : value.text.trim() ? "Preparing your lettering…" : "Enter your text to see the preview."}</p>}
    </div>}
  </section>;
}

