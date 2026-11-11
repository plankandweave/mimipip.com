"use client";

import { draftNumber } from "@/lib/number-draft";
import { TextOverlayEditor, useTextOverlayPreview } from "@/components/TextOverlayEditor";
import { defaultTextOverlay, overlayPlacementError, textOverlaySchema, type TextOverlay } from "@/lib/text-overlay";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type InputHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { useWallBuilderStage } from "@/components/WallBuilderStage";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { imageQuality } from "@/lib/image-quality";
import { areaSqFt, billedSqFt, billedPriceFor, fixedSizePrice, installationTotal, CM_PER_INCH, CM_PER_FOOT, INSTALL_RATE_EX_GST, INSTALL_MIN_SQFT, NAME_FEE, MIN_PRINT_WIDTH_FT, MIN_WALLPAPER_SQFT, INSTALL_RATE_LABEL } from "@/lib/pricing";
import { initialWallFt } from "@/lib/wall-default";
import { resolveInstallEligibility } from "@/lib/install-cities";
import { MarketInvoiceBreakdown } from "@/components/MarketInvoiceBreakdown";
import { useMarket } from "@/components/MarketProvider";
import { formatMarketMoney } from "@/lib/markets";
import { useAuthGate } from "@/components/AuthGate";
import { RoomVisualizer } from "@/components/RoomVisualizer";
import { loadRoomSession, persistablePhoto, saveRoomSession, type RoomSession } from "@/lib/room-session";
import { gaEvent } from "@/lib/ga";
import { configurationTracker } from "@/lib/configuration-tracking";
import { DesignVisualizer } from "@/components/DesignVisualizer";
import { WallScaleVisualizer } from "@/components/WallScaleVisualizer";
import { SaveToBoard } from "@/components/SaveToBoard";
import { SampleOrderModal } from "@/components/SampleOrderModal";
import { WallMeasure } from "@/components/WallMeasure";
import { useCart } from "@/components/CartProvider";
import { usePartner } from "@/components/PartnerProvider";
import { SaveToProject, type WallToSave } from "@/components/SaveToProject";
import { compositionUntouched } from "@/lib/composition-signoff";
import { MAX_PANEL_CM, PANEL_OVERLAP_CM, panelArrangementLabel, pieceCount, rollCmFromMm, type CropData, type SeamlessSpec } from "@/lib/visualizer";
import { planOpenings, placeMarks, newHeadboard, placeHeadboard, isHeadboard, openingsSnapshot, openingsArrangementLabel, OPENING_EXCLUSION_ENABLED, QUALIFY_MIN_WIDTH_CM, QUALIFY_MIN_HEIGHT_FRAC } from "@/lib/openings";

// EQUAL panels at full roll width (capped by the OS max-strip rule) — the
// machine splits the wall evenly, never "full modules + a narrow balance".
function panelWidthSpec(widthCm: number, panelCm: number, overlapCm: number): string {
  const n = pieceCount(widthCm, panelCm, overlapCm);
  const toIn = (cm: number) => Math.round(cm / 2.54);
  if (n < 2) return `${toIn(widthCm)} in`;
  return `~${toIn(widthCm / n)} in each (equal widths)`;
}

// Installation rate/threshold now live in pricing.ts (shared with the
// concierge's add-to-cart) so both surfaces quote identically.
//
// DISPLAYED GST-inclusive here. "₹35/sqft + GST" was the only price on the
// site quoted before tax (30 Sep 2026 walkthrough), beside wallpaper rates
// that all include it. The CHARGE is unchanged: installationTotal() is
// area × ₹35 × (1 + GST) rounded once, which is exactly area × this rate, so
// the per-sq-ft figure and the "+₹X incl. GST" total below always agree.
// Derived from the pricing constants, never typed, so a rate change moves both.

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

// Stacked picker shading — a light wash per row so the options read as
// separate buttons rather than one block. Written out in full so Tailwind
// keeps the classes.
const MATERIAL_TINTS = ["bg-wash", "bg-sage/40", "bg-sky/40", "bg-peach/40"];
/** Above WARN on any side the size tool asks "check this?"; above MAX it won't
 *  add to cart. No home wall is 60 ft — past that it is a typo or a project. */
const WARN_SIDE_FT = 30;
const MAX_SIDE_FT = 60;
const MAX_ORDER_SQFT = 2000;

export function ProductConfigurator(props:Parameters<typeof ConnectedProductConfigurator>[0] | {unavailable:true}){
 if('unavailable' in props)return <section className="mt-6 rounded-2xl bg-wash p-5" aria-label="Configuration"><h2>Configuration</h2><p>Material choices and pricing are not yet confirmed for this design.</p><button className="btn mt-4" disabled>Ordering unavailable</button></section>;
 return <ConnectedProductConfigurator {...props}/>;
}
function ConnectedProductConfigurator({
  productHandle,
  productTitle,
  productId,
  materials,
  image,
  initialWidthFt,
  initialHeightFt,
  autoOpenSample,
  readySizes,
  initialMaterialSlug,
  autoStart = false,
  editItemId,
  initialSizeIn,
  nameAudience = null,
  isFixedSize = false,
  seamless = null,
  printRules = null,
  sampleable = true,
  uploadedSource = false,
  customArtworkId,
  maxQty,
  materialLayout = "wrap",
}: {
  productHandle: string;
  productTitle: string;
  productId: string;
  materials: MaterialOpt[];
  image: { url: string; alt: string } | null;
  /** Pre-fills from a curation pick's stated wall size — still needs approval before Add to Cart. */
  initialWidthFt?: number;
  initialHeightFt?: number;
  /** Opens the sample modal on load — e.g. arriving via a curation pick's "Order a sample" link. */
  autoOpenSample?: boolean;
  /** Fixed [widthIn, heightIn] options — when set, this design is sold at
   *  these exact ready sizes only (no free measurements). */
  readySizes?: [number, number][] | null;
  /** Deep-linked material (?material= from a Shopping ad) — pre-selects it when valid. */
  initialMaterialSlug?: string | null;
  /** `?configure=1` — the one-tap link from a Trending pin: open straight into
   *  the builder (preview up, Measure step on screen, width field ready) rather
   *  than on the gallery. Does NOT count as a configuration start; that is
   *  still the customer's first keystroke, so the metric the pins were chosen
   *  on is not inflated by the pins themselves. */
  autoStart?: boolean;
  /** Cart line being revised; its approved crop is restored before editing. */
  editItemId?: string;
  /** Deep-linked ready size (?size=36x60, already validated against the ladder). */
  initialSizeIn?: [number, number] | null;
  /** Children's-design personalisation: "kids" → offer the child's-name add-on
   *  and pre-tick it; "nursery" → offer it but leave it off; null → don't show. */
  nameAudience?: "kids" | "nursery" | null;
  /** Fixed-size family (category measurement_type = "fixed", e.g. Canvas Wall
   *  Art): the visualiser becomes a true-scale room wall instead of the
   *  made-to-measure crop frame. */
  isFixedSize?: boolean;
  /** Seamless tile: the design repeats at a fixed physical size rather than
   *  one copy being fitted to the wall. Set by the studio, never the customer. */
  seamless?: SeamlessSpec | null;
  /** Live production panel rules (fetched server-side from the MGI OS via
   *  lib/print-rules.ts). Absent → the baked-in fallback mirror of the rules. */
  printRules?: { maxPanelCm: number; overlapCm: number } | null;
  /** Whether a design sample can be ordered for this product (the category
   *  decides — canvas art has no wallpaper sample). Default true. */
  sampleable?: boolean;
  uploadedSource?: boolean;
  customArtworkId?: string;
  /** Limited edition: how many pieces of the edition are still available.
   *  Caps the quantity; 0 = sold out (Add to Cart disabled). Undefined = no cap. */
  maxQty?: number;
  /** How the material picker is laid out. "wrap" (default) flows the options
   *  across the row; "stack" gives each its own full-width row, lightly tinted
   *  so a longer finish list reads as four distinct buttons (print-your-own). */
  materialLayout?: "wrap" | "stack";
}) {
  // The wall builder runs ON the page, never in a window over it (Roheena,
  // 26 Sep 2026). Its steps are this card; its preview takes over the
  // product page's left column (WallBuilderStage) once the customer starts.
  // Every step is walked in order — the card used to reopen at the last step
  // reached, so a returning shopper read "Step 5 of 5" and was dropped
  // straight onto Review.
  const stage = useWallBuilderStage();
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const stepHeadingRef = useRef<HTMLDivElement>(null);
  // Wall art has no installation service. Keep its artwork options on Adjust.
  const isCanvas = isFixedSize || (materials.length > 0 && materials.every((m) => m.slug === "eco-cotton-canvas"));
  const STEP_MATERIAL = isCanvas ? 1 : 2;
  const STEP_REVIEW = isCanvas ? 2 : 3;
  const steps = isCanvas
    ? ["Size", "Adjust", "Review"]
    : [isFixedSize ? "Size" : "Measure", "Adjust", "Installation", "Review"];
  const engage = () => stage?.setActive(true);
  // On a phone the preview sits ABOVE this card, and is a different height
  // from the gallery it replaces — so the first keystroke in a size field
  // would shove that field up the page. Chrome anchors the scroll itself;
  // Safari does not, so the field's position is measured before the swap
  // and restored after it.
  const swapAnchor = useRef<{ el: Element; top: number } | null>(null);
  const stageActive = stage?.active ?? false;
  useEffect(() => {
    document.documentElement.toggleAttribute("data-wall-builder-active", stageActive);
    return () => document.documentElement.removeAttribute("data-wall-builder-active");
  }, [stageActive]);
  useLayoutEffect(() => {
    const anchor = swapAnchor.current;
    if (!stageActive || !anchor) return;
    swapAnchor.current = null;
    const delta = anchor.el.getBoundingClientRect().top - anchor.top;
    if (Math.abs(delta) > 1) window.scrollBy(0, delta);
  }, [stageActive]);
  // Bring the current step's heading into view and announce it; the preview
  // is already on screen beside (desktop) or above (phone) the card. The
  // offset clears the sticky site header and, on a phone, the preview pinned
  // beneath it — both measured, since both change height.
  const revealStepHeading = () => {
    const heading = stepHeadingRef.current;
    if (!heading) return;
    const header = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
    const pinned = document.querySelector<HTMLElement>(".wall-stage-active");
    const pinnedH = pinned && getComputedStyle(pinned).position === "sticky" && window.innerWidth < 1024 ? pinned.offsetHeight : 0;
    const offset = header + pinnedH + 16;
    const at = heading.getBoundingClientRect().top;
    // Already comfortably in view (the usual case on a laptop): leave the
    // page where it is rather than nudge it on every step.
    if (at < offset - 8 || at > window.innerHeight * 0.5) {
      window.scrollTo({ top: at + window.scrollY - offset, behavior: "smooth" });
    }
    heading.focus({ preventScroll: true });
  };
  const goToStep = (next: number) => {
    if (next !== step) gaEvent("configuration_step", { item_id: productHandle, step_number: next + 1, step_name: steps[next], previous_step: step + 1 });
    // Separate names are reportable without registering custom GA dimensions.
    if (next !== step) gaEvent(`configuration_step_${next + 1}`, { item_id: productHandle });
    setStep(next);
    setFurthestStep(current => Math.max(current, next));
    engage();
    setTimeout(revealStepHeading, 0);
  };
  // One-tap entry (autoStart): the builder is already open when the page
  // lands — preview up, Measure step on screen. On a pointer device the width
  // field takes focus so the first keystroke is the wall; on a touch screen
  // the card is brought into view but the keyboard is left to the customer.
  useEffect(() => {
    if (!autoStart) return;
    engage();
    const t = setTimeout(() => {
      revealStepHeading();
      if (window.matchMedia?.("(pointer: fine)").matches) {
        stepHeadingRef.current?.closest("section")?.querySelector<HTMLInputElement>('input[type="number"]')?.focus({ preventScroll: true });
      }
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const recordConfigurationStart = useMemo(() => configurationTracker(productHandle), [productHandle]);
  const { market, money, quote } = useMarket();
  const [materialSlug, setMaterialSlug] = useState(
    materials.find((m) => m.slug === initialMaterialSlug && !m.comingSoon)?.slug ??
      materials.find((m) => !m.comingSoon)?.slug ??
      materials[0]?.slug,
  );
  // Ready-size designs default to the middle option of their ladder (or the
  // deep-linked size when a Shopping ad advertised one); a made-to-measure
  // design starts from the customer's stated (or a typical) wall.
  const midReady = readySizes?.length ? readySizes[Math.floor((readySizes.length - 1) / 2)] : null;
  const startReady =
    initialSizeIn && readySizes?.some(([w, h]) => w === initialSizeIn[0] && h === initialSizeIn[1])
      ? initialSizeIn
      : midReady;
  // Indians measure as feet + inches (10 ft 6 in), not decimal feet — so feet
  // and inches are separate fields. Metric conversion stays internal.
  // No forcing "6 inches" into "0.5 feet".
  // The opening wall — and therefore the first price anyone sees. Its reasoning
  // and its floors live in wall-default.ts, where they can be tested.
  const { w: initW, h: initH } = initialWallFt(startReady, initialWidthFt, initialHeightFt);
  const [widthFeet, setWidthFeet] = useState(Math.floor(initW));
  const [widthInches, setWidthInches] = useState(Math.round((initW - Math.floor(initW)) * 12));
  const [heightFeet, setHeightFeet] = useState(Math.floor(initH));
  const [heightInches, setHeightInches] = useState(Math.round((initH - Math.floor(initH)) * 12));
  // The ladder size currently chosen, in exact inches — the price and print
  // authority for a fixed-size piece. Null once the customer measures freely.
  const [exactReady, setExactReady] = useState<[number, number] | null>(startReady ?? null);
  const [qty, setQty] = useState(1);
  const [installOn, setInstallOn] = useState(false);
  // Installation is only sold where we have an installer, decided by pincode.
  // Remembered for the visit so it isn't re-asked on every design.
  const [installPin, setInstallPin] = useState("");
  const installPinRef = useRef<HTMLInputElement>(null);
  const [visualizerOpen, setVisualizerOpen] = useState(false);
  const { gate, authModal, signedIn } = useAuthGate();
  // Opening the room visualiser is free and ungated. The homepage promises
  // "see it on your wall in seconds, at no charge", and this used to demand a
  // verified email plus consent boxes before the modal even opened. Mapping a
  // design onto a photo happens entirely in the browser (object URL + four
  // corners — nothing leaves the device). What costs us and touches our
  // servers — furniture occlusion (/api/segment-room) and keeping the room —
  // stays behind the gate inside RoomVisualizer, and the server enforces it
  // with requireGatedUser() regardless of what the client does.
  const openVisualizer = () => {
    engage();
    setVisualizerOpen(true);
  };

  // The room the customer already uploaded and aligned — on /see-it-in-my-room
  // or on another design's page — opens here with the photo and corners in
  // place, so "See it on your wall" never asks for the photo twice. Read after
  // mount (localStorage), and kept current when they align a room here.
  const [savedRoom, setSavedRoom] = useState<RoomSession | null>(null);
  useEffect(() => { setSavedRoom(loadRoomSession()); }, []);

  // The gallery's above-the-fold "See it on your wall" pill opens the same
  // room visualizer from anywhere on the page.
  useEffect(() => {
    window.addEventListener("zyv:open-visualizer", openVisualizer);
    return () => window.removeEventListener("zyv:open-visualizer", openVisualizer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unified crop framing — shared by the inline design visualiser, the room
  // visualiser, the order (crop_data) and the print pipeline.
  const [offsetX, setOffsetX] = useState(0.5);
  const [offsetY, setOffsetY] = useState(0.5);
  const [zoom, setZoom] = useState(1);
  // Mirror the design left↔right / top↔bottom — persists to crop_data → print.
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [imgMeta, setImgMeta] = useState<{ aspect: number; sourceW: number; sourceH: number } | null>(null);
  // A composite of the mural mapped into the customer's own room photo,
  // captured from the room visualiser for the order-copy PDF (optional).
  const [roomComposite, setRoomComposite] = useState<string | null>(null);
  const [placed, setPlaced] = useState(false);
  const [saveBoardOpen, setSaveBoardOpen] = useState(false);
  const [sampleOpen, setSampleOpen] = useState(false);
  const sampleOffered = sampleable && market.countryCode === "IN";
  const [measureOpen, setMeasureOpen] = useState(false);
  const [swatchZoom, setSwatchZoom] = useState<MaterialOpt | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const router = useRouter();
  // Lettering is optional and folded away inside Installation; it opens
  // on request, and stays open whenever there is lettering to show.
  // A children's design (nameAudience "kids") opens it by default — the name
  // is the reason many of those buyers came.
  const [letteringOpen, setLetteringOpen] = useState(nameAudience === "kids");
  const [orderError, setOrderError] = useState<string | null>(null);
  const [proofBusy, setProofBusy] = useState(false);
  // Mandatory composition sign-off — required before Add to Cart. Any change
  // to the crop, scale, size or material invalidates a prior approval, so a
  // stale confirmation can never apply to a composition the customer didn't
  // actually see.
  const [approved, setApproved] = useState(false);
  // Set the first time the customer presses a disabled Add to Cart. Until then
  // the required fields carry only a quiet asterisk — flagging a form in alert
  // colours before anyone has tried to use it accuses them of a mistake they
  // haven't made yet.
  const [triedSubmit, setTriedSubmit] = useState(false);
  // Scroll/focus targets for the compulsory fields, so a blocked Add to Cart
  // can point at the exact thing that's missing.
  const approvalRef = useRef<HTMLLabelElement | null>(null);
  const stickyBarRef = useRef<HTMLDivElement | null>(null);
  const { add, remove, items: cartItems } = useCart();
  const restoredEdit = useRef(false);
  // A partner's designer configures exactly as a customer does, but the way
  // forward is a customer project, never the cart (src/lib/partner-mode.ts).
  const { partner } = usePartner();
  const [projectDialog, setProjectDialog] = useState<WallToSave | null>(null);
  const [savedProject, setSavedProject] = useState<{ customer_name: string } | null>(null);

  const material = materials.find((m) => m.slug === materialSlug) ?? materials[0];
  const entryMaterialRate = Math.min(...materials.filter((m) => !m.comingSoon).map((m) => m.pricePerSqFt));
  const pickReadySize = (wIn: number, hIn: number) => {
    setWidthGiven(true);
    setHeightGiven(true);
    setExactReady([wIn, hIn]);
    setWidthFeet(Math.floor(wIn / 12));
    setWidthInches(wIn % 12);
    setHeightFeet(Math.floor(hIn / 12));
    setHeightInches(hIn % 12);
  };
  // Wall art (fixed-size family): sold in up to two media — eco-cotton canvas
  // (rolled, framed at home) and self-adhesive (peel & stick). Prices are
  // quoted per finished size only; the per-sq-ft make rate is never shown.
  // The category decides this, not the material list — a design may carry one
  // medium or both.
  const isAdhesiveMedium = isCanvas && material?.slug === "self-adhesive-vinyl";
  const stacked = materialLayout === "stack";
  // Panel width: the SELECTED material's roll width, capped by the live OS
  // max-strip rule (fallback mirrors current production when the OS was
  // unreachable at render time).
  const panelCm = rollCmFromMm(material?.rollWidthMm, printRules?.maxPanelCm ?? MAX_PANEL_CM);
  const overlapCm = printRules?.overlapCm ?? PANEL_OVERLAP_CM;

  // cm is canonical (drives price, visualiser, print). feet+inches → total
  // inches → cm; decimal feet kept only for compatibility with existing labels.
  //
  // A fixed size is taken from the ladder verbatim, NOT via the feet+inches
  // state: a ready size follows the artwork's own shape and can land on a half
  // inch (60 × 33.5), which whole-inch state silently drops. That made the
  // header's "from" price — which reads the ladder directly — disagree with the
  // price panel on the same page.
  const widthCm = (exactReady ? exactReady[0] : widthFeet * 12 + widthInches) * CM_PER_INCH;
  const heightCm = (exactReady ? exactReady[1] : heightFeet * 12 + heightInches) * CM_PER_INCH;
  const widthFt = widthFeet + widthInches / 12;
  const heightFt = heightFeet + heightInches / 12;

  // Multi-wall run + planning overlays. `extraWalls` are additional wall widths
  // (cm) beyond the primary wall; they extend one continuous run, so the total
  // priced/printed width is the sum. A corner joint falls at each seam. Doors &
  // manual divisions are wall-fixed overlays for the studio. Empty → a plain
  // single wall, so every derived value below is unchanged in the common case.
  const [extraWalls, setExtraWalls] = useState<number[]>([]);
  // `side` is how the customer chose to measure the position (from the left or
  // the right edge); the geometry stays canonical — offsetCm from the left —
  // so nothing downstream learns a second coordinate system.
  const [doors, setDoors] = useState<{ widthCm: number; heightCm: number; offsetCm: number; sillCm?: number; kind?: "headboard"; side?: "left" | "right" }[]>([]);
  const [manualDivisions, setManualDivisions] = useState<number[]>([]);
  const [textOverlay, setTextOverlay] = useState<TextOverlay | null>(null);
  const textPreview = useTextOverlayPreview(textOverlay);
  const companionPreview = useTextOverlayPreview(textOverlay?.companion ?? null);
  const [activeLettering, setActiveLettering] = useState<"name" | "quote">("name");
  const nameOn = textOverlay?.kind === "cloud";
  const childName = nameOn ? textOverlay.text.trim() : "";
  const nameFee = nameOn ? NAME_FEE : 0;
  const wallsCm = [widthCm, ...extraWalls.filter((w) => w > 0)];
  const multiWall = wallsCm.length > 1;
  const runWidthCm = wallsCm.reduce((a, b) => a + b, 0);
  // Headboards held on the floor and inside the wall as it is NOW — a wall
  // narrowed after the headboard went up must not price or print one hanging
  // off it. Every reader below uses these, never the raw state.
  const placedDoors = placeMarks(doors, runWidthCm, heightCm);
  const textCheck = textOverlay ? textOverlaySchema.safeParse(textOverlay) : null;
  const textError = nameOn && market.countryCode !== "IN" ? "Please contact MimiPip for a name-cloud price for overseas delivery." : textOverlay && textOverlay.text.trim() ? (!textCheck?.success ? textCheck?.error.issues[0]?.message ?? "Enter your text." : overlayPlacementError(textOverlay, runWidthCm, heightCm, placedDoors) || textPreview.error) : null;
  const nameReady = !textOverlay || (!!textPreview.url && !textError && (!textOverlay.companion || (!!companionPreview.url && !companionPreview.error)));
  // Never folded while there is lettering: hiding it would hide the fee and
  // the preview state that can block Add to cart.
  const showLettering = letteringOpen || !!textOverlay;

  // Auto corner joints at each cumulative seam (all walls but the last).
  const autoDivisions = multiWall
    ? wallsCm.slice(0, -1).map((_, i) => wallsCm.slice(0, i + 1).reduce((a, b) => a + b, 0))
    : [];
  const allDivisions = [...autoDivisions, ...manualDivisions.filter((d) => d > 0 && d < runWidthCm)];

  // mm is a synced alternate — typing mm updates feet + inches.
  const setDimFromMm = (mm: number, setFeet: (n: number) => void, setInches: (n: number) => void) => {
    const totalIn = (mm || 0) / 25.4;
    let f = Math.floor(totalIn / 12);
    let i = Math.round((totalIn - f * 12) * 2) / 2;
    if (i >= 12) { f += 1; i = 0; }
    setFeet(f);
    setInches(i);
  };

  // ---- keep the artwork's own shape ----------------------------------------
  // A mural is one composition, so a wall of a different shape can only show
  // part of it: the visualiser cover-fits the artwork and crops the overflow.
  // With the lock on, one dimension follows the other at the artwork's true
  // ratio, so a 2:1 design is ordered at 2:1 and nothing is lost.
  //
  // The customer's wall dimensions are independent by default. Keeping the
  // artwork's original proportions is an explicit choice, because changing a
  // measured height in response to a width risks printing the wrong wall.
  //
  // It used to default off, reasoning that silently rewriting a height someone
  // had typed was worse than a crop they chose. That is right for a repeating
  // pattern and wrong for a composition: these designs ARE their proportion —
  // a phone-booth panel is one arch drawn for a 1:2.5 wall — so the default
  // that loses least is the one that keeps the whole picture. The lock is
  // mutual (either field pulls the other), so a customer who types their real
  // wall is never overruled, only answered; and unchecking it is one click.
  const artAspect = imgMeta?.aspect ?? null;
  const [lockChoice, setLockChoice] = useState(false);
  /** True once a phone-measured wall has been applied — see applyIdealSize. */
  const measuredWall = useRef(false);
  // Only worth offering where it would actually change something. A near-square
  // flat is almost always a repeating pattern rather than a composition, and a
  // repeat has no shape to keep — offering to lock a wall to 1:1 would be noise
  // at best and a lie about the artwork at worst.
  const lockable =
    !!artAspect && artAspect > 0 && !isFixedSize &&
    (artAspect > 1.1 || artAspect < 1 / 1.1);
  const lockRatio = lockChoice && lockable;
  /** The artwork's ratio as a spoken label — "2:1", "3:2", "4:5". */
  const ratioLabel = (() => {
    if (!artAspect) return "";
    const r = artAspect >= 1 ? artAspect : 1 / artAspect;
    const near = [1, 1.25, 1.33, 1.5, 1.6, 1.78, 2, 2.5, 3].find((c) => Math.abs(c - r) < 0.06);
    const asPair: Record<string, string> = {
      "1": "1:1", "1.25": "5:4", "1.33": "4:3", "1.5": "3:2",
      "1.6": "8:5", "1.78": "16:9", "2": "2:1", "2.5": "5:2", "3": "3:1",
    };
    const pair = near ? asPair[String(near)] : `${r.toFixed(2)}:1`;
    // Portrait artwork is the same ratio the other way round.
    return artAspect >= 1 ? pair : pair.split(":").reverse().join(":");
  })();

  /**
   * Split total inches into the feet + inches fields.
   *
   * Inches snap to the HALF inch because that is the inches field's own `step`.
   * Rounding to a tenth (which this used to do) produced values the browser
   * itself rejects — a locked 2:5 wall computed "25 ft 0.1 in" and the field
   * showed "Please enter a valid value. The two nearest valid values are 0 and
   * 0.5", which is a validation error the customer cannot fix by typing. Half
   * an inch on a wall is 12mm and the millimetre field carries the exact figure
   * anyway.
   */
  const setTotalIn = (totalIn: number, setFeet: (n: number) => void, setInches: (n: number) => void) => {
    const clamped = Math.max(0, totalIn);
    let f = Math.floor(clamped / 12);
    let i = Math.round((clamped - f * 12) * 2) / 2;
    // 11.75in rounds to 12 — carry it rather than showing an out-of-range "12".
    if (i >= 12) { f += 1; i = 0; }
    setFeet(f);
    setInches(i);
  };
  /** Only an explicitly chosen artwork lock may change the other dimension. */
  const syncHeightToWidth = (wTotalIn: number) => {
    if (!lockRatio || !artAspect) return;
    setTotalIn(wTotalIn / artAspect, setHeightFeet, setHeightInches);
  };
  const syncWidthToHeight = (hTotalIn: number) => {
    if (!lockRatio || !artAspect) return;
    setTotalIn(hTotalIn * artAspect, setWidthFeet, setWidthInches);
  };

  /**
   * The wall a shaped design is FOR, when nobody has said otherwise.
   *
   * The old default was 10 ft x 10 ft for everything, which is a reasonable
   * guess for a repeating pattern and nonsense for a composition: locking a
   * 1:2.5 booth panel to a 10 ft width asked for a 25 ft high wall, and quoted
   * it. So a design with a real shape starts at a real wall instead.
   *
   * Height is the anchor because room height is the fixed fact in a building —
   * 2.5 m is a standard Indian floor-to-ceiling — and the width follows the
   * artwork's own ratio. For the phone-booth panels that lands on 1 m x 2.5 m,
   * which is the pod they were drawn for. Width is clamped so an extreme
   * landscape ratio cannot ask for a 12 m wall; the height then follows back.
   *
   * Only applies where the artwork HAS a shape (`lockable`) and the customer
   * has not already supplied a size — a ready size, ?w=/?h=, or a wall they
   * measured with their phone all win.
   */
  const IDEAL_H_MM = 2500;
  const MAX_IDEAL_W_MM = 6000;
  const MIN_IDEAL_W_MM = 600;
  const customerSized =
    !!startReady || !!(initialWidthFt && initialWidthFt > 0) || !!(initialHeightFt && initialHeightFt > 0);
  /**
   * Has the price on screen been asked for yet?
   *
   * The opening wall is the minimum-billing wall ON PURPOSE (wall-default.ts —
   * the ads we compete with show low prices, and this is our honest low one).
   * But labelled "Current price", ₹4,050 read as the price of the mural
   * (30 Sep 2026 walkthrough). So until the customer has given us a size —
   * typed a dimension, measured with the phone, picked a ready size, or
   * arrived on one (?size= / ?w=&h=) — the same figure is labelled as what it
   * is: where prices start. The figure itself never changes.
   */
  const [widthGiven, setWidthGiven] = useState(!!startReady || !!(initialWidthFt && initialWidthFt > 0));
  const [heightGiven, setHeightGiven] = useState(!!startReady || !!(initialHeightFt && initialHeightFt > 0));
  const sizeGiven = widthGiven && heightGiven;

  // Presets give an immediate price; custom measurements open only on request.
  // One preset, then Custom Size, then Sample (Roheena, 12 October 2026: a
  // second preset, 12 × 9, is gone; a sample is the
  // other thing a shopper on this step actually wants).
  const SIZE_PRESETS: { label: string; w: number; h: number; hint: string }[] = [
    { label: "8 × 9 ft", w: 8, h: 9, hint: "standard wall" },
  ];
  const [sizePreset, setSizePreset] = useState<string | null>(null);
  const [customSize, setCustomSize] = useState(false);
  // "Measure with your phone" is WebXR, which only Android Chrome has. On an
  // iPhone or a laptop it opened a sheet saying it could not run — a dead end
  // above the size fields. Offered only where the browser says it can work.
  const [arMeasure, setArMeasure] = useState(false);
  useEffect(() => {
    const xr = (navigator as Navigator & { xr?: { isSessionSupported?: (m: string) => Promise<boolean> } }).xr;
    if (!xr?.isSessionSupported) return;
    let live = true;
    xr.isSessionSupported("immersive-ar").then((ok) => { if (live) setArMeasure(ok); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const activePreset = SIZE_PRESETS.find(
    (p) => p.label === sizePreset && widthFeet === p.w && widthInches === 0 && heightFeet === p.h && heightInches === 0,
  ) ?? null;
  const pickSizePreset = (p: (typeof SIZE_PRESETS)[number]) => {
    recordConfigurationStart();
    engage();
    setWidthFeet(p.w);
    setWidthInches(0);
    setHeightFeet(p.h);
    setHeightInches(0);
    setWidthGiven(true);
    setHeightGiven(true);
    setSizePreset(p.label);
    setCustomSize(false);
    gaEvent("size_preset", { item_id: productHandle, preset: p.label });
  };

  /**
   * Seed the wall from the artwork's own shape, once its ratio is known.
   *
   * OFF since 27 Sep 2026. This ran the moment the image loaded and replaced
   * the opening wall with the artwork at full height — 50 sq ft, ₹10,124,
   * shown to someone who had not asked for a price and had not said how big
   * their wall was. In the 30 days before it was turned off, 3,483 people
   * opened a design and 81 touched the builder.
   *
   * Kept rather than deleted because the phone-measure path below reuses the
   * same setters, and because the artwork's ratio is still the right answer
   * for the LOCK — it just must not decide the size on the customer's behalf.
   */
  const SEED_FROM_ARTWORK = false;
  const applyIdealSize = (aspect: number) => {
    if (!SEED_FROM_ARTWORK) return;
    if (customerSized || measuredWall.current || isFixedSize) return;
    if (!(aspect > 1.1 || aspect < 1 / 1.1)) return;
    let hMm = IDEAL_H_MM;
    let wMm = hMm * aspect;
    if (wMm > MAX_IDEAL_W_MM) { wMm = MAX_IDEAL_W_MM; hMm = wMm / aspect; }
    else if (wMm < MIN_IDEAL_W_MM) { wMm = MIN_IDEAL_W_MM; hMm = wMm / aspect; }
    setDimFromMm(Math.round(wMm), setWidthFeet, setWidthInches);
    setDimFromMm(Math.round(hMm), setHeightFeet, setHeightInches);
  };

  // A wall measured with the phone (WallMeasure, e.g. from /how-to-measure)
  // pre-fills the size for the rest of the visit — but never overrides a
  // ready-size product or dimensions passed in explicitly.
  useEffect(() => {
    if (startReady || (initialWidthFt && initialWidthFt > 0) || (initialHeightFt && initialHeightFt > 0)) return;
    try {
      const raw = sessionStorage.getItem("zyv:measured-wall");
      if (!raw) return;
      const { wMm, hMm } = JSON.parse(raw) as { wMm?: number; hMm?: number };
      if (!wMm || !hMm || wMm < 300 || hMm < 300) return;
      // A real wall beats an ideal one — flagged so the shaped-artwork default
      // above cannot overwrite it when the image finishes loading.
      measuredWall.current = true;
      setWidthGiven(true);
      setHeightGiven(true);
      setDimFromMm(wMm, setWidthFeet, setWidthInches);
      setDimFromMm(hMm, setHeightFeet, setHeightInches);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overlaySig = JSON.stringify({ extraWalls, placedDoors, manualDivisions, textOverlay });
  useEffect(() => {
    if (!editItemId || restoredEdit.current) return;
    const line = cartItems.find((it) => it.item_id === editItemId && it.handle === productHandle);
    if (!line) return;
    restoredEdit.current = true;
    setQty(line.quantity);
    setCustomSize(true);
    const c = line.crop_data;
    const firstWidth=c?.walls?.length?c.walls[0]:Number(line.width_cm);
    pickReadySize(firstWidth/CM_PER_INCH,Number(line.height_cm)/CM_PER_INCH);
    setExtraWalls(c?.walls?.slice(1)??[]);
    setDoors(c?.doors??[]);
    const corners=c?.walls?.slice(0,-1).map((_,i)=>c.walls!.slice(0,i+1).reduce((sum,w)=>sum+w,0))??[];
    setManualDivisions(c?.divisions?.filter(d=>!corners.some(v=>Math.abs(v-d)<.01))??[]);
    setTextOverlay(c?.textOverlay??null);
    if (c) {
      setOffsetX(c.offsetX ?? 0.5);
      setOffsetY(c.offsetY ?? 0.5);
      setZoom(c.zoom ?? 1);
      setFlipH(!!c.flipH);
      setFlipV(!!c.flipV);
    }
  }, [editItemId, cartItems, productHandle]);
  useEffect(() => {
    setApproved(false);
  }, [offsetX, offsetY, zoom, flipH, flipV, runWidthCm, heightCm, materialSlug, overlaySig]);

  useEffect(() => {
    if (autoOpenSample) setSampleOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The gallery's on-image "Order a sample" pill opens the sample modal from
  // anywhere on the page (mirrors the "See it on your wall" visualiser pill).
  useEffect(() => {
    const open = () => setSampleOpen(true);
    window.addEventListener("zyv:open-sample", open);
    return () => window.removeEventListener("zyv:open-sample", open);
  }, []);

  // Large openings (doors ≥2ft wide reaching ≥70% of the wall, full-height
  // wardrobes): the panels over them print short or not at all, and the
  // customer pays for the PRINTED area, not the wall behind the door. Small
  // marks stay planning overlays (print through, full price), as always.
  // lib/openings.ts is the canonical geometry the print engine mirrors.
  const openingsPlan = planOpenings({
    runWidthCm,
    wallHeightCm: heightCm,
    doors: placedDoors,
    panelCm,
    overlapCm,
  });
  const hasExclusions = OPENING_EXCLUSION_ENABLED && !isFixedSize && openingsPlan.excludedSqft > 0;
  const fullSqft = areaSqFt(runWidthCm, heightCm);
  // From here down `sqft` is the CHARGEABLE area — material, installation and
  // the women-entrepreneurs contribution all price on the same basis.
  const sqft = hasExclusions ? openingsPlan.chargeableSqft : fullSqft;
  // BILLED area — the chargeable area with the small-order minimums applied
  // (print width counts as at least 4 ft; wallpaper billing never drops below
  // 20 sq ft). Fixed-size pieces are exempt: their price is a set figure.
  const billed = isFixedSize || sqft <= 0 ? sqft : billedSqFt(runWidthCm, heightCm, hasExclusions ? sqft : undefined);
  const minimumsApplied = !isFixedSize && sqft > 0 && billed > sqft + 0.0005;
  const widthFloorApplied = !isFixedSize && sqft > 0 && runWidthCm / CM_PER_FOOT < MIN_PRINT_WIDTH_FT;
  // What an openings exclusion is actually WORTH once the minimums apply. At
  // the 20 sq ft floor a skipped door stops lowering the price — the panel
  // still prints short, but the total doesn't move. The per-door "you save ₹X"
  // below must quote the saving the customer really gets, never the raw area.
  const billedWithoutExclusions =
    isFixedSize || fullSqft <= 0 ? fullSqft : billedSqFt(runWidthCm, heightCm);
  const realisedExclusionFrac =
    hasExclusions && openingsPlan.excludedSqft > 0
      ? Math.max(0, billedWithoutExclusions - billed) / openingsPlan.excludedSqft
      : 0;
  // Fixed-size pieces price at a clean retail figure (₹7,000, never ₹6,667);
  // a made-to-measure wall prices at its billed area, which the customer can
  // verify themselves — rounding THAT would look like an error, not a courtesy.
  const materialTotal = material
    ? isFixedSize
      ? fixedSizePrice(runWidthCm, heightCm, material.pricePerSqFt, qty)
      : Math.round(billed * material.pricePerSqFt * 100) / 100 * qty
    : 0;
  // On-site installation (Bengaluru, Mumbai & Pune only), ₹35/sq ft + GST (shown
  // as the GST-inclusive rate, see INSTALL_RATE_LABEL) of mural area × qty —
  // offered only from INSTALL_MIN_SQFT up; never for smaller walls or the
  // wall-art family, regardless of finished size.
  const installEligible = !isCanvas && market.countryCode === "IN" && sqft >= INSTALL_MIN_SQFT;
  // Pincode decides serviceability — see src/lib/install-cities.ts. Checkout
  // re-checks this against the real delivery address, so this is the front gate.
  const installArea = resolveInstallEligibility({ pincode: installPin });
  const installActive = installOn && installEligible && installArea.serviceable;
  const installTotal = installActive ? installationTotal(sqft, qty) : 0;
  const total = materialTotal + installTotal + nameFee;
  const marketTotal = quote(total, billed * qty, qty);
  const marketTotalLabel = formatMarketMoney(marketTotal.total, marketTotal.currency);

  // The compulsory steps, in the order they appear on the page. The button, the
  // asterisks and the "what's left" line all read from this one list, so the
  // form can never disable the button for a reason it hasn't named.
  const soldOut = maxQty !== undefined && maxQty <= 0;
  // Size sanity. One mis-tap once quoted a 10,090 ft wall at ₹24.6 crore with
  // no warning. No home wall is 60 ft; above that, or 2,000 sq ft in all, it
  // is a typo or a project, and either way not a cart.
  const sideFt = (cm: number) => cm / (CM_PER_INCH * 12);
  const longestSideFt = isFixedSize ? 0 : Math.max(sideFt(widthCm), sideFt(heightCm), ...extraWalls.map(sideFt));
  const wallTooBig = !isFixedSize && (longestSideFt > MAX_SIDE_FT || fullSqft > MAX_ORDER_SQFT);
  const wallLarge = !wallTooBig && longestSideFt > WARN_SIDE_FT;
  const needsName = !nameReady;
  // A catalogue design exactly as the studio drew it: no customer upload and
  // no lettering. Review speaks plainly for these (see the Review step).
  const plainCatalogue = !uploadedSource && !textOverlay && !nameOn;
  // Founder's rule (6 October 2026): a standard wallpaper the customer has not
  // touched — no drag, scale or flip either — needs no composition sign-off.
  // Anything changed, and every canvas or fixed-size piece, still does. The
  // rule itself lives in src/lib/composition-signoff.ts, pinned by its test.
  const untouched = compositionUntouched({
    offsetX, offsetY, zoom, flipH, flipV,
    ownImage: !!uploadedSource,
    lettering: !!textOverlay || nameOn,
    nonWallpaper: isCanvas || isFixedSize,
  });
  const needsApproval = sqft > 0 && !approved && !untouched;
  const blockers = [
    ...(!isFixedSize && !sizeGiven ? ["your wall width and height"] : []),
    ...(wallTooBig ? ["a wall size we can print"] : []),
    ...(needsName ? ["your lettering preview"] : []),
    ...(needsApproval ? ["the composition sign-off"] : []),
  ];
  const canAdd = total > 0 && blockers.length === 0 && !soldOut && !(maxQty !== undefined && qty > maxQty);

  // Publish the sticky bar's height so page-level floating UI can lift itself
  // clear of it. The concierge launcher is fixed bottom-right at z-50, well
  // above this bar, so without this it sits ON TOP of the Add to Cart button and
  // swallows clicks on its right-hand end. Measured rather than hard-coded: the
  // bar grows a line whenever something is still outstanding.
  useEffect(() => {
    const el = stickyBarRef.current;
    if (!el) return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty("--sticky-cta-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--sticky-cta-h");
    };
  }, []);

  // If the wall shrinks below the threshold, or the pincode stops being one we
  // service, untick it — a hidden add-on must never keep charging silently.
  useEffect(() => {
    if (installOn && (!installEligible || !installArea.serviceable)) setInstallOn(false);
  }, [installEligible, installOn, installArea.serviceable]);

  // Carry a confirmed installation pincode across the visit.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("zyv:install-pin");
      if (saved) setInstallPin(saved);
    } catch {}
  }, []);
  useEffect(() => {
    if (!installArea.serviceable) return;
    try {
      sessionStorage.setItem("zyv:install-pin", installPin);
    } catch {}
  }, [installArea.serviceable, installPin]);

  const wallLabel = isCanvas
    ? `${Math.round(widthCm / CM_PER_INCH)}″ × ${Math.round(heightCm / CM_PER_INCH)}″ artwork`
    : multiWall
    ? `${(runWidthCm / (CM_PER_INCH * 12)).toFixed(1)} ft run × ${heightFeet}′${heightInches}″`
    : `${widthFeet}′${widthInches}″ × ${heightFeet}′${heightInches}″ wall`;

  const crop: CropData | null = image
    ? {
        imageUrl: image.url,
        ...(customArtworkId?{customArtworkId}:{}),
        wallWidthCm: runWidthCm,
        wallHeightCm: heightCm,
        offsetX,
        offsetY,
        zoom,
        flipH,
        flipV,
        planningMode: "full-wall",
        walls: multiWall ? wallsCm : undefined,
        doors: placedDoors.length
          ? placedDoors.map((d) => ({ widthCm: d.widthCm, heightCm: d.heightCm, offsetCm: d.offsetCm, ...(d.sillCm ? { sillCm: d.sillCm } : {}), ...(d.kind ? { kind: d.kind } : {}) }))
          : undefined,
        divisions: allDivisions.length ? allDivisions : undefined,
        imageAspect: imgMeta?.aspect,
        // Seamless designs print as a REPEAT, so the print pipeline must see
        // this on the order item, not just in the preview.
        seamless,
        sourceW: imgMeta?.sourceW,
        sourceH: imgMeta?.sourceH,
        // ratePerSqft is the EX-GST quoted rate; total is what's charged
        // (GST included), so total ≠ rate × area by design.
        installation: installActive ? { ratePerSqft: INSTALL_RATE_EX_GST, total: installTotal } : null,
        textOverlay: textOverlay ? { ...textOverlay, text: textOverlay.text.trim(), companion: textOverlay.companion ? { ...textOverlay.companion, text: textOverlay.companion.text.trim() } : undefined } : null,
        personalisation: nameOn ? { childName: childName.trim(), fee: NAME_FEE } : null,
        // Bill-time truth for the exclusion: what was billed off and the exact
        // panel plan the customer approved. Downstream (order-copy PDF, OS
        // payload) renders THIS, never a re-derivation from live rules.
        openingsPlan: hasExclusions ? openingsSnapshot(openingsPlan) : null,
      }
    : null;

  const quality = imageQuality(crop);

  const addToCart = async () => {
    if (adding || soldOut) return;
    recordConfigurationStart();
    // Pressed while something compulsory is still blank: mark the form as
    // attempted (which turns the asterisked fields alert-coloured) and take the
    // customer to the first thing that's missing. A greyed-out button that
    // simply does nothing is the reason this was hard to use.
    if (!canAdd) {
      gaEvent("cart_add_blocked", {
        item_id: productHandle,
        reason: wallTooBig ? "wall_too_big" : !isFixedSize && !sizeGiven ? "measurements_missing" : needsName ? "lettering_incomplete" : needsApproval ? "approval_missing" : "invalid_selection",
      });
      setTriedSubmit(true);
      if (wallTooBig || (!isFixedSize && !sizeGiven)) { goToStep(0); return; }
      // Lettering lives in Installation's expander now — open it too,
      // or the jump lands on a step whose problem is folded out of sight.
      if (needsName) { setLetteringOpen(true); goToStep(STEP_MATERIAL); }
      // Looked up after the step switch has rendered, so the target exists and
      // is no longer hidden.
      setTimeout(() => {
        const target = needsName ? document.getElementById("personalise") : needsApproval ? approvalRef.current : null;
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, needsName ? 50 : 0);

      return;
    }
    if (!crop || !material) return;
    if (partner) {
      // Same approved wall, filed to a project instead of a cart. Millimetres,
      // and the portal's placement vocabulary (cropX/cropY are the visualiser's
      // offsetX/offsetY) — what the portal's own editor would have saved.
      setProjectDialog({
        productHandle,
        materialSlug: material.slug,
        widthMm: Math.round(runWidthCm * 10),
        heightMm: Math.round(heightCm * 10),
        placement: {
          zoom: Math.min(8, Math.max(1, crop.zoom ?? 1)),
          cropX: Math.min(1, Math.max(0, crop.offsetX ?? 0.5)),
          cropY: Math.min(1, Math.max(0, crop.offsetY ?? 0.5)),
          flipH: !!crop.flipH,
          flipV: !!crop.flipV,
        },
        openings: [],
      });
      return;
    }
    setAdding(true);
    setOrderError(null);
    try {
      const approvedCrop: CropData = {
        ...crop,
        quality: quality ? { ...quality, checkedAt: new Date().toISOString() } : undefined,
        approval: {
          approvedAt: new Date().toISOString(),
          panelArrangement: hasExclusions
            ? openingsArrangementLabel(openingsPlan)
            : panelArrangementLabel(runWidthCm, panelCm, overlapCm),
        },
        // Every selected size is the ordered size, including the two presets.
        sizeAssumed: null,
      };
      const ok = await add({
        productHandle,
        editItemId,
        materialSlug: material.slug,
        widthCm: runWidthCm,
        heightCm,
        // Custom wallpaper carries its BILLED area so area × rate always
        // reconciles with the line on the cart, order copy and invoice; the
        // print itself still uses widthCm/heightCm — the real measurements.
        areaSqft: isFixedSize ? sqft : billed,
        unitPrice: material.pricePerSqFt,
        quantity: qty,
        lineTotal: total,
        crop: approvedCrop,
        // The room composite is a picture of the customer's home, and the
        // cart stores it in our bucket. The free, anonymous room preview is
        // browser-only by design, so only a verified customer's composite is
        // sent — keeping a room is one of the things behind the gate.
        roomComposite: signedIn ? roomComposite : null,
      });
      if (!ok) {
        setOrderError("Couldn't add to cart — please try again.");
        return;
      }
      setAdded(true);
      router.push("/cart");
    } catch {
      setOrderError("Couldn't reach the store just now — please try again.");
    } finally {
      setAdding(false);
    }
  };

  // Downloadable order proof — panel layout + specs for the current wall size.
  const downloadProof = async () => {
    if (proofBusy || sqft <= 0 || !material || !nameReady) return;
    setProofBusy(true);
    setOrderError(null);
    try {
      const res = await fetch("/api/proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productHandle, materialSlug: material.slug, widthCm: runWidthCm, heightCm, crop }),
      });
      if (!res.ok) throw new Error("proof failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mimipip-order-proof-${productHandle}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setOrderError("Couldn't generate the order proof just now — please try again.");
    } finally {
      setProofBusy(false);
    }
  };

  // Size choices live in Step 1, below or alongside the persistent preview.
  const sizesInPreview = false; // The guided measurement step owns the size choice.

  // The live preview: in the page's left column when the product page hosts
  // a WallBuilderStage, otherwise inside this card.
  const viewer = (
      <div className="guided-viewer" data-step={step}>

      {/* 1 · inline size & design visualiser — the primary sales tool, front and centre.
          Fixed-size products get the true-scale room wall; made-to-measure keeps
          the crop-frame view. Both share the same crop state. */}
      {image && isFixedSize && readySizes?.length ? (
        <WallScaleVisualizer
          imageUrl={image.url}
          imageAlt={image.alt}
          artWidthIn={Math.round(widthCm / CM_PER_INCH)}
          artHeightIn={Math.round(heightCm / CM_PER_INCH)}
          offsetX={offsetX}
          offsetY={offsetY}
          zoom={zoom}
          flipH={flipH}
          flipV={flipV}
          textureUrl={material?.textureUrl ?? null}
          sizePicker={
            // A single fixed size is not a choice — showing a one-option
            // picker (and calling it "choose") invites a decision that
            // doesn't exist. State the size instead; the preview above is
            // already showing it at true scale.
            sizesInPreview && readySizes.length > 1 ? (
              <>
                <p className="caps mb-2 text-slate">Choose your artwork size</p>
                <ReadySizePicker
                  sizes={readySizes}
                  widthCm={widthCm}
                  heightCm={heightCm}
                  pricePerSqFt={material?.pricePerSqFt ?? null}
                  onPick={pickReadySize}
                  isFixedSize
                  compact
                />
              </>
            ) : null
          }
          onChange={(n) => {
            setOffsetX(n.offsetX);
            setOffsetY(n.offsetY);
            setZoom(n.zoom);
            setFlipH(n.flipH);
            setFlipV(n.flipV);
          }}
          onImageMeta={(m) => {
            setImgMeta(m);
            // Sizing the wall belongs here rather than in an effect watching
            // imgMeta: the ratio arrives exactly once, with the image.
            if (!imgMeta) applyIdealSize(m.aspect);
          }}
        />
      ) : image ? (
        <DesignVisualizer
          guided
          showScaleFigure={false}
          textOverlay={textOverlay}
          textOverlayUrl={textPreview.url}
          companionUrl={companionPreview.url}
          onTextOverlayChange={(o) => { setTextOverlay(o); setRoomComposite(null); }}
          imageUrl={image.url}
          imageAlt={image.alt}
          wallWidthCm={runWidthCm}
          wallHeightCm={heightCm}
          seamless={seamless}
          offsetX={offsetX}
          offsetY={offsetY}
          zoom={zoom}
          flipH={flipH}
          flipV={flipV}
          doors={placedDoors}
          onDoorMove={(i, offsetCm) => setDoors((ds) => ds.map((x, j) => (j === i ? { ...x, offsetCm } : x)))}
          divisions={allDivisions}
          textureUrl={material?.textureUrl ?? null}
          isCanvas={isCanvas}
          onChange={(n) => {
            setOffsetX(n.offsetX);
            setOffsetY(n.offsetY);
            setZoom(n.zoom);
            setFlipH(n.flipH);
            setFlipV(n.flipV);
          }}
          onImageMeta={(m) => {
            setImgMeta(m);
            if (!imgMeta) applyIdealSize(m.aspect);
          }}
        />
      ) : null}

      </div>
  );

  return (
    <>
    {/* id + scroll margin: the product page's "Measure & price my wall"
        button lands here, clear of the sticky header. */}
    <section id="create-your-wall" aria-label={isCanvas ? "Choose your artwork" : "Create your wall"} className={`wall-builder scroll-mt-28 rounded-2xl border border-step-edge bg-step p-5 ${stageActive && step < STEP_REVIEW ? "wall-builder-staged" : ""} ${step === STEP_REVIEW ? "wall-builder-review" : ""}`}
      onChangeCapture={(event) => {
        recordConfigurationStart();
        if (stage && !stage.active) swapAnchor.current = { el: event.target as Element, top: (event.target as Element).getBoundingClientRect().top };
        engage();
      }}>
      <div ref={stepHeadingRef} tabIndex={-1} className="wall-step-heading flex items-start gap-3 outline-none">
        {/* Where the customer is in the steps — always the step on screen. */}
        <span aria-hidden className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-charcoal text-sm font-semibold text-white">{step + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-slate" aria-live="polite">Step {step + 1} of {steps.length} · {steps[step]}</p>
          <h2 className="text-lg font-semibold">{isCanvas ? "Choose your artwork" : "Create your wall"}</h2>
          {step === 0 && <p className="mt-2 text-sm text-slate">{isFixedSize ? "Choose the artwork size, adjust the composition, then review your selection." : "Measure, adjust and make it yours. One preview, four simple steps."}</p>}
          {step < STEP_REVIEW && !sizeGiven && <p className="mt-1 text-xs text-mist">Enter your wall for your exact price</p>}
        </div>
        {/* The Review step carries the full itemised price, so this summary
            stops one step short of it. Before a size is given it is labelled
            as the floor it is (see sizeGiven), never as "the price". */}
        {step < STEP_REVIEW && <div className="shrink-0 text-right">
          <span className="block text-xs text-slate">{sizeGiven ? "Your price" : widthGiven || heightGiven ? "Add both measurements" : "Standard wall"}</span>
          <span className="block text-sm font-medium tabular-nums">{sizeGiven || (!widthGiven && !heightGiven) ? marketTotalLabel : "—"}</span>
          {!sizeGiven && !widthGiven && !heightGiven && <span className="block text-[0.68rem] text-mist">8 × 9 ft · adjust to your wall</span>}
          {market.currency === "USD" && (sizeGiven || (!widthGiven && !heightGiven)) && <span className="block text-[0.68rem] text-mist">Shipping included</span>}
        </div>}
      </div>
      {stage ? (stage.slot ? createPortal(viewer, stage.slot) : null) : <div className="mt-4">{viewer}</div>}
      <div className="guided-controls">
      <nav aria-label={isCanvas ? "Artwork selection steps" : "Wall configuration steps"} className="my-4 flex gap-1">
        {steps.map((label, index) => <button type="button" key={label}
          disabled={index > furthestStep} aria-current={step === index ? "step" : undefined}
          onClick={() => goToStep(index)}
          className={`min-w-0 flex-1 rounded-xl px-1 py-2 text-[0.7rem] disabled:opacity-35 ${step === index ? "bg-charcoal text-white" : "bg-wash"}`}>
          {index + 1}<span className="block">{label}</span>
        </button>)}
      </nav>
      <div hidden={step !== 1} className="space-y-4">
      <h3 className="text-lg font-semibold">{isCanvas ? "Adjust your artwork" : "How should your design sit?"}</h3>
      <p className="text-sm text-slate">Drag the artwork in the preview. Use the scale and flip controls below the preview to find your composition.</p>
      <button
        className="btn btn-room-preview h-14 w-full gap-2 text-[0.85rem]"
        disabled={!image || sqft <= 0}
        onClick={openVisualizer}
      >
        <CameraIcon /> {savedRoom ? "See it in your saved room" : isCanvas ? "Preview your artwork — upload a room photo" : "See it on your wall, free — upload a room photo"}
      </button>

      </div>
      <div hidden={step !== 0} className="space-y-5">
      {/* 2 · size — ready-size designs pick from a fixed ladder; made-to-measure
          designs offer one preset, custom feet and inches, or a sample */}
      {sizesInPreview ? (
        // Already chosen inside the preview above — repeating the ladder here
        // would give the same decision two different homes.
        <p className="-mt-3 text-xs text-mist">
          {isAdhesiveMedium
            ? "Made on smooth self-adhesive media — peels straight onto the wall, no framing needed."
            : "Made on fine-art canvas and shipped rolled in a protective tube — ready to frame or stretch at home."}
        </p>
      ) : readySizes?.length ? (
        <div>
          <p className="caps mb-3 text-slate">
            {readySizes.length > 1 ? (isCanvas ? "Choose your artwork size" : "Choose your size") : (isCanvas ? "Artwork size" : "Size")}
          </p>
          {readySizes.length === 1 && <p className="mb-3 font-semibold">{readySizes[0][0]} × {readySizes[0][1]} inches · fixed finished size</p>}
          <p className="mb-3 text-xs text-mist">
            {isCanvas
              ? isAdhesiveMedium
                ? "Made on smooth self-adhesive media — peels straight onto the wall, no framing needed."
                : "Made on fine-art canvas and shipped rolled in a protective tube — ready to frame or stretch at home."
              : "This design comes in ready sizes — supplied as this complete artwork, edge to edge."}
          </p>
          {readySizes.length > 1 && (
            <ReadySizePicker
              sizes={readySizes}
              widthCm={widthCm}
              heightCm={heightCm}
              pricePerSqFt={material?.pricePerSqFt ?? null}
              onPick={pickReadySize}
              isFixedSize={isCanvas}
            />
          )}
        </div>
      ) : (
        <div>
          <p className="caps mb-3 text-slate">Wall dimensions</p>
          {/* The one-tap price. First, because it is the only thing on this
              step a shopper can do without a tape measure in hand. */}
          <div className="mb-4 rounded-[14px] border border-edge bg-surface p-3">
            <p className="text-xs font-semibold text-charcoal">Choose a wall size to see your price.</p>
            <div className={`mt-2 grid ${sampleOffered ? "grid-cols-3" : "grid-cols-2"} gap-2`} role="group" aria-label="Common wall sizes">
              {SIZE_PRESETS.map((p) => {
                const on = activePreset?.label === p.label;
                return (
                  <button
                    key={p.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pickSizePreset(p)}
                    className={`min-h-12 rounded-[12px] border px-2 py-1.5 text-center transition-colors ${on ? "border-charcoal bg-charcoal text-cloud" : "border-edge bg-wash text-charcoal hover:border-charcoal/40"}`}
                  >
                    <span className="block text-sm font-semibold leading-tight">{p.label}</span>
                    <span className={`block text-[0.65rem] leading-tight ${on ? "text-cloud/80" : "text-mist"}`}>{p.hint}</span>
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={customSize}
                aria-expanded={customSize}
                aria-controls="custom-wall-dimensions"
                onClick={() => {
                  recordConfigurationStart();
                  engage();
                  setCustomSize(true);
                  if (activePreset) {
                    setWidthFeet(Math.floor(initW));
                    setWidthInches(Math.round((initW - Math.floor(initW)) * 12));
                    setHeightFeet(Math.floor(initH));
                    setHeightInches(Math.round((initH - Math.floor(initH)) * 12));
                    setWidthGiven(false);
                    setHeightGiven(false);
                  }
                  setSizePreset(null);
                }}
                className={`min-h-12 rounded-[12px] border px-2 py-1.5 text-center text-sm font-semibold leading-tight transition-colors ${customSize ? "border-charcoal bg-charcoal text-cloud" : "border-edge bg-wash text-charcoal hover:border-charcoal/40"}`}
              >
                Custom Size
              </button>
              {sampleOffered && (
                <button
                  type="button"
                  onClick={() => { engage(); setSampleOpen(true); }}
                  className="min-h-12 rounded-[12px] border border-edge bg-wash px-2 py-1.5 text-center text-charcoal transition-colors hover:border-charcoal/40"
                >
                  <span className="block text-sm font-semibold leading-tight">Sample</span>
                  <span className="block text-[0.65rem] leading-tight text-mist">see it first</span>
                </button>
              )}
            </div>
            <p className="mt-2 text-[0.7rem] leading-relaxed text-slate">
              {activePreset
                ? `Your wallpaper will be made at ${activePreset.label}. Choose Custom Size for different dimensions.`
                : customSize
                  ? "Use your own measurements for an exact price."
                  : "Choose a preset or enter your own measurements with Custom Size."}
            </p>
          </div>
          <div id="custom-wall-dimensions" hidden={!customSize}>
          <p className="mb-3 text-xs text-mist">
            Enter your width and height in feet and inches. Leave inches at zero for whole feet. Your area and price update automatically.
          </p>
          {arMeasure && <button
            type="button"
            onClick={() => setMeasureOpen(true)}
            className="btn btn-ghost mb-4 flex w-full items-center justify-center gap-2 text-sm"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13.5" r="3.4" /></svg>
            Measure with your phone
          </button>}
          <div className="space-y-4">
            <div>
              <span className="mb-1.5 block text-xs font-medium text-mist">Width</span>
              <div className="grid grid-cols-2 gap-2">
                <NumField name="Width" label="ft" value={widthGiven ? widthFeet : ""} onChange={(v) => { if (!widthGiven) setWidthInches(0); setWidthGiven(true); setWidthFeet(v); syncHeightToWidth(v * 12 + (widthGiven ? widthInches : 0)); }} />
                <NumField name="Width" label="in" value={widthGiven ? widthInches : ""} onChange={(v) => { if (!widthGiven) setWidthFeet(0); setWidthGiven(true); setWidthInches(v); syncHeightToWidth((widthGiven ? widthFeet : 0) * 12 + v); }} max={11} step="0.5" />
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-medium text-mist">Height</span>
              <div className="grid grid-cols-2 gap-2">
                <NumField name="Height" label="ft" value={heightGiven ? heightFeet : ""} onChange={(v) => { if (!heightGiven) setHeightInches(0); setHeightGiven(true); setHeightFeet(v); syncWidthToHeight(v * 12 + (heightGiven ? heightInches : 0)); }} />
                <NumField name="Height" label="in" value={heightGiven ? heightInches : ""} onChange={(v) => { if (!heightGiven) setHeightFeet(0); setHeightGiven(true); setHeightInches(v); syncWidthToHeight((heightGiven ? heightFeet : 0) * 12 + v); }} max={11} step="0.5" />
              </div>
            </div>

            {/* Keep the artwork's own shape. Named with the REAL ratio rather
                than a generic "lock proportions", because "2:1" is the thing
                the design was made at and the thing worth protecting. */}
            {lockable && (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-[12px] border border-edge bg-wash/60 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={lockRatio}
                  onChange={(e) => {
                    setLockChoice(e.target.checked);
                    // Turning it on corrects the shape immediately, keeping the
                    // width they already chose — otherwise the box reads "on"
                    // while the size on screen is still the old shape.
                    if (e.target.checked && artAspect) {
                      setTotalIn((widthFeet * 12 + widthInches) / artAspect, setHeightFeet, setHeightInches);
                      if (widthGiven) setHeightGiven(true);
                    }
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-charcoal"
                />
                <span className="text-xs leading-snug">
                  <span className="font-semibold">Keep the artwork&apos;s {ratioLabel} shape</span>
                  <span className="block text-mist">
                    Optional: choosing this changes your height to match the artwork. Leave it off to keep
                    your exact wall size and position the crop in the next step.
                  </span>
                </span>
              </label>
            )}

            {wallTooBig ? (
              <p role="alert" className="rounded-[12px] border border-alert/40 bg-blush/40 px-3 py-2.5 text-xs font-semibold text-alert">
                That&apos;s larger than any single wall we print online (up to {MAX_SIDE_FT} ft a side, {MAX_ORDER_SQFT.toLocaleString("en-IN")} sq ft
                in all). Check the numbers — or <a href="/contact" className="underline">contact us</a> for a wall this size.
              </p>
            ) : wallLarge ? (
              <p role="status" className="rounded-[12px] bg-wash/60 px-3 py-2.5 text-xs font-semibold text-charcoal">
                Check this — that&apos;s a very large wall ({widthFeet}′{widthInches}″ × {heightFeet}′{heightInches}″).
              </p>
            ) : null}

            <p className="text-xs text-slate">
              Enter your exact wall size — we cut the mural to fit.{" "}
              <a href="/how-to-measure" target="_blank" rel="noopener noreferrer" className="link-underline">
                How to measure
              </a>
            </p>
            <details className="mt-3 rounded-[12px] bg-wash/60 px-3 py-2.5 text-xs text-slate">
              <summary className="cursor-pointer font-semibold text-charcoal">How exactly should I measure?</summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>Measure the full wall at the widest and tallest points, including behind furniture.</li>
                <li>Start at the top of the skirting. Ignore sockets and switches; the fitter trims around them.</li>
                <li>Round up to the nearest inch. We add about 5 cm of fitting trim at the top and bottom.</li>
              </ul>
              <p className="mt-2">Doors, windows and sloped ceilings? Open “Walls, doors &amp; divisions” below or ask us to check the measurements.</p>
            </details>
          </div>
          </div>
        </div>
      )}


      </div>
      <div hidden={step !== STEP_REVIEW} className="space-y-5">
      {/* The buying decision first; the invoice calculation stays expandable. */}
      <div className="rounded-[22px] bg-wash p-5">
        <h3 className="font-display text-xl font-semibold">{productTitle}</h3>
        <p className="mt-2 text-lg font-semibold text-charcoal">{wallLabel}</p>
        {(isCanvas || textOverlay) && <p className="mt-1 text-sm text-slate">{isCanvas ? material?.name : null}{textOverlay ? `${isCanvas ? " · " : ""}“${textOverlay.text}”` : ""}{textOverlay?.companion ? ` · “${textOverlay.companion.text}”` : ""}</p>}
        {!isCanvas && <p className="mt-1 text-sm text-slate">{installActive ? "Professional installation included" : "Wallpaper only · installation not added"}</p>}
        <div className="mt-4 flex items-end justify-between gap-3 border-t border-edge pt-4">
          <span className="text-sm text-slate">Total · incl. tax</span>
          <span className="font-display text-3xl font-extrabold tracking-tight">{marketTotalLabel}</span>
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-slate underline underline-offset-2">Price breakdown</summary>
        {sqft > 0 && material && (
          <MarketInvoiceBreakdown
            className="mt-4 border-t border-edge pt-4"
            areaSqFt={billed * qty}
            tubeCount={qty}
            infoRows={[{
              label: isCanvas ? "Finished size" : "Your wall",
              value: isCanvas
                ? `${widthFeet} ft × ${heightFeet} ft`
                : `${widthFeet} ft ${widthInches} in × ${heightFeet} ft ${heightInches} in · ${
                    hasExclusions
                      ? `${fullSqft.toFixed(2)} sq ft, ${billed.toFixed(2)} billed (openings excluded)`
                      : minimumsApplied
                        ? `${sqft.toFixed(2)} sq ft, billed as ${billed.toFixed(2)} (our minimum)`
                        : `${sqft.toFixed(2)} sq ft`
                  }`,
            }]}
            lines={[
              { label: `${isCanvas ? (isAdhesiveMedium ? "Self-adhesive piece" : "Canvas artwork") : "Wallpaper"}${isCanvas ? ` (${material.name})` : ""}${qty > 1 ? ` × ${qty}` : ""}`, incl: materialTotal },
              ...(installActive && installTotal > 0
                ? [{ label: "Professional installation", incl: installTotal }]
                : []),
              ...(nameFee > 0 ? [{ label: "Child's name personalisation", incl: nameFee }] : []),
            ]}
          />
        )}

        {/* Small-order honesty — say it here, never spring it at checkout. */}
        {minimumsApplied && (
          <p className="mt-3 text-[0.8rem] leading-relaxed text-slate">
            Small pieces are billed at our minimum of {MIN_WALLPAPER_SQFT} sq ft
            (minimum billed width {MIN_PRINT_WIDTH_FT} ft) — your wallpaper is
            still made to your exact wall size, and shipping stays free.
          </p>
        )}
        </details>
      </div>

      {/* The women-entrepreneurs contribution is NOT shown here, in the cart or
          at checkout (Roheena, 11 October 2026): before payment it reads as a
          charity ask and puts buyers off. It appears once, on the thank-you
          screen after the order is paid — see checkout/page.tsx. */}

      </div>
      <div hidden={step !== STEP_MATERIAL} className="space-y-5">
      {/* material — canvas has a single non-priced media (rolled, framed at home).
          One available option is not a choice: name it in a line rather than
          rendering a picker with nothing to pick. */}
      {isCanvas && <div>
        <p className="caps mb-3 text-slate">Artwork</p>

        {materials.length === 1 ? (
          <p className="text-sm text-slate">
            <span className="font-semibold text-charcoal">{material?.name}</span>
            {material?.description ? ` — ${material.description}` : ""}
          </p>
        ) : (
        <div className={stacked ? "grid gap-2.5" : "flex flex-wrap gap-2"}>
          {materials.map((m, i) => (
            <button
              key={m.slug}
              disabled={m.comingSoon}
              onClick={() => !m.comingSoon && setMaterialSlug(m.slug)}
              className={`flex items-center justify-between gap-3 rounded-[14px] border-2 px-4 py-3.5 text-left transition-all ${
                stacked ? "w-full" : "min-w-[9rem] flex-1"
              } ${
                m.comingSoon
                  ? "cursor-not-allowed border-edge bg-wash opacity-60"
                  : m.slug === materialSlug
                    ? `border-charcoal shadow-sm ${stacked ? MATERIAL_TINTS[i % MATERIAL_TINTS.length] : "bg-surface"}`
                    : `border-edge hover:border-slate ${stacked ? MATERIAL_TINTS[i % MATERIAL_TINTS.length] : "bg-surface"}`
              }`}
            >
              <span className="flex min-w-0 items-center gap-3">
                {m.swatchUrl && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSwatchZoom(m);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        setSwatchZoom(m);
                      }
                    }}
                    className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[10px] border border-edge shadow-sm ring-offset-1 transition hover:ring-2 hover:ring-charcoal/30 cursor-pointer"
                    aria-label={`Zoom ${m.name} texture`}
                    style={{ backgroundImage: `url(${m.swatchUrl})`, backgroundSize: "cover", backgroundPosition: "center" }}
                  />
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{m.name}</span>
                  {m.description && (
                    <span className="mt-0.5 block text-xs text-slate">{m.description}</span>
                  )}
                  {!isCanvas && sizeGiven && m.pricePerSqFt > entryMaterialRate && <span className="mt-1 block text-xs font-semibold text-charcoal">Adds {formatMarketMoney(quote(Math.round(billed * m.pricePerSqFt), billed).total - quote(Math.round(billed * entryMaterialRate), billed).total, market.currency)} for this wall</span>}
                </span>
              </span>
              {m.comingSoon ? (
                <span className="ml-4 shrink-0 rounded-full bg-mist/30 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wide text-slate">
                  Coming soon
                </span>
              ) : isCanvas ? null : (
                <span className="ml-4 shrink-0 text-sm text-slate">
                  {money(m.pricePerSqFt)}<span className="text-mist">/sqft</span>
                </span>
              )}
            </button>
          ))}
        </div>
        )}
      </div>}

      {/* Lettering — optional, so folded away rather than a step of its own.
          The editor inside is exactly the one the old "Add words" step held,
          and it writes the same textOverlay state: CropData.textOverlay and
          .personalisation (the child's-name fee) reach the cart and the print
          pipeline unchanged. A finished fixed-size artwork takes no lettering,
          so it isn't offered there at all. */}
      {image && !isFixedSize && (
        <div className="rounded-[14px] border border-edge bg-surface">
          <button
            type="button"
            aria-expanded={showLettering}
            aria-controls="lettering-panel"
            onClick={() => setLetteringOpen((v) => !v || !!textOverlay)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-semibold"
          >
            <span>{showLettering ? "Name or quote" : "+ Add a name or quote"}</span>
            <span className="text-xs font-normal text-mist">Optional</span>
          </button>
          {showLettering && (
            <div id="lettering-panel" className="space-y-4 border-t border-edge px-4 pb-4 pt-3">
            {textOverlay?.companion && <div className="flex gap-2" role="group" aria-label="Choose lettering to edit">
              <button type="button" className="btn btn-ghost" aria-pressed={activeLettering === "name"} onClick={() => setActiveLettering("name")}>Edit name</button>
              <button type="button" className="btn btn-ghost" aria-pressed={activeLettering === "quote"} onClick={() => setActiveLettering("quote")}>Edit quote</button>
            </div>}
            {activeLettering === "quote" && textOverlay?.companion ? <TextOverlayEditor
              companionEditor value={textOverlay.companion}
              onChange={o => { setTextOverlay({ ...textOverlay, companion: o ?? undefined }); setRoomComposite(null); if (!o) setActiveLettering("name"); }}
              cloudAllowed={false} feeLabel={money(NAME_FEE)} error={companionPreview.error || textError || null}
              previewReady={!!companionPreview.url} retry={companionPreview.retry} />
            : <TextOverlayEditor value={textOverlay} onChange={o => { setTextOverlay(o); setRoomComposite(null); }}
              cloudAllowed={!!nameAudience && market.countryCode === "IN"} feeLabel={money(NAME_FEE)} error={textError ?? null}
              previewReady={!!textPreview.url} retry={textPreview.retry} />}
            {textOverlay?.kind === "cloud" && !textOverlay.companion && <button type="button" className="btn btn-ghost w-full"
              onClick={() => { setTextOverlay({ ...textOverlay, companion: { ...defaultTextOverlay("quote"), y: .65 } }); setActiveLettering("quote"); }}>
              + Add a quote as well
            </button>}
            </div>
          )}
        </div>
      )}

      {/* installation add-on — only for walls of 80 sq ft and above, and only in
          the cities where we have an installer (confirmed by pincode) */}
      {installEligible ? (
        <div
          className={`rounded-[14px] border-2 px-4 py-3.5 transition-all ${
            installActive ? "border-charcoal bg-surface shadow-sm" : "border-edge bg-surface"
          }`}
        >
          {/* On a phone the rate sits under the text, indented to it: as a
              right-hand column it took half the width and squeezed the copy
              to two words a line. */}
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <button
              type="button"
              onClick={() => {
                if (installArea.serviceable) return setInstallOn((v) => !v);
                installPinRef.current?.focus();
              }}
              aria-pressed={installActive}
              aria-describedby={installArea.serviceable ? undefined : "install-pin-first"}
              className="flex min-w-0 flex-1 items-start gap-3 text-left"
            >
              <span
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border-2 ${
                  installActive
                    ? "border-charcoal bg-charcoal text-surface"
                    : installArea.serviceable
                      ? "border-slate"
                      : "border-mist/60"
                }`}
                aria-hidden
              >
                {installActive && (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="m4 8 2.5 2.5L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span>
                <span className={`block text-sm font-semibold ${installArea.serviceable ? "" : "text-slate"}`}>
                  Add professional installation
                </span>
                <span className="mt-0.5 block text-xs text-slate">
                  Optional installation at your home
                </span>
                {!installArea.serviceable && (
                  <span
                    id="install-pin-first"
                    className="mt-1.5 block text-xs text-slate"
                  >
                    Enter your PIN code to check availability, then choose whether to add installation.
                  </span>
                )}
              </span>
            </button>
            <span className="pl-8 text-sm text-slate sm:ml-4 sm:shrink-0 sm:pl-0 sm:text-right">
              {INSTALL_RATE_LABEL}
              {installActive && installTotal > 0 && (
                <span className="mt-0.5 block text-[0.7rem] font-semibold text-charcoal">
                  +{money(installTotal)} <span className="font-normal text-mist">incl. GST</span>
                </span>
              )}
            </span>
          </div>

          {/* serviceability check — the pincode is what decides */}
          <div className="mt-3 border-t border-edge pt-3">
            {installArea.serviceable ? (
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-charcoal">
                <span className="font-semibold text-charcoal">✓ Available in {installArea.city}</span>
                <span className="text-mist">({installPin})</span>
                <button
                  type="button"
                  onClick={() => {
                    setInstallPin("");
                    setInstallOn(false);
                    try { sessionStorage.removeItem("zyv:install-pin"); } catch {}
                  }}
                  className="text-slate underline underline-offset-2 hover:text-charcoal"
                >
                  Change PIN code
                </button>
              </p>
            ) : (
              <>
                <label htmlFor="install-pin" className="block text-xs text-slate">
                  Enter your PIN code to check installation availability:
                </label>
                <input
                  id="install-pin"
                  ref={installPinRef}
                  inputMode="numeric"
                  maxLength={6}
                  value={installPin}
                  onChange={(e) => setInstallPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit PIN code"
                  className="mt-2 h-10 w-40 rounded-[10px] border border-edge bg-surface px-3 text-sm outline-none focus:border-charcoal"
                />
                {installArea.reason === "out_of_area" && (
                  <p className="mt-2 text-xs text-charcoal/80">
                    Installation is currently unavailable at {installPin}. You can continue with your wallpaper order.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      ) : !isCanvas && (
        <div className="rounded-[14px] border border-edge bg-surface px-4 py-3.5 text-sm text-slate">
          <p className="font-semibold text-charcoal">Installation for this wall</p>
          <p className="mt-1">{market.countryCode !== "IN" ? "MimiPip installation is currently available only in selected Indian cities." : `Our optional installation service starts at ${INSTALL_MIN_SQFT} sq ft.`} You can continue with your wallpaper order.</p>
        </div>
      )}

      </div>
      <div hidden={step !== STEP_REVIEW} className="space-y-5">
      <details className="rounded-[14px] border border-edge px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold text-charcoal">Delivery, returns &amp; help</summary>
        <div className="mt-3 space-y-3 text-xs leading-relaxed text-slate">
          <p>{isCanvas ? "Your artwork comes in the finished size you selected." : "Your wallpaper is sized to your wall in your selected finish."}</p>
          <p>Made to order: cancel within 12 hours if production has not started. Once production starts, change-of-mind returns are unavailable. Damage and production faults have separate remedies in the <a className="underline" href="/refund-policy">refund policy</a>.</p>
          <a className="inline-block underline underline-offset-2" href={`/contact?question=${encodeURIComponent(`${productTitle}, ${wallLabel}${material ? `, ${material.name}` : ""}`)}`}>Ask about this design and size</a>
        </div>
      </details>
      {!untouched && !plainCatalogue && (
        <details className="rounded-[14px] border border-edge px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-charcoal">Artwork &amp; personalisation details</summary>
          <div className="mt-3 space-y-3 text-xs leading-relaxed text-slate">
            <p>Check spelling, placement and the edges of your crop in the preview. A room preview cannot confirm colour or remove defects in the original artwork.</p>
            {uploadedSource && quality && <p>Your image at this size: {quality.ppi} pixels per inch. {quality.band === "review" ? "Fine detail may appear soft. Use a larger original or request an artwork review before ordering." : "A sample helps you judge the detail and finish."}</p>}
            <a href="/contact" className="inline-block underline">Ask for an artwork review</a>
          </div>
        </details>
      )}

      {/* composition approval — required before Add to Cart whenever the
          customer changed anything (see `untouched` above) */}
      {sqft > 0 && !untouched && (
        <label
          ref={approvalRef}
          className={`flex cursor-pointer items-start gap-3 rounded-[14px] border-2 px-4 py-3.5 text-left transition-all ${
            approved
              ? "border-charcoal bg-surface"
              : triedSubmit
                ? "border-alert bg-alert/5"
                : "border-edge bg-surface hover:border-slate"
          }`}
        >
          <span
            className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border-2 ${
              approved
                ? "border-charcoal bg-charcoal text-surface"
                : triedSubmit
                  ? "border-alert"
                  : "border-slate"
            }`}
            aria-hidden
          >
            {approved && (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="m4 8 2.5 2.5L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <span className="text-sm">
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked && nameReady)}
              disabled={!nameReady}
              required
              aria-invalid={triedSubmit && !approved}
              className="sr-only"
            />
            <span className="font-medium text-charcoal">
              {plainCatalogue ? (
                "Yes"
              ) : (
                <>
                  Print my design and lettering as shown.
                </>
              )}
              <span aria-hidden className="text-alert">*</span>
            </span>
            {triedSubmit && !approved && (
              <span className="mt-1.5 block text-xs font-semibold text-alert">
                Tick this box to confirm the composition — it&apos;s the last step before adding to cart.
              </span>
            )}
            {isCanvas && (
              <span className="mt-1 block text-xs text-slate">
                {isAdhesiveMedium
                  ? "Arrives as a single self-adhesive piece, shipped rolled — peel and apply."
                  : "Arrives as a single piece, shipped rolled."}
              </span>
            )}
          </span>
        </label>
      )}

      </div>
      </div>
      <div className="guided-footer">
      {step < STEP_REVIEW ? <div className="flex items-center justify-between gap-3">
        {step > 0 && <button type="button" className="btn btn-ghost" onClick={() => goToStep(step - 1)}>Back</button>}
        <button type="button" className="btn guided-next flex-1" disabled={!(widthCm > 0 && heightCm > 0) || (step === 0 && !sizeGiven) || (step === STEP_MATERIAL && !nameReady)}
          onClick={() => goToStep(step + 1)}>Continue to Step {step + 2}</button>
      </div> : <button type="button" className="mb-2 text-sm underline" onClick={() => goToStep(STEP_MATERIAL)}>← Back to {isCanvas ? "artwork" : "installation"}</button>}
      <div hidden={step !== STEP_REVIEW}>
      {/* quantity + actions — sticks to the bottom of the viewport for the whole
          length of the configurator, so the price and the way forward are never
          scrolled off. Sticky rather than fixed: it occupies its own space in
          the column, so nothing underneath is covered. */}
      <div ref={stickyBarRef} className="sticky bottom-0 z-30 -mx-1 border-t border-edge bg-cloud/95 px-1 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-12 shrink-0 items-center overflow-hidden rounded-full border border-edge bg-surface">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="grid h-full w-12 place-items-center text-lg text-slate hover:text-charcoal"
              aria-label="Decrease quantity"
            >
              &minus;
            </button>
            <span className="w-8 text-center text-sm font-semibold tabular-nums">{qty}</span>
            <button
              onClick={() => setQty((q) => Math.min(maxQty ?? Number.MAX_SAFE_INTEGER, q + 1))}
              className="grid h-full w-12 place-items-center text-lg text-slate hover:text-charcoal"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          {/* Deliberately NOT disabled while something is outstanding — pressing
              it is how the customer finds out what's left. Only a sold-out
              edition or an in-flight add actually blocks the press. */}
          {/* h-auto + leading-snug: .btn is a fixed 3.2rem, and beside the
              quantity stepper on a phone the label wraps — "Confirm the
              composition to continue" ran to three lines with the third cut
              off by the pill (founder, 7 October 2026). The button grows with
              its text, and the waiting-state labels are short. */}
          <button
            className={`btn h-auto min-h-[3.2rem] flex-1 px-4 py-2 text-center leading-snug ${!canAdd && !soldOut ? "opacity-60" : ""}`}
            disabled={adding || soldOut || total <= 0}
            aria-disabled={!canAdd}
            onClick={addToCart}
          >
            {soldOut
              ? "Edition sold out"
              : adding
                ? (editItemId ? "Updating…" : "Adding…")
                : added
                  ? "Add another"
                  : canAdd
                    ? partner
                      ? `Save to project · ${marketTotalLabel}`
                      : `${editItemId ? "Update cart" : "Add to Cart"} · ${marketTotalLabel}`
                    : needsName
                      ? "Finish lettering to continue"
                      : "Tick the box to continue"}
          </button>
        </div>
        {/* Names what is still outstanding, and offers to jump straight to it. */}
        {blockers.length > 0 && !added && (
          <button
            type="button"
            onClick={addToCart}
            className={`mt-2 block w-full text-left text-xs ${triedSubmit ? "font-semibold text-alert" : "text-slate"}`}
          >
            <Required /> Still to do: {blockers.join(" and ")} — tap to go there.
          </button>
        )}
      </div>

      </div>
      {orderError && (
        <p className="rounded-[12px] bg-blush/50 px-4 py-3 text-sm text-charcoal">{orderError}</p>
      )}

      {partner && savedProject && (
        <div className="flex items-center justify-between gap-3 rounded-[14px] bg-sage/50 px-4 py-3.5 text-sm">
          <span className="flex items-center gap-2 font-semibold">
            <CheckIcon /> Saved to {savedProject.customer_name}&rsquo;s project
          </span>
          <Link href={`${partner.home}/projects`} className="text-xs font-semibold underline underline-offset-2">
            Open projects
          </Link>
        </div>
      )}
      <SaveToProject
        wall={projectDialog}
        open={projectDialog !== null}
        onClose={() => setProjectDialog(null)}
        onSaved={(p) => { setProjectDialog(null); setSavedProject(p); }}
      />
      {added && !partner && (
        <div className="flex items-center justify-between gap-3 rounded-[14px] bg-sage/50 px-4 py-3.5 text-sm">
          <span className="flex items-center gap-2 font-semibold">
            <CheckIcon /> Added to your cart
          </span>
          <span className="flex gap-3 text-xs font-semibold">
            <Link href="/cart" className="underline underline-offset-2">View cart</Link>
            <Link href="/checkout" className="underline underline-offset-2">Checkout</Link>
          </span>
        </div>
      )}
      </div>
      <div className="guided-extras">
      {!isCanvas && (
        <details className="mt-5 rounded-[18px] border border-edge bg-surface p-4">
          <summary className="cursor-pointer text-sm font-semibold text-charcoal">
            For architects &amp; installers — technical details
          </summary>
          <div className="mt-4 space-y-4">
            <p className="text-xs text-slate">Panel sizes, joins, fitting allowances and wall planning. Your order PDF also includes panel information and installation instructions.</p>
      {/* walls, doors & divisions — planning overlays for made-to-measure runs */}
      {!readySizes?.length && sqft > 0 && (
        <details className="rounded-[18px] border border-alert/25 bg-blush/40 p-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="cursor-pointer list-none">
            <span className="caps text-charcoal">Walls, doors &amp; divisions</span>
            <span className="mt-1 block text-xs text-slate">
              Papering more than one wall, or working around a door or a bed? Add them and we&apos;ll plan the
              panels and joins around them.
            </span>
          </summary>

          <div className="mt-4 space-y-5">
            {/* extra walls → one continuous run */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-charcoal">More walls (one continuous run)</span>
                <button type="button" onClick={() => setExtraWalls((w) => [...w, Math.round(widthCm)])} className="text-xs font-semibold text-charcoal underline underline-offset-2 hover:text-slate">
                  + Add wall
                </button>
              </div>
              <p className="mt-1 text-[0.7rem] text-mist">
                Wall 1 is your size above. Each wall you add extends the run; a corner joint falls at every seam.
              </p>
              {extraWalls.map((w, i) => (
                <div key={i} className="mt-2 flex items-center gap-2 text-xs">
                  <span className="w-14 text-slate">Wall {i + 2}</span>
                  <NumberBox
                    inputMode="decimal" min={0} step="0.1"
                    value={Number((w / CM_PER_FOOT).toFixed(1))}
                    onValue={(v) => setExtraWalls((ws) => ws.map((x, j) => (j === i ? v * CM_PER_FOOT : x)))}
                    className="w-20 rounded-[10px] border border-edge bg-surface px-2 py-1 outline-none focus:border-charcoal"
                  />
                  <span className="text-mist">ft wide</span>
                  <button type="button" onClick={() => setExtraWalls((ws) => ws.filter((_, j) => j !== i))} className="ml-auto text-mist hover:text-charcoal" aria-label="Remove wall">✕</button>
                </div>
              ))}
              {multiWall && (
                <p className="mt-2 text-[0.7rem] text-slate">
                  Total run <span className="font-semibold text-charcoal">{(runWidthCm / CM_PER_FOOT).toFixed(1)} ft</span> ·{" "}
                  {autoDivisions.length} corner joint{autoDivisions.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>

            {/* doors, windows & openings */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-charcoal">Doors, windows &amp; headboards</span>
                <span className="flex flex-wrap gap-x-3 gap-y-1">
                  <button type="button" onClick={() => setDoors((d) => [...d, { widthCm: 90, heightCm: 210, offsetCm: Math.max(0, Math.round(runWidthCm / 2 - 45)) }])} className="text-xs font-semibold text-charcoal underline underline-offset-2 hover:text-slate">
                    + Add door
                  </button>
                  <button type="button" onClick={() => setDoors((d) => [...d, { widthCm: 120, heightCm: 120, sillCm: 90, offsetCm: Math.max(0, Math.round(runWidthCm / 2 - 60)) }])} className="text-xs font-semibold text-charcoal underline underline-offset-2 hover:text-slate">
                    + Add window
                  </button>
                  <button type="button" onClick={() => setDoors((d) => [...d, newHeadboard(runWidthCm, heightCm)])} className="text-xs font-semibold text-charcoal underline underline-offset-2 hover:text-slate">
                    + Add headboard
                  </button>
                </span>
              </div>
              {placedDoors.map((d, i) => {
                const headboard = isHeadboard(d);
                // A headboard is re-placed on every edit, so the state never
                // holds one off the floor or past the wall's edge.
                const upd = (patch: Partial<(typeof doors)[number]>) =>
                  setDoors((ds) => ds.map((x, j) => (j !== i ? x : headboard ? placeHeadboard({ ...x, ...patch }, runWidthCm, heightCm) : { ...x, ...patch })));
                const ftVal = (cm: number) => Number((cm / CM_PER_FOOT).toFixed(1));
                const isWindow = d.sillCm != null;
                const kindOf = (x: (typeof doors)[number]) => (isHeadboard(x) ? "Headboard" : x.sillCm != null ? "Window" : "Door");
                const label = `${kindOf(d)} ${placedDoors.slice(0, i + 1).filter((x) => kindOf(x) === kindOf(d)).length}`;
                // Position is stored from the left; a customer measuring from
                // the right sees and types the right-hand distance instead.
                const fromRight = d.side === "right";
                const posCm = fromRight ? Math.max(0, runWidthCm - d.offsetCm - d.widthCm) : d.offsetCm;
                const setPos = (cm: number) => upd({ offsetCm: fromRight ? Math.max(0, runWidthCm - cm - d.widthCm) : cm });
                // Honest, per-door: does this mark change the print and the
                // price, or is it a planning overlay like before?
                const savedSqft = openingsPlan.perDoorSavedSqft[i] ?? 0;
                const qualifies = openingsPlan.qualifyingDoors.includes(i);
                const disqualified = openingsPlan.disqualifiedDoors.includes(i);
                // Only the part of this door's area that survives the billing
                // floor actually comes off the price. Installation is unfloored,
                // so its saving is the real area either way.
                const billedSavedSqft = savedSqft * realisedExclusionFrac;
                const savedInr = material
                  ? Math.round(billedSavedSqft * material.pricePerSqFt * qty) +
                    (installActive ? Math.round(savedSqft * INSTALL_RATE_EX_GST * qty * 1.18) : 0)
                  : 0;
                const status = isWindow
                  ? "Planning mark — drawn for the installer; the mural covers this area in full and is trimmed around the window on site."
                  : qualifies && savedSqft > 0
                  ? savedInr > 0
                    ? `Excluded from the mural & price — you save ${money(savedInr)} (−${billedSavedSqft.toFixed(1)} sq ft billed). The panel above it stops short and is trimmed on site.`
                    : `Excluded from the mural — your wall is already at our ${MIN_WALLPAPER_SQFT} sq ft minimum billing, so leaving it out doesn't reduce the price. The panel above it still stops short and is trimmed on site.`
                  : qualifies
                    ? "Excluded together with the adjacent opening."
                    : disqualified
                      ? "Too close to the wall's edge or another opening to leave a workable strip — this area is covered in full and is charged."
                      : `Planning mark only — too small to skip (openings ${Math.round(QUALIFY_MIN_WIDTH_CM / 30.48 * 10) / 10} ft wide reaching ${Math.round(QUALIFY_MIN_HEIGHT_FRAC * 100)}% of the wall's height are left out of the mural & price automatically).`;
                return (
                  <div key={i} className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate">{label}</span>
                    <label className="flex items-center gap-1">W
                      <NumberBox inputMode="decimal" min={0} step="0.1" value={ftVal(d.widthCm)} aria-label={`${label} width in feet`} onValue={(v) => upd({ widthCm: v * CM_PER_FOOT })} className="w-14 rounded-[10px] border border-edge bg-surface px-2 py-1 outline-none focus:border-charcoal" />ft
                    </label>
                    <label className="flex items-center gap-1">H
                      <NumberBox inputMode="decimal" min={0} step="0.1" value={ftVal(d.heightCm)} aria-label={`${label} height in feet`} onValue={(v) => upd({ heightCm: v * CM_PER_FOOT })} className="w-14 rounded-[10px] border border-edge bg-surface px-2 py-1 outline-none focus:border-charcoal" />ft
                    </label>
                    {isWindow && (
                      <label className="flex items-center gap-1" title="Height of the window's bottom edge (sill) above the floor">sill
                        <NumberBox inputMode="decimal" min={0} step="0.1" value={ftVal(d.sillCm ?? 0)} aria-label={`${label} sill height above the floor in feet`} onValue={(v) => upd({ sillCm: v * CM_PER_FOOT })} className="w-14 rounded-[10px] border border-edge bg-surface px-2 py-1 outline-none focus:border-charcoal" />ft
                      </label>
                    )}
                    {headboard ? (
                    <label className="flex items-center gap-1">from left
                      <NumberBox inputMode="decimal" min={0} step="0.1" value={ftVal(d.offsetCm)} aria-label={`${label} distance from the wall's left edge in feet`} onValue={(v) => upd({ offsetCm: v * CM_PER_FOOT })} className="w-14 rounded-[10px] border border-edge bg-surface px-2 py-1 outline-none focus:border-charcoal" />ft
                    </label>
                    ) : (
                    <label className="flex items-center gap-1">
                      <select value={fromRight ? "right" : "left"} aria-label={`${label} position measured from`} onChange={(e) => upd({ side: e.target.value === "right" ? "right" : "left" })} className="rounded-[10px] border border-edge bg-surface px-1 py-1 outline-none focus:border-charcoal">
                        <option value="left">from left</option>
                        <option value="right">from right</option>
                      </select>
                      <NumberBox inputMode="decimal" min={0} step="0.1" value={ftVal(posCm)} aria-label={`${label} distance from the wall's ${fromRight ? "right" : "left"} edge in feet`} onValue={(v) => setPos(v * CM_PER_FOOT)} className="w-14 rounded-[10px] border border-edge bg-surface px-2 py-1 outline-none focus:border-charcoal" />ft
                    </label>
                    )}
                    <button type="button" onClick={() => setDoors((ds) => ds.filter((_, j) => j !== i))} className="ml-auto text-mist hover:text-charcoal" aria-label={`Remove ${label.toLowerCase()}`}>✕</button>
                    {headboard && (
                      <span className="w-full text-[0.68rem] text-slate">Sits on the floor. Drag it or set its distance from the left.</span>
                    )}
                    {OPENING_EXCLUSION_ENABLED && !isFixedSize && (
                      <span className={`w-full text-[0.68rem] ${qualifies ? "font-medium text-charcoal" : "text-mist"}`}>{status}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* manual divisions / seam lines */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-charcoal">Divisions / seam lines</span>
                <button type="button" onClick={() => setManualDivisions((x) => [...x, Math.round(runWidthCm / 2)])} className="text-xs font-semibold text-charcoal underline underline-offset-2 hover:text-slate">
                  + Add division
                </button>
              </div>
              {manualDivisions.map((d, i) => (
                <div key={i} className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-slate">Division {i + 1}</span>
                  <NumberBox
                    inputMode="decimal" min={0} step="0.1"
                    value={Number((d / CM_PER_FOOT).toFixed(1))}
                    onValue={(v) => setManualDivisions((xs) => xs.map((x, j) => (j === i ? v * CM_PER_FOOT : x)))}
                    className="w-20 rounded-[10px] border border-edge bg-surface px-2 py-1 outline-none focus:border-charcoal"
                  />
                  <span className="text-mist">ft from left</span>
                  <button type="button" onClick={() => setManualDivisions((xs) => xs.filter((_, j) => j !== i))} className="ml-auto text-mist hover:text-charcoal" aria-label="Remove division">✕</button>
                </div>
              ))}
            </div>

            <p className="text-[0.68rem] text-mist">
              {hasExclusions
                ? realisedExclusionFrac > 0
                  ? `Large openings marked above are left out of the mural and your price (−${openingsPlan.excludedSqft.toFixed(1)} sq ft). Windows, smaller marks and divisions are planning-only — those areas are covered in full and trimmed on site.`
                  : `Large openings marked above are left out of the mural (−${openingsPlan.excludedSqft.toFixed(1)} sq ft), though your wall is already at our ${MIN_WALLPAPER_SQFT} sq ft minimum billing so the price doesn't change. Windows, smaller marks and divisions are planning-only — those areas are covered in full and trimmed on site.`
                : OPENING_EXCLUSION_ENABLED && !isFixedSize
                  ? "These are planning marks — your mural still covers the full wall and is trimmed and joined on site. A large floor-to-top opening (2 ft wide reaching 70% of the wall) is left out of the mural and your price automatically; windows always print through."
                  : "These are planning marks — your mural still covers the full wall and is trimmed and joined on site."}
            </p>
          </div>
        </details>
      )}

      {/* panel layout — how the mural physically arrives, shown before purchase.
          A canvas ships as one rolled piece, so it has no panel plan. */}
      {!isCanvas && sqft > 0 && (
        <section className="rounded-[18px] border border-edge p-5">
          <h3 className="caps text-slate">Panel layout &amp; installation</h3>
          <div className="mt-4">
          {hasExclusions ? (() => {
            const n = openingsPlan.panels.length;
            const skipped = openingsPlan.panels.filter((p) => p.skipped).length;
            const short = openingsPlan.panels.filter((p) => p.opening && !p.skipped).length;
            const printed = n - skipped;
            return (
              <>
                <p className="text-sm text-charcoal">
                  Your mural arrives in {printed} numbered panel{printed !== 1 ? "s" : ""}, installed left to right — panel seams sit on your opening&apos;s edges
                  {short > 0 ? `, ${short} panel${short !== 1 ? "s stop" : " stops"} short above the opening` : ""}
                  {skipped > 0 ? `, ${skipped} position${skipped !== 1 ? "s are" : " is"} left out (full-height opening)` : ""}.
                </p>
                {/* The panel spec is the production detail behind the price —
                    "printed" is the accurate word here and stays, unlike the
                    selling copy around it. */}
                <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-sm">
                  <Spec label="Panels" value={skipped ? `${printed} of ${n} positions` : String(n)} />
                  <Spec label="Panel widths" value={openingsPlan.panels.map((p) => `${Math.round(p.widthCm / CM_PER_INCH)}″${p.skipped ? " (skip)" : p.opening ? " (short)" : ""}`).join(" · ")} />
                  <Spec label="Panel order" value={`Numbered 1–${n}, left → right`} />
                  <Spec label="Mural area" value={`${sqft.toFixed(1)} sq ft (wall ${fullSqft.toFixed(1)} sq ft — openings excluded)`} />
                  <Spec label="Seam" value="Pattern-matched overlap join" />
                  <Spec label="Trim allowance" value="~5 cm extra, incl. above openings" />
                </dl>
              </>
            );
          })() : (
            <>
              <p className="text-sm text-charcoal">
                {pieceCount(runWidthCm, panelCm, overlapCm) < 2
                  ? "Your mural arrives as a single panel — no seams to join."
                  : `Your mural will arrive in ${pieceCount(runWidthCm, panelCm, overlapCm)} numbered panels, installed from left to right.`}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-sm">
                <Spec label="Panels" value={String(pieceCount(runWidthCm, panelCm, overlapCm))} />
                <Spec label="Panel width" value={panelWidthSpec(runWidthCm, panelCm, overlapCm)} />
                <Spec label="Panel order" value={pieceCount(runWidthCm, panelCm, overlapCm) < 2 ? "Single panel" : `Numbered 1–${pieceCount(runWidthCm, panelCm, overlapCm)}, left → right`} />
                <Spec label="Starting side" value="Left" />
                <Spec label="Seam" value="Pattern-matched overlap join" />
                <Spec label="Trim allowance" value="~5 cm extra, top & bottom" />
              </dl>
            </>
          )}
          <button onClick={() => gate("download your wall proof", downloadProof)} disabled={proofBusy || !nameReady} className="btn btn-ghost mt-4 text-sm disabled:opacity-50">
            {proofBusy ? "Preparing proof…" : "Download order proof (PDF)"}
          </button>
          </div>
        </section>
      )}

          </div>
        </details>
      )}

      {/* Samples are an India-only ₹200 offer (see SampleOrderModal), so the
          invitation is India-only too — the gallery's on-image pill is gated
          the same way. Offering it abroad walks a dollar-priced shopper into a
          rupee checkout that cannot ship to them. */}
      {/* The swatch button and the WhatsApp line live once, in
          the size step's Sample button (and the gallery pill).
          They were here too, hidden by globals.css; showing both would put the
          same two offers on screen twice. Only the modal stays. */}
      {sampleOffered && (
        <SampleOrderModal open={sampleOpen} onClose={() => setSampleOpen(false)} productHandle={productHandle} productTitle={productTitle} />
      )}
      {!sampleOffered && !isFixedSize && !isCanvas && (
        <p className="text-xs text-slate">
          {market.countryCode === "IN"
            ? "A design sample is not available for this artwork yet. Ask us for close-up photographs before ordering."
            : "Design samples currently ship within India only. Ask us for close-up photographs of this design on the finished material."}{" "}
          <Link href="/contact" className="underline underline-offset-2">Ask for a close-up</Link>
        </p>
      )}

      <WallMeasure
        open={measureOpen}
        onClose={() => setMeasureOpen(false)}
        onResult={(wMm, hMm) => {
          setWidthGiven(true);
          setHeightGiven(true);
          setDimFromMm(wMm, setWidthFeet, setWidthInches);
          setDimFromMm(hMm, setHeightFeet, setHeightInches);
        }}
      />

      {/* material texture close-up */}
      {swatchZoom?.swatchUrl && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-charcoal/60 p-6 backdrop-blur-sm"
          onClick={() => setSwatchZoom(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-[min(420px,100%)] overflow-hidden rounded-[22px] bg-surface" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={swatchZoom.swatchUrl} alt={`${swatchZoom.name} finish texture`} className="aspect-square w-full object-cover" />
            <div className="flex items-start justify-between gap-4 p-5">
              <div>
                <p className="font-display text-lg font-bold">{swatchZoom.name}</p>
                {swatchZoom.description && <p className="mt-1 text-sm text-slate">{swatchZoom.description}</p>}
                <p className="mt-1 text-xs text-mist">
                  Actual finish texture{isCanvas ? "" : ` · ${money(swatchZoom.pricePerSqFt)}/sq ft`}
                </p>
              </div>
              <button onClick={() => setSwatchZoom(null)} className="shrink-0 text-sm text-slate underline underline-offset-2">Close</button>
            </div>
          </div>
        </div>
      )}

      {placed && (
        <div className="rounded-[14px] bg-sky/40 px-4 py-3 text-sm">
          <div className="flex items-center gap-3">
            {roomComposite && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={roomComposite}
                alt="Your room with this design placed"
                className="h-14 w-14 shrink-0 rounded-[10px] object-cover ring-1 ring-charcoal/10"
              />
            )}
            <div className="flex flex-1 items-center justify-between gap-3">
              <span className="flex items-center gap-2 font-medium">
                <CheckIcon /> {isCanvas ? "Artwork placement preview saved" : "Room preview saved — made exactly as framed"}
              </span>
              <span className="flex gap-3 text-xs font-semibold">
                <button
                  onClick={openVisualizer}
                  className="underline underline-offset-2 hover:text-slate"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    setPlaced(false);
                    setRoomComposite(null);
                  }}
                  className="text-slate underline underline-offset-2 hover:text-charcoal"
                >
                  Remove
                </button>
              </span>
            </div>
          </div>
          {roomComposite && (
            // A real button, not another underlined link — "Save placement"
            // above only locks the framing for this order, it doesn't touch
            // the customer's account, and that distinction was getting missed
            // when this was styled the same as the Edit/Remove text links.
            <button
              onClick={() => setSaveBoardOpen(true)}
              className="mt-3 rounded-full bg-charcoal px-4 py-2 text-xs font-semibold text-surface hover:bg-charcoal/90"
            >
              Save to your account →
            </button>
          )}
        </div>
      )}

      {roomComposite && crop && (
        <SaveToBoard
          open={saveBoardOpen}
          onClose={() => setSaveBoardOpen(false)}
          productId={productId}
          imageDataUrl={roomComposite}
          crop={crop}
        />
      )}

      {image && crop && (
        <RoomVisualizer
          textOverlayUrl={textPreview.url}
          companionUrl={companionPreview.url}
          open={visualizerOpen}
          onClose={() => setVisualizerOpen(false)}
          imageUrl={image.url}
          imageAlt={image.alt}
          productHandle={productHandle}
          wallWidthCm={runWidthCm}
          wallHeightCm={heightCm}
          wallLabel={wallLabel}
          seamless={seamless}
          initial={crop}
          textureUrl={material?.textureUrl ?? null}
          initialPhoto={savedRoom?.photo ?? null}
          initialCorners={savedRoom?.corners ?? null}
          initialMids={savedRoom?.mids ?? null}
          onRoomCapture={(photo, corners, mids) => {
            void persistablePhoto(photo).then((kept) => {
              if (!kept) return;
              const next: RoomSession = { photo: kept, corners, mids, widthFt: runWidthCm / CM_PER_FOOT, heightFt: heightCm / CM_PER_FOOT };
              setSavedRoom(next);
              saveRoomSession(next);
            });
          }}
          onApply={(c, composite) => {
            // Room framing shares the same offsets/zoom — merge back so the
            // inline visualiser and the order stay in sync.
            setOffsetX(c.offsetX);
            setOffsetY(c.offsetY);
            setZoom(c.zoom);
            setRoomComposite(composite ?? null);
            setPlaced(true);
            setVisualizerOpen(false);
          }}
        />
      )}

      {authModal}

      <div className="rounded-[18px] bg-sage/40 p-5">
        <ul className="grid gap-2.5 text-[0.8rem] text-slate">
          <li className="flex items-center gap-2.5"><CheckIcon /> {market.countryCode === "IN" ? "Free standard shipping across India" : "International delivery included · duties and customs excluded"}</li>
          {isCanvas ? (
            isAdhesiveMedium ? (
              <>
                <li className="flex items-center gap-2.5"><CheckIcon /> Made to order on smooth self-adhesive media</li>
                <li className="flex items-center gap-2.5"><CheckIcon /> Peels straight onto the wall &middot; no frame, no paste, no fitter</li>
              </>
            ) : (
              <>
                <li className="flex items-center gap-2.5"><CheckIcon /> Made to order on museum-grade fine-art canvas</li>
                <li className="flex items-center gap-2.5"><CheckIcon /> Ships unframed, rolled in a protective tube &middot; frame or stretch it locally</li>
              </>
            )
          ) : (
            <>
              <li className="flex items-center gap-2.5"><CheckIcon /> Made to fit your wall</li>
              <li className="flex items-center gap-2.5"><CheckIcon /> Arrives damaged? We replace it free</li>
            </>
          )}
          <li className="flex items-center gap-2.5"><CheckIcon /> Secure payment by Razorpay</li>
        </ul>
      </div>
      </div>
    </section>
    {/* After the builder, not before it (6 Oct 2026): on a phone this box
        pushed "Create your wall" a full screen below the photo, so the first
        thing a shopper met under the price was a list of side doors. Someone
        who has not measured still finds it straight after step 1. */}
    </>
  );
}


/** The fixed ready-size ladder.
 *  `compact` is the row that sits under the true-scale wall preview — small
 *  enough that the canvas stays on screen while you switch between sizes.
 *  The full-width rows are the made-to-measure page's step 2. */
function ReadySizePicker({
  sizes,
  widthCm,
  heightCm,
  pricePerSqFt,
  onPick,
  compact = false,
  isFixedSize = false,
}: {
  sizes: [number, number][];
  widthCm: number;
  heightCm: number;
  pricePerSqFt: number | null;
  onPick: (wIn: number, hIn: number) => void;
  compact?: boolean;
  /** Fixed-size (canvas/wall-art) sizes price at a clean retail figure, since
   *  their per-sq-ft rate is internal and never shown. A ready-size WALLPAPER
   *  prices at its exact area — its rate is genuinely displayed elsewhere on
   *  the page, so rounding it would contradict that number. */
  isFixedSize?: boolean;
}) {
  const { money } = useMarket();
  const ftLabel = (inches: number) =>
    inches % 12 === 0 ? `${inches / 12} ft` : `${Math.floor(inches / 12)} ft ${inches % 12} in`;

  return (
    <div className={compact ? "flex flex-wrap gap-2" : "grid gap-2"}>
      {sizes.map(([wIn, hIn]) => {
        const wCm = wIn * CM_PER_INCH;
        const hCm = hIn * CM_PER_INCH;
        const selected = Math.round(widthCm) === Math.round(wCm) && Math.round(heightCm) === Math.round(hCm);
        const price = pricePerSqFt != null
          ? money(isFixedSize ? fixedSizePrice(wCm, hCm, pricePerSqFt) : billedPriceFor(wCm, hCm, pricePerSqFt))
          : null;
        const border = selected ? "border-charcoal bg-surface shadow-sm" : "border-edge bg-surface hover:border-slate";

        if (compact) {
          return (
            <button
              key={`${wIn}x${hIn}`}
              onClick={() => onPick(wIn, hIn)}
              aria-pressed={selected}
              className={`min-w-[7rem] flex-1 rounded-[12px] border-2 px-3 py-2 text-left transition-all ${border}`}
            >
              <span className="block text-[0.82rem] font-semibold leading-tight">
                {ftLabel(wIn)} × {ftLabel(hIn)}
              </span>
              <span className="mt-0.5 block text-[0.7rem] text-slate">
                {wIn}″ × {hIn}″{price ? ` · ${price}` : ""}
              </span>
            </button>
          );
        }

        return (
          <button
            key={`${wIn}x${hIn}`}
            onClick={() => onPick(wIn, hIn)}
            aria-pressed={selected}
            className={`flex items-center justify-between gap-3 rounded-[14px] border-2 px-4 py-3.5 text-left transition-all ${border}`}
          >
            <span>
              <span className="block font-semibold">{wIn}″ × {hIn}″</span>
              <span className="block text-xs text-slate">{ftLabel(wIn)} wide × {ftLabel(hIn)} tall</span>
            </span>
            {price && <span className="shrink-0 font-display text-base font-bold">{price}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A number box that keeps the shopper's own text while they type and shows
 *  the tidy value again once they leave it (src/lib/number-draft.ts says why:
 *  a derived value re-rendered per keystroke made sizes impossible to type). */
function NumberBox({
  value,
  onValue,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number | "";
  onValue: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      {...rest}
      type="number"
      value={draft ?? value}
      onFocus={(e) => { setDraft(value === "" ? "" : String(value)); rest.onFocus?.(e); }}
      onChange={(e) => { setDraft(e.target.value); onValue(draftNumber(e.target.value)); }}
      onBlur={(e) => { setDraft(null); rest.onBlur?.(e); }}
    />
  );
}

function NumField({
  label,
  value,
  onChange,
  max,
  step,
  name,
}: {
  label: string;
  value: number | "";
  onChange: (v: number) => void;
  max?: number;
  step?: string;
  /** What the figure is — "Width" or "Height" — for assistive tech; the
   *  unit label beside the field is visual only. */
  name?: string;
}) {
  return (
    <div className="relative">
      {/* inputMode decimal: on a phone, type=number alone opens the full
          keyboard with a number row; this opens the number pad. */}
      <NumberBox
        inputMode="decimal"
        min={0}
        max={max}
        step={step}
        value={value}
        aria-label={name ? `${name} in ${label === "ft" ? "feet" : label === "in" ? "inches" : "millimetres"}` : undefined}
        onValue={onChange}
        className="h-12 w-full rounded-[14px] border border-edge bg-surface px-3 pr-9 outline-none transition-colors focus:border-charcoal"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-mist">{label}</span>
    </div>
  );
}

/** The required-field mark. Carries its own screen-reader word so the asterisk
 *  isn't a purely visual convention — it is announced, not just seen. */
function Required() {
  return (
    <>
      <span aria-hidden className="text-alert">*</span>
      <span className="sr-only"> (required)</span>
    </>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[0.7rem] font-semibold uppercase tracking-wide text-mist">{label}</dt>
      <dd className="text-charcoal">{value}</dd>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.5" r="3.4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-charcoal">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" />
      <path d="m5.5 8 1.8 1.8 3.2-3.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
