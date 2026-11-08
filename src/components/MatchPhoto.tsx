"use client";

import { useRef, useState } from "react";
import { ProductCard } from "@/components/ProductCard";
import { downscaleForUpload } from "@/lib/upload";
import { useMarket } from "@/components/MarketProvider";
import { useAuthGate } from "@/components/AuthGate";
import type { ProductCardData } from "@/lib/types";

const MAX_BYTES = 8 * 1024 * 1024;

type MatchType = "overall" | "colours" | "pattern" | "subject" | "mood" | "similar" | "coordinate";

const MATCH_TYPES: { value: MatchType; label: string }[] = [
  { value: "overall", label: "Overall look" },
  { value: "colours", label: "Colours" },
  { value: "pattern", label: "Pattern" },
  { value: "subject", label: "Subject" },
  { value: "mood", label: "Mood" },
  { value: "similar", label: "Find something very similar" },
  { value: "coordinate", label: "Find something that coordinates with it" },
];

type Attrs = { subjects: string[]; styles: string[]; colours: string[] } | null;
type Buckets = { closest: ProductCardData[]; sameColours: ProductCardData[]; complements: ProductCardData[] };
type Candidate = { handle: string; tags: string };

// Real style/colour vocabulary in the catalogue — grounds the style-leaning
// refinement chips instead of guessing at tags that may not exist.
const QUIET_TAGS = ["pastel", "neutral"];
const BOLD_TAGS = ["bright"];
const CONTEMPORARY_TAGS = ["geometric", "abstract", "japandi", "casual", "quirky"];
const TRADITIONAL_TAGS = ["vintage", "chinoiserie", "masterpiece"];
const NURSERY_TAGS = ["kids", "nursery", "baby"];
// A wall-sized guide price (~10×8ft, a typical accent wall) so "Under ₹10,000"
// filters against something real rather than an arbitrary per-sqft cutoff.
const GUIDE_AREA_SQFT = 80;

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.5" r="3.4" />
    </svg>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-[0.78rem] font-semibold transition-colors ${
        active ? "border-charcoal bg-charcoal text-surface" : "border-edge text-slate hover:border-charcoal hover:text-charcoal"
      }`}
    >
      {children}
    </button>
  );
}

export function MatchPhoto() {
  const { money } = useMarket();
  const { promptAuth, authModal, signedIn } = useAuthGate();
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [matchType, setMatchType] = useState<MatchType>("overall");
  const [attrs, setAttrs] = useState<Attrs>(null);
  const [buckets, setBuckets] = useState<Buckets | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  // Refinements — all client-side, applied to the already-fetched candidate pool.
  const [excludedColours, setExcludedColours] = useState<Set<string>>(new Set());
  const [quieter, setQuieter] = useState(false);
  const [bolder, setBolder] = useState(false);
  const [lessFloral, setLessFloral] = useState(false);
  const [moreContemporary, setMoreContemporary] = useState(false);
  const [moreIndian, setMoreIndian] = useState(false);
  const [under10k, setUnder10k] = useState(false);
  const [nursery, setNursery] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const captureRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const currentFileRef = useRef<File | null>(null);

  const setPreviewUrl = (url: string | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = url;
    setPreview(url);
  };

  const runSearch = async (file: File, type: MatchType) => {
    setBusy(true);
    setError(null);
    try {
      const upload = await downscaleForUpload(file);
      const body = new FormData();
      body.append("image", upload, "match.jpg");
      body.append("matchType", type);
      const res = await fetch("/api/visual-search", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "too_large" ? "That image is too large — please use one under 8MB." : "Something went wrong finding matches — please try another photo.");
        return;
      }
      setAttrs(data.attrs ?? null);
      setBuckets(data.buckets ?? { closest: [], sameColours: [], complements: [] });
      setCandidates(data.candidates ?? []);
      setExcludedColours(new Set());
      setQuieter(false); setBolder(false); setLessFloral(false);
      setMoreContemporary(false); setMoreIndian(false); setUnder10k(false); setNursery(false);
    } catch {
      setError("Couldn't reach the store just now — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = (file: File) => {
    // Verified email required — this runs Haiku vision on the upload.
    if (!signedIn) {
      promptAuth("match a wallpaper to your photo");
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
    currentFileRef.current = file;
    setPreviewUrl(URL.createObjectURL(file));
    setBuckets(null);
    void runSearch(file, matchType);
  };

  const changeMatchType = (t: MatchType) => {
    setMatchType(t);
    if (currentFileRef.current) void runSearch(currentFileRef.current, t);
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

  const reset = () => {
    setPreviewUrl(null);
    currentFileRef.current = null;
    setBuckets(null);
    setAttrs(null);
    setError(null);
  };

  // Apply refinements to a bucket, filtering against real detected tags.
  const tagsFor = (handle: string) => candidates.find((c) => c.handle === handle)?.tags ?? "";
  const has = (hay: string, terms: string[]) => terms.some((t) => hay.includes(t));
  const refine = (list: ProductCardData[]) =>
    list.filter((p) => {
      const hay = tagsFor(p.handle);
      if (excludedColours.size && has(hay, [...excludedColours])) return false;
      if (quieter && has(hay, BOLD_TAGS)) return false;
      if (bolder && has(hay, QUIET_TAGS)) return false;
      if (lessFloral && has(hay, ["floral", "botanical"])) return false;
      if (moreContemporary && has(hay, TRADITIONAL_TAGS)) return false;
      if (moreIndian && !hay.includes("indian ethnic") && !hay.includes("indian")) return false;
      if (under10k && p.fromPricePerSqft != null && p.fromPricePerSqft * GUIDE_AREA_SQFT >= 10000) return false;
      if (nursery && !has(hay, NURSERY_TAGS)) return false;
      return true;
    });

  const refinementsActive =
    excludedColours.size > 0 || quieter || bolder || lessFloral || moreContemporary || moreIndian || under10k || nursery;

  const closest = buckets ? refine(buckets.closest) : [];
  const sameColours = buckets ? refine(buckets.sameColours) : [];
  const complements = buckets ? refine(buckets.complements) : [];
  const totalShown = closest.length + sameColours.length + complements.length;

  return (
    <div className="container-x py-12">
      <div className="mx-auto max-w-2xl text-center">
        <span className="caps text-slate">Match a Photo</span>
        <h1 className="mt-3 text-[clamp(2rem,4vw,2.8rem)] leading-tight">
          See something you love? Find a wallpaper to match.
        </h1>
        <p className="mt-4 text-slate">
          Photograph a fabric, artwork, rug, curtain, hotel wall, tile or colour combination. Mimi Pip
          will find designs that share its colours, mood, pattern or visual character.
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-2xl">
        {!preview ? (
          <>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`grid cursor-pointer place-items-center rounded-[20px] border-2 border-dashed px-6 py-16 text-center transition-colors ${
                dragOver ? "border-charcoal bg-wash" : "border-edge hover:bg-wash/60"
              }`}
            >
              <CameraIcon />
              <p className="mt-3 text-sm font-medium text-charcoal">Click to upload or drag an image here</p>
              <p className="mt-1 text-xs text-mist">A room photo, a Pinterest save, a fabric swatch — JPG, PNG or WEBP, up to 8MB</p>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
            </div>
            <div className="my-3 flex items-center gap-3">
              <span className="h-px flex-1 bg-edge" />
              <span className="text-xs text-mist">or</span>
              <span className="h-px flex-1 bg-edge" />
            </div>
            <button type="button" onClick={() => captureRef.current?.click()} className="btn btn-ghost w-full justify-center">
              <CameraIcon /> Take a photo
            </button>
            <input ref={captureRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
            {error && <p className="mt-4 rounded-[12px] bg-blush/50 px-4 py-3 text-sm text-charcoal">{error}</p>}
          </>
        ) : (
          <>
            <div className="flex items-center gap-4 rounded-[16px] bg-wash p-4">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[12px] bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Your upload" className="h-full w-full object-cover" />
              </div>
              <div className="flex-1 text-sm text-slate">
                {busy ? "Finding matches…" : error ? "Couldn't search that photo." : `${totalShown} matches found`}
                {attrs && !busy && (
                  <p className="mt-1 text-xs text-mist">
                    We read this as {[...attrs.colours.slice(0, 3)].join(", ") || "an image"}
                    {attrs.subjects.length ? ` · ${attrs.subjects.slice(0, 2).join(", ")}` : ""}
                  </p>
                )}
              </div>
              <button onClick={reset} className="shrink-0 text-xs font-semibold text-slate underline underline-offset-2 hover:text-charcoal">
                Try another
              </button>
            </div>

            <p className="caps mt-6 mb-2 text-slate">What should we match?</p>
            <div className="flex flex-wrap gap-2">
              {MATCH_TYPES.map((m) => (
                <Chip key={m.value} active={matchType === m.value} onClick={() => changeMatchType(m.value)}>
                  {m.label}
                </Chip>
              ))}
            </div>
          </>
        )}
      </div>

      {busy && (
        <div className="mt-10 flex items-center justify-center gap-1.5">
          {[0, 1, 2].map((d) => (
            <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-mist" style={{ animationDelay: `${d * 0.15}s` }} />
          ))}
        </div>
      )}

      {error && preview && !busy && (
        <p className="mx-auto mt-6 max-w-2xl rounded-[12px] bg-blush/50 px-4 py-3 text-center text-sm text-charcoal">{error}</p>
      )}

      {!busy && buckets && (
        <div className="mt-12 space-y-4">
          {/* refinement controls — grounded in real detected colours + catalogue tags */}
          <div className="mx-auto max-w-4xl">
            <p className="caps mb-2 text-slate">Refine</p>
            <div className="flex flex-wrap gap-2">
              {attrs?.colours.map((c) => (
                <Chip
                  key={c}
                  active={!excludedColours.has(c)}
                  onClick={() =>
                    setExcludedColours((prev) => {
                      const n = new Set(prev);
                      if (n.has(c)) n.delete(c); else n.add(c);
                      return n;
                    })
                  }
                >
                  {excludedColours.has(c) ? `Remove ${c} ✓` : c}
                </Chip>
              ))}
              <Chip active={quieter} onClick={() => { setQuieter((v) => !v); setBolder(false); }}>Make it quieter</Chip>
              <Chip active={bolder} onClick={() => { setBolder((v) => !v); setQuieter(false); }}>Make it bolder</Chip>
              <Chip active={lessFloral} onClick={() => setLessFloral((v) => !v)}>Less floral</Chip>
              <Chip active={moreContemporary} onClick={() => setMoreContemporary((v) => !v)}>More contemporary</Chip>
              <Chip active={moreIndian} onClick={() => setMoreIndian((v) => !v)}>More Indian</Chip>
              <Chip active={under10k} onClick={() => setUnder10k((v) => !v)}>
                Under {money(10000)} (≈{GUIDE_AREA_SQFT} sq ft wall)
              </Chip>
              <Chip active={nursery} onClick={() => setNursery((v) => !v)}>Suitable for a nursery</Chip>
            </div>
          </div>

          {[
            { title: "Closest visual matches", items: closest },
            { title: "Same colours, different design", items: sameColours },
            { title: "Complements this look", items: complements },
          ].map((section) =>
            section.items.length ? (
              <section key={section.title} className="mx-auto max-w-6xl">
                <h2 className="mb-4 text-xl font-semibold">{section.title}</h2>
                <div className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">
                  {section.items.map((p) => <ProductCard key={p.handle} product={p} />)}
                </div>
              </section>
            ) : null,
          )}

          {totalShown === 0 && (
            <p className="mx-auto max-w-2xl rounded-[12px] bg-wash px-4 py-6 text-center text-sm text-slate">
              {refinementsActive
                ? "Nothing matches these refinements — try clearing one or two."
                : "No close matches yet — try a clearer photo or a different angle."}
            </p>
          )}
        </div>
      )}
      {authModal}
    </div>
  );
}
