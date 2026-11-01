"use client";

import Image from "@/components/SiteImage";
import Link from "next/link";
import { useRef, useState } from "react";

// The showroom sign-off screen. Everything money-shaped in this file is the
// SELLING price the server chose to send — the partner's cost never reaches
// this component (see page.tsx). Flow: partner fills client name/ref, turns
// the screen, the client checks the wall + amount and signs on the canvas,
// Confirm saves the signed order-copy PDF against the order. Placing the
// order (freeze → pay) stays on the orders dashboard, where prices are the
// partner's own business again.

const ftIn = (mm: number) => {
  const t = mm / 25.4, f = Math.floor(t / 12), i = Math.round(t - f * 12);
  return i === 12 ? `${f + 1} ft` : i ? `${f} ft ${i} in` : `${f} ft`;
};
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default function ShowroomSignOff({
  slug, accountName, logoPath, orderId, orderRef, printName,
  widthMm, heightMm, areaSqft, sellTotal,
  savedClientName, savedClientRef, alreadySigned, hasQuotePdf,
}: {
  slug: string;
  accountName: string;
  logoPath: string | null;
  orderId: string;
  orderRef: string;
  printName: string | null;
  widthMm: number;
  heightMm: number;
  areaSqft: number;
  sellTotal: number;
  savedClientName: string | null;
  savedClientRef: string | null;
  alreadySigned: boolean;
  hasQuotePdf: boolean;
}) {
  const [clientName, setClientName] = useState(savedClientName ?? "");
  const [clientRef, setClientRef] = useState(savedClientRef ?? "");
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ url: string | null } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  // Plain pointer-events signature pad. White ground on purpose: the PDF path
  // JPEG-flattens the image, and a transparent canvas would flatten to black.
  function ensureGround(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement) {
    if (!hasInk) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
  }
  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    ensureGround(ctx, c);
    drawing.current = true;
    c.setPointerCapture(e.pointerId);
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#17171a";
    setHasInk(true);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function up() { drawing.current = false; }
  function clear() {
    const c = canvasRef.current; const ctx = c?.getContext("2d");
    if (c && ctx) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
    setHasInk(false);
  }

  async function confirm() {
    setErr(null);
    if (!clientName.trim()) { setErr("Enter your client's name first."); return; }
    setBusy(true);
    try {
      const signatureDataUrl = hasInk ? canvasRef.current?.toDataURL("image/png") : undefined;
      const r = await fetch(`/api/corporate/orders/${orderId}/client-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: clientName.trim(), clientRef: clientRef.trim() || undefined, signatureDataUrl }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not save the sign-off.");
      setDone({ url: j.quoteUrl ?? null });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the sign-off.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <header className="mb-8 flex items-center gap-3">
        {logoPath && <Image src={logoPath} alt="" width={44} height={44} className="rounded-[10px]" />}
        <div>
          <p className="font-display text-lg font-bold leading-tight">{accountName}</p>
          <p className="text-xs text-mist">Order confirmation</p>
        </div>
        <p className="ml-auto font-mono text-xs text-slate">{orderRef}</p>
      </header>

      <section className="rounded-[18px] border border-edge bg-surface p-6">
        <div className="flex flex-wrap items-start gap-5">
          {/* The order's artwork, through the session-gated image route. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/corporate/orders/${orderId}/image`} alt=""
            className="h-28 w-28 shrink-0 rounded-[12px] border border-edge object-cover" />
          <div className="min-w-[200px] flex-1">
            <p className="font-display text-base font-bold leading-tight">{printName || "Custom wall"}</p>
            <p className="mt-1 text-sm text-slate">
              {ftIn(widthMm)} × {ftIn(heightMm)} · {areaSqft.toFixed(1)} sq ft
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-bold">{inr(sellTotal)}</p>
            <p className="text-xs text-mist">inclusive of taxes</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-slate">Client name</span>
            <input value={clientName} onChange={(e) => setClientName(e.target.value)}
              placeholder="Who this order is for"
              className="mt-1 w-full rounded-[10px] border border-edge bg-wash px-3 py-2 text-sm outline-none focus:border-charcoal" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate">Your reference (optional)</span>
            <input value={clientRef} onChange={(e) => setClientRef(e.target.value)}
              placeholder="Your job / order number"
              className="mt-1 w-full rounded-[10px] border border-edge bg-wash px-3 py-2 text-sm outline-none focus:border-charcoal" />
          </label>
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold text-slate">Client signature</span>
            <button type="button" onClick={clear} className="text-xs text-mist underline">Clear</button>
          </div>
          <canvas ref={canvasRef} width={640} height={200}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
            className="mt-1 h-40 w-full touch-none rounded-[12px] border border-edge bg-white" />
          <p className="mt-1 text-[11px] text-mist">
            Sign with a finger or stylus. This saves a signed order copy (PDF) — it is a record of
            confirmation, not a tax invoice.
          </p>
        </div>

        {err && <p className="mt-4 text-sm font-semibold text-red-600">{err}</p>}

        {done ? (
          <div className="mt-5 rounded-[12px] border border-edge bg-wash px-4 py-3 text-sm">
            <p className="font-semibold">Saved{hasInk ? " with signature" : ""}.</p>
            <div className="mt-2 flex flex-wrap gap-4">
              {done.url && (
                <a href={done.url} target="_blank" rel="noopener noreferrer" className="underline">
                  Download the order copy (PDF)
                </a>
              )}
              <Link href={`/partners/${slug}/orders`} className="underline">
                Back to orders — confirm &amp; pay there when you&apos;re ready
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button onClick={() => void confirm()} disabled={busy}
              className="rounded-[12px] bg-charcoal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {busy ? "Saving…" : hasInk ? "Confirm & save signed copy" : "Save order copy"}
            </button>
            {(alreadySigned || hasQuotePdf) && (
              <a href={`/api/corporate/orders/${orderId}/client-quote`} target="_blank" rel="noopener noreferrer"
                className="text-sm text-slate underline">
                View the saved copy
              </a>
            )}
          </div>
        )}
      </section>

      <p className="mt-6 text-center text-xs text-mist">
        <Link href={`/partners/${slug}/orders`} className="underline">← Back to your orders</Link>
      </p>
    </main>
  );
}
