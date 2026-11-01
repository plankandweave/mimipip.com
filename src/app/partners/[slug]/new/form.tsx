"use client";

import { VIJAY_SALES_SLUG } from "@/lib/receiver-mobile";
import Image from "@/components/SiteImage";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DesignVisualizer } from "@/components/DesignVisualizer";
import {
  planOpenings, OPENING_EXCLUSION_ENABLED,
  QUALIFY_MIN_WIDTH_CM, QUALIFY_MIN_HEIGHT_FRAC,
} from "@/lib/openings";
import { MAX_PANEL_CM, PANEL_OVERLAP_CM } from "@/lib/visualizer";
import { mediaFloorSqft } from "@/lib/print-types";
import { checkGstin, gstinStateMismatch } from "@/lib/gstin";
import { taxHeads } from "@/lib/gst";
import { LARGE_ART_FROM } from "@/lib/large-art-upload-rules";
import { uploadLargeArt, type UploadedArt } from "@/lib/large-art-upload";
import { uploadOrderWallPhoto } from "@/lib/order-wall-photo-client";

// Indian states/UTs — the dispatch state decides which GSTIN we bill. An
// account may narrow this to the states it actually trades in (ship_states,
// migration 0053); the full list is the fallback, not the norm.
const ALL_STATES = [
  "Andhra Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh", "Delhi", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jammu & Kashmir", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Tamil Nadu",
  "Telangana", "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

type CatalogueCard = { handle: string; title: string; image: string | null; fromPricePerSqft: number | null };
type CatalogueMaterial = {
  slug: string; name: string; listPricePerSqft: number; netPricePerSqft: number; swatchUrl: string | null;
};
type PickedDesign = { handle: string; title: string; flatImage: string | null; materials: CatalogueMaterial[] };

/** An owner-approved design from this partner's library (corporate_designs). */
type LibraryDesign = {
  id: string; title: string; design_url: string;
  design_code: string | null; series_name: string | null;
  design_w_px: number | null; design_h_px: number | null;
  status: string;
  /** What this design prints as — wallpaper, wrap, border (migration 0105).
   *  A flat-rate partner never touches the catalogue, so the library row is the
   *  ONLY thing that knows, and the wall inherits it. */
  print_type?: string | null;
};

type StateProfile = {
  state: string; gstin: string | null; address_line: string | null; city: string | null;
  pincode: string | null; contact_name: string | null; contact_phone: string | null;
};

type StoreOption = {
  id: string; name: string; state: string; city: string | null;
  address_line: string | null; pincode: string | null;
  contact_name: string | null; contact_phone: string | null;
};

/** One wall of a multi-wall project — artwork + size captured together, priced
 *  at add time for display (the server re-derives on submit). A partner sale
 *  is rarely one wall: Vijay Sales' Series 2 run is seven creatives at seven
 *  sizes, and it must go in as ONE submission, not seven. */
/** The framing the partner confirmed in the visualiser, in the shape the
 *  order routes store (crop_data) and the OS print engine consumes — the same
 *  mapping the retail cart uses (os-sync.ts). Null = print the cover-fit
 *  default, exactly as before. */
type Placement = { zoom: number; cropX: number; cropY: number; flipH?: boolean; flipV?: boolean };

/** The visualiser's framing of one artwork, keyed to the artwork it framed so
 *  swapping designs never silently carries the previous wall's crop along. */
type Framing = { url: string; offsetX: number; offsetY: number; zoom: number; flipH: boolean; flipV: boolean };

/** Untouched framing (centred, no zoom, no flip) → null: the server's
 *  cover-fit default prints the identical result, so don't dress it up as a
 *  bespoke placement. */
const framingPlacement = (v: Framing | null): Placement | null =>
  v && (v.zoom !== 1 || v.offsetX !== 0.5 || v.offsetY !== 0.5 || v.flipH || v.flipV)
    ? {
        zoom: Math.min(8, Math.max(1, v.zoom)),
        cropX: Math.min(1, Math.max(0, v.offsetX)),
        cropY: Math.min(1, Math.max(0, v.offsetY)),
        ...(v.flipH ? { flipH: true } : {}),
        ...(v.flipV ? { flipV: true } : {}),
      }
    : null;

/** Something on the wall that is NOT wall — a glass return, a full-height door,
 *  a fitted unit, a window. Measured from the wall's left edge (`offsetMm`),
 *  the same contract lib/openings.ts and the print engine use; a window lifts
 *  off the floor by `sillMm` and is drawn for the installer but never comes
 *  off the print or the bill. `side` is only how the buyer chose to measure
 *  the position and never leaves the browser. mm, like every other
 *  measurement on this form. */
type Opening = { key: string; widthMm: number; heightMm: number; offsetMm: number; sillMm?: number; side?: "left" | "right" };

type CartLine = {
  key: string;
  art: { url: string; previewUrl?: string; width: number; height: number; name: string };
  widthMm: number;
  heightMm: number;
  printName: string;
  productHandle: string | null;
  /** Inherited from the library design or the band's segments. Decides the
   *  print rules the OS dispatches with; null lets the server resolve it from
   *  the catalogue product, and failing that from wallpaper. */
  printType: string | null;
  materialSlug: string | null;
  rate: number | null;
  placement: Placement | null;
  openings: Opening[];
  /** Chargeable sq ft after exclusion, or null to bill the plain rectangle.
   *  Display only — the server re-plans and is authoritative. */
  chargeableSqft: number | null;
  /** A photo of the wall itself, with where the print goes marked on it —
   *  uploaded against the order once it exists, and printed on the
   *  installer's sheet. Optional. */
  wallPhoto: File | null;
};

const MM_PER_IN = 25.4;
const ftIn = (mm: number) => {
  const t = mm / MM_PER_IN, f = Math.floor(t / 12), i = Math.round(t - f * 12);
  return i === 12 ? `${f + 1} ft` : i ? `${f} ft ${i} in` : `${f} ft`;
};

export default function NewOrderForm({
  slug, accountName, logoPath, ratePerSqft, gstPct, pricingMode, discountPct,
  staffEmail = null, shipStates = null, printRules = null, canOrder = true,
  billingFloors = null, embedded = false, onPlaced,
}: {
  embedded?: boolean;
  onPlaced?: () => void;
  slug: string;
  accountName: string;
  logoPath: string | null;
  ratePerSqft: number;
  gstPct: number;
  /** 'website' tenants are priced from the live catalogue, not a contracted
   *  rate — the server is authoritative, this only drives what we show. */
  pricingMode: "flat_rate" | "website";
  discountPct: number;
  /** Set when one of OUR people is signed in on the partner's account. */
  staffEmail?: string | null;
  /** False for someone their admins gave "prepare orders" but not "place
   *  orders". The server enforces it; this is so they learn now rather than
   *  after measuring a wall. */
  canOrder?: boolean;
  /** The states this account ships to. Null/empty = every state. */
  shipStates?: string[] | null;
  /** Live panel geometry from the OS. Null falls back to the baked-in mirror —
   *  the server re-plans on submit either way, so a stale display can only ever
   *  be cosmetic. */
  printRules?: { maxPanelCm: number; overlapCm: number } | null;
  /** Minimum billable width per print type, mm (migration 0106) — a one-lane
   *  piece bills at least run length × this, because it consumes the full web.
   *  Null for a type with no floor (nest-capable). The server re-derives on
   *  submit; this only keeps the on-screen quote honest. */
  billingFloors?: Record<string, number | null> | null;
}) {
  const STATES = shipStates && shipStates.length ? shipStates : ALL_STATES;
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // `url` is the real artwork the printer must fetch. `previewUrl` is what the
  // browser may show — for a library pick those differ: the file itself lives in
  // a private bucket and is only viewable through the watermarking proxy.
  const [art, setArt] = useState<
    { url: string; previewUrl?: string; width: number; height: number; name: string } | null
  >(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [printName, setPrintName] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [widthMm, setWidthMm] = useState(0);
  const [heightMm, setHeightMm] = useState(0);
  // Openings on the wall being composed. Marking one takes it off the print AND
  // the bill — a Vijay Sales storefront is rarely a clean rectangle, and billing
  // the glass was costing them (and wasting our film) on every such wall.
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [wallPhoto, setWallPhoto] = useState<File | null>(null);
  const wallPhotoRef = useRef<HTMLInputElement>(null);
  const wallPhotoPreview = useMemo(() => (wallPhoto ? URL.createObjectURL(wallPhoto) : null), [wallPhoto]);
  useEffect(() => () => { if (wallPhotoPreview) URL.revokeObjectURL(wallPhotoPreview); }, [wallPhotoPreview]);
  // Website-priced tenants: ₹/sq ft of the chosen catalogue design (ex-GST).
  const [catalogueRate, setCatalogueRate] = useState<number | null>(null);
  const [catalogueQuery, setCatalogueQuery] = useState("");
  const [catalogueResults, setCatalogueResults] = useState<CatalogueCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<PickedDesign | null>(null);
  // Owner-approved library designs (migration 0044): the pre-approved artwork
  // this partner's staff may order without any further sign-off.
  const [library, setLibrary] = useState<LibraryDesign[]>([]);
  const [libraryPicked, setLibraryPicked] = useState<string | null>(null);
  // The type of whatever currently fills the art slot: a library design's own,
  // or a band's (every segment of a band shares one — the API refuses a mixed
  // band). Cleared by an upload or a catalogue pick, where the server resolves
  // it instead.
  const [artType, setArtType] = useState<string | null>(null);
  const [materialSlug, setMaterialSlug] = useState<string | null>(null);
  const [customMaterials, setCustomMaterials] = useState<CatalogueMaterial[]>([]);

  const [profiles, setProfiles] = useState<StateProfile[]>([]);
  // The account's showrooms (Stores page). Picking one IS the destination —
  // address, PIN and contact land on this order. The state profile still
  // supplies the GSTIN; it no longer supplies where the parcel goes.
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeId, setStoreId] = useState("");
  // ?repeat=<order id>: same artwork and size as an earlier order, with the
  // destination deliberately left EMPTY. A repeat used to inherit its parent's
  // state and ship with no address typed (ZVY-20476, placed for Virar, boxed
  // to Ahmedabad). Now the person placing it says where it goes.
  const [repeatOf, setRepeatOf] = useState<string | null>(null);
  const [repeatNote, setRepeatNote] = useState<string | null>(null);
  const [state, setState] = useState("");
  const [gstin, setGstin] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Sending the project OUT for a purchase order rather than to print. Who it
  // goes to is a different person from the site contact often enough that it
  // gets its own fields — pre-filled from the site contact, because often
  // enough it isn't.
  const [shareOpen, setShareOpen] = useState(false);
  // The PO form opens BELOW the buttons, often off the bottom of the screen:
  // bring it into view, or opening it looks like nothing happened.
  const shareRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (shareOpen) shareRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [shareOpen]);
  const [shareName, setShareName] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [sharePhone, setSharePhone] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareErr, setShareErr] = useState<string | null>(null);
  const [shareSent, setShareSent] = useState<{ url: string; waUrl: string; emailed: boolean } | null>(null);

  // The project cart. Empty = the classic single-wall order, unchanged.
  const [lines, setLines] = useState<CartLine[]>([]);

  // The wall being composed is framed in the same inline Size & Design
  // Visualiser the retail product page uses — drag to reposition, zoom for
  // pattern scale, flip. The framing travels with the line and IS what prints;
  // untouched, the cover-fit default prints.
  const [framingFor, setFramingFor] = useState<Framing | null>(null);
  const framing = framingFor && framingFor.url === art?.url ? framingFor : null;

  // Rack-band composer: a showroom band (say 25 ft × 2.5 ft) is longer than
  // any one creative fitted to its height, so it is composed — approved
  // designs A, B, C… laid left to right. The server stitches the CLEAN
  // originals into one print master; from there it is a normal artwork.
  const [bandMode, setBandMode] = useState(false);
  const [bandSegs, setBandSegs] = useState<LibraryDesign[]>([]);
  const [bandBusy, setBandBusy] = useState(false);
  // Band failures used to land in the page-level error line, far down the page
  // and off-screen — so a failed build read as "the button does nothing".
  // The band reports its own outcome, next to the button that caused it.
  const [bandErr, setBandErr] = useState<string | null>(null);
  // Building swapped the artwork slot further up the page and said nothing
  // where the person was actually looking, so a SUCCESSFUL build read as
  // "nothing happened". The band states its own result.
  const [bandDone, setBandDone] = useState<string | null>(null);

  /** Length of one segment along the band, in mm — the design fitted to the
   *  band's height keeps its aspect. Null when the design predates dimension
   *  capture (the server still composites; we just can't preview the span). */
  const segSpanMm = (d: LibraryDesign) =>
    heightMm > 0 && d.design_w_px && d.design_h_px ? heightMm * (d.design_w_px / d.design_h_px) : null;
  const bandCoveredMm = bandSegs.reduce<number | null>(
    (sum, d) => { const s = segSpanMm(d); return sum === null || s === null ? null : sum + s; }, 0);
  /** How many times the chosen run repeats to fill the band — the server tiles
   *  A B C A B C… so a short sequence is an ORDER, not a shortfall. */
  const bandPasses = bandCoveredMm && bandCoveredMm > 0 && widthMm > 0
    ? Math.round((widthMm / bandCoveredMm) * 10) / 10 : null;

  async function buildBand() {
    // Never fail silently: say which input is missing rather than sitting
    // there disabled while the person clicks it again.
    if (!widthMm || !heightMm) {
      setBandErr("Set the band's length and height first — the 30 × 2.5 ft button fills in a typical rack band.");
      return;
    }
    if (bandSegs.length === 0) {
      setBandErr("Tap at least one design below to start the run — it repeats to fill the band.");
      return;
    }
    setBandBusy(true); setErr(null); setBandErr(null); setBandDone(null);
    try {
      const r = await fetch("/api/corporate/band", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designIds: bandSegs.map((d) => d.id), widthMm, heightMm }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not build the band artwork");
      const pieces = (j.pieces ?? []) as { url: string; previewUrl: string | null; width: number; height: number; name: string; widthMm: number }[];
      if (pieces.length === 0) throw new Error("The band build returned nothing — try again.");
      // The canonical url is a REFERENCE the printer resolves, not something a
      // browser can fetch — without a signed previewUrl the slot would fill
      // with a broken image and look like a failure. Say so instead.
      if (pieces.some((p) => !p.previewUrl)) throw new Error("The band was built but its preview link could not be signed — tell us and we'll fix it.");

      if (pieces.length === 1) {
        const p = pieces[0];
        setArt({ url: p.url, previewUrl: p.previewUrl ?? undefined, width: p.width, height: p.height, name: p.name });
        setLibraryPicked(null); setPicked(null); setArtType(null);
        if (!printName) setPrintName(p.name);
        if (pricingMode === "website") await loadCustomMaterials();
        setBandDone(
          `Band artwork built — ${j.tiles ?? bandSegs.length} panels across ${ftIn(widthMm)}. It is now the artwork for this wall; set the material and price below.`,
        );
      } else {
        // No creative runs past 39 m (one full roll): a longer band arrives pre-split into
        // equal pieces, each its own wall in the project — the pattern flows
        // continuously across the join, which lands like any panel seam.
        const stamp = Date.now();
        setLines((ls) => [
          ...ls,
          ...pieces.map((p, i) => ({
            key: `${stamp}-band-${i}`,
            art: { url: p.url, previewUrl: p.previewUrl ?? undefined, width: p.width, height: p.height, name: p.name },
            widthMm: p.widthMm,
            heightMm,
            printName: p.name,
            productHandle: null,
            printType: (j.printType as string | null) ?? null,
            materialSlug,
            rate: effectiveRate,
            placement: null,
            // A rack band is a clear run of fascia — nothing to exclude, and
            // the band's own pieces are already sized to what prints.
            openings: [],
            chargeableSqft: null,
            wallPhoto: null,
          })),
        ]);
        setArt(null); setLibraryPicked(null); setPicked(null); setArtType(null);
        setWidthMm(0); setHeightMm(0); setPrintName("");
        setBandDone(
          `Band built as ${pieces.length} pieces of ≈${ftIn(pieces[0].widthMm)} each (full-roll 39 m cap per piece) — added to the project below.`,
        );
      }
    } catch (e) {
      setBandErr(e instanceof Error ? e.message : "Could not build the band artwork");
    } finally { setBandBusy(false); }
  }

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/corporate/states", { cache: "no-store" });
      if (r.ok) setProfiles(((await r.json()).states ?? []) as StateProfile[]);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/corporate/stores", { cache: "no-store" });
      if (r.ok) setStores(((await r.json()).stores ?? []) as StoreOption[]);
    })();
  }, []);

  // Repeat an earlier order: artwork, size, name and PO come across; the
  // destination does not (see repeatOf).
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("repeat");
    if (!wanted) return;
    void (async () => {
      const r = await fetch("/api/corporate/orders", { cache: "no-store" });
      if (!r.ok) return;
      const orders = ((await r.json()).orders ?? []) as Array<{
        id: string; design_url: string | null; design_w_px: number | null; design_h_px: number | null;
        width_mm: number; height_mm: number; print_name: string | null; po_number: string | null;
        print_type?: string | null; os?: { designRef?: string | null } | null;
      }>;
      const o = orders.find((x) => x.id === wanted);
      if (!o?.design_url) return;
      setArt({ url: o.design_url, previewUrl: o.design_url, width: o.design_w_px ?? 0, height: o.design_h_px ?? 0, name: o.print_name ?? "Repeat" });
      setArtType(o.print_type ?? null);
      setLibraryPicked(null); setPicked(null); setCatalogueRate(null);
      setWidthMm(o.width_mm); setHeightMm(o.height_mm);
      setPrintName(o.print_name ?? ""); setPoNumber(o.po_number ?? "");
      setRepeatOf(o.id);
      setRepeatNote(`Repeat of ${o.print_name ?? "an earlier order"} — same artwork, same ${ftIn(o.width_mm)} × ${ftIn(o.height_mm)}. Choose where THIS copy ships in step 2.`);
    })();
  }, []);

  /** A showroom pick is the whole destination in one go. */
  function pickStore(id: string) {
    setStoreId(id);
    const st = stores.find((x) => x.id === id);
    if (!st) return;
    setState(st.state);
    const p = profiles.find((x) => x.state === st.state);
    setGstin(p?.gstin ?? "");
    setAddress(st.address_line ?? ""); setCity(st.city ?? ""); setPincode(st.pincode ?? "");
    setContactName(st.contact_name ?? ""); setContactPhone(st.contact_phone ?? "");
  }

  // Approved library designs, and honour ?design=<id> from the library page's
  // "Order this design" link (window.location, not useSearchParams, to keep
  // this client component out of a Suspense requirement).
  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/corporate/designs", { cache: "no-store" });
      if (!r.ok) return;
      const all = ((await r.json()).designs ?? []) as LibraryDesign[];
      // Everything in the library is orderable — approval is retired (0084).
      // Filtered on "not archived" rather than "is approved" so a row the OS
      // desk still writes as 'pending' out of habit is orderable too; archived
      // is the one status that means genuinely gone.
      const usable = all.filter((d) => d.status !== "archived");
      setLibrary(usable);
      const wanted = new URLSearchParams(window.location.search).get("design");
      const hit = wanted ? usable.find((d) => d.id === wanted) : null;
      if (hit) pickLibraryDesign(hit);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** A library pick is the partner's own approved artwork: it fills the art
   *  slot exactly like an upload (and prices like one) — no re-approval, no
   *  catalogue rate. */
  function pickLibraryDesign(d: LibraryDesign) {
    setArt({
      url: d.design_url,
      previewUrl: `/api/corporate/designs/${d.id}/image`,
      width: d.design_w_px ?? 0, height: d.design_h_px ?? 0, name: d.title,
    });
    setLibraryPicked(d.id);
    setArtType(d.print_type ?? null);
    setPicked(null);
    setCatalogueRate(null);
    if (!printName) setPrintName(d.title);
  }

  // Picking a state pulls back everything saved for it — one GSTIN per state,
  // shared by every showroom there, so it is typed once and never again.
  function pickState(s: string) {
    setState(s);
    setStoreId("");
    const p = profiles.find((x) => x.state === s);
    if (p) {
      setGstin(p.gstin ?? ""); setAddress(p.address_line ?? ""); setCity(p.city ?? "");
      setPincode(p.pincode ?? ""); setContactName(p.contact_name ?? ""); setContactPhone(p.contact_phone ?? "");
    }
  }

  async function searchCatalogue() {
    const q = catalogueQuery.trim();
    if (!q) return;
    setSearching(true); setErr(null);
    try {
      const r = await fetch(`/api/corporate/catalogue?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Search failed");
      setCatalogueResults((j.results ?? []) as CatalogueCard[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Search failed");
    } finally { setSearching(false); }
  }

  /** The ex-GST LIST rate (before the partner discount) for a catalogue
   *  material — what catalogueRate must hold, not the API's netPricePerSqft
   *  (already discounted), so the discount below applies exactly once. */
  const catalogueExRate = (listPricePerSqft: number) => listPricePerSqft / (1 + gstPct / 100);

  /** Choosing a catalogue design replaces any uploaded art — one order is one
   *  design, and leaving both set would make it ambiguous what we print. */
  async function pickDesign(handle: string) {
    setErr(null);
    try {
      const r = await fetch(`/api/corporate/catalogue?handle=${encodeURIComponent(handle)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not load that design");
      const d = j as PickedDesign;
      setPicked(d);
      setArt(d.flatImage ? { url: d.flatImage, width: 0, height: 0, name: d.title } : null);
      setLibraryPicked(null); setArtType(null); // a catalogue pick supersedes a library pick
      if (!printName) setPrintName(d.title);
      // Auto-select when there is only one material to choose from.
      const only = d.materials.length === 1 ? d.materials[0] : null;
      setMaterialSlug(only?.slug ?? null);
      setCatalogueRate(only ? catalogueExRate(only.listPricePerSqft) : null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load that design");
    }
  }

  /** Materials (and partner rates) for partner-supplied artwork. */
  async function loadCustomMaterials() {
    try {
      const r = await fetch("/api/corporate/catalogue?handle=custom-wallpaper", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) return;
      const mats = (j.materials ?? []) as CatalogueMaterial[];
      setCustomMaterials(mats);
      const only = mats.length === 1 ? mats[0] : null;
      if (only) { setMaterialSlug(only.slug); setCatalogueRate(catalogueExRate(only.listPricePerSqft)); }
    } catch { /* pricing simply stays unset; the server is authoritative */ }
  }

  async function upload(f: File) {
    setErr(null); setUploading(true);
    try {
      let j: UploadedArt;
      if (f.size >= LARGE_ART_FROM) {
        // Print masters run to hundreds of MB: sent to storage in parts.
        setUploadPct(0);
        j = await uploadLargeArt(f, setUploadPct);
      } else {
        const fd = new FormData(); fd.append("file", f);
        const r = await fetch("/api/corporate/upload", { method: "POST", body: fd });
        // A refusal from the platform in front of the route (a 413, a 502) is
        // plain text, not JSON — say what happened rather than "Unexpected token".
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? `Upload failed (${r.status}) — please try again.`);
        j = body as UploadedArt;
      }
      // previewUrl is the signed one the browser can actually render; url is
      // the canonical reference the order carries (private bucket).
      setArt({ url: j.url, previewUrl: j.previewUrl ?? undefined, width: j.width, height: j.height, name: j.name });
      setLibraryPicked(null); setArtType(null); // a fresh upload supersedes a library pick
      if (!printName) setPrintName(f.name.replace(/\.[^.]+$/, ""));
      // Own artwork supersedes a catalogue pick. Website-priced partners still
      // need a material to have a rate at all, so load the Custom Wallpaper
      // SKU's materials — the same ones a retail customer printing their own
      // image chooses from.
      setPicked(null);
      if (pricingMode === "website") await loadCustomMaterials();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally { setUploading(false); setUploadPct(null); }
  }

  // Honest sharpness verdict at the ordered wall size — the same 150 DPI target
  // the print engine uses, shown BEFORE they commit.
  const dpi = useMemo(() => {
    // Library designs may predate dimension capture (width/height 0) — no DPI
    // verdict is honest there, rather than a scary "0 DPI".
    if (!art || !art.width || !art.height || !widthMm || !heightMm) return null;
    return Math.min(art.width / (widthMm / MM_PER_IN), art.height / (heightMm / MM_PER_IN));
  }, [art, widthMm, heightMm]);

  // ── Openings ───────────────────────────────────────────────────────────────
  const panelCm = printRules?.maxPanelCm ?? MAX_PANEL_CM;
  const overlapCm = printRules?.overlapCm ?? PANEL_OVERLAP_CM;

  /** Complete openings only, in the cm/floor-anchored shape lib/openings.ts and
   *  the visualiser both take — a half-typed row must not make the preview jump
   *  or the price flicker. */
  const doorsCm = useMemo(
    () => openings
      .filter((o) => o.widthMm > 0 && o.heightMm > 0 && o.offsetMm >= 0)
      .map((o) => ({ widthCm: o.widthMm / 10, heightCm: o.heightMm / 10, offsetCm: o.offsetMm / 10, ...(o.sillMm ? { sillCm: o.sillMm / 10 } : {}) })),
    [openings],
  );

  /** The SAME planOpenings the order route and the print engine run. Computed
   *  here only so the partner sees the seams and the saving before committing;
   *  the server re-plans from live OS rules and is authoritative. */
  const openingsPlan = useMemo(() => {
    if (!widthMm || !heightMm || doorsCm.length === 0) return null;
    return planOpenings({
      runWidthCm: widthMm / 10, wallHeightCm: heightMm / 10,
      doors: doorsCm, panelCm, overlapCm,
    });
  }, [widthMm, heightMm, doorsCm, panelCm, overlapCm]);

  const excluding = OPENING_EXCLUSION_ENABLED && !!openingsPlan && openingsPlan.excludedSqft > 0;
  const chargeableSqft = excluding ? openingsPlan!.chargeableSqft : null;

  /** Would this mark be big enough to come off the print? Mirrors step 1 of
   *  planOpenings so a partner is told plainly that a small niche prints
   *  through, instead of wondering why the price didn't move. */
  const openingQualifies = (o: Opening) =>
    heightMm > 0 &&
    !((o.sillMm ?? 0) > 0) &&
    o.widthMm / 10 >= QUALIFY_MIN_WIDTH_CM &&
    o.heightMm / 10 >= QUALIFY_MIN_HEIGHT_FRAC * (heightMm / 10);

  /** An opening measured past the wall it sits on is a survey error — say so
   *  here rather than letting the server reject the whole submission. */
  const openingOverflows = (o: Opening) =>
    (widthMm > 0 && o.offsetMm + o.widthMm > widthMm + 2) ||
    (heightMm > 0 && (o.sillMm ?? 0) + o.heightMm > heightMm + 2);

  const openingsInvalid = openings.some(openingOverflows);

  // The GSTIN is checked here as well as on the server, because being told at
  // the point of typing beats being refused after choosing artwork and a wall.
  // Blank is fine — not every buyer is registered — but a value that is present
  // and wrong is stopped: it would be saved against the state and auto-filled
  // onto every future order into it.
  const gstinProblem = (() => {
    const c = checkGstin(gstin);
    if ("error" in c) return c.error;
    return gstinStateMismatch(c.value, state);
  })();

  function addOpening(kind: "door" | "window") {
    setOpenings((os) => [...os, { key: `${Date.now()}-${os.length}`, widthMm: 0, heightMm: 0, offsetMm: 0, ...(kind === "window" ? { sillMm: 0 } : {}) }]);
  }
  function patchOpening(key: string, patch: Partial<Opening>) {
    setOpenings((os) => os.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  }

  // Rate actually in force. Flat-rate tenants carry it on the account; website
  // tenants get it from the chosen catalogue design, so it stays null until one
  // is picked rather than quietly quoting ₹0. The server re-derives and is
  // authoritative either way — this is only what the buyer sees while deciding.
  //
  // catalogueRate is stored as the ex-GST LIST rate (before the partner
  // discount) — see catalogueExRate() below — so it lines up with ratePerSqft
  // (also pre-discount) and the discount below applies exactly once. Storing
  // the catalogue API's already-discounted netPricePerSqft here instead would
  // double the discount in this preview (₹200 retail at 50% off showed as
  // ₹84.75/sq ft on-screen and was then discounted 50% again), even though the
  // server — which re-derives from the raw catalogue rate independently — was
  // never affected and always charged the correct amount.
  const effectiveRate = pricingMode === "website" ? catalogueRate : ratePerSqft;

  /** The billing floor for a line's type, mirroring the server's resolution:
   *  an unknown or unset type prices as wallpaper. */
  const floorFor = useCallback((type: string | null) => {
    if (!billingFloors) return null;
    return type != null && type in billingFloors
      ? billingFloors[type]
      : billingFloors.wallpaper ?? null;
  }, [billingFloors]);

  const price = useMemo(() => {
    if (!widthMm || !heightMm || !effectiveRate) return null;
    const fullSqft = (widthMm * heightMm) / 92903.04;
    // Marked openings are billed at zero: the partner pays for what prints...
    const artworkSqft = chargeableSqft ?? fullSqft;
    // ...unless the piece is narrower than the roll it prints on. A one-lane
    // piece consumes the full web for every running metre, so it bills at
    // least run length × the billable web width (migration 0106) — same
    // arithmetic the server locks on submit.
    const minWidth = floorFor(artType);
    const floorSqft = minWidth ? mediaFloorSqft(widthMm, heightMm, minWidth) : 0;
    const floorApplied = floorSqft > artworkSqft + 0.001;
    const areaSqft = floorApplied ? floorSqft : artworkSqft;
    const list = Math.round(areaSqft * effectiveRate * 100) / 100;
    const discount = Math.round((list * discountPct) / 100 * 100) / 100;
    const amount = Math.round((list - discount) * 100) / 100;
    const gst = Math.round((amount * gstPct) / 100 * 100) / 100;
    const savedInr = Math.round((fullSqft - areaSqft) * effectiveRate);
    return { areaSqft, fullSqft, list, discount, amount, gst, total: amount + gst, savedInr: Math.max(0, savedInr), floorApplied, minWidth };
  }, [widthMm, heightMm, effectiveRate, discountPct, gstPct, chargeableSqft, artType, floorFor]);

  // Website-priced partners need a material chosen before there is a price at
  // all, so don't let them submit a quote we'd only reject server-side.
  const priced = pricingMode !== "website" || !!materialSlug;
  // The wall currently being composed is complete and could become a line. An
  // opening measured past the wall blocks it: the server would reject the whole
  // submission, and finding that out after "send" is the worse place to learn it.
  const wallComplete = !!art && widthMm >= 100 && heightMm >= 100 && priced && !openingsInvalid && !gstinProblem;
  // A blank PIN is fine: the server looks it up from the address. A typed
  // one has to be real.
  const shipToOk = address.trim().length >= 8 && (!pincode.trim() || /^[1-9][0-9]{5}$/.test(pincode.replace(/\s+/g, "")));
  const ready = (wallComplete || lines.length > 0) && !!state && shipToOk && !busy && !uploading;

  /** Everything still standing between this order and production, in plain
   *  words. A disabled "Send to print" is indistinguishable from a broken one —
   *  and with dispatch at the top of the page and the button at the bottom, the
   *  commonest blocker (no state chosen) is literally off-screen from the thing
   *  that refuses to work. So the button always responds, and says what it wants.
   *  Same rule the band builder already follows. */
  const blockers: string[] = (() => {
    const b: string[] = [];
    if (!wallComplete && lines.length === 0) {
      if (!art) {
        b.push("Add the artwork first — upload a design, pick one from your library, or build a rack band.");
      } else if (widthMm < 100 || heightMm < 100) {
        b.push("Set the wall size in step 3 — width and height in mm.");
      } else if (!priced) {
        b.push("Choose the material this prints on, so it can be priced.");
      } else if (openingsInvalid) {
        b.push("An opening is measured past the wall it sits on — check it in step 3.");
      }
    }
    // Blank is fine; a present-but-wrong one is not, and it would be saved
    // against the state and ride onto every future order into it.
    if (gstinProblem) b.push(gstinProblem);
    if (!state) b.push("Choose the dispatch state in step 2 — it decides which GSTIN this bills to and where it ships.");
    else if (!address.trim() || address.trim().length < 8) b.push("Enter the delivery address in step 2 — pick a store, or type the site address. It is per order, never assumed.");
    else if (pincode.trim() && !/^[1-9][0-9]{5}$/.test(pincode.replace(/\s+/g, ""))) b.push("That PIN code in step 2 is not six digits — fix it, or leave it blank and it is looked up from the address.");
    if (!canOrder) {
      b.push("Your sign-in can prepare orders but not place them — ask an account admin for the “Place orders” permission on the Team page.");
    }
    return b;
  })();

  /** Display-side price of one line (the server is authoritative on submit).
   *  `chargeable` is the line's opening-excluded area when it has one. */
  function linePrice(w: number, h: number, rate: number | null, chargeable: number | null = null, printType: string | null = null) {
    if (!rate) return null;
    const fullSqft = (w * h) / 92903.04;
    const artworkSqft = chargeable ?? fullSqft;
    // Same media floor as the composing quote above — the server's rule.
    const minWidth = floorFor(printType);
    const floorSqft = minWidth ? mediaFloorSqft(w, h, minWidth) : 0;
    const areaSqft = floorSqft > artworkSqft + 0.001 ? floorSqft : artworkSqft;
    const list = Math.round(areaSqft * rate * 100) / 100;
    const amount = Math.round((list - (list * discountPct) / 100) * 100) / 100;
    return {
      areaSqft,
      excludedSqft: Math.max(0, fullSqft - areaSqft),
      total: amount + Math.round((amount * gstPct) / 100 * 100) / 100,
    };
  }

  /** Fold the composed wall into the project and clear the bench for the next
   *  one — same artwork slot, same size inputs, no page change. */
  function addWall() {
    if (!wallComplete || !art) return;
    setLines((ls) => [...ls, {
      key: `${Date.now()}-${ls.length}`,
      art, widthMm, heightMm,
      printName: printName || art.name,
      productHandle: picked?.handle ?? null,
      printType: artType,
      materialSlug,
      rate: effectiveRate,
      placement: framingPlacement(framing),
      openings,
      chargeableSqft,
      wallPhoto,
    }]);
    setArt(null); setLibraryPicked(null); setPicked(null); setArtType(null); setFramingFor(null);
    setWidthMm(0); setHeightMm(0); setPrintName(""); setOpenings([]); setWallPhoto(null);
    if (pricingMode === "website") { setMaterialSlug(null); setCatalogueRate(null); }
  }

  const cartTotals = useMemo(() => {
    let sqft = 0, inr = 0, excluded = 0, unpriced = false;
    for (const l of lines) {
      const p = linePrice(l.widthMm, l.heightMm, l.rate, l.chargeableSqft, l.printType);
      if (!p) { unpriced = true; continue; }
      sqft += p.areaSqft; inr += p.total; excluded += p.excludedSqft;
    }
    return { sqft, inr, excluded, unpriced };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, discountPct, gstPct]);

  /** Every wall in the project, including one composed but not yet added — "add"
   *  then "send" as two taps would lose walls to the person who forgot the
   *  first tap. */
  function projectLines(): CartLine[] {
    return wallComplete && art
      ? [...lines, {
          key: "tail", art, widthMm, heightMm, printName: printName || art.name,
          productHandle: picked?.handle ?? null, printType: artType, materialSlug, rate: effectiveRate,
          placement: framingPlacement(framing),
          openings, chargeableSqft, wallPhoto,
        }]
      : lines;
  }

  // Openings go over the wire as geometry only — the server re-plans and
  // re-prices from it. Nothing about the discount the browser calculated is
  // sent, or a partner could edit their own bill.
  const wireOpenings = (l: CartLine) =>
    l.openings
      .filter((o) => o.widthMm > 0 && o.heightMm > 0)
      .map((o) => ({ widthMm: o.widthMm, heightMm: o.heightMm, offsetMm: o.offsetMm, ...(o.sillMm ? { sillMm: o.sillMm } : {}) }));

  /** The project as the server takes it — the same shape whether it is going
   *  to print now or out for a purchase order first. */
  const wireLines = (ls: CartLine[]) => ls.map((l) => ({
    designUrl: l.art.url, designWpx: l.art.width, designHpx: l.art.height,
    widthMm: l.widthMm, heightMm: l.heightMm, printName: l.printName,
    productHandle: l.productHandle, printType: l.printType, materialSlug: l.materialSlug,
    placement: l.placement,
    openings: wireOpenings(l),
  }));

  /**
   * Send the project to whoever raises the PO, instead of to print.
   *
   * The person composing walls is very often not the person who can commit the
   * spend. This mails them the quotation and hands back a wa.me link the
   * browser opens, so the same walls also arrive on WhatsApp from this
   * partner's own number. Nothing is ordered until that person types their PO
   * number on the link — at which point the PO is ON the order, rather than
   * being reconciled to it a week later.
   */
  async function sendQuotation() {
    const allLines = projectLines();
    if (!allLines.length) { setShareErr("Add at least one wall first."); return; }
    if (!state) { setShareErr("Choose the dispatch state first."); return; }
    if (!shareEmail.trim() && !sharePhone.trim()) {
      setShareErr("Add an email address or a WhatsApp number to send it to.");
      return;
    }
    setShareBusy(true); setShareErr(null);
    try {
      const r = await fetch("/api/corporate/quotes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: wireLines(allLines),
          recipientName: shareName, recipientEmail: shareEmail, recipientPhone: sharePhone,
          state, gstin, shipAddress: address, shipCity: city, shipPincode: pincode,
          shipContactName: contactName, shipContactPhone: contactPhone,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not send the quotation");
      setShareSent({ url: j.url, waUrl: j.waUrl, emailed: Boolean(j.emailed) });
      // WhatsApp is opened, not sent for them: the message leaves from this
      // partner's own number, which is the number their client already knows.
      // Opened in a new tab so a half-composed project is never navigated away.
      window.open(j.waUrl, "_blank", "noopener");
    } catch (e) {
      setShareErr(e instanceof Error ? e.message : "Could not send the quotation");
    } finally {
      setShareBusy(false);
    }
  }

  /** The order is already placed when these go: a photo that fails is said
   *  plainly and can be added again from Your orders — it never undoes the
   *  order. */
  async function sendWallPhotos(items: { orderId: string | undefined; line: CartLine }[]) {
    const failed: string[] = [];
    for (const { orderId, line } of items) {
      if (!line.wallPhoto) continue;
      try {
        if (!orderId) throw new Error("no order id");
        await uploadOrderWallPhoto(orderId, line.wallPhoto);
      } catch {
        failed.push(line.printName);
      }
    }
    if (failed.length) {
      alert(`Order placed. The wall photo for ${failed.join(", ")} did not upload — add it from Your orders.`);
    }
  }

  async function submit() {
    if (!ready) return;
    setBusy(true); setErr(null);
    try {
      const allLines = projectLines();

      if (allLines.length > 1) {
        const r = await fetch("/api/corporate/orders/batch", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lines: wireLines(allLines),
            poNumber,
            state, gstin, shipAddress: address, shipCity: city, shipPincode: pincode,
            shipContactName: contactName, shipContactPhone: contactPhone,
          }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Could not place the project");
        // The server places the walls in the order they were sent.
        const ids = ((j.orders ?? []) as { orderId: string }[]).map((o) => o.orderId);
        await sendWallPhotos(allLines.map((l, i) => ({ orderId: ids[i], line: l })));
        if (onPlaced) onPlaced(); else router.push(`/partners/${slug}/orders`);
        return;
      }

      const only = allLines[0];
      const r = await fetch("/api/corporate/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designUrl: only.art.url, designWpx: only.art.width, designHpx: only.art.height,
          // Present only for catalogue orders — the server re-derives the rate
          // from these rather than trusting any price sent from the browser.
          productHandle: only.productHandle, printType: only.printType, materialSlug: only.materialSlug,
          placement: only.placement,
          openings: wireOpenings(only),
          widthMm: only.widthMm, heightMm: only.heightMm, printName: only.printName, poNumber,
          state, gstin, shipAddress: address, shipCity: city, shipPincode: pincode,
          shipContactName: contactName, shipContactPhone: contactPhone,
          repeatOf: repeatOf ?? undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not place the order");
      await sendWallPhotos([{ orderId: j.orderId, line: only }]);
      if (onPlaced) onPlaced(); else router.push(`/partners/${slug}/orders`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not place the order");
      setBusy(false);
    }
  }

  return (
    <div className={embedded ? "py-3" : "container-x py-10"}>
      <div className="flex items-center gap-3">
        {logoPath && (
          <Image src={logoPath} alt="" width={36} height={36} className="rounded-[9px]" />
        )}
        <div className="flex-1">
          <h1 className="font-display text-2xl font-extrabold leading-tight">New print order</h1>
          <p className="text-xs text-slate">
            {accountName} ·{" "}
            {pricingMode === "website"
              ? <>zyvorah.com pricing less {discountPct}% + {gstPct}% GST</>
              : <>₹{ratePerSqft}/sq ft + {gstPct}% GST</>}
          </p>
        </div>
        {!embedded && <Link href={`/partners/${slug}/orders`} className="text-sm text-slate underline">Your orders</Link>}
      </div>

      {/* Never let one of our own work an account without seeing whose it is —
          and a staff session designs only: the spend stays with the partner. */}
      {staffEmail && (
        <p className="mt-4 rounded-[14px] border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          <strong>Zyvorah staff</strong> — designer session on <strong>{accountName}</strong>&apos;s account
          as {staffEmail}. {canOrder
            ? <>As a director you can place this order: it bills to their account and is recorded as placed by you.</>
            : <>You can prepare and quote drafts; only their ordering contact places the final order.</>}
        </p>
      )}

      {!canOrder && !staffEmail && (
        <p className="mt-4 rounded-[14px] border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          You can prepare an order here, but <strong>placing</strong> it needs the &ldquo;Place orders&rdquo;
          permission. Ask one of your account admins on the{" "}
          <Link href={`/partners/${slug}/team`} className="underline">Team</Link> page.
        </p>
      )}

      {/* One column, top to bottom, every block full width: the order is the
          order the job is actually done in — who it bills and ships to first,
          then the wall, then the artwork, then the band. The visualiser sits
          under the band because that is the thing being judged, and at full
          width it is big enough to judge. */}
      <div className="mt-8 space-y-4">
        <div className="rounded-[18px] border border-edge bg-wash p-4">
          <p className="caps text-slate">1 · Reference</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input value={printName} onChange={(e) => setPrintName(e.target.value)}
              placeholder="Name this print (e.g. Koramangala store front)"
              className="rounded-[10px] border border-edge bg-wash px-3 py-2 text-sm" />
            <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)}
              placeholder="Your PO number (optional)"
              className="rounded-[10px] border border-edge bg-wash px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="rounded-[18px] border border-emerald-200/70 bg-emerald-50/40 p-4">
          <p className="caps text-emerald-900">2 · Dispatch to</p>
          {repeatNote && (
            <p className="mt-2 rounded-[12px] border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">{repeatNote}</p>
          )}
          {stores.length > 0 && (
            <select value={storeId} onChange={(e) => pickStore(e.target.value)}
              className="mt-2 w-full rounded-[10px] border border-edge bg-wash px-3 py-2 text-sm">
              <option value="">Deliver to a store…</option>
              {stores.map((st) => (
                <option key={st.id} value={st.id}>{st.name} · {st.city ?? st.state}{st.pincode ? ` ${st.pincode}` : ""}</option>
              ))}
            </select>
          )}
          <select value={state} onChange={(e) => pickState(e.target.value)}
            className="mt-2 w-full rounded-[10px] border border-edge bg-wash px-3 py-2 text-sm">
            <option value="">Select the state…</option>
            {STATES.map((s) => (
              <option key={s} value={s}>{s}{profiles.some((p) => p.state === s) ? " ✓ saved" : ""}</option>
            ))}
          </select>
          {/* Full width now, so the address reads across in two rows rather
              than as a stack down a narrow rail: GSTIN and address on top,
              the four short fields side by side beneath. */}
          {state && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder={`${state} GSTIN`} aria-invalid={gstinProblem ? true : undefined}
                aria-describedby={gstinProblem ? "gstin-problem" : undefined}
                className={`rounded-[10px] border bg-wash px-3 py-2 text-sm sm:col-span-2 lg:col-span-1 ${gstinProblem ? "border-red-400" : "border-edge"}`} />
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Delivery address (required)" aria-required
                className="rounded-[10px] border border-edge bg-wash px-3 py-2 text-sm sm:col-span-2 lg:col-span-3" />
              {gstinProblem && (
                <p id="gstin-problem" className="text-[11px] text-red-600 sm:col-span-2 lg:col-span-4">{gstinProblem}</p>
              )}
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City"
                className="rounded-[10px] border border-edge bg-wash px-3 py-2 text-sm" />
              <input value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="PIN code (blank = looked up)" inputMode="numeric"
                className="rounded-[10px] border border-edge bg-wash px-3 py-2 text-sm" />
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Site contact"
                className="rounded-[10px] border border-edge bg-wash px-3 py-2 text-sm" />
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder={slug === VIJAY_SALES_SLUG ? "Receiver's mobile (optional)" : "Receiver's mobile (required)"}
                inputMode="tel" autoComplete="tel" aria-required={slug !== VIJAY_SALES_SLUG}
                className="rounded-[10px] border border-edge bg-wash px-3 py-2 text-sm" />
              <p className="text-[11px] text-mist sm:col-span-2 lg:col-span-4">
                The GSTIN is saved against {state}. The address is for THIS order — pick a store or type where this parcel goes; it is never assumed from the state.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-[18px] border border-violet-200/70 bg-violet-50/50 p-4">
          <p className="caps text-violet-900">3 · Wall size</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="text-sm">W{" "}
              <input type="number" value={widthMm || ""} onChange={(e) => setWidthMm(Number(e.target.value))}
                className="w-28 rounded-[10px] border border-edge bg-wash px-3 py-2 text-sm" /> mm
            </label>
            <label className="text-sm">H{" "}
              <input type="number" value={heightMm || ""} onChange={(e) => setHeightMm(Number(e.target.value))}
                className="w-28 rounded-[10px] border border-edge bg-wash px-3 py-2 text-sm" /> mm
            </label>
            {widthMm > 0 && heightMm > 0 && (
              <span className="text-xs text-slate">{ftIn(widthMm)} × {ftIn(heightMm)}</span>
            )}
          </div>
          {dpi !== null && (
            <p className={`mt-2 text-xs ${dpi >= 150 ? "text-emerald-700" : dpi >= 100 ? "text-amber-700" : "text-red-600"}`}>
              {dpi >= 150
                ? `Sharp — ${Math.round(dpi)} DPI at this size.`
                : dpi >= 100
                  ? `${Math.round(dpi)} DPI at this size — we'll AI-enhance it, but a larger file prints crisper.`
                  : `Only ${Math.round(dpi)} DPI at this size — please send a higher-resolution file for a clean print.`}
            </p>
          )}
          {/* ── Openings. Measure the wall as a rectangle, then say what
              isn't wall. Each qualifying mark comes off the print AND the
              bill: the seam pins to its edge, the panel over it prints only
              the strip above, and a full-height one isn't printed at all. */}
          {OPENING_EXCLUSION_ENABLED && widthMm > 0 && heightMm > 0 && (
            <div className="mt-3 border-t border-violet-200/70 pt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-semibold text-violet-900">Anything on this wall that isn&apos;t wall?</p>
                <span className="flex gap-2">
                  <button type="button" onClick={() => addOpening("door")}
                    className="rounded-full border border-violet-300 px-3 py-1 text-[11px] font-semibold text-violet-900 hover:bg-violet-100">
                    + Glass / door / fitted unit
                  </button>
                  <button type="button" onClick={() => addOpening("window")}
                    className="rounded-full border border-violet-300 px-3 py-1 text-[11px] font-semibold text-violet-900 hover:bg-violet-100">
                    + Window
                  </button>
                </span>
              </div>
              {openings.length === 0 ? (
                <p className="mt-1 text-[11px] text-slate">
                  Glass returns, full-height doors and fitted units aren&apos;t printed and aren&apos;t charged.
                  Add them and the price drops. Windows are drawn for the installer and print through.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {openings.map((o, i) => {
                    const over = openingOverflows(o);
                    const ready = o.widthMm > 0 && o.heightMm > 0;
                    const isWindow = o.sillMm != null;
                    const label = `${isWindow ? "Window" : "Opening"} ${i + 1}`;
                    const fromRight = o.side === "right";
                    const pos = fromRight ? Math.max(0, widthMm - o.offsetMm - o.widthMm) : o.offsetMm;
                    const setPos = (mm: number) => patchOpening(o.key, { offsetMm: fromRight ? Math.max(0, widthMm - mm - o.widthMm) : mm });
                    return (
                      <div key={o.key} className="rounded-[12px] border border-edge bg-surface p-2.5">
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="font-semibold text-slate">{isWindow ? `Window ${i + 1}` : i + 1}</span>
                          <label>W{" "}
                            <input type="number" value={o.widthMm || ""} aria-label={`${label} width in mm`}
                              onChange={(e) => patchOpening(o.key, { widthMm: Number(e.target.value) })}
                              className="w-20 rounded-[8px] border border-edge bg-wash px-2 py-1" /> mm
                          </label>
                          <label>H{" "}
                            <input type="number" value={o.heightMm || ""} aria-label={`${label} height in mm`}
                              onChange={(e) => patchOpening(o.key, { heightMm: Number(e.target.value) })}
                              className="w-20 rounded-[8px] border border-edge bg-wash px-2 py-1" /> mm
                          </label>
                          {isWindow && (
                            <label title="Height of the window's bottom edge (sill) above the floor">
                              sill{" "}
                              <input type="number" value={o.sillMm || ""} aria-label={`${label} sill height above the floor, in mm`}
                                onChange={(e) => patchOpening(o.key, { sillMm: Number(e.target.value) })}
                                className="w-20 rounded-[8px] border border-edge bg-wash px-2 py-1" /> mm
                            </label>
                          )}
                          <label title={`Distance from the wall's ${fromRight ? "right" : "left"} edge to the opening's nearest edge`}>
                            <select value={fromRight ? "right" : "left"} aria-label={`${label} position measured from`}
                              onChange={(e) => patchOpening(o.key, { side: e.target.value === "right" ? "right" : "left" })}
                              className="rounded-[8px] border border-edge bg-wash px-1 py-1">
                              <option value="left">from left</option>
                              <option value="right">from right</option>
                            </select>{" "}
                            <input type="number" value={pos || ""} aria-label={`${label} offset from the wall's ${fromRight ? "right" : "left"} edge, in mm`}
                              onChange={(e) => setPos(Number(e.target.value))}
                              className="w-20 rounded-[8px] border border-edge bg-wash px-2 py-1" /> mm
                          </label>
                          <button type="button" onClick={() => setOpenings((os) => os.filter((x) => x.key !== o.key))}
                            aria-label={`Remove ${label.toLowerCase()}`}
                            className="ml-auto text-slate underline">remove</button>
                        </div>
                        {/* Say what this mark will actually do, before they commit. */}
                        {over ? (
                          <p className="mt-1 text-[11px] text-red-600">
                            This runs past the wall — check the measurement.
                          </p>
                        ) : ready && isWindow ? (
                          <p className="mt-1 text-[11px] text-slate">
                            Drawn for the installer — the wallpaper covers this area in full, is charged, and is trimmed around the window on site.
                          </p>
                        ) : ready && !openingQualifies(o) ? (
                          <p className="mt-1 text-[11px] text-amber-700">
                            Too small to leave out — under {Math.round(QUALIFY_MIN_WIDTH_CM * 10)} mm wide or
                            under {Math.round(QUALIFY_MIN_HEIGHT_FRAC * 100)}% of the wall&apos;s height, so it prints
                            through and is charged. Wallpaper is trimmed around it on site.
                          </p>
                        ) : ready ? (
                          <p className="mt-1 text-[11px] text-emerald-700">
                            Not printed, not charged — the seam falls on its edge.
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* The disqualified-by-sliver case: big enough on its own, but it
                  would leave an unprintable strip beside it. Never let that
                  show up as a silent price difference. */}
              {openingsPlan && openingsPlan.disqualifiedDoors.length > 0 && (
                <p className="mt-2 text-[11px] text-amber-700">
                  {openingsPlan.disqualifiedDoors.length === 1 ? "One opening is" : `${openingsPlan.disqualifiedDoors.length} openings are`} too
                  close to a wall edge or another opening to leave out — the strip beside it would be too narrow to
                  print, so it prints through and is charged.
                </p>
              )}
              {excluding && (
                <p className="mt-2 rounded-[10px] bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800">
                  {openingsPlan!.excludedSqft.toFixed(1)} sq ft left out — you pay for {openingsPlan!.chargeableSqft.toFixed(1)} sq ft
                  instead of {((widthMm * heightMm) / 92903.04).toFixed(1)}
                  {price?.savedInr ? <> · ₹{price.savedInr.toLocaleString("en-IN")} less</> : null}.
                </p>
              )}
            </div>
          )}

          {/* The wall itself, with where the print goes marked on it — the
              installer's sheet shows it beside the design (ZVY-20522 had
              nowhere to put one). */}
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-violet-200/70 pt-3">
            <input ref={wallPhotoRef} type="file" accept="image/*" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setWallPhoto(f); e.target.value = ""; }} />
            {wallPhotoPreview ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={wallPhotoPreview} alt="Photo of the wall"
                  className="h-16 w-24 shrink-0 rounded-[10px] border border-edge object-cover" />
                <div className="text-[11px]">
                  <p className="font-semibold text-violet-900">Wall photo added</p>
                  <p className="text-slate">It goes to the installer with this order.</p>
                  <span className="mt-1 flex gap-3">
                    <button type="button" onClick={() => wallPhotoRef.current?.click()} className="text-slate underline">replace</button>
                    <button type="button" onClick={() => setWallPhoto(null)} className="text-slate underline">remove</button>
                  </span>
                </div>
              </>
            ) : (
              <>
                <button type="button" onClick={() => wallPhotoRef.current?.click()}
                  className="rounded-full border border-violet-300 px-3 py-1 text-[11px] font-semibold text-violet-900 hover:bg-violet-100">
                  + Photo of the wall
                </button>
                <p className="text-[11px] text-slate">
                  Optional. Mark where the print goes — the installer gets it with the order.
                </p>
              </>
            )}
          </div>

          {/* More than one wall in this sale? Bank this one and compose the
              next — the whole project goes in as one submission at the end. */}
          {wallComplete && (
            <button type="button" onClick={addWall}
              className="mt-3 rounded-full border border-charcoal px-4 py-2 text-xs font-semibold hover:bg-charcoal hover:text-white">
              + Add this wall & pick the next design
            </button>
          )}
        </div>

        <div className="rounded-[18px] border border-sky-200/70 bg-sky-50/50 p-4">
          <p className="caps text-sky-900">4 · Individual wall-size design</p>
          <p className="mt-1 text-[11px] text-sky-900/70">
            One design printed to one wall size.
          </p>

          {/* The library first: artwork already on the account, ready to
              print, no upload step. */}
          {library.length > 0 && (
            <div className="mt-2 rounded-[16px] border border-edge bg-wash p-3">
              <p className="text-[11px] font-semibold text-slate">From your library</p>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {library.map((d) => (
                  <button key={d.id} type="button" onClick={() => pickLibraryDesign(d)}
                    className={`w-24 shrink-0 overflow-hidden rounded-[10px] border text-left transition-colors ${
                      libraryPicked === d.id ? "border-charcoal" : "border-edge hover:border-slate"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/corporate/designs/${d.id}/image`} alt=""
                      className="h-16 w-full object-cover" draggable={false}
                      onContextMenu={(e) => e.preventDefault()} />
                    <p className="truncate px-1.5 py-1 text-[10px] font-semibold">{d.title}</p>
                    {d.design_code && (
                      <p className="truncate px-1.5 pb-1 font-mono text-[9px] text-mist">{d.design_code}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}


          {/* Website-priced partners may order from the Zyvorah catalogue as
              well as supply their own art, so both routes sit side by side. */}
          {pricingMode === "website" && (
            <div className="mt-2 rounded-[16px] border border-edge bg-wash p-3">
              <div className="flex items-center gap-2">
                <input
                  value={catalogueQuery}
                  onChange={(e) => setCatalogueQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void searchCatalogue(); } }}
                  placeholder="Search the Zyvorah catalogue — e.g. botanical, ikat, jungle"
                  className="flex-1 rounded-[10px] border border-edge bg-surface px-3 py-2 text-sm"
                />
                <button type="button" onClick={() => void searchCatalogue()} disabled={searching}
                  className="rounded-[10px] border border-edge px-3 py-2 text-xs font-semibold disabled:opacity-40">
                  {searching ? "…" : "Search"}
                </button>
              </div>

              {catalogueResults.length > 0 && (
                <div className="mt-3 grid max-h-[280px] grid-cols-3 gap-2 overflow-y-auto">
                  {catalogueResults.map((r) => (
                    <button key={r.handle} type="button" onClick={() => void pickDesign(r.handle)}
                      className={`overflow-hidden rounded-[10px] border text-left transition-colors ${
                        picked?.handle === r.handle ? "border-charcoal" : "border-edge hover:border-slate"}`}>
                      {r.image
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={r.image} alt="" className="h-20 w-full object-cover" />
                        : <div className="h-20 w-full bg-mist/20" />}
                      <p className="truncate px-2 py-1 text-[11px] font-semibold">{r.title}</p>
                    </button>
                  ))}
                </div>
              )}

              {picked && (
                <div className="mt-3 rounded-[12px] border border-edge bg-surface p-3">
                  <p className="text-sm font-semibold">{picked.title}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {picked.materials.map((m) => (
                      <button key={m.slug} type="button"
                        onClick={() => { setMaterialSlug(m.slug); setCatalogueRate(catalogueExRate(m.listPricePerSqft)); }}
                        className={`rounded-full border px-3 py-1 text-[11px] ${
                          materialSlug === m.slug
                            ? "border-charcoal bg-charcoal text-white"
                            : "border-edge hover:border-slate"}`}>
                        {m.name} · ₹{m.netPricePerSqft}/sq ft
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-mist">
                    Your {discountPct}% partner rate, ex-GST. Retail on zyvorah.com is
                    {" "}₹{picked.materials[0]?.listPricePerSqft}/sq ft incl. GST.
                  </p>
                </div>
              )}
            </div>
          )}

          <input ref={fileRef} type="file" accept="image/*,.tif,.tiff" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
          {!art ? (
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="mt-2 flex w-full flex-col items-center rounded-[16px] border-2 border-dashed border-edge bg-wash px-4 py-10 hover:border-charcoal">
              <span className="font-display text-base font-bold">
                {uploading ? (uploadPct != null ? `Uploading… ${uploadPct}%` : "Uploading…") : pricingMode === "website" ? "…or upload your own design" : "Upload your design"}
              </span>
              <span className="mt-1 text-xs text-slate">
                JPG / PNG / TIFF · please send the highest resolution you have
              </span>
            </button>
          ) : (
            <div className="mt-2 flex items-center gap-3 rounded-[14px] border border-edge bg-wash p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={art.previewUrl ?? art.url} alt="" className="h-14 w-14 rounded-[10px] border border-edge object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{art.name}</p>
                <p className="text-xs text-slate">{art.width} × {art.height} px</p>
              </div>
              <button onClick={() => setArt(null)} className="text-xs text-slate underline">Replace</button>
            </div>
          )}

          {/* Own artwork on website pricing: choose the material it prints on. */}
          {pricingMode === "website" && art && !picked && customMaterials.length > 0 && (
            <div className="mt-2 rounded-[12px] border border-edge bg-wash p-3">
              <p className="text-[11px] font-semibold text-slate">Print this on</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {customMaterials.map((m) => (
                  <button key={m.slug} type="button"
                    onClick={() => { setMaterialSlug(m.slug); setCatalogueRate(catalogueExRate(m.listPricePerSqft)); }}
                    className={`rounded-full border px-3 py-1 text-[11px] ${
                      materialSlug === m.slug
                        ? "border-charcoal bg-charcoal text-white"
                        : "border-edge hover:border-slate"}`}>
                    {m.name} · ₹{m.netPricePerSqft}/sq ft
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Rack band — its OWN job, not a variant of a single wall: a long
            shallow run above the racks, composed from several approved
            designs laid left to right and tiled to the length. Built
            server-side from the clean originals. */}
        {library.length > 0 && (
          <div className="rounded-[18px] border border-amber-200/70 bg-amber-50/50 p-4">
            <p className="caps text-amber-900">5 · Rack band design</p>
            <p className="mt-1 text-[11px] text-amber-900/70">
              One long run above the racks — several designs tiled across its length.
            </p>
            <div className="mt-2">
              <button type="button" onClick={() => setBandMode(!bandMode)}
                className="flex w-full items-center justify-between text-left">
                <span className="text-xs font-semibold text-amber-900">
                  {bandMode ? "Hide the band builder" : "Build a rack band"}
                </span>
                <span aria-hidden className={`text-amber-800 transition-transform ${bandMode ? "rotate-180" : ""}`}>▾</span>
              </button>

              {bandMode && (
                <div className="mt-2">
                  {/* The band's own size, so the builder is self-contained —
                      it writes the same wall size step 3 shows. */}
                  <div className="rounded-[10px] border border-dashed border-edge bg-surface px-3 py-2">
                    <p className="text-[11px] text-slate">
                      Band size — each design fits the height, then the run tiles across the length.
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <label className="text-[11px]">Length{" "}
                        <input type="number" value={widthMm || ""} onChange={(e) => setWidthMm(Number(e.target.value))}
                          className="w-24 rounded-[8px] border border-edge bg-wash px-2 py-1 text-xs" /> mm
                      </label>
                      <label className="text-[11px]">Height{" "}
                        <input type="number" value={heightMm || ""} onChange={(e) => setHeightMm(Number(e.target.value))}
                          className="w-24 rounded-[8px] border border-edge bg-wash px-2 py-1 text-xs" /> mm
                      </label>
                      <button type="button" onClick={() => { setWidthMm(9144); setHeightMm(762); }}
                        className="rounded-full border border-edge px-2.5 py-1 text-[10px] text-slate hover:border-slate">
                        30 × 2.5 ft
                      </button>
                      {widthMm > 0 && heightMm > 0 && (
                        <span className="text-[11px] text-mist">{ftIn(widthMm)} × {ftIn(heightMm)}</span>
                      )}
                    </div>
                  </div>

                  {bandSegs.length > 0 && (
                    <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                      {bandSegs.map((d, i) => {
                        const span = segSpanMm(d);
                        return (
                          <div key={`${d.id}-${i}`} className="w-24 shrink-0 overflow-hidden rounded-[10px] border border-edge bg-surface">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/api/corporate/designs/${d.id}/image`} alt=""
                              className="h-12 w-full object-cover" draggable={false}
                              onContextMenu={(e) => e.preventDefault()} />
                            <p className="truncate px-1.5 pt-1 text-[10px] font-semibold">{i + 1} · {d.title}</p>
                            <p className="px-1.5 text-[9px] text-mist">{span ? `≈ ${ftIn(Math.round(span))}` : "size unknown"}</p>
                            <div className="flex items-center justify-between px-1 pb-1">
                              <button type="button" aria-label="Move left" disabled={i === 0}
                                onClick={() => setBandSegs((s) => { const n = [...s]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}
                                className="px-1 text-xs text-slate disabled:opacity-30">←</button>
                              <button type="button" aria-label="Remove"
                                onClick={() => setBandSegs((s) => s.filter((_, j) => j !== i))}
                                className="px-1 text-xs text-red-600">×</button>
                              <button type="button" aria-label="Move right" disabled={i === bandSegs.length - 1}
                                onClick={() => setBandSegs((s) => { const n = [...s]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; return n; })}
                                className="px-1 text-xs text-slate disabled:opacity-30">→</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <p className="mt-2 text-[11px] font-semibold text-slate">Tap to add — repeating a design is fine</p>
                  <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
                    {library.map((d) => (
                      <button key={d.id} type="button" onClick={() => setBandSegs((s) => [...s, d])}
                        className="w-20 shrink-0 overflow-hidden rounded-[10px] border border-edge text-left hover:border-slate">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/corporate/designs/${d.id}/image`} alt=""
                          className="h-12 w-full object-cover" draggable={false}
                          onContextMenu={(e) => e.preventDefault()} />
                        <p className="truncate px-1.5 py-1 text-[10px]">{d.title}</p>
                      </button>
                    ))}
                  </div>

                  {widthMm > 0 && heightMm > 0 && bandSegs.length > 0 && (
                    <p className="mt-2 text-[11px] text-emerald-700">
                      {bandCoveredMm === null
                        ? "The run tiles across the band — one design's size is unknown, so the exact repeat shows after building."
                        : bandPasses !== null && bandPasses > 1.05
                          ? `Your ${bandSegs.length}-design run covers ${ftIn(Math.round(bandCoveredMm))} and tiles ≈${bandPasses}× to fill the ${ftIn(widthMm)} band.`
                          : `Covers the full ${ftIn(widthMm)} run — the last design crops at the band's edge.`}
                    </p>
                  )}

                  {bandErr && (
                    <p className="mt-2 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                      {bandErr}
                    </p>
                  )}

                  {bandDone && (
                    <div className="mt-2 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <p className="text-[11px] font-semibold text-emerald-800">{bandDone}</p>
                      {art && (
                        <div className="mt-1.5 flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={art.previewUrl ?? art.url} alt=""
                            className="h-8 w-40 rounded-[6px] border border-emerald-200 object-cover" />
                          <span className="text-[10px] text-emerald-700">{art.width} × {art.height} px</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Deliberately NOT disabled when inputs are missing — a
                      disabled button is indistinguishable from a broken one.
                      It always responds, and says what it still needs. */}
                  <button type="button" onClick={() => void buildBand()} disabled={bandBusy}
                    className="mt-2 rounded-full border border-charcoal px-4 py-2 text-xs font-semibold hover:bg-charcoal hover:text-white disabled:opacity-40">
                    {bandBusy ? "Building the band artwork…" : "Build band artwork"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Directly under the band, full width: this is where the run is
            judged, so it gets the whole page rather than a column of it. */}
        <div className="rounded-[18px] border border-edge bg-surface p-5">
          <p className="caps text-slate">Size &amp; design visualiser</p>
          <p className="mt-1 text-[11px] text-slate">
            The artwork above at the size above — a band shows as the long run it prints as.
          </p>
          {art && widthMm > 0 && heightMm > 0 ? (
            <div className="mt-3">
              {/* The same inline visualiser as the retail product page:
                  drag to frame the design at the entered wall size — the
                  framing rides the line to production and IS what prints. */}
              <DesignVisualizer
                imageUrl={art.previewUrl ?? art.url}
                imageAlt={art.name}
                wallWidthCm={widthMm / 10}
                wallHeightCm={heightMm / 10}
                offsetX={framing?.offsetX ?? 0.5}
                offsetY={framing?.offsetY ?? 0.5}
                zoom={framing?.zoom ?? 1}
                flipH={framing?.flipH ?? false}
                flipV={framing?.flipV ?? false}
                doors={doorsCm}
                showScaleFigure={false}
                heading={null}
                onChange={(n) => setFramingFor({ url: art.url, ...n })}
                onImageMeta={() => {}}
              />
              <p className="mt-2 text-center text-[11px] text-mist">
                {framing ? "Framing confirmed — this exact crop is what prints." : "What you frame here is exactly what prints."}
              </p>
              {doorsCm.length > 0 && (
                <p className="mt-1 text-center text-[11px] text-slate">
                  Shaded blocks are the openings — {excluding ? "left out of the print and the bill" : "shown for planning; they still print"}.
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 py-16 text-center text-xs text-mist">Upload artwork and enter the wall size to see it.</p>
          )}
        </div>

        {/* The project so far — every banked wall, its size and its price,
            with the running total the sale is being sold against. */}
        {lines.length > 0 && (
          <div className="rounded-[18px] border border-edge bg-surface p-4">
            <p className="caps text-slate">Your project · {lines.length} wall{lines.length > 1 ? "s" : ""}</p>
            <div className="mt-2 space-y-2">
              {lines.map((l, i) => {
                const p = linePrice(l.widthMm, l.heightMm, l.rate, l.chargeableSqft, l.printType);
                return (
                  <div key={l.key} className="flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={l.art.previewUrl ?? l.art.url} alt=""
                      className="h-10 w-10 shrink-0 rounded-[8px] border border-edge object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{i + 1} · {l.printName}</p>
                      <p className="text-[11px] text-slate">
                        {ftIn(l.widthMm)} × {ftIn(l.heightMm)}
                        {p ? <> · {p.areaSqft.toFixed(1)} sq ft</> : null}
                        {p && p.excludedSqft > 0.05
                          ? <> · <span className="text-emerald-700">−{p.excludedSqft.toFixed(1)} sq ft excluded</span></>
                          : null}
                        {l.placement ? <> · <span className="text-emerald-700">placement ✓</span></> : null}
                        {l.wallPhoto ? <> · <span className="text-emerald-700">wall photo ✓</span></> : null}
                      </p>
                    </div>
                    {p && <p className="text-xs font-semibold">₹{Math.round(p.total).toLocaleString("en-IN")}</p>}
                    <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      aria-label={`Remove ${l.printName}`}
                      className="text-xs text-slate underline">remove</button>
                  </div>
                );
              })}
            </div>
            {cartTotals.excluded > 0.05 && (
              <p className="mt-2 text-[11px] font-semibold text-emerald-700">
                {cartTotals.excluded.toFixed(1)} sq ft excluded across this project — not printed, not charged.
              </p>
            )}
            <div className="mt-3 flex items-baseline justify-between border-t border-edge pt-2.5">
              <span className="text-xs font-semibold text-slate">{cartTotals.sqft.toFixed(1)} sq ft total</span>
              <span className="font-display text-base font-extrabold">
                ₹{Math.round(cartTotals.inr).toLocaleString("en-IN")}<span className="text-[11px] font-normal text-mist"> incl. GST</span>
              </span>
            </div>
            {wallComplete && (
              <p className="mt-1.5 text-[11px] text-mist">The wall you&apos;re composing now joins the project when you send it.</p>
            )}
          </div>
        )}

        {pricingMode === "website" && !catalogueRate && widthMm > 0 && heightMm > 0 && (
          <p className="rounded-[14px] border border-dashed border-edge bg-wash px-4 py-3 text-xs text-slate">
            Choose a design from the Zyvorah catalogue to price this wall — your
            {" "}{discountPct}% partner discount is applied automatically.
          </p>
        )}

        {price && (
          <div className="rounded-[18px] border border-edge bg-surface p-5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-slate">{price.areaSqft.toFixed(1)} sq ft × ₹{effectiveRate}</span>
              <span className={price.discount > 0 ? "text-slate line-through" : "font-semibold"}>
                ₹{price.list.toLocaleString("en-IN")}
              </span>
            </div>
            {/* Say WHY the billed area beats the artwork's — a piece narrower
                than the roll still consumes the full web for every running
                metre, and a partner billed 48 sq ft for 24 sq ft of art
                deserves the arithmetic, not a surprise. */}
            {price.floorApplied && price.minWidth != null && (
              <p className="mt-1 text-[11px] text-mist">
                Artwork is {price.fullSqft.toFixed(1)} sq ft, billed at the roll&apos;s minimum
                billable width of {price.minWidth.toLocaleString("en-IN")} mm — a print
                narrower than the roll still uses the full web.
              </p>
            )}
            {price.discount > 0 && (
              <div className="mt-1 flex items-baseline justify-between text-sm">
                <span className="text-slate">Partner discount {discountPct}%</span>
                <span className="font-semibold text-emerald-700">
                  −₹{price.discount.toLocaleString("en-IN")}
                </span>
              </div>
            )}
            {price.discount > 0 && (
              <div className="mt-1 flex items-baseline justify-between text-sm">
                <span className="text-slate">Net</span>
                <span className="font-semibold">₹{price.amount.toLocaleString("en-IN")}</span>
              </div>
            )}
            {/* The heads the OS invoice will charge: IGST outside Maharashtra. */}
            {taxHeads(price.gst, gstPct, state || null).map(h => (
              <div key={h.label} className="mt-1 flex items-baseline justify-between text-sm">
                <span className="text-slate">{h.label}</span>
                <span>₹{h.amount.toLocaleString("en-IN")}</span>
              </div>
            ))}
            <div className="mt-3 flex items-baseline justify-between border-t border-edge pt-3">
              <span className="font-display font-bold">Total</span>
              <span className="font-display text-xl font-extrabold">
                ₹{price.total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-mist">
              Invoiced to your {state || "state"} GSTIN on account. Installation is arranged and paid directly with the installer.
            </p>
          </div>
        )}

        {err && <p className="text-sm text-red-600">{err}</p>}

        {/* Say it BEFORE the button is pressed, next to the button — not as a
            grey rectangle that reads as a dead page. */}
        {blockers.length > 0 && (
          <div className="rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold text-amber-900">
              {blockers.length === 1 ? "One thing before this can go to print:" : "Before this can go to print:"}
            </p>
            <ul className="mt-1 space-y-0.5">
              {blockers.map((m) => (
                <li key={m} className="text-xs text-amber-900">· {m}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Deliberately NOT disabled on missing inputs — a disabled button is
            indistinguishable from a broken one, and this one sits a full page
            below the fields it depends on. It always responds, and repeats
            what it still needs. Only a request already in flight disables it. */}
        <button
          onClick={() => {
            if (blockers.length) { setErr(blockers[0]); return; }
            void submit();
          }}
          disabled={busy || uploading}
          className="btn h-12 w-full text-[0.85rem] disabled:opacity-40">
          {busy
            ? "Sending to print…"
            : uploading
              ? "Waiting for the upload to finish…"
              : lines.length + (wallComplete ? 1 : 0) > 1
                ? `Send project to print — ${lines.length + (wallComplete ? 1 : 0)} walls`
                : "Send to print"}
        </button>

        {/* The other road out of this page: the person composing the walls is
            very often not the person who can commit the spend. Rather than
            screenshotting the cart into an email — and getting a PO back
            against a total nobody can tie to the walls — send the quotation
            itself, and let the PO land ON the order. */}
        {!shareSent && (
          <button
            onClick={() => { setShareOpen((o) => !o); setShareErr(null); }}
            disabled={busy || uploading}
            className="btn h-12 w-full text-[0.85rem] disabled:opacity-40">
            {shareOpen
              ? "Hide the PO form"
              : `Send quotation for PO approval — ${lines.length + (wallComplete ? 1 : 0)} wall${lines.length + (wallComplete ? 1 : 0) === 1 ? "" : "s"}`}
          </button>
        )}

        {shareOpen && !shareSent && (
          <div ref={shareRef} className="rounded-[14px] border border-edge bg-wash px-4 py-4">
            <p className="text-xs font-semibold">Who raises the purchase order?</p>
            <p className="mt-1 text-[11px] text-slate">
              They get this project by email and on WhatsApp. Nothing goes to print until they
              enter their PO number on the link — and that PO number lands on the order and the invoice.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <input value={shareName} onChange={(e) => setShareName(e.target.value)}
                placeholder="Their name" maxLength={80}
                className="w-full rounded-[10px] border border-edge bg-surface px-3 py-2.5 text-sm" />
              <input value={shareEmail} onChange={(e) => { setShareEmail(e.target.value); setShareErr(null); }}
                type="email" inputMode="email" placeholder="Their email"
                className="w-full rounded-[10px] border border-edge bg-surface px-3 py-2.5 text-sm" />
              <input value={sharePhone} onChange={(e) => { setSharePhone(e.target.value); setShareErr(null); }}
                type="tel" inputMode="tel" placeholder="WhatsApp number"
                className="w-full rounded-[10px] border border-edge bg-surface px-3 py-2.5 text-sm" />
            </div>
            {shareErr && <p className="mt-2.5 text-sm text-red-600">{shareErr}</p>}
            <button onClick={() => void sendQuotation()} disabled={shareBusy}
              className="btn mt-3 h-11 w-full text-[0.8rem] disabled:opacity-40">
              {shareBusy ? "Sending the quotation…" : "Send by email & WhatsApp"}
            </button>
          </div>
        )}

        {shareSent && (
          <div className="rounded-[14px] border border-emerald-200 bg-emerald-50 px-4 py-4">
            <p className="text-xs font-semibold text-emerald-900">
              Quotation sent{shareSent.emailed ? " by email" : ""}. WhatsApp has opened in a new tab — press send there.
            </p>
            <p className="mt-1.5 break-all text-[11px] text-emerald-900">{shareSent.url}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={shareSent.waUrl} target="_blank" rel="noopener"
                className="btn-ghost rounded-[10px] px-3 py-2 text-[11px]">Open WhatsApp again</a>
              <button onClick={() => { void navigator.clipboard?.writeText(shareSent.url); }}
                className="btn-ghost rounded-[10px] px-3 py-2 text-[11px]">Copy the link</button>
            </div>
            <p className="mt-2.5 text-[11px] text-emerald-900">
              These walls are NOT in production yet — they go to print the moment the PO number is entered.
              It also waits under &ldquo;Waiting on you&rdquo; on {accountName}&apos;s dashboard, for anyone there who places orders.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
