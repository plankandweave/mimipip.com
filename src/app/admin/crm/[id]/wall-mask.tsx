"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Choosing the wall.
 *
 * The first in-situ render was beautiful and dishonest: an unmasked image edit
 * regenerates the whole photograph, so the mural was right but the camera had
 * moved, the desks had rearranged themselves and a piece of furniture appeared
 * that does not exist in their office. A mask fixes that — it is the difference
 * between "here is your wall, wearing this" and "here is a similar room".
 *
 * Two jobs happen here, both on a canvas, because the deployed runtime is
 * Cloudflare Workers and sharp cannot run there:
 *
 *   1. The BASE. The image model answers in 3:2 whatever it is asked, and their
 *      photographs are 2.16:1, so an unprepared render is re-framed before it
 *      begins. The photograph is centre-cropped to 3:2 once, and that crop is
 *      both what the model sees and what the client swipes against.
 *   2. The MASK. The wall segmenter is a good first guess and a poor final
 *      answer: it takes every wall in the room — 58% of their Admin bay,
 *      including some ceiling — and a design usually wants one wall. So the
 *      segmentation is a starting point she paints on top of.
 *
 * Mask polarity is the edits API's, not the segmenter's: TRANSPARENT where the
 * mural may go, opaque everywhere that must survive untouched. On screen that
 * is inverted for the eye — the paintable wall is the tinted part, because
 * "what I am choosing" should be what is lit up.
 */

const OUT_W = 1536;
const OUT_H = 1024; // 3:2, the size the image model returns.

type Props = {
  photo: { id: string; label: string | null; url: string | null; maskUrl?: string | null };
  proposalId: string;
  onDone: () => void;
  onClose: () => void;
};

export function WallMaskEditor({ photo, proposalId, onDone, onClose }: Props) {
  const shot = useRef<HTMLCanvasElement>(null);   // the 3:2 photograph
  const paint = useRef<HTMLCanvasElement>(null);  // white where the mural may go
  const [brush, setBrush] = useState(90);
  const [mode, setMode] = useState<"add" | "erase">("add");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const drawing = useRef(false);

  /* ---- the base: centre-crop the photograph to the model's own aspect ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!photo.url) return;
      const img = await loadImage(photo.url);
      if (cancelled) return;
      const c = shot.current!;
      c.width = OUT_W; c.height = OUT_H;
      const ctx = c.getContext("2d")!;
      // "cover": fill 3:2 from the middle of the frame, never letterbox — a
      // black band would become part of the wall the model is asked to paint.
      const scale = Math.max(OUT_W / img.width, OUT_H / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (OUT_W - w) / 2, (OUT_H - h) / 2, w, h);

      const p = paint.current!;
      p.width = OUT_W; p.height = OUT_H;
      // An existing mask is loaded back in its API polarity and flipped for the
      // eye, so re-opening shows exactly what was saved.
      if (photo.maskUrl) {
        try {
          const m = await loadImage(photo.maskUrl);
          const t = document.createElement("canvas");
          t.width = OUT_W; t.height = OUT_H;
          const tx = t.getContext("2d")!;
          tx.drawImage(m, 0, 0, OUT_W, OUT_H);
          const d = tx.getImageData(0, 0, OUT_W, OUT_H);
          const px = d.data;
          for (let i = 0; i < px.length; i += 4) {
            const paintable = px[i + 3] < 128; // transparent in the API mask
            px[i] = 196; px[i + 1] = 24; px[i + 2] = 124;
            px[i + 3] = paintable ? 255 : 0;
          }
          p.getContext("2d")!.putImageData(d, 0, 0);
        } catch { /* a mask that will not load is simply re-made */ }
      }
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [photo.url, photo.maskUrl]);

  const at = (e: React.PointerEvent) => {
    const r = paint.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * OUT_W,
      y: ((e.clientY - r.top) / r.height) * OUT_H,
      // The brush is set in displayed pixels; scale it to the canvas so it
      // feels the same size however the editor is sized on screen.
      r: (brush / r.width) * OUT_W,
    };
  };

  const dab = (e: React.PointerEvent) => {
    const ctx = paint.current!.getContext("2d")!;
    const { x, y, r } = at(e);
    ctx.globalCompositeOperation = mode === "add" ? "source-over" : "destination-out";
    // Magenta, not white: these walls ARE white, and a white brush on them is
    // invisible. Only the alpha channel is read on save, so the colour is free.
    ctx.fillStyle = "#C4187C";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  };

  /* ---- the segmenter's guess, as a starting point ---- */
  const suggest = useCallback(async () => {
    if (!photo.url) return;
    setBusy("segment"); setErr(null);
    try {
      const blob = await fetch(photo.url).then((r) => r.blob());
      const fd = new FormData();
      fd.set("image", new File([blob], "space.jpg", { type: blob.type || "image/jpeg" }));
      const res = await fetch("/api/segment-room", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`segmentation ${res.status}`);
      const found = res.headers.get("X-Found-Wall") === "true";
      const m = await createImageBitmap(await res.blob());
      const p = paint.current!;
      const ctx = p.getContext("2d")!;
      ctx.clearRect(0, 0, OUT_W, OUT_H);
      ctx.save();
      // The segmenter answers at the photograph's own size; draw it through the
      // same cover-crop the base used or the mask would sit off the wall.
      const scale = Math.max(OUT_W / m.width, OUT_H / m.height);
      const w = m.width * scale, h = m.height * scale;
      ctx.drawImage(m, (OUT_W - w) / 2, (OUT_H - h) / 2, w, h);
      // Tint the suggestion so it reads against a white wall, keeping its alpha.
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = "#C4187C";
      ctx.fillRect(0, 0, OUT_W, OUT_H);
      ctx.restore();
      if (!found) setErr("No wall found — paint it yourself.");
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  }, [photo.url]);

  /* ---- save: the base as JPEG, the mask inverted into the API's polarity ---- */
  const save = async () => {
    setBusy("save"); setErr(null);
    try {
      const baseBlob = await new Promise<Blob | null>((r) => shot.current!.toBlob(r, "image/jpeg", 0.9));
      const src = paint.current!.getContext("2d")!.getImageData(0, 0, OUT_W, OUT_H);
      const out = new ImageData(OUT_W, OUT_H);
      let paintable = 0;
      for (let i = 0; i < src.data.length; i += 4) {
        const chosen = src.data[i + 3] > 128;
        if (chosen) paintable++;
        // Transparent = the model may paint here. Opaque black elsewhere.
        out.data[i] = out.data[i + 1] = out.data[i + 2] = 0;
        out.data[i + 3] = chosen ? 0 : 255;
      }
      if (paintable === 0) throw new Error("Nothing is selected — paint the wall first.");
      const mc = document.createElement("canvas");
      mc.width = OUT_W; mc.height = OUT_H;
      mc.getContext("2d")!.putImageData(out, 0, 0);
      const maskBlob = await new Promise<Blob | null>((r) => mc.toBlob(r, "image/png"));
      if (!baseBlob || !maskBlob) throw new Error("could not read the canvases");

      for (const [kind, blob, name] of [
        ["base", baseBlob, "base.jpg"],
        ["mask", maskBlob, "mask.png"],
      ] as const) {
        const fd = new FormData();
        fd.set("proposal_id", proposalId);
        fd.set("prepare_image_id", photo.id);
        fd.set("prepare_kind", kind);
        fd.set("file", new File([blob], name, { type: blob.type }));
        const r = await fetch("/api/admin/crm/studio", { method: "POST", body: fd });
        if (!r.ok) throw new Error(`${kind} upload failed (${r.status})`);
      }
      onDone();
      onClose();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black/60 p-4">
      <div className="mx-auto max-w-4xl rounded-[18px] bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-sm font-bold">
              The wall — {photo.label ?? "unlabelled space"}
            </h3>
            <p className="text-[0.68rem] text-slate">
              Paint where the mural may go. Everything you leave unpainted stays exactly as photographed.
            </p>
          </div>
          <button onClick={onClose} className="rounded-[8px] border border-edge px-3 py-1.5 text-[0.7rem]">
            Close
          </button>
        </div>

        <div className="relative mt-3 select-none overflow-hidden rounded-[10px] border border-edge"
          style={{ aspectRatio: "3 / 2", touchAction: "none" }}>
          <canvas ref={shot} className="absolute inset-0 h-full w-full" />
          <canvas
            ref={paint}
            className="absolute inset-0 h-full w-full cursor-crosshair"
            style={{ opacity: 0.5 }}
            onPointerDown={(e) => {
              drawing.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              dab(e);
            }}
            onPointerMove={(e) => { if (drawing.current) dab(e); }}
            onPointerUp={() => { drawing.current = false; }}
            onPointerCancel={() => { drawing.current = false; }}
          />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-wash text-xs text-slate">
              Loading the photograph…
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.7rem]">
          <button onClick={suggest} disabled={busy !== null}
            className="rounded-[8px] border border-edge px-3 py-1.5 disabled:opacity-40">
            {busy === "segment" ? "Finding the walls…" : "Suggest the walls"}
          </button>
          <span className="inline-flex overflow-hidden rounded-[8px] border border-edge">
            <button onClick={() => setMode("add")}
              className={`px-3 py-1.5 ${mode === "add" ? "bg-charcoal text-white" : ""}`}>Paint</button>
            <button onClick={() => setMode("erase")}
              className={`px-3 py-1.5 ${mode === "erase" ? "bg-charcoal text-white" : ""}`}>Erase</button>
          </span>
          <label className="flex items-center gap-1.5">
            Brush
            <input type="range" min={20} max={220} value={brush}
              onChange={(e) => setBrush(Number(e.target.value))} />
          </label>
          <button
            onClick={() => paint.current!.getContext("2d")!.clearRect(0, 0, OUT_W, OUT_H)}
            className="rounded-[8px] border border-edge px-3 py-1.5">Clear</button>
          <button onClick={save} disabled={busy !== null || !ready}
            className="btn h-8 px-3.5 disabled:opacity-40">
            {busy === "save" ? "Saving…" : "Save this wall"}
          </button>
          {err && <span className="text-red-700">{err}</span>}
        </div>
        <p className="mt-2 text-[0.66rem] text-slate">
          The segmenter takes every wall in the room; a direction usually wants one. Erase the walls you
          do not want, and anything it caught that is not a wall.
        </p>
      </div>
    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = src;
  });
}
