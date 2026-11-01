"use client";

import { useRef, useState } from "react";
import { ProductConfigurator } from "@/components/ProductConfigurator";
import { toMediaUrl, isMediaUrl, mediaRendition } from "@/lib/media-url";
import { useAuthGate } from "@/components/AuthGate";

type MaterialOpt = {
  slug: string;
  name: string;
  description: string | null;
  pricePerSqFt: number;
  comingSoon: boolean;
  swatchUrl?: string | null;
  textureUrl?: string | null;
  rollWidthMm?: number | null;
};

type Uploaded = { url: string; width: number; height: number; lowRes: boolean };

/**
 * A resized copy of an uploaded design for on-screen preview only, via Supabase
 * Storage's render CDN. Pulling the full-resolution original (up to 25MB) into
 * an <img> is what made the preview sit blank for seconds on mobile data. The
 * original URL is still what's passed to the configurator and printed.
 */
function previewSrc(url: string): string {
  const mapped = toMediaUrl(url);
  if (isMediaUrl(mapped)) return mediaRendition(mapped, 900);
  if (!url.includes("/storage/v1/object/public/")) return url;
  const rendered = url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
  return `${rendered}${rendered.includes("?") ? "&" : "?"}width=900&quality=70&resize=contain`;
}

export function PrintYourOwn({
  productHandle,
  productId,
  materials,
  printRules = null,
}: {
  productHandle: string;
  productId: string;
  materials: MaterialOpt[];
  /** Live production panel rules, fetched server-side (see lib/print-rules.ts). */
  printRules?: { maxPanelCm: number; overlapCm: number } | null;
}) {
  const [uploaded, setUploaded] = useState<Uploaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The preview is a real photo straight off a phone — often many megabytes — so
  // it can take a while to come back down over mobile data. Track its load state
  // so the customer sees progress instead of an empty box (which read as "my
  // upload didn't work"), and a retry if it genuinely fails.
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { gate, authModal } = useAuthGate();

  // iPhone photos often arrive as HEIC, which our print pipeline can't decode.
  // Safari (the only browser whose picker hands over HEIC) CAN decode it, so
  // convert to a full-resolution JPEG in the browser before uploading.
  const normalizeFile = async (file: File): Promise<{ blob: Blob; ext: string }> => {
    const isHeic = /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
    if (!isHeic) {
      const ext = (file.type.split("/")[1] || "jpg").replace("jpeg", "jpg").toLowerCase();
      return { blob: file, ext };
    }
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
    if (!blob) throw new Error("heic_convert_failed");
    return { blob, ext: "jpg" };
  };

  const upload = async (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/") && !/\.hei[cf]$/i.test(file.name)) {
      setError("That doesn't look like an image — try a JPG, PNG or WEBP.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("That image is over 25MB — please use a smaller file.");
      return;
    }
    setBusy(true);
    try {
      // Straight from the browser into storage — a full-resolution print file
      // must never squeeze through the API function (its request-body cap is
      // ~4.5MB, far below a normal phone photo).
      let normalized: { blob: Blob; ext: string };
      try {
        normalized = await normalizeFile(file);
      } catch {
        setError("We couldn't read that photo format — please try a JPG or PNG.");
        return;
      }
      // The gate that already protects this route mints a one-path signed URL;
      // the bytes then go straight to storage without the bucket granting the
      // public any write access. The KEY IS THE SERVER'S — see the route.
      const signRes = await fetch("/api/custom-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sign", ext: normalized.ext }),
      });
      const signed = await signRes.json().catch(() => null);
      if (!signRes.ok || !signed?.token) {
        setError("Upload failed — please try again.");
        return;
      }
      const objectKey: string = signed.objectKey;
      const up = await fetch("/api/media-upload", {
        method: "PUT",
        headers: {
          "x-upload-token": signed.token,
          "content-type": normalized.blob.type || "image/jpeg",
        },
        body: normalized.blob,
      });
      if (!up.ok) {
        setError("Upload failed — please try again.");
        return;
      }
      // Server pass: validate it's a real image, bake in EXIF rotation, and
      // return the durable URL + true dimensions.
      const res = await fetch("/api/custom-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectKey }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(
          j.error === "too_large"
            ? "That image is over 25MB — please use a smaller file."
            : j.error === "unreadable_image"
              ? "We couldn't read that image — try a different file."
              : "Upload failed — please try again.",
        );
        return;
      }
      setPreviewLoaded(false);
      setPreviewFailed(false);
      setUploaded({ url: j.url, width: j.width, height: j.height, lowRes: j.lowRes });
    } catch {
      setError("Couldn't reach the server — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) upload(f);
  };

  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
      {/* left — upload / preview. Empty state stretches to the right column's
          height; the uploaded preview sticks while the configurator scrolls. */}
      <div className={uploaded ? "lg:sticky lg:top-28 lg:self-start" : ""}>
        {!uploaded ? (
          <div className="flex flex-col gap-4 lg:h-full">
            <button
              type="button"
              onClick={() => gate("upload your own design to print", () => inputRef.current?.click())}
              disabled={busy}
              className="group grid min-h-[340px] w-full place-items-center rounded-[22px] border-2 border-dashed border-edge bg-wash text-center transition-colors hover:border-charcoal lg:min-h-0 lg:flex-1"
            >
              <div className="px-8">
                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-surface text-charcoal shadow-sm">
                  <UploadIcon />
                </div>
                <p className="font-display text-xl font-bold">
                  {busy ? "Uploading…" : "Upload your design"}
                </p>
                <p className="mt-2 text-sm text-slate">
                  JPG, PNG or WEBP · up to 25MB. The higher the resolution, the crisper the print.
                </p>
              </div>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,.heic,.heif"
              className="hidden"
              onChange={onPick}
            />
            {error && (
              <p className="rounded-[12px] bg-blush/60 px-4 py-3 text-sm text-charcoal">{error}</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[22px] bg-wash">
              {/* Display copy only — a resized render of the upload, so the
                  preview appears in a moment instead of pulling the whole
                  multi-megabyte original back down. The full-resolution file is
                  what actually goes to print. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc(uploaded.url)}
                alt="Your uploaded design"
                className={`h-full w-full object-cover transition-opacity duration-300 ${previewLoaded ? "opacity-100" : "opacity-0"}`}
                onLoad={() => setPreviewLoaded(true)}
                onError={() => setPreviewFailed(true)}
              />
              {!previewLoaded && !previewFailed && (
                <div className="absolute inset-0 grid place-items-center">
                  <div className="text-center">
                    <Spinner />
                    <p className="mt-3 text-xs text-slate">Preparing your preview…</p>
                  </div>
                </div>
              )}
              {previewFailed && (
                <div className="absolute inset-0 grid place-items-center p-6 text-center">
                  <div>
                    <p className="text-sm text-charcoal">
                      Your design uploaded, but the preview didn&apos;t load.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewFailed(false);
                        setPreviewLoaded(false);
                      }}
                      className="btn btn-ghost mt-3 h-10 px-4 text-[0.75rem]"
                    >
                      Retry preview
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-slate">
              <span>{uploaded.width} × {uploaded.height}px</span>
              <button
                type="button"
                onClick={() => { setUploaded(null); setError(null); }}
                className="font-semibold underline underline-offset-2 hover:text-charcoal"
              >
                Replace image
              </button>
            </div>
            {uploaded.lowRes && (
              <p className="rounded-[12px] border-2 border-alert/45 bg-peach px-4 py-3.5 text-sm text-charcoal">
                <span className="font-semibold">Heads up:</span>{" "}this image is fairly low resolution, so
                a large wall print may look soft. Enhancement cannot restore missing detail. Use a larger original, reduce the print size, or ask us to review it before ordering.
              </p>
            )}
          </div>
        )}
      </div>

      {/* right — the standard made-to-measure journey, driven by the uploaded design */}
      <div className="max-w-lg">
        <span className="inline-block rounded-full bg-lavender/50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate">
          Print your own
        </span>
        <h1 className="mt-4 text-[clamp(2rem,4vw,2.8rem)] leading-[1.05]">Your design, on your wall.</h1>
        <p className="mt-3 text-slate">
          Upload any artwork or photo you have the rights to, size it to your exact wall, choose a
          finish, and we&apos;ll print it sized to your wall — same quality and journey as our own murals.
        </p>

        {!uploaded ? (
          <div className="mt-8 rounded-[18px] bg-sage/40 p-5 text-sm text-slate">
            <p className="font-semibold text-charcoal">How it works</p>
            <ol className="mt-2 grid gap-1.5 list-decimal pl-4">
              <li>Upload your image.</li>
              <li>Frame it and enter your wall size.</li>
              <li>Pick a finish and see your price.</li>
              <li>Confirm the rights &amp; print consents at checkout, then pay.</li>
            </ol>
          </div>
        ) : (
          <div className="mt-8">
            <ProductConfigurator
              productHandle={productHandle}
              productTitle="Your custom design"
              productId={productId}
              materials={materials}
              image={{ url: uploaded.url, alt: "Your custom design" }}
              printRules={printRules}
              materialLayout="stack"
              uploadedSource
              sampleable={false}
              initialMaterialSlug="smooth-matt"
            />
          </div>
        )}
      </div>
      {authModal}
    </div>
  );
}

function Spinner() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" className="mx-auto animate-spin text-slate" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4m0 0L7 9m5-5 5 5" />
      <path d="M20 16.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.5" />
    </svg>
  );
}
