"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ProductCard } from "./ProductCard";
import { downscaleForUpload } from "@/lib/upload";
import { useAuthGate } from "@/components/AuthGate";
import type { ProductCardData } from "@/lib/types";

const MAX_BYTES = 8 * 1024 * 1024;

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.5" r="3.4" />
    </svg>
  );
}

export function VisualSearch({ triggerClassName = "grid" }: { triggerClassName?: string } = {}) {
  const { promptAuth, authModal, signedIn } = useAuthGate();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ProductCardData[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const captureRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setMounted(true), []);

  // The mobile menu's "Search by photo" item opens this modal via a window event.
  useEffect(() => {
    const openIt = () => setOpen(true);
    window.addEventListener("zyvorah:open-visual-search", openIt);
    return () => window.removeEventListener("zyvorah:open-visual-search", openIt);
  }, []);

  // Track the current blob: URL so we can revoke it — otherwise every upload
  // leaks an object URL for the page's lifetime.
  const previewUrlRef = useRef<string | null>(null);
  const setPreviewUrl = (url: string | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = url;
    setPreview(url);
  };
  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const reset = () => {
    setPreviewUrl(null);
    setError(null);
    setResults(null);
    setBusy(false);
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const submit = async (file: File) => {
    // Verified email required — this runs Haiku vision on the upload.
    if (!signedIn) {
      promptAuth("search with your own photo");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("That doesn't look like an image — try a photo (JPG, PNG, WEBP).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That image is too large — please use one under 8MB.");
      return;
    }
    setError(null);
    setResults(null);
    setPreviewUrl(URL.createObjectURL(file));
    setBusy(true);
    try {
      const upload = await downscaleForUpload(file);
      const body = new FormData();
      body.append("image", upload, "search.jpg");
      const res = await fetch("/api/visual-search", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "too_large"
            ? "That image is too large — please use one under 8MB."
            : "Something went wrong finding matches — please try another photo.",
        );
        return;
      }
      setResults(data.products ?? []);
    } catch {
      setError("Couldn't reach the store just now — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) submit(file);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) submit(file);
  };

  return (
    <>
      <button
        aria-label="Search by photo"
        onClick={() => setOpen(true)}
        className={`${triggerClassName} h-10 w-10 place-items-center rounded-full text-charcoal transition-colors hover:bg-wash`}
      >
        <CameraIcon />
      </button>

      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-charcoal/40 p-4 backdrop-blur-sm"
          onClick={close}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-[min(560px,100%)] flex-col overflow-hidden rounded-[24px] bg-cloud shadow-2xl ring-1 ring-edge"
          >
            <div className="flex items-start justify-between bg-gradient-to-r from-lavender via-blush to-peach px-5 py-4">
              <div>
                <p className="font-display text-base font-bold text-charcoal">Search by photo</p>
                <p className="text-xs text-charcoal/70">
                  Upload a room photo, a Pinterest save, or a fabric swatch — we&apos;ll find the closest murals.
                </p>
                <Link href="/match-a-photo" onClick={close} className="mt-1 inline-block text-xs font-semibold text-charcoal underline underline-offset-2">
                  Open the full Match a Photo tool &rarr;
                </Link>
              </div>
              <button
                aria-label="Close"
                onClick={close}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-charcoal/70 transition-colors hover:bg-surface/50"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {!preview && (
                <>
                  <div
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    className={`grid cursor-pointer place-items-center rounded-[16px] border-2 border-dashed px-6 py-14 text-center transition-colors ${
                      dragOver ? "border-charcoal bg-wash" : "border-edge hover:bg-wash/60"
                    }`}
                  >
                    <CameraIcon />
                    <p className="mt-3 text-sm font-medium text-charcoal">Click to upload or drag a photo here</p>
                    <p className="mt-1 text-xs text-mist">JPG, PNG or WEBP, up to 8MB</p>
                    <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
                  </div>

                  <div className="my-3 flex items-center gap-3">
                    <span className="h-px flex-1 bg-edge" />
                    <span className="text-xs text-mist">or</span>
                    <span className="h-px flex-1 bg-edge" />
                  </div>

                  {/* Take a photo — opens the device camera on mobile (capture),
                      falls back to the file picker on desktop. */}
                  <button
                    type="button"
                    onClick={() => captureRef.current?.click()}
                    className="btn btn-ghost w-full justify-center"
                  >
                    <CameraIcon />
                    Take a photo
                  </button>
                  <input
                    ref={captureRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={onPick}
                  />
                </>
              )}

              {preview && (
                <div className="mb-4 flex items-center gap-3">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[12px] bg-wash">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="Your upload" className="h-full w-full object-cover" />
                  </div>
                  <div className="flex-1 text-sm text-slate">
                    {busy ? "Finding similar murals…" : error ? "Couldn't search that photo." : `${results?.length ?? 0} matches found`}
                  </div>
                  <button
                    onClick={reset}
                    className="shrink-0 text-xs font-semibold text-slate underline underline-offset-2 hover:text-charcoal"
                  >
                    Try another
                  </button>
                </div>
              )}

              {busy && (
                <div className="flex items-center gap-1.5 py-6">
                  {[0, 1, 2].map((d) => (
                    <span
                      key={d}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-mist"
                      style={{ animationDelay: `${d * 0.15}s` }}
                    />
                  ))}
                </div>
              )}

              {error && <p className="rounded-[12px] bg-wash px-4 py-3 text-sm text-charcoal">{error}</p>}

              {!busy && results && results.length === 0 && !error && (
                <p className="rounded-[12px] bg-wash px-4 py-3 text-sm text-charcoal">
                  No close matches yet — try a clearer photo or a different angle.
                </p>
              )}

              {!busy && results && results.length > 0 && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {results.map((p) => (
                    <div key={p.handle} onClick={close}>
                      <ProductCard product={p} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
      {authModal}
    </>
  );
}
