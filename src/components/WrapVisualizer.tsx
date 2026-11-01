"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { RoomVisualizer, type Corners } from "@/components/RoomVisualizer";
import { WrapMockup } from "@/components/WrapMockup";
import { useAuthGate } from "@/components/AuthGate";
import type { EdgeMids } from "@/lib/coons";
import type { CropData } from "@/lib/visualizer";
import type { WrapCardData } from "@/lib/wrap-queries";
import { formatFitLabel, formatSizeCm, formatSizeLabel, formatsFor, type WrapFormat } from "@/lib/wraps";
import { mockupFrame } from "@/lib/wrap-mockups";
import { APPLIANCES, wrapDesignPath, type ApplianceKey } from "@/lib/appliances";

// "See it on your <appliance>" — modelled on SeeInMyRoom.tsx (same upload-once /
// try-many-designs shape), but deliberately thinner: no board-saving, no
// side-by-side compare. Those earned their complexity on the wallpaper flow
// through real usage; the wrap flow doesn't have that history yet, and bolting
// them on speculatively would be scope this workstream doesn't own.
//
// One component for all six appliances rather than one per appliance: the only
// things that actually differ are the copy (from APPLIANCES) and the format
// ladder (filtered from wrap_formats), and both arrive as data.

/** Where the preview lands when the appliance's ladder hasn't been seeded yet.
 *
 *  A single fridge door, because that is the only shape in the range we can name
 *  without a row to read — and this is unreachable in practice: an appliance
 *  with no formats has nothing to preview and no landing page worth linking to.
 *  It exists so a missing ladder degrades to a plausible rectangle instead of a
 *  division by zero in RoomVisualizer's aspect maths. */
const FALLBACK_FACE_CM = { widthCm: 65, heightCm: 155 };

/**
 * The face the preview is laid out against before the customer picks a format:
 * the appliance's LARGEST standard format.
 *
 * The largest rather than the first, because this ratio only decides how the
 * design is cropped for the preview, and the biggest face in the ladder is the
 * one most likely to show the whole composition. Picking a format (below)
 * replaces this with that format's own real size.
 */
function defaultFaceCm(standard: WrapFormat[]): { widthCm: number; heightCm: number } {
  let best: { widthCm: number; heightCm: number } | null = null;
  for (const f of standard) {
    const s = formatSizeCm(f);
    if (!(s.widthCm > 0) || !(s.heightCm > 0)) continue;
    if (!best || s.widthCm * s.heightCm > best.widthCm * best.heightCm) best = s;
  }
  return best ?? FALLBACK_FACE_CM;
}

/**
 * Persists the customer's uploaded photo + aligned face corners across the whole
 * browsing session, so trying a second or third design never asks them to
 * re-upload or re-align.
 *
 * ONE KEY PER APPLIANCE, not one for the family. This was already deliberately
 * separate from room-session.ts's wall session so that previewing a wallpaper
 * and a wrap couldn't overwrite each other; the same reasoning applies inside
 * the range now that there are six appliances. A customer who lines up their
 * fridge door and then goes to look at dishwasher designs must not come back to
 * find their fridge photo replaced by a photo of a dishwasher — the corners are
 * aligned to one specific face and are meaningless on any other.
 */
function sessionKey(appliance: ApplianceKey): string {
  return `zyvorah:wrap-session:${appliance}`;
}

/** The single pre-multi-appliance key, read once so an in-flight fridge session
 *  survives the rename. Never written to again. */
const LEGACY_FRIDGE_KEY = "zyvorah:fridge-session";

type WrapSession = {
  photo: string;
  corners: Corners;
  mids?: EdgeMids;
};

function parseSession(raw: string | null): WrapSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as WrapSession;
    if (!parsed?.photo || !Array.isArray(parsed.corners)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function loadSession(appliance: ApplianceKey): WrapSession | null {
  if (typeof window === "undefined") return null;
  try {
    return (
      parseSession(localStorage.getItem(sessionKey(appliance))) ??
      (appliance === "fridge" ? parseSession(localStorage.getItem(LEGACY_FRIDGE_KEY)) : null)
    );
  } catch {
    return null;
  }
}

function saveSession(appliance: ApplianceKey, next: WrapSession): void {
  try {
    localStorage.setItem(sessionKey(appliance), JSON.stringify(next));
  } catch {
    /* storage full/unavailable — the session just won't persist across reloads */
  }
}

function clearSession(appliance: ApplianceKey): void {
  try {
    localStorage.removeItem(sessionKey(appliance));
    if (appliance === "fridge") localStorage.removeItem(LEGACY_FRIDGE_KEY);
  } catch {
    /* ignore */
  }
}

type TriedLook = { handle: string; title: string; composite: string };

async function fileToDataUri(file: File, maxEdge = 1800): Promise<string> {
  const raw = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new window.Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("decode"));
      i.src = raw;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    if (scale >= 1) return raw;
    const cv = document.createElement("canvas");
    cv.width = Math.round(img.width * scale);
    cv.height = Math.round(img.height * scale);
    cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/jpeg", 0.85);
  } catch {
    return raw;
  }
}

export function WrapVisualizer({
  initialDesigns,
  formats,
  appliance,
}: {
  initialDesigns: WrapCardData[];
  /** Every appliance's formats is fine — this scopes them itself. */
  formats: WrapFormat[];
  appliance: ApplianceKey;
}) {
  const cfg = APPLIANCES[appliance];
  const [session, setSession] = useState<WrapSession | null>(null);
  // Made-to-measure has no fixed size to warp against — only offer formats that
  // actually have a cut list here. It's context for the preview's aspect ratio,
  // not an order; the customer still picks the real format (or measures) on the
  // product page.
  const applianceFormats = formatsFor(formats, appliance);
  const standardFormats = applianceFormats.filter((f) => !f.isMadeToMeasure);
  // One canvas for this appliance's whole ladder, so the mockups below don't
  // resize each other as the format changes — see mockupFrame().
  const frame = mockupFrame(applianceFormats);
  const [formatCode, setFormatCode] = useState<string>("");
  const selectedFormat = standardFormats.find((f) => f.code === formatCode) ?? null;
  const { widthCm, heightCm } = selectedFormat
    ? formatSizeCm(selectedFormat)
    : defaultFaceCm(standardFormats);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState<WrapCardData | null>(null);
  const [tried, setTried] = useState<TriedLook[]>([]);
  const { gate, authModal } = useAuthGate();
  const fileRef = useRef<HTMLInputElement | null>(null);

  // localStorage is read after mount, not during render: the saved photo only
  // exists in the browser, and reading it while rendering would make the server
  // and client disagree about what this page contains.
  useEffect(() => {
    const saved = loadSession(appliance);
    if (saved) setSession(saved);
  }, [appliance]);

  const onUploadPhoto = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const uri = await fileToDataUri(file);
    // Corners get set for real once the customer aligns them in the
    // visualiser — start with a full-frame placeholder so it opens straight
    // into corner-dragging instead of its own upload step.
    const placeholder: Corners = [{ x: 0.2, y: 0.1 }, { x: 0.8, y: 0.1 }, { x: 0.8, y: 0.85 }, { x: 0.2, y: 0.85 }];
    const next: WrapSession = { photo: uri, corners: placeholder };
    setSession(next);
    saveSession(appliance, next);
  };

  const shown = query.trim()
    ? initialDesigns.filter((d) => d.title.toLowerCase().includes(query.trim().toLowerCase()))
    : initialDesigns;

  return (
    <div className="container-x py-12">
      {!session ? (
        <div className="mx-auto max-w-2xl text-center">
          <span className="caps text-slate">{cfg.visualizerLabel}</span>
          <h1 className="mt-3 text-[clamp(2rem,4vw,2.8rem)] leading-tight">
            See a wrap on {cfg.possessiveNoun} before you decide.
          </h1>
          <p className="mt-4 text-slate">
            Upload a photo of {cfg.possessiveNoun} once — we&rsquo;ll keep it and the {cfg.surfaceNoun} corners you
            mark, so you can try as many designs against it as you like without starting over.
          </p>
          <div
            onClick={() => gate(`see this on ${cfg.possessiveNoun}`, () => fileRef.current?.click())}
            className="mt-8 grid cursor-pointer place-items-center rounded-[20px] border-2 border-dashed border-edge px-6 py-16 text-center transition-colors hover:bg-wash/60"
          >
            <p className="text-sm font-medium text-charcoal">Click to upload a photo of {cfg.possessiveNoun}</p>
            <p className="mt-1 text-xs text-mist">JPG, PNG or WEBP · stand back so the whole {cfg.surfaceNoun} is in frame</p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUploadPhoto(f); e.target.value = ""; }} />
          </div>
          <div className="mt-6 text-left">
            <label className="mb-1 block text-xs font-medium text-mist">
              Which format matches {cfg.possessiveNoun}? (optional — sizes the preview correctly)
            </label>
            <select
              value={formatCode}
              onChange={(e) => setFormatCode(e.target.value)}
              className="h-11 w-full rounded-[12px] border border-edge bg-surface px-4 text-sm outline-none focus:border-charcoal"
            >
              <option value="">Not sure yet — use a standard {cfg.surfaceNoun}</option>
              {standardFormats.map((f) => (
                <option key={f.code} value={f.code}>
                  {formatFitLabel(f)} · {formatSizeLabel(f)}
                </option>
              ))}
            </select>
          </div>

          {/* No photograph needed to answer the first question. The upload
              above is for "will this suit MY kitchen"; this is for "what does
              this design even look like on one of these", and making that wait
              on a photo is why people leave. */}
          {initialDesigns.length > 0 && (
            <div className="mt-12 text-left">
              <p className="caps text-slate">No photo handy?</p>
              <h2 className="mt-2 text-xl font-semibold">
                {/* The full stored label, not the picker's shortened one: this
                    is a running sentence, and "every design on a 1.5 ton"
                    needs the appliance the pickers get from their heading. */}
                Here is every design on a{" "}
                {(selectedFormat ? selectedFormat.label : `standard ${cfg.surfaceNoun}`).toLowerCase()}.
              </h2>
              <p className="mt-1 text-sm text-slate">
                Drawn to the format&rsquo;s real proportions. Change the format above and these redraw.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
                {initialDesigns.slice(0, 12).map((d) =>
                  d.image ? (
                    <Link key={d.handle} href={wrapDesignPath(d.handle)} className="group block text-center">
                      <WrapMockup
                        designUrl={d.image}
                        designAlt={d.title}
                        formats={applianceFormats}
                        formatCode={selectedFormat?.code ?? null}
                        frame={frame}
                        className="mx-auto h-[210px] w-auto transition-transform group-hover:-translate-y-1"
                      />
                      <p className="mt-2 text-sm font-medium text-charcoal">{d.title}</p>
                    </Link>
                  ) : null,
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="caps text-slate">{cfg.visualizerLabel}</span>
              <h1 className="mt-2 text-2xl font-semibold">
                We&rsquo;ve saved {cfg.possessiveNoun} — try any design against it.
              </h1>
              <p className="mt-1 text-sm text-slate">
                {selectedFormat
                  ? `${formatFitLabel(selectedFormat)} · ${formatSizeLabel(selectedFormat)}`
                  : `Using a standard ${cfg.surfaceNoun} size — pick your format below to size it exactly`}
              </p>
            </div>
            <div className="flex gap-2">
              <div className="relative h-16 w-16 overflow-hidden rounded-[12px] border border-edge">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={session.photo} alt={cfg.possessiveNoun} className="h-full w-full object-cover" />
              </div>
              <button
                onClick={() => { clearSession(appliance); setSession(null); setTried([]); }}
                className="btn btn-ghost text-xs"
              >
                Change photo
              </button>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search designs to try…"
              className="h-11 w-64 max-w-full rounded-[12px] border border-edge bg-surface px-4 text-sm outline-none focus:border-charcoal"
            />
            <select
              value={formatCode}
              onChange={(e) => setFormatCode(e.target.value)}
              className="h-11 rounded-[12px] border border-edge bg-surface px-4 text-sm outline-none focus:border-charcoal"
            >
              <option value="">Not sure yet — use a standard {cfg.surfaceNoun}</option>
              {standardFormats.map((f) => (
                <option key={f.code} value={f.code}>
                  {formatFitLabel(f)} · {formatSizeLabel(f)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {shown.map((d) => (
              <button
                key={d.handle}
                onClick={() => gate(`see this on ${cfg.possessiveNoun}`, () => setActive(d))}
                className="group relative aspect-square overflow-hidden rounded-[14px] border border-edge"
              >
                {d.image && <Image src={d.image} alt={d.title} fill sizes="150px" className="object-cover transition-transform group-hover:scale-105" />}
                <span className="absolute inset-x-0 bottom-0 truncate bg-charcoal/60 px-2 py-1 text-[0.65rem] font-medium text-surface">{d.title}</span>
              </button>
            ))}
          </div>

          {tried.length > 0 && (
            <div className="mt-12">
              <h2 className="mb-4 text-xl font-semibold">Looks you&rsquo;ve tried</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {tried.map((t) => (
                  <div key={t.handle} className="overflow-hidden rounded-[16px] border border-edge">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.composite} alt={t.title} className="aspect-[4/3] w-full object-cover" />
                    <div className="space-y-1.5 p-3">
                      <p className="text-sm font-semibold">{t.title}</p>
                      <Link href={wrapDesignPath(t.handle)} className="inline-block rounded-full bg-charcoal px-2.5 py-1 text-[0.68rem] font-semibold text-surface">
                        View this design
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {session && active && (
        <RoomVisualizer
          open
          onClose={() => setActive(null)}
          imageUrl={active.image ?? ""}
          imageAlt={active.title}
          productHandle={active.handle}
          surface={appliance}
          wallWidthCm={widthCm}
          wallHeightCm={heightCm}
          wallLabel={selectedFormat ? selectedFormat.label : `${cfg.label} ${cfg.surfaceNoun}`}
          initial={null}
          initialPhoto={session.photo}
          initialCorners={session.corners}
          initialMids={session.mids ?? null}
          onRoomCapture={(photo, corners, mids) => {
            const next: WrapSession = { photo, corners, mids };
            setSession(next);
            saveSession(appliance, next);
          }}
          onApply={(_crop: CropData, composite) => {
            if (composite) {
              const look: TriedLook = { handle: active.handle, title: active.title, composite };
              setTried((prev) => [look, ...prev.filter((t) => t.handle !== active.handle)]);
            }
            setActive(null);
          }}
        />
      )}

      {authModal}
    </div>
  );
}
