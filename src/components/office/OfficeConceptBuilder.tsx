"use client";

import Image from "@/components/SiteImage";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/CartProvider";
import { useFreightToPay } from "@/components/FreightBasis";
import {
  billedPriceFor,
  billedSqFt,
  areaSqFt,
  toCm,
  type Unit,
} from "@/lib/pricing";
import { panelArrangementLabel, rollCmFromMm } from "@/lib/visualizer";
import { useMarket } from "@/components/MarketProvider";
import { MarketPricingNote } from "@/components/MarketMoney";
import type { PrintRules } from "@/lib/print-rules";
import {
  MAX_CONCEPT_WALLS,
  validWallSize,
  type ConceptOffer,
  type ConceptWall,
} from "@/lib/office-concept";
import "./office-concept.css";

import {
  EXCLUSIVITY_COPY,
  EXCLUSIVITY_TERMS,
  createLookPath,
} from "@/lib/concept-copy";
import type { ShopConcept } from "@/lib/shop-concepts";
import { configurationTracker } from "@/lib/configuration-tracking";
const UNIT_LABELS: Record<Unit, string> = {
  ft: "Feet",
  cm: "Centimetres",
  in: "Inches",
};
const STEPS = ["Choose your spaces", "Size your walls", "Review your concept"];
const GOLF_DIRECTIONS = [
  "Contours of the Course",
  "The Art of the Swing",
  "Beyond the Fairway",
];
const initialWall = (offer: ConceptOffer): ConceptWall => ({
  id: crypto.randomUUID(),
  handle: offer.handle,
  roomLabel: offer.space,
  widthCm: 0,
  heightCm: 0,
  offsetX: 0.5,
  offsetY: 0.5,
});
const displaySize = (cm: number, unit: Unit) =>
  Number((cm / toCm(1, unit)).toFixed(3));

export function OfficeConceptBuilder({
  offers,
  materialName,
  rollWidthMm,
  rules,
  concept,
  exploreHref,
}: {
  offers: ConceptOffer[];
  materialName: string;
  rollWidthMm: number;
  rules: PrintRules;
  concept: ShopConcept;
  exploreHref?: string;
}) {
  // A commercial quote is priced in the buyer's currency — the same market the
  // rest of the site uses, so a concept saved here matches the cart it becomes.
  const { money } = useMarket();
  const isLivesWithin = concept.slug === "the-lives-within";
  const steps = isLivesWithin ? ["Choose your spaces", "Size your walls", "Review your walls"] : STEPS;
  const DRAFT_KEY = `zyv:${concept.slug}:v1`;
  const [exclusive, setExclusive] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [historyAccepted, setHistoryAccepted] = useState(false);
  const [walls, setWalls] = useState<ConceptWall[]>([]);
  const [unit, setUnit] = useState<Unit>("ft");
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const [approved, setApproved] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [requestId, setRequestId] = useState("");
  const submitLock = useRef(false);
  // The first wall a shopper picks is where a study reader becomes a buyer.
  // Logged under the CONCEPT slug — the same handle case_study_download and the
  // concept cart_add carry — so "downloaded the study → started configuring it
  // → added it" can be read for one study.
  const startConfiguration = useRef(
    configurationTracker(concept.slug, undefined, { concept: true }),
  ).current;
  const heading = useRef<HTMLHeadingElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const { addConcept } = useCart();
  const freightToPay = useFreightToPay();

  /* eslint-disable react-hooks/set-state-in-effect -- Hydrate the saved external browser draft only after SSR; never read localStorage during server render. */
  useEffect(() => {
    // Restore only this public shopping draft. Never restore an approval or silently submit it.
    let recoveredDraft = false;
    const requested = new URLSearchParams(window.location.search).get("design");
    const requestedValue = requested
      ?.replace(/, every floor$/i, "")
      .toLowerCase()
      .replace(/primary (bedroom|suite|room)/g, "master $1");
    const requestedSpace = requestedValue?.split(" · ")[0];
    const wholeLook = concept.slug === "tidal-silence" && requestedSpace === "the dining room";
    try {
      const saved = requested
        ? null
        : JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (saved && Array.isArray(saved.walls)) {
        const recovered: ConceptWall[] = saved.walls
          .slice(0, MAX_CONCEPT_WALLS)
          .filter(
            (w: ConceptWall) =>
              typeof w.id === "string" &&
              /^[0-9a-f-]{36}$/i.test(w.id) &&
              offers.some((o) => o.handle === w.handle) &&
              typeof w.roomLabel === "string" &&
              w.roomLabel.length <= 60 &&
              [w.widthCm, w.heightCm, w.offsetX, w.offsetY].every(
                Number.isFinite,
              ) &&
              w.widthCm >= 0 &&
              w.heightCm >= 0 &&
              w.offsetX >= 0 &&
              w.offsetX <= 1 &&
              w.offsetY >= 0 &&
              w.offsetY <= 1,
          );
        if (
          recovered.length &&
          new Set(recovered.map((w) => w.id)).size === recovered.length
        ) {
          setWalls(recovered);
          setRestored(true);
          recoveredDraft = true;
          if (["ft", "cm", "in"].includes(saved.unit)) setUnit(saved.unit);
          if (
            typeof saved.requestId === "string" &&
            /^[0-9a-f-]{36}$/i.test(saved.requestId)
          )
            setRequestId(saved.requestId);
        }
      }
    } catch {
      /* A browser without local storage can still order. */
    }
    if (!recoveredDraft) {
      setWalls(
        offers
          .filter(
            (o) =>
              !requested ||
              wholeLook ||
              (concept.slug === "chengdu-after-dark" && requestedSpace === "the artwork" && o === offers[0]) ||
              o.handle === requested ||
              o.number === requested ||
              o.space.toLowerCase() === requestedValue ||
              o.space.toLowerCase() === requestedSpace,
          )
          .map(initialWall),
      );
    }
    setReady(true);
  }, [offers, DRAFT_KEY, concept.slug]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!ready || success) return;
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ walls, unit, requestId }),
      );
    } catch {
      /* Storage is optional. */
    }
  }, [walls, unit, requestId, ready, success, DRAFT_KEY]);

  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const measure = () =>
      document.documentElement.style.setProperty(
        "--sticky-cta-h",
        `${el.getBoundingClientRect().height}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--sticky-cta-h");
    };
  }, [success]);

  const offerFor = (wall: ConceptWall) =>
    offers.find((o) => o.handle === wall.handle)!;
  const complete = (wall: ConceptWall) =>
    validWallSize(wall) && wall.roomLabel.trim().length > 0;
  const validWalls = walls.filter(complete);
  const wallpaperTotal = validWalls.reduce(
    (sum, wall) =>
      sum + billedPriceFor(wall.widthCm, wall.heightCm, offerFor(wall).rate),
    0,
  );
  const exclusiveFee = exclusive
    ? validWalls.reduce(
        (sum, w) =>
          sum +
          Math.round(
            (billedPriceFor(w.widthCm, w.heightCm, offerFor(w).rate) *
              (offerFor(w).commerce?.premiumPercent || 0)) /
              100,
          ),
        0,
      )
    : 0;
  const total = wallpaperTotal + exclusiveFee;
  const selectedOffers = offers.filter((o) =>
    walls.some((w) => w.handle === o.handle),
  );
  const exclusiveAvailable =
    selectedOffers.length > 0 &&
    selectedOffers.every((o) => o.commerce?.exclusiveAvailable);
  const area = validWalls.reduce(
    (sum, wall) => sum + billedSqFt(wall.widthCm, wall.heightCm),
    0,
  );
  const rates = offers.map((o) => o.rate);
  const offerGroups =
    concept.slug === "the-golf-club-three-ways"
      ? GOLF_DIRECTIONS.map((label) => ({
          label,
          offers: offers.filter((offer) =>
            offer.space.startsWith(`${label} · `),
          ),
        }))
      : [{ label: "", offers }];
  const rateLabel =
    rates.length && Math.min(...rates) === Math.max(...rates)
      ? `${money(rates[0])}/sq ft`
      : "Priced per wall";

  // The first wall a shopper picks is where a study reader becomes a buyer.
  // Logged under the CONCEPT slug — the same handle case_study_download and the
  // concept cart_add carry — so "downloaded the study → started configuring it
  // → added it" can be read for one study. Before this, nothing between the
  // download and the cart was recorded at all.
  function change(next: ConceptWall[]) {
    if (busy) return;
    if (next.length) void startConfiguration();
    setWalls(next);
    setApproved(false);
    setHistoryAccepted(false);
    setExclusive(false);
    setRequestId(crypto.randomUUID());
    setError("");
    setSuccess(false);
  }
  function patch(id: string, update: Partial<ConceptWall>) {
    change(walls.map((w) => (w.id === id ? { ...w, ...update } : w)));
  }
  function select(offer: ConceptOffer) {
    const exists = walls.some((w) => w.handle === offer.handle);
    if (exists) change(walls.filter((w) => w.handle !== offer.handle));
    else if (walls.length < MAX_CONCEPT_WALLS)
      change([...walls, initialWall(offer)]);
  }
  function preset(numbers: string[]) {
    const next = [...walls];
    for (const offer of offers.filter((o) => numbers.includes(o.number))) {
      if (
        !next.some((w) => w.handle === offer.handle) &&
        next.length < MAX_CONCEPT_WALLS
      )
        next.push(initialWall(offer));
    }
    change(next);
  }
  function go(next: number) {
    if (busy) return;
    if (next > 0 && walls.length === 0) {
      setError("Choose at least one space to get started.");
      return;
    }
    if (next === 2 && validWalls.length !== walls.length) {
      setTried(true);
      setError(
        "Add a name and valid measurements for every wall before reviewing.",
      );
      return;
    }
    setStep(next);
    setTried(false);
    setError("");
    requestAnimationFrame(() => {
      heading.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      heading.current?.focus({ preventScroll: true });
    });
  }
  async function addOffice() {
    if (submitLock.current) return;
    if (
      exclusive &&
      (!exclusiveAvailable || projectName.trim().length < 2 || !historyAccepted)
    ) {
      setError(
        "Name your project and acknowledge the sales history and exclusivity terms.",
      );
      return;
    }
    if (!approved) {
      setError(isLivesWithin
        ? "Confirm the wall names and measurements before adding your walls."
        : "Confirm the measurements and artwork previews before adding your concept.");
      return;
    }
    if (!walls.length || validWalls.length !== walls.length) return;
    submitLock.current = true;
    setBusy(true);
    setError("");
    const id = requestId || crypto.randomUUID();
    setRequestId(id);
    // Persist the ID before the request: a lost response/reload must reuse it.
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ walls, unit, requestId: id }),
      );
    } catch {}
    try {
      // addConcept POSTs the route AND reports the add to GA4 + Meta. Going
      // straight to fetch() here is what made every office-concept add
      // invisible to both.
      const result = await addConcept({
          conceptSlug: concept.slug,
          requestId: id,
          approved: true,
          ...(exclusive
            ? {
                exclusivity: {
                  requested: true,
                  projectName: projectName.trim(),
                  termsVersion: EXCLUSIVITY_TERMS,
                  historyAccepted: true,
                },
              }
            : {}),
          walls: walls.map((w) => ({
            ...w,
            quotedRate: offerFor(w).rate,
            ...(exclusive
              ? {
                  priorOrders: offerFor(w).commerce!.priorOrders,
                  priorCustomers: offerFor(w).commerce!.priorCustomers,
                  premiumPercent: offerFor(w).commerce!.premiumPercent,
                }
              : {}),
          })),
      });
      if (!result.ok) throw new Error(result.error);
      setSuccess(true);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Connection interrupted. Your selection is saved; please try again.",
      );
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }

  if (success)
    return (
      <div className="office-concept oc-success">
        <span className="oc-eyebrow">{concept.title}</span>
        <h1>{isLivesWithin ? "Your walls are in your cart." : "Your concept is in your cart."}</h1>
        <p>
          {walls.length} {walls.length === 1 ? "wall" : "walls"}, made to your
          sizes on {materialName}. Your room names and artwork layouts are saved
          with every wall.
        </p>
        <div className="oc-success-total">
          {money(total)} <span><MarketPricingNote india="including GST" international="delivery included" /></span>
        </div>
        <p>Complete your delivery details and payment securely online.</p>
        <div className="oc-actions">
          <Link href="/checkout" className="oc-primary">
            Continue to checkout →
          </Link>
          <Link href="/cart" className="oc-secondary">
            View cart
          </Link>
        </div>
      </div>
    );

  return (
    <div className="office-concept">
      <div className="oc-intro">
        <div>
          <Link href={exploreHref ?? `/projects/${concept.slug}`} className="oc-back">
            ← Explore this space
          </Link>
          <Link href={isLivesWithin ? "/collections/the-lives-within" : "/concepts"} className="oc-back">
            {isLivesWithin ? "Browse the collection →" : "Browse all concepts →"}
          </Link>
          <span className="oc-eyebrow">{isLivesWithin ? "The Lives Within · Signature collection" : "A complete look, already designed"}</span>
          <h1>{concept.title}</h1>
          <p>
            {isLivesWithin ? "Choose one wall or several rooms, then enter your measurements. We prepare the final artwork for each wall and send you a proof before printing. Furniture and styling are not included." : "Buy the complete look or choose individual designs. Enter your wall sizes and make this look work for your space. Wallpaper and murals only; furniture and styling are not included."}
          </p>
          <Link
            href={createLookPath(concept.slug)}
            className="oc-secondary inline-flex mt-4"
          >
            Create a look for your space →
          </Link>
          <div className="oc-facts">
            <span>{offers.length} coordinated designs</span>
            <span>{materialName} included</span>
            <span>{rateLabel} · <MarketPricingNote india="incl. GST" international="delivery included" /></span>
          </div>
        </div>
        <div className="oc-intro-image">
          <Image
            src={concept.cover}
            alt={`${concept.title} — ${isLivesWithin ? "room reference" : "concept interior"}`}
            fill
            sizes="(max-width: 700px) 100vw, 360px"
            className="object-cover object-bottom"
            priority
          />
        </div>
      </div>
      {restored && (
        <div className="oc-restored">
          {isLivesWithin ? "Your saved wall selection is ready to continue." : "Your saved concept selection is ready to continue."}{" "}
          <button
            onClick={() => {
              change([]);
              setRestored(false);
              setStep(0);
            }}
          >
            Start fresh
          </button>
        </div>
      )}
      <nav className="oc-steps" aria-label={isLivesWithin ? "Choose your walls" : "Build your concept"}>
        {steps.map((label, i) => (
          <button
            key={label}
            aria-current={step === i ? "step" : undefined}
            onClick={() => go(i)}
            disabled={busy || !ready}
          >
            <span>{i + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      <div className="oc-section-heading">
        <div>
          <span className="oc-eyebrow">Step {step + 1} of 3</span>
          <h2 ref={heading} tabIndex={-1}>
            {steps[step]}
          </h2>
        </div>
        <span>
          {walls.length} {walls.length === 1 ? "wall" : "walls"} selected
        </span>
      </div>
      {!ready ? (
        <p role="status">Loading your saved selection…</p>
      ) : offers.length === 0 ? (
        <p role="status">
          This collection is temporarily unavailable. Please try again shortly.
        </p>
      ) : (
        <>
          {step === 0 && (
            <>
              <div className="oc-choice-toolbar">
                <p>
                  Explore every area for ideas. Order one wall, combine several areas, or bring the whole space together. Add
                  extra walls in the next step.
                </p>
                <div className="oc-actions">
                  <button
                    className="oc-secondary"
                    onClick={() =>
                      preset(offers.slice(0, 3).map((o) => o.number))
                    }
                  >
                    Start with {Math.min(3, offers.length)} spaces
                  </button>
                  <button
                    className="oc-secondary"
                    onClick={() => preset(offers.map((o) => o.number))}
                  >
                    Select all {offers.length} spaces
                  </button>
                  {walls.length > 0 && (
                    <button
                      className="oc-text-button"
                      onClick={() => change([])}
                    >
                      Clear selection
                    </button>
                  )}
                </div>
              </div>
              <div className="oc-direction-list">
                {offerGroups.map((group) => (
                  <section
                    key={group.label || "all"}
                    className="oc-direction"
                    aria-labelledby={
                      group.label
                        ? `concept-direction-${group.label.replaceAll(" ", "-").toLowerCase()}`
                        : undefined
                    }
                  >
                    {group.label && (
                      <h3
                        id={`concept-direction-${group.label.replaceAll(" ", "-").toLowerCase()}`}
                        className="oc-direction-heading"
                      >
                        {group.label}
                      </h3>
                    )}
                    <div className="oc-grid">
                      {group.offers.map((offer) => {
                        const count = walls.filter(
                          (wall) => wall.handle === offer.handle,
                        ).length;
                        const spaceLabel = offer.space.replace(/^.* · /, "");
                        return (
                          <button
                            key={offer.handle}
                            className={`oc-space ${count ? "is-selected" : ""}`}
                            aria-pressed={count > 0}
                            aria-label={`${count ? "Remove" : "Add"} ${offer.space}`}
                            onClick={() => select(offer)}
                          >
                            <div className="oc-space-image">
                              <Image
                                src={offer.roomUrl}
                                alt={`${offer.title} in the ${offer.space.toLowerCase()}`}
                                fill
                                sizes="(max-width:600px) 50vw, (max-width:1000px) 33vw, 25vw"
                                className="object-cover object-bottom"
                              />
                              <span className="oc-check" aria-hidden="true">
                                {count ? "✓" : "+"}
                              </span>
                            </div>
                            <div className="oc-space-copy">
                              <strong>{spaceLabel}</strong>
                              <span>{offer.title}</span>
                              {offer.finishNote && <small>{offer.finishNote}</small>}
                              <small>
                                {count
                                  ? `${count} selected · click to remove`
                                  : "Add this space"}
                              </small>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <div className="oc-choice-toolbar">
                <p>
                  Measure the full width and height of each wall. For artwork
                  previews, move the crop to keep the details you love in view.
                  {walls.some((w) => offerFor(w).requiresPreparation) ? (isLivesWithin ? "Room photos are references; the print artwork is prepared for your measurements after ordering." : "Room references show the concept; their print artwork is prepared after ordering.") : null}{" "}
                  <a href="/how-to-measure" target="_blank" rel="noreferrer">
                    Measuring guide ↗
                  </a>
                </p>
                <label className="oc-unit">
                  Measurements in{" "}
                  <select
                    value={unit}
                    onChange={(e) => {
                      setUnit(e.target.value as Unit);
                      setApproved(false);
                    }}
                  >
                    {Object.entries(UNIT_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="oc-wall-list">
                {walls.map((wall, index) => {
                  const offer = offerFor(wall);
                  const valid = complete(wall);
                  const aspect = offer.sourceW / offer.sourceH;
                  const wallAspect = validWallSize(wall)
                    ? wall.widthCm / wall.heightCm
                    : aspect;
                  const horizontal = wallAspect < aspect;
                  return (
                    <article className="oc-wall" key={wall.id}>
                      <div className="oc-wall-preview">
                        <WallPreview wall={wall} offer={offer} />
                        <span className="oc-preview-caption">
                          {offer.requiresPreparation
                            ? "Room reference · artwork prepared to your sizes"
                            : validWallSize(wall)
                              ? `${displaySize(wall.widthCm, unit)} × ${displaySize(wall.heightCm, unit)} ${unit} · your print layout`
                              : "Enter your sizes to continue"}
                        </span>
                      </div>
                      <div className="oc-wall-controls">
                        <div className="oc-wall-heading">
                          <span className="oc-eyebrow">Wall {index + 1}</span>
                          <button
                            className="oc-text-button"
                            aria-label={`Remove wall ${index + 1}`}
                            onClick={() =>
                              change(walls.filter((w) => w.id !== wall.id))
                            }
                          >
                            Remove
                          </button>
                        </div>
                        <label>
                          Room / wall name
                          <input
                            aria-label={`Wall ${index + 1} name`}
                            maxLength={60}
                            value={wall.roomLabel}
                            onChange={(e) =>
                              patch(wall.id, { roomLabel: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Artwork
                          <select
                            aria-label={`Wall ${index + 1} artwork`}
                            value={wall.handle}
                            onChange={(e) =>
                              patch(wall.id, {
                                handle: e.target.value,
                                offsetX: 0.5,
                                offsetY: 0.5,
                              })
                            }
                          >
                            {offers.map((o) => (
                              <option key={o.handle} value={o.handle}>
                                {o.title} — {o.space}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="oc-dimensions">
                          <DimensionInput
                            key={`${wall.id}-w-${unit}`}
                            label={`Wall ${index + 1} width`}
                            value={wall.widthCm}
                            unit={unit}
                            onChange={(widthCm) => patch(wall.id, { widthCm })}
                          />
                          <DimensionInput
                            key={`${wall.id}-h-${unit}`}
                            label={`Wall ${index + 1} height`}
                            value={wall.heightCm}
                            unit={unit}
                            onChange={(heightCm) =>
                              patch(wall.id, { heightCm })
                            }
                          />
                        </div>
                        {tried && !valid && (
                          <p className="oc-field-error">
                            Enter a wall name and sizes between 30 cm and 15 m
                            wide / 5 m high.
                          </p>
                        )}
                        {validWallSize(wall) &&
                          !offer.requiresPreparation &&
                          Math.abs(wallAspect - aspect) > 0.01 && (
                            <label className="oc-position">
                              Artwork position ·{" "}
                              {horizontal ? "left / right" : "top / bottom"}
                              <input
                                aria-label={`Wall ${index + 1} artwork position`}
                                type="range"
                                min="0"
                                max="100"
                                value={Math.round(
                                  (horizontal ? wall.offsetX : wall.offsetY) *
                                    100,
                                )}
                                onChange={(e) =>
                                  patch(
                                    wall.id,
                                    horizontal
                                      ? {
                                          offsetX: Number(e.target.value) / 100,
                                        }
                                      : {
                                          offsetY: Number(e.target.value) / 100,
                                        },
                                  )
                                }
                              />
                            </label>
                          )}
                        <div className="oc-wall-price">
                          <strong>
                            {valid
                              ? money(
                                  billedPriceFor(
                                    wall.widthCm,
                                    wall.heightCm,
                                    offer.rate,
                                  ),
                                )
                              : "Enter wall sizes"}
                          </strong>
                          <span>
                            {materialName} · {money(offer.rate)}/sq ft
                            {offer.finishNote && <small className="block">{offer.finishNote}</small>}
                          </span>
                        </div>
                        {valid &&
                          billedSqFt(wall.widthCm, wall.heightCm) >
                            areaSqFt(wall.widthCm, wall.heightCm) + 0.005 && (
                            <small className="oc-minimum">
                              Billed as{" "}
                              {billedSqFt(wall.widthCm, wall.heightCm)} sq ft:
                              minimum 4 ft print width and 20 sq ft per wall.
                              Sized to your wall.
                            </small>
                          )}
                        <div className="oc-actions">
                          <button
                            className="oc-text-button"
                            disabled={walls.length >= MAX_CONCEPT_WALLS}
                            onClick={() =>
                              change([
                                ...walls,
                                {
                                  ...initialWall(offer),
                                  roomLabel: `${wall.roomLabel.slice(0, 48)} — extra wall`,
                                },
                              ])
                            }
                          >
                            + Add another wall like this
                          </button>
                          <details>
                            <summary>
                              {offer.requiresPreparation
                                ? "See room reference"
                                : "See full artwork"}
                            </summary>
                            <Image
                              src={offer.imageUrl || offer.roomUrl}
                              alt={`${offer.title} — ${offer.requiresPreparation ? "room reference" : "complete artwork"}`}
                              width={320}
                              height={320}
                              className="oc-original"
                            />
                          </details>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              <button
                className="oc-secondary oc-add-space"
                onClick={() => go(0)}
              >
                + Choose another space
              </button>
            </>
          )}
          {step === 2 && (
            <div className="oc-review">
              <div className="oc-review-walls">
                {walls.map((wall, index) => {
                  const offer = offerFor(wall);
                  return (
                    <article className="oc-review-wall" key={wall.id}>
                      <WallPreview wall={wall} offer={offer} />
                      <div>
                        <span className="oc-eyebrow">
                          Wall {index + 1} · {wall.roomLabel}
                        </span>
                        <h3>{offer.title}</h3>
                        <p>
                          {displaySize(wall.widthCm, unit)} ×{" "}
                          {displaySize(wall.heightCm, unit)} {unit} ·{" "}
                          {materialName}
                        </p>
                        <p>
                          {panelArrangementLabel(
                            wall.widthCm,
                            rollCmFromMm(rollWidthMm, rules.maxPanelCm),
                            rules.overlapCm,
                          )}
                        </p>
                        <strong>
                          {money(
                            billedPriceFor(
                              wall.widthCm,
                              wall.heightCm,
                              offer.rate,
                            ),
                          )}
                        </strong>
                      </div>
                    </article>
                  );
                })}
                <button className="oc-secondary" onClick={() => go(1)}>
                  Edit sizes or artwork
                </button>
              </div>
              <aside className="oc-order-summary">
                <span className="oc-eyebrow">{isLivesWithin ? "Your wall selection" : "Your complete concept"}</span>
                <h3>{concept.title}</h3>
                <dl>
                  <div>
                    <dt>
                      {walls.length} {walls.length === 1 ? "wall" : "walls"} · {area.toFixed(2)} sq ft billed
                    </dt>
                    <dd>{money(wallpaperTotal)}</dd>
                  </div>
                  {exclusive && (
                    <div>
                      <dt>Future-sales exclusivity</dt>
                      <dd>{money(exclusiveFee)}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Material</dt>
                    <dd>{materialName}</dd>
                  </div>
                  {/* GST is an India line. Abroad the same total carries
                      international delivery instead, and duties are the
                      buyer's — stating both keeps the summary honest either
                      way. */}
                  <div>
                    <dt><MarketPricingNote india="GST" international="Duties & local taxes" /></dt>
                    <dd><MarketPricingNote india="Included" international="Excluded — payable on arrival" /></dd>
                  </div>
                  <div>
                    <dt>Standard shipping</dt>
                    <dd>
                      {freightToPay ? (
                        "To-pay on your account"
                      ) : (
                        <MarketPricingNote india="Free across India" international="Included in the price" />
                      )}
                    </dd>
                  </div>
                  <div className="oc-total">
                    <dt>Total</dt>
                    <dd>{money(total)}</dd>
                  </div>
                </dl>
                <p>
                  Sized to your wall. Supplied as labelled panels with a fitting
                  guide. Adhesive and installation are separate.
                </p>
                {walls.some((w) => offerFor(w).requiresPreparation) && (
                  <p>
                    <strong>Artwork preparation included.</strong>{" "}
                    Reference-only designs are prepared to your sizes. You
                    approve the final artwork proof before printing; room photos
                    are excluded.
                  </p>
                )}
                <p>
                  {walls.some((w) => offerFor(w).requiresPreparation) ? "Dispatched in 7–10 working days after artwork approval." : "Dispatched in 7–10 working days."}
                  Delivery details and any available add-ons are shown at
                  checkout.
                </p>
                <div className="my-5 rounded-xl border p-4">
                  <label className="flex gap-3 font-semibold">
                    <input
                      type="checkbox"
                      checked={exclusive}
                      disabled={!exclusiveAvailable}
                      onChange={(e) => {
                        setExclusive(e.target.checked);
                        setApproved(false);
                        setHistoryAccepted(false);
                        setRequestId(crypto.randomUUID());
                      }}
                    />
                    Make these designs exclusive to your project
                  </label>
                  <p className="mt-2 text-sm">
                    {exclusiveAvailable
                      ? `Add ${[...new Set(selectedOffers.map((o) => o.commerce!.premiumPercent))].join("–")}% to the selected wallpaper price. The total updates above.`
                      : "Exclusivity for this selection needs a rights or availability check. Mention it in your request to create a look."}
                  </p>
                  {exclusive && (
                    <>
                      <p className="my-3 text-sm">{EXCLUSIVITY_COPY}</p>
                      <label className="block text-sm">
                        Project / property name
                        <input
                          maxLength={120}
                          value={projectName}
                          onChange={(e) => {
                            setProjectName(e.target.value);
                            setApproved(false);
                            setRequestId(crypto.randomUUID());
                          }}
                        />
                      </label>
                      <p className="mt-4 font-semibold text-sm">
                        Previous sales, before your purchase
                      </p>
                      <ul className="my-2 space-y-2 text-xs">
                        {selectedOffers.map((o) => (
                          <li key={o.handle}>
                            <strong>{o.title}</strong>:{" "}
                            {o.commerce!.priorOrders} recorded orders ·{" "}
                            {o.commerce!.priorCustomers} recorded customers.{" "}
                            {!o.commerce!.historyVerified && (
                              <strong>
                                Historical sales not fully verified; these are
                                known records, not a guarantee of no earlier
                                sales.
                              </strong>
                            )}
                          </li>
                        ))}
                      </ul>
                      <label className="flex gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={historyAccepted}
                          onChange={(e) => setHistoryAccepted(e.target.checked)}
                        />
                        I have reviewed the previous-sales information and
                        accept exclusivity for future sales only, for the named
                        project.
                      </label>
                      <p className="mt-2 text-xs">
                        Exclusivity is reserved when your order is placed and
                        confirmed after payment. We will confirm any additional
                        use or reorders against this project.
                      </p>
                    </>
                  )}
                </div>
                <label className="oc-approval">
                  <input
                    type="checkbox"
                    checked={approved}
                    onChange={(e) => {
                      setApproved(e.target.checked);
                      setError("");
                    }}
                  />
                  <span>
                    {walls.some((w) => offerFor(w).requiresPreparation) ? (isLivesWithin ? "I have checked every wall name and measurement. I understand that I will review the final artwork proof before printing." : "I have checked every wall name and measurement. I approve the fitted artwork shown; reference-only designs need a final artwork proof before printing.") : "I have checked the measurements and artwork layout for each wall."}
                  </span>
                </label>
              </aside>
            </div>
          )}
        </>
      )}
      <div ref={bar} className="oc-bottom-bar">
        <div>
          <strong>
            {step === 0
              ? `${walls.length} ${walls.length === 1 ? "wall" : "walls"} selected`
              : money(total)}
          </strong>
          <span>
            {step === 0
              ? `${materialName} included · ${rateLabel}`
              : `${validWalls.length} of ${walls.length} walls sized`}
          </span>
        </div>
        <div className="oc-bottom-action">
          {error && <p role="alert">{error}</p>}
          <button
            className="oc-primary"
            disabled={busy || !ready || !offers.length}
            onClick={() => (step < 2 ? go(step + 1) : void addOffice())}
          >
            {busy
              ? (isLivesWithin ? "Adding your walls…" : "Adding your concept…")
              : step === 0
                ? "Continue to sizes →"
                : step === 1
                  ? "Review your look →"
                  : "Add your look to cart →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DimensionInput({
  label,
  value,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  unit: Unit;
  onChange: (cm: number) => void;
}) {
  const [text, setText] = useState(
    value > 0 ? String(displaySize(value, unit)) : "",
  );
  return (
    <label>
      {label.endsWith("width") ? "Width" : "Height"} ({unit})
      <input
        aria-label={`${label} (${unit})`}
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        placeholder={label.endsWith("width") ? "e.g. 12" : "e.g. 8"}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          onChange(
            Number.isFinite(v) ? Math.round(toCm(v, unit) * 100) / 100 : 0,
          );
        }}
      />
    </label>
  );
}

function WallPreview({
  wall,
  offer,
}: {
  wall: ConceptWall;
  offer: ConceptOffer;
}) {
  if (offer.requiresPreparation)
    return (
      <div
        className="oc-preview-well"
        style={{ flexDirection: "column", gap: 8 }}
      >
        <Image
          src={offer.roomUrl}
          alt={`${wall.roomLabel}: room reference, artwork preparation included`}
          width={480}
          height={320}
          style={{ width: "100%", height: "auto" }}
        />
        <small>Room reference · final artwork proof before printing</small>
      </div>
    );
  const sized = validWallSize(wall);
  const ratio = sized
    ? wall.widthCm / wall.heightCm
    : offer.sourceW / offer.sourceH;
  return (
    <div className="oc-preview-well">
      <div
        className="oc-print-frame"
        style={{ aspectRatio: String(ratio), maxWidth: `${260 * ratio}px` }}
      >
        <Image
          src={offer.imageUrl}
          alt={`${wall.roomLabel}: ${offer.title}${sized ? " — fitted artwork preview" : " — full artwork"}`}
          fill
          sizes="(max-width:700px) 90vw, 480px"
          style={{
            objectFit: "cover",
            objectPosition: `${wall.offsetX * 100}% ${wall.offsetY * 100}%`,
          }}
        />
      </div>
    </div>
  );
}
