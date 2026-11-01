"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  type WrapFormat,
  cmToMm,
  formatForDoor,
  formatSizeLabel,
  isPlausibleDoor,
  DOOR_MIN_CM,
  DOOR_MAX_CM,
  TRIM_ALLOWANCE_MM,
  WRAP_MTM_RATE,
  WRAP_MTM_LEAD_DAYS,
} from "@/lib/wraps";
import { formatINR } from "@/lib/pricing";

type ModelMatch = {
  brand: string;
  modelCode: string;
  formatCode: string;
  capacityL: number | null;
  verified: boolean;
  sourceNote: string | null;
};

/** How the verdict was arrived at. The UI must never render these alike. */
type Verdict =
  | { kind: "verified"; format: WrapFormat; match: ModelMatch }
  | { kind: "class"; format: WrapFormat; match: ModelMatch }
  | { kind: "measured"; format: WrapFormat; widthCm: number; heightCm: number }
  | { kind: "made-to-measure"; widthCm: number; heightCm: number };

const DEBOUNCE_MS = 220;

export function FitFinder({
  formats,
  brands,
  browseHref,
}: {
  /**
   * The FRIDGE ladder only — `getApplianceFormats("fridge")`, never the whole
   * `getWrapFormats()` result. This finder asks "which refrigerator do you
   * have?", so an AC or dishwasher row reaching it would be offered as an
   * answer to a question about a fridge. Format codes are globally unique
   * (0094), so a stray row would not corrupt a lookup — it would just quietly
   * appear in the wrong ladder, which is the harder bug to see.
   */
  formats: WrapFormat[];
  brands: string[];
  /** The family listing, when it has designs in it. Null before launch — an
   *  empty collection page 404s, so the verdict must not offer that door. */
  browseHref: string | null;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ModelMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [measureError, setMeasureError] = useState<string | null>(null);

  const listId = useId();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Every fetch carries a sequence number: a slow response for "LG" must never
  // land on top of a fast one for "LG-B199" and repopulate the stale list.
  const seqRef = useRef(0);

  // Only teardown lives in an effect. The search is driven from the input's own
  // change handler instead — a typed character is an event, not state to
  // synchronise, and routing it through an effect makes every keystroke a
  // cascading render.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  async function runSearch(term: string) {
    const seq = ++seqRef.current;
    try {
      const res = await fetch(`/api/fridge/fit?q=${encodeURIComponent(term)}`);
      const data = (await res.json()) as { matches?: ModelMatch[] };
      if (seq !== seqRef.current) return;
      setMatches(data.matches ?? []);
    } catch {
      if (seq !== seqRef.current) return;
      setMatches([]);
    } finally {
      if (seq === seqRef.current) {
        setSearching(false);
        setSearched(true);
      }
    }
  }

  function onQueryChange(value: string) {
    setQuery(value);
    const term = value.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Invalidate anything in flight: a slow response for "LG" must never land
    // on top of a fast one for "GL-B199" and repopulate the stale list.
    seqRef.current++;
    if (term.length < 2) {
      setMatches([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => void runSearch(term), DEBOUNCE_MS);
  }

  // The verdict container is always in the DOM, so this can run in the same
  // tick as the state change that fills it.
  function revealVerdict() {
    const el = document.getElementById("verdict");
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }

  function choose(match: ModelMatch) {
    const format = formats.find((f) => f.code === match.formatCode);
    if (!format) return;
    setVerdict({ kind: match.verified ? "verified" : "class", format, match });
    // An unverified verdict prints its own "confirm by measuring" link, and the
    // measure form is permanently below — so scrolling the answer into view
    // brings the confirmation with it.
    revealVerdict();
  }

  function resolveMeasured(e: React.FormEvent) {
    e.preventDefault();
    const w = Number(widthCm);
    const h = Number(heightCm);
    if (!Number.isFinite(w) || !Number.isFinite(h) || !isPlausibleDoor(w, h)) {
      // Bounds, and nothing else — the message states exactly what
      // isPlausibleDoor() checks. It used to add "a door is always taller than
      // half its width", which the validator deliberately dropped: a
      // French-door bottom freezer drawer is about 90 x 40 cm, and telling that
      // customer their real measurement is impossible is the one error message
      // that sends a made-to-measure sale away.
      setMeasureError(
        `Both measurements should be between ${DOOR_MIN_CM} and ${DOOR_MAX_CM} cm. Check the numbers — it's the door face, not the whole cabinet.`,
      );
      return;
    }
    setMeasureError(null);
    // "fridge" stated rather than left to the default: the bands overlap across
    // the range, and this call is only ever asking about a refrigerator door.
    const format = formatForDoor(formats, cmToMm(w), cmToMm(h), "fridge");
    // No format fitting is a REAL answer — sized to your wall — not an error
    // state. Formats C and D are class generalisations at launch (0089), so
    // the honest fallback has to be a route, never a shrug.
    setVerdict(format ? { kind: "measured", format, widthCm: w, heightCm: h } : { kind: "made-to-measure", widthCm: w, heightCm: h });
    revealVerdict();
  }

  return (
    <div className="space-y-14">
      {/* ---------- step 1: the model number ---------- */}
      <section>
        <p className="caps text-[#8C6F33]">Step one</p>
        <h2 className="mt-2 text-2xl lg:text-3xl">Type your brand or model number</h2>
        <p className="mt-3 max-w-xl text-sm text-slate">
          It is on a sticker inside the fridge door, or on the energy label. Partial is fine — try
          &ldquo;LG&rdquo;, &ldquo;RT28&rdquo; or &ldquo;GL B199&rdquo;.
        </p>

        <div className="mt-6 max-w-xl">
          <label htmlFor="fridge-model" className="block text-sm font-medium">
            Your refrigerator
          </label>
          <input
            id="fridge-model"
            type="search"
            autoComplete="off"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Brand or model number"
            aria-describedby={`${listId}-status`}
            className="mt-2 h-14 w-full rounded-[14px] border border-edge bg-surface px-4 text-base outline-none focus-visible:border-charcoal focus-visible:ring-2 focus-visible:ring-charcoal/20"
          />

          {brands.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {brands.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => onQueryChange(b)}
                  className="rounded-full border border-edge px-4 py-1.5 text-[0.78rem] font-medium transition-colors hover:border-charcoal hover:bg-charcoal hover:text-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal"
                >
                  {b}
                </button>
              ))}
            </div>
          )}

          <p id={`${listId}-status`} aria-live="polite" className="mt-4 text-sm text-slate">
            {searching
              ? "Searching…"
              : searched && matches.length === 0
                ? "No model matched that. Measure the door instead — it takes a minute, and it is the more reliable answer anyway."
                : matches.length > 0
                  ? `${matches.length} ${matches.length === 1 ? "model" : "models"} matched.`
                  : ""}
          </p>

          {matches.length > 0 && (
            <ul className="mt-3 divide-y divide-edge overflow-hidden rounded-[14px] border border-edge bg-surface">
              {matches.map((m) => (
                <li key={`${m.brand}-${m.modelCode}`}>
                  <button
                    type="button"
                    onClick={() => choose(m)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-wash focus-visible:bg-wash focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-charcoal"
                  >
                    <span>
                      <span className="font-display text-[0.95rem] font-semibold">
                        {m.brand} {m.modelCode}
                      </span>
                      {m.capacityL != null && <span className="ml-2 text-sm text-slate">{m.capacityL} L</span>}
                    </span>
                    {/* The verification state is on the row, before the
                        customer has even chosen — so a class assignment can
                        never arrive looking like a measured fact. */}
                    <span className={`shrink-0 text-[0.7rem] font-semibold uppercase tracking-[0.1em] ${m.verified ? "text-[#1B3A6B]" : "text-mist"}`}>
                      {m.verified ? "Verified" : "By class"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ---------- the verdict ---------- */}
      <div id="verdict" className="scroll-mt-24">
        {verdict && (
          <section aria-live="polite" className="rounded-[28px] bg-[#F6F1E7] p-7 lg:p-10">
            {verdict.kind === "made-to-measure" ? (
              <>
                <p className="caps text-[#8C6F33]">Format Z</p>
                <h2 className="mt-2 text-2xl lg:text-3xl">No standard format covers that door.</h2>
                <p className="mt-3 max-w-xl text-slate">
                  A {verdict.widthCm} × {verdict.heightCm} cm door falls outside all five standard
                  bands. That is a real answer, not a failure: your design is sized to your fridge using your
                  numbers at {formatINR(WRAP_MTM_RATE)} per square foot, dispatched in{" "}
                  {WRAP_MTM_LEAD_DAYS} working days.
                </p>
                <Link
                  href={`/fridge-wraps/made-to-measure?w=${verdict.widthCm}&h=${verdict.heightCm}`}
                  className="btn mt-7"
                >
                  Price my measurements
                </Link>
              </>
            ) : (
              <VerdictCard verdict={verdict} browseHref={browseHref} />
            )}
          </section>
        )}
      </div>

      {/* ---------- the fallback ----------
          Always present, never hidden behind a failed search: an unverified
          match is supposed to land the customer here, and a form you have to
          go looking for is a form nobody confirms with. */}
      <section id="measure" className="scroll-mt-24 border-t border-edge pt-14">
        <p className="caps text-mist">Or measure the door</p>
        <h2 className="mt-2 text-2xl lg:text-3xl">Two numbers place almost any fridge</h2>
        <p className="mt-3 max-w-xl text-sm text-slate">
          Measure the door <strong className="text-charcoal">face</strong> — edge to edge across the
          front, and top to bottom — not the whole cabinet. On a double door, measure the larger
          (fridge) door. Round to the nearest centimetre.
        </p>

        <form onSubmit={resolveMeasured} className="mt-6 max-w-xl" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="door-width" className="block text-sm font-medium">
                Door width (cm)
              </label>
              <input
                id="door-width"
                type="number"
                inputMode="decimal"
                min={DOOR_MIN_CM}
                max={DOOR_MAX_CM}
                step="0.5"
                value={widthCm}
                onChange={(e) => setWidthCm(e.target.value)}
                className="mt-2 h-14 w-full rounded-[14px] border border-edge bg-surface px-4 text-base outline-none focus-visible:border-charcoal focus-visible:ring-2 focus-visible:ring-charcoal/20"
              />
            </div>
            <div>
              <label htmlFor="door-height" className="block text-sm font-medium">
                Door height (cm)
              </label>
              <input
                id="door-height"
                type="number"
                inputMode="decimal"
                min={DOOR_MIN_CM}
                max={DOOR_MAX_CM}
                step="0.5"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="mt-2 h-14 w-full rounded-[14px] border border-edge bg-surface px-4 text-base outline-none focus-visible:border-charcoal focus-visible:ring-2 focus-visible:ring-charcoal/20"
              />
            </div>
          </div>

          {measureError && (
            <p role="alert" className="mt-4 text-sm text-[#9B2C2C]">
              {measureError}
            </p>
          )}

          <button type="submit" className="btn mt-6">
            Find my format
          </button>
        </form>

        <p className="mt-6 max-w-xl text-xs text-mist">
          Panels ship {TRIM_ALLOWANCE_MM} mm oversize on every edge, so a centimetre either way in
          your measurement is absorbed by the trim.
        </p>
      </section>
    </div>
  );
}

function VerdictCard({
  verdict,
  browseHref,
}: {
  verdict: Extract<Verdict, { kind: "verified" | "class" | "measured" }>;
  browseHref: string | null;
}) {
  const f = verdict.format;
  return (
    <>
      <p className="caps text-[#8C6F33]">
        {verdict.kind === "verified" ? "Your format" : verdict.kind === "measured" ? "Your format" : "Most likely"}
      </p>
      <h2 className="mt-2 text-[clamp(1.7rem,3.4vw,2.4rem)] leading-tight">
        Format {f.code} — {f.label}
      </h2>

      {verdict.kind === "verified" && (
        <p className="mt-3 max-w-xl text-slate">
          We have the door dimensions for the {verdict.match.brand} {verdict.match.modelCode} from the
          manufacturer&apos;s own specification sheet, so this is a stated fit rather than an estimate.
          {verdict.match.sourceNote && (
            <span className="block pt-1 text-xs text-mist">Source: {verdict.match.sourceNote}</span>
          )}
        </p>
      )}

      {verdict.kind === "class" && (
        <div className="mt-3 max-w-xl">
          <p className="text-slate">
            The {verdict.match.brand} {verdict.match.modelCode} is placed in this format by its
            capacity and door type
            {verdict.match.capacityL != null ? ` (${verdict.match.capacityL} L)` : ""}.{" "}
            <strong className="text-charcoal">Nobody has measured one.</strong> It is very likely
            right, and we would still rather you confirmed it with two measurements than found out
            after the panels arrived.
          </p>
          <a href="#measure" className="link-underline mt-3 inline-block text-sm font-medium">
            Confirm by measuring the door &rarr;
          </a>
        </div>
      )}

      {verdict.kind === "measured" && (
        <p className="mt-3 max-w-xl text-slate">
          A {verdict.widthCm} × {verdict.heightCm} cm door face sits inside this format&apos;s band —
          {f.doorWidthMinMm != null && f.doorWidthMaxMm != null
            ? ` ${(f.doorWidthMinMm / 10).toFixed(0)}–${(f.doorWidthMaxMm / 10).toFixed(0)} cm wide`
            : ""}
          {f.doorHeightMinMm != null && f.doorHeightMaxMm != null
            ? `, ${(f.doorHeightMinMm / 10).toFixed(0)}–${(f.doorHeightMaxMm / 10).toFixed(0)} cm tall`
            : ""}
          .
        </p>
      )}

      <dl className="mt-7 grid gap-x-8 gap-y-4 border-t border-[#E3D9C6] pt-6 sm:grid-cols-3">
        <div>
          <dt className="caps text-mist">Fits</dt>
          <dd className="mt-1 text-sm">{f.capacityLabel ?? f.doorType}</dd>
        </div>
        <div>
          <dt className="caps text-mist">Panels</dt>
          <dd className="mt-1 text-sm">{formatSizeLabel(f)}</dd>
        </div>
        <div>
          <dt className="caps text-mist">Price</dt>
          <dd className="mt-1 font-display text-lg font-bold">
            {f.priceInr != null ? formatINR(f.priceInr) : "—"}
          </dd>
        </div>
      </dl>

      {f.panels.length > 1 && (
        <ul className="mt-4 text-sm text-slate">
          {f.panels.map((p, i) => (
            <li key={i}>
              {p.label ?? `Panel ${i + 1}`} — {p.widthMm} × {p.heightMm} mm
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        {browseHref ? (
          <Link href={browseHref} className="btn">
            Choose a design
          </Link>
        ) : (
          <Link href="/fridge-wraps/size-guide" className="btn">
            See what Format {f.code} includes
          </Link>
        )}
        <Link href="/contact?about=Appliance%20wraps" className="btn btn-ghost">
          Tell me when it opens
        </Link>
      </div>
    </>
  );
}
