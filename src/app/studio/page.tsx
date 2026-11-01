"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { signAdminUpload, putSigned } from "@/lib/signed-upload";
import { type StylingKey, SPACE_CATEGORIES, type SpaceCategory } from "@/lib/studio-scenes";
import { FamilyTabs, StylingChips, QueueStatusStrip, FieldGroup, type FamilyTabConfig } from "./studio-ui";
import { AUTOGRAPH_RATE_LABEL, AUTOGRAPH_LABEL, roundRetail, formatINR } from "@/lib/pricing";
import { WALLPAPER_FINISHES, DEFAULT_WALLPAPER_FINISH, type WallpaperFinishSlug } from "@/lib/wallpaper-finish";
import { StaffGate, useStaff } from "@/lib/use-staff";

// Zyvorah Studio — upload wallpaper artwork, and the pipeline auto-names it,
// room-maps it (kids/nursery designs don't get generated into an Office),
// generates its room scenes (gpt-image-2), and assembles a product.
// Opened by the Google sign-in on the door (Cloudflare Access) and nothing else
// — the Studio spends real money on generation, so there is no shared key that
// could drive it from a browser nobody signed in on.
//
// A section per product family — Wallpaper, Wall art (canvas), Border — each
// creating that family's product, because they are priced and configured in
// genuinely different ways. Each takes the flat plus, optionally, room pictures
// of your own: those lead the gallery and anything generated follows them. A
// border almost always uses them, since the generator renders walls and framed
// pieces rather than a 10 cm strip.
//
// Plus the overnight batch (queue): drop in up to ~40 designs and walk away — a
// server-side worker chains through them on its own; this page just polls for
// progress so you can check on it, but it keeps going even if you close the tab.
//
// Every upload takes an optional room pick: tick the exact spaces to render (the
// same rooms and spaces a customer can shop by on the site), or leave it blank
// and let the pipeline choose what suits the design — except when you've added
// pictures of your own, where blank means "use just mine".

const TAB_STORE = "zyvorah:studio:tab";
const MAX_BATCH = 40;
const MAX_EXTRA = 5;

type Scenario = { key: string; label: string };
type RoomOption = { key: string; label: string; collection: string; collectionTitle: string; category: SpaceCategory };
/** A commissioned project (see src/lib/studio-projects.ts). Turning one on
 *  shoots every render inside that project's building — its shell rides every
 *  prompt and, once `anchored`, its approved style reference rides along too. */
type ProjectOption = { key: string; label: string; note: string; anchored: boolean; scenes: Scenario[] };
type SceneOptions = { rooms: RoomOption[]; extras: Scenario[]; projects?: ProjectOption[]; maxPicked: number };
/** An existing collection a design can be dropped into. `name` is the tag that
 *  joins it — the same string the collection's rule_tag holds. `thumb` is one
 *  design already in it: the picker shows the picture because a collection name
 *  ("Katha", "Quiet Column") does not say what it looks like, and picking blind
 *  is how a design ends up in the wrong one. */
type CollectionOption = {
  name: string;
  title: string;
  /** curated = an aesthetic, series = a provenance/price band, set = panels cut
   *  for one physical thing. See migration 0145. */
  kind: string;
  count: number;
  thumb: string | null;
};
type SceneState = { label: string; status: "pending" | "running" | "done" | "failed"; url?: string };
type BatchItem = {
  id: string; status: "queued" | "naming" | "scenes" | "done" | "failed";
  handle: string | null; title: string | null; scene_total: number; scene_index: number;
  error: string | null; created_at: string;
};

/** The config an overnight-batch queue run shares across every design in it —
 *  the subset of the single-design form that makes sense applied uniformly
 *  to many different artworks at once (see studio_batch_enqueue). */
type QueueOpts = {
  picks: string[];
  styling: StylingKey | null;
  seamless: boolean;
  repeatWidthCm: number;
  autograph: boolean;
  /** The ONE finish every design in the run is sold on. */
  finish: WallpaperFinishSlug;
  ceiling: boolean;
  /** A naming/tagging hint applied to every design in the run — "these are
   *  all patchwork" — same idea as the single-design context field, just
   *  shared across the whole batch instead of describing one image. */
  context: string;
  /** The shelves every design in the run joins — at most one per kind. */
  collections: Shelf[];
};

/** The three independent shelves a design can sit on at once. See migration
 *  0145 — separating them is what stopped /collections offering a price band
 *  and a mood as though they answered the same question. */
type ShelfKind = "curated" | "series" | "set";
/** One shelf an upload puts a design on. The kind travels with the name so a
 *  NEW name is created on the right shelf — see the API's collectionShelves. */
type Shelf = { name: string; kind: ShelfKind };
const SHELVES: { kind: ShelfKind; noun: string; plural: string; hint: string; placeholder: string }[] = [
  {
    kind: "curated", noun: "collection", plural: "collections",
    hint: "an aesthetic: how the wall looks",
    placeholder: "Choose a collection, or type a new name",
  },
  {
    kind: "series", noun: "series", plural: "series",
    hint: "where it comes from, and what it costs",
    placeholder: "Choose a series, or type a new name",
  },
  {
    kind: "set", noun: "set", plural: "sets",
    hint: "the wall it is cut for",
    placeholder: "Choose a set, or type a new name",
  },
];

/**
 * Collection field. One control doing two jobs: joining an existing collection,
 * or naming a new one.
 *
 * It used to be a bare <datalist>, which can only offer words — and a word is
 * exactly what a collection name is not able to explain. Two of ours were near
 * duplicates nobody could tell apart from the names alone, so designs went into
 * the wrong one for months. Every option therefore carries a design from the
 * collection and a count, grouped by what kind of thing the name IS, so the
 * uploader is choosing between pictures rather than between guesses.
 *
 * Typing is still how a collection is created — a collection grows a design at
 * a time and must never require a "make the whole thing in one go" step.
 */
function CollectionPicker({
  kind, label, value, onChange, options, disabled, note,
}: {
  kind: ShelfKind;
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: CollectionOption[];
  disabled?: boolean;
  note: string;
}) {
  const shelf = SHELVES.find((sh) => sh.kind === kind)!;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const q = value.trim().toLowerCase();
  // Each field offers only its own shelf. A design belongs on up to three at
  // once and they are independent questions — "what does it look like", "where
  // does it come from and what does it cost", "what wall is it cut for" — so
  // mixing them into one list is what made the old single field unanswerable.
  const mine = options.filter((c) => c.kind === kind);
  // While typing, the list narrows to what the text could still mean — so the
  // moment a name IS an existing collection, its picture is on screen.
  const matching = q ? mine.filter((c) => c.name.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)) : mine;

  return (
    <div className="relative" ref={box}>
      <label className="text-[0.72rem] font-semibold">
        {label} <span className="font-normal text-slate">— {shelf.hint}</span>
      </label>
      <input
        type="text" value={value} disabled={disabled} maxLength={80}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={shelf.placeholder}
        className="mt-1 h-10 w-full rounded-[12px] border border-edge bg-surface px-3 text-[0.72rem] outline-none placeholder:text-mist focus:border-charcoal disabled:opacity-40"
      />
      {open && !disabled && (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-[12px] border border-edge bg-surface shadow-lg">
          {matching.length === 0 && (
            <p className="px-3 py-3 text-[0.68rem] text-mist">
              {value.trim()
                ? `Nothing on this shelf matches — publishing creates “${value.trim()}” as a new ${shelf.noun}.`
                : `No ${shelf.plural} yet. Type a name to create the first one.`}
            </p>
          )}
          {matching.map((c) => (
            <button
              key={c.name} type="button"
              onClick={() => { onChange(c.name); setOpen(false); }}
              className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-cloud ${
                c.name.toLowerCase() === q ? "bg-cloud" : ""
              }`}
            >
              {c.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.thumb} alt="" className="h-9 w-9 shrink-0 rounded-[6px] object-cover" />
              ) : (
                <span className="h-9 w-9 shrink-0 rounded-[6px] border border-dashed border-edge" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.72rem] font-medium">{c.title}</span>
                <span className="block text-[0.62rem] text-mist">
                  {c.count ? `${c.count} design${c.count === 1 ? "" : "s"}` : "empty — nothing in it yet"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      <p className="mt-1 text-[0.62rem] text-mist">{note}</p>
    </div>
  );
}

/** Tickable room/space list. Blank = let the pipeline pick per design. */
function RoomPicker({
  options, selected, onChange, disabled, note, project,
}: {
  options: SceneOptions | null;
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  note?: string;
  /** Active commissioned project — its own spaces join the picker while it's
   *  on, and leave (with any picks of them) when it's off. */
  project?: ProjectOption | null;
}) {
  const [open, setOpen] = useState(false);
  if (!options) return null;
  const max = options.maxPicked;
  const full = selected.length >= max;

  const toggle = (k: string) => {
    if (selected.includes(k)) onChange(selected.filter((x) => x !== k));
    else if (!full) onChange([...selected, k]);
  };

  const Chip = ({ k, label }: { k: string; label: string }) => {
    const on = selected.includes(k);
    return (
      <button
        type="button" disabled={disabled || (!on && full)} onClick={() => toggle(k)}
        title={!on && full ? `${max} rooms is the most one design can be rendered into.` : label}
        className={`rounded-full px-3 py-1 text-[0.7rem] transition disabled:cursor-not-allowed disabled:opacity-40 ${
          on ? "bg-charcoal text-surface" : "bg-surface text-slate hover:bg-lavender/40"
        }`}
      >
        {on ? "✓ " : ""}{label}
      </button>
    );
  };

  return (
    <div className="mt-4 rounded-[16px] border border-edge bg-surface/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[0.72rem] font-semibold">
            Rooms to generate{" "}
            <span className="font-normal text-slate">
              {selected.length ? `— ${selected.length} of ${max} picked` : "— none picked, the pipeline will choose"}
            </span>
          </p>
          {note && <p className="mt-0.5 text-[0.68rem] text-mist">{note}</p>}
        </div>
        <div className="flex items-center gap-3">
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="text-[0.68rem] text-slate underline underline-offset-2">
              Clear
            </button>
          )}
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-[0.68rem] text-slate underline underline-offset-2">
            {open ? "Hide rooms" : "Pick rooms"}
          </button>
        </div>
      </div>

      {!open && selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((k) => {
            const o = [...options.rooms, ...options.extras, ...(project?.scenes ?? [])].find((x) => x.key === k);
            return <Chip key={k} k={k} label={o?.label ?? k} />;
          })}
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          {project && (
            <div>
              <p className="text-[0.62rem] font-semibold uppercase tracking-widest text-mist">
                {project.label} — project spaces
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {project.scenes.map((o) => <Chip key={o.key} k={o.key} label={o.label} />)}
              </div>
            </div>
          )}
          {SPACE_CATEGORIES.map((cat) => {
            const inCat = options.rooms.filter((o) => o.category === cat);
            if (!inCat.length) return null;
            return (
              <div key={cat}>
                <p className="text-[0.62rem] font-semibold uppercase tracking-widest text-mist">
                  {cat}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {inCat.map((o) => <Chip key={o.key} k={o.key} label={o.label} />)}
                </div>
              </div>
            );
          })}
          <div>
            <p className="text-[0.62rem] font-semibold uppercase tracking-widest text-mist">
              Extra shots (no collection of their own)
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {options.extras.map((o) => <Chip key={o.key} k={o.key} label={o.label} />)}
            </div>
          </div>
          <p className="text-[0.66rem] text-mist">
            Ticking a shop-by-room space also puts the design into that collection on the site, with this
            render as its card image. Up to {max} per design.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The commissioned-project switch — a sitting-wide setting, deliberately
 * OUTSIDE the per-family upload form: it governs the restage panel's renders
 * exactly as it governs fresh uploads, and switching family tabs must not
 * silently drop it. While a project is on, every render is shot inside that
 * project's building (see src/lib/studio-projects.ts).
 */
function ProjectPicker({
  options, value, onChange, disabled,
}: {
  options: ProjectOption[];
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  if (!options.length) return null;
  const active = options.find((p) => p.key === value) ?? null;
  // A render helper, not a component — a component declared here would be
  // remade (and lose state) every render, which the lint rule rightly bans.
  const chip = (k: string, label: string) => (
    <button
      key={k || "none"}
      type="button" disabled={disabled} onClick={() => onChange(k)}
      className={`rounded-full px-3 py-1 text-[0.7rem] transition disabled:cursor-not-allowed disabled:opacity-40 ${
        (value || "") === k ? "bg-charcoal text-surface" : "bg-surface text-slate hover:bg-lavender/40"
      }`}
    >
      {(value || "") === k ? "✓ " : ""}{label}
    </button>
  );
  return (
    <div className="mb-4 rounded-[16px] border border-edge bg-surface/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.72rem] font-semibold">
          Commissioned project{" "}
          <span className="font-normal text-slate">— every render this sitting is shot inside the project&rsquo;s building</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {chip("", "None")}
          {options.map((p) => chip(p.key, p.label))}
        </div>
      </div>
      {active && (
        <p className="mt-1.5 text-[0.66rem] text-mist">
          {active.note}{" "}
          {active.anchored
            ? "The approved style anchor rides every render."
            : "No style anchor approved yet — these renders ARE the anchor candidates; once one is approved it locks the look for everything after."}{" "}
          Single designs only — the overnight batch can&rsquo;t carry a project yet.
        </p>
      )}
    </div>
  );
}

/** The three product families, each uploaded from its own tab. A fourth,
 *  "wraps" (fridge/washing-machine wraps), joins later — adding it is one
 *  more entry in FAMILIES plus its own `family === "wraps"` branches inside
 *  UploadPanel; the tab bar and layout need no surgery. */
type Family = "wallpaper" | "canvas" | "border";

type FamilyConfig = FamilyTabConfig & {
  key: Family;
  note: string;
  roomNote: string;
  /** Wallpaper only: the artwork picker takes more than one file, and picking
   *  more than one queues them as an overnight batch instead of running the
   *  single-design pipeline inline — same form, decided by file count. */
  hasBatch?: boolean;
  /** Canvas only: wires up the bulk-upload sub-panel. */
  hasBulk?: boolean;
};

const FAMILIES: FamilyConfig[] = [
  {
    key: "wallpaper",
    title: "Wallpaper",
    blurb: "Made to the customer's wall, priced per sq ft.",
    note: "Pick a flat, choose rooms, hit Go.",
    roomNote: "Leave blank and the design gets the rooms that genuinely suit it.",
    tabActive: "bg-ink-blue text-surface shadow-sm",
    tabHover: "hover:bg-ink-blue/15",
    panelAccent: "border-ink-blue",
    hasBatch: true,
  },
  {
    key: "canvas",
    title: "Wall Art",
    blurb: "Fixed finished sizes, priced per piece, shipped rolled to frame at home.",
    note: "Pick the artwork, tick the sizes and media it works in, hit Go.",
    roomNote: "Pick rooms where the framed canvas will be shown.",
    tabActive: "bg-ink-terracotta text-surface shadow-sm",
    tabHover: "hover:bg-ink-terracotta/15",
    panelAccent: "border-ink-terracotta",
    hasBulk: true,
  },
  {
    key: "border",
    title: "Border",
    blurb: "Sold per linear metre, supplied in 1 m pieces.",
    note: "Pick the strip artwork and hit Go — set its height and price before publishing.",
    roomNote: "Pick rooms where the border will be shown.",
    tabActive: "bg-ink-forest text-surface shadow-sm",
    tabHover: "hover:bg-ink-forest/15",
    panelAccent: "border-ink-forest",
  },
];

const FAMILY_BY_KEY: Record<Family, FamilyConfig> = Object.fromEntries(
  FAMILIES.map((f) => [f.key, f]),
) as Record<Family, FamilyConfig>;

/** The canvas size ladder, in the Studio's own words. A canvas prints edge to
 *  edge, so the SHAPE of every size is the artwork's own — the uploader picks
 *  how big, never what shape (see src/lib/canvas-sizes.ts). Keys match the API. */
const CANVAS_SIZES: { key: string; label: string; note: string }[] = [
  { key: "s", label: "Small", note: "~2 ft on the short side" },
  { key: "m", label: "Medium", note: "~3 ft on the short side" },
  { key: "l", label: "Large", note: "~4 ft on the short side" },
];

/** Wall art's two media — the same artwork, two different goods. Both on by
 *  default; untick one only when a design suits a single medium. */
const CANVAS_MEDIA: { key: string; label: string; note: string }[] = [
  { key: "canvas", label: "Canvas", note: "eco-cotton, shipped rolled, framed at home" },
  { key: "self-adhesive", label: "Self-adhesive", note: "peel & stick, no framing — the Amazon medium" },
];

export type UploadPayload = {
  family: Family;
  file: File;
  context: string;
  styleFile: File | null;
  picks: string[];
  sizes: string[];
  media: string[];
  /** Room pictures of your own, attached ahead of anything generated. */
  extras: File[];
  /** How the rooms are dressed. null = let the artwork decide (its own Mood /
   *  Bold / Dark tags), which is right for most uploads. */
  styling: StylingKey | null;
  /** Seamless tile: the design repeats at `repeatWidthCm` on the wall instead
   *  of one copy being scaled to fit it. null = one composition, as before. */
  repeatWidthCm: number | null;
  /** From the dedicated ceiling range — every room scene shows it on the
   *  ceiling instead of the wall. Wallpaper only. */
  isCeiling: boolean;
  /** An explicit product name. Empty = let the pipeline name it. */
  titleOverride: string;
  /** Autograph = the top price category: linen-textured (non-woven)
   *  only, and never exported to Amazon, Pepperfry or anywhere else. */
  isAutograph: boolean;
  /** The ONE finish a wallpaper is sold on (see wallpaper-finish.ts). */
  finish: WallpaperFinishSlug;
  /** Limited-edition wall art: the edition size (e.g. 5). null = open edition. */
  editionLimit: number | null;
  /** What the piece SELLS for, in rupees — a limited edition is priced as a
   *  work, not by the square foot. null = the standard limited-edition rate. */
  editionPrice: number | null;
  /** The artist's own story of the piece — the AI writes the product page's
   *  story from this, faithfully. Empty = normal AI description. */
  story: string;
  /** The shelves this design joins — a collection (an aesthetic), a series (a
   *  provenance or price band) and a set (panels cut for one physical thing),
   *  each picked from the ones that already exist or typed fresh to create one.
   *  Empty = on no shelf. */
  collections: Shelf[];
};

/** A row in Recent designs. `family` and the seamless pair are enriched by the
 *  API on top of studio_recent, so an existing catalogue design can be marked a
 *  tile long after it was uploaded — the only way the feature reaches the
 *  hundreds of designs that predate it. */
type RecentDesign = {
  handle: string;
  title: string;
  status: string;
  family?: "wallpaper" | "canvas" | "border";
  isSeamless?: boolean;
  repeatWidthCm?: number | null;
  /** Limited editions carry a SET price — the piece is worth what it is worth.
   *  `price` is the figure the storefront quotes, so the two can't disagree. */
  isLimited?: boolean;
  price?: number | null;
  /** A concept-page design that is drawn only once it is bought. It has no
   *  product images on purpose — `referenceUrl` is the room render shown on
   *  the concept page, and is a reference, never a print source. */
  concept?: { slug: string; referenceUrl: string; space: string } | null;
};

/**
 * One family's upload panel. Each of the three sections owns its own file,
 * context, style reference and room pick, so switching between them never
 * carries a half-filled form across — they are different products, filled in
 * at different times.
 */
function UploadPanel({
  family, sceneOptions, collectionOptions, project, busy, onRun, onBulk, onQueue,
}: {
  family: Family;
  sceneOptions: SceneOptions | null;
  collectionOptions: CollectionOption[];
  /** Active commissioned project — read-only here; the switch lives with the
   *  parent so it also governs the restage panel. */
  project?: ProjectOption | null;
  busy: boolean;
  onRun: (p: UploadPayload) => Promise<void>;
  /** Wall art only: many artworks at once — named, coded and configured in the
   *  picked media AND ticked sizes, NO room scenes. Desk-ready drafts. */
  onBulk?: (files: File[], media: string[], sizes: string[]) => Promise<void>;
  /** Wallpaper only: picking more than one file above queues them as an
   *  overnight batch instead of running the single-design pipeline inline —
   *  same form, same config, just applied to every file at once. */
  onQueue?: (files: File[], opts: QueueOpts) => Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [context, setContext] = useState("");
  const [styleFile, setStyleFile] = useState<File | null>(null);
  const [styling, setStyling] = useState<StylingKey | null>(null);
  const [seamless, setSeamless] = useState(false);
  const [ceiling, setCeiling] = useState(false);
  const [autograph, setAutograph] = useState(false);
  // The one finish the design is sold on. Like Autograph, NOT reset between
  // uploads: a run of designs is usually specified on one stock.
  const [finish, setFinish] = useState<WallpaperFinishSlug>(DEFAULT_WALLPAPER_FINISH);
  // Three independent shelves — see SHELVES. Kept as three fields rather than
  // one because a design is routinely all three at once: Autograph-priced, in
  // the Maharaja's Court aesthetic, drawn for a phone booth.
  const [series, setSeries] = useState("");
  const [collectionSet, setCollectionSet] = useState("");
  const [titleOverride, setTitleOverride] = useState("");
  const [repeatCm, setRepeatCm] = useState(60);
  const [picks, setPicks] = useState<string[]>([]);
  const [extras, setExtras] = useState<File[]>([]);
  // Project spaces leave the picker with their project — drop any pick that
  // stopped being a valid key the moment the switch changes, or Go would send
  // keys the API rejects. Render-time adjustment (the documented pattern for
  // deriving state from a changed prop), not an effect: the strip must land
  // before the same render's RoomPicker paints its chips.
  const projectKey = project?.key ?? "";
  const [prevProjectKey, setPrevProjectKey] = useState(projectKey);
  if (prevProjectKey !== projectKey) {
    setPrevProjectKey(projectKey);
    if (sceneOptions) {
      const valid = new Set([
        ...[...sceneOptions.rooms, ...sceneOptions.extras].map((o) => o.key),
        ...(project?.scenes ?? []).map((s) => s.key),
      ]);
      setPicks((prev) => prev.filter((k) => valid.has(k)));
    }
  }
  // Canvas only. Every size and both media on by default — narrowing is the
  // exception, not the rule.
  const [sizes, setSizes] = useState<string[]>(CANVAS_SIZES.map((s) => s.key));
  const [media, setMedia] = useState<string[]>(CANVAS_MEDIA.map((m) => m.key));
  // Canvas only: limited-edition pieces — a small numbered edition.
  const [limited, setLimited] = useState(false);
  const [editionLimit, setEditionLimit] = useState(5);
  // The price of the piece, in whole rupees. Blank = fall back to the standard
  // limited-edition rate, which is how every piece was priced before this.
  const [editionPrice, setEditionPrice] = useState("");
  // Every family: the design's own story, which becomes the product page's
  // description when it is written.
  const [story, setStory] = useState("");
  // The collection this design joins. Starts empty and is deliberately NOT
  // reset between uploads: designs arrive in runs ("today's ikat batch"), so
  // the name typed once carries to the next one until it is changed.
  const [collection, setCollection] = useState("");
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const styleRef = useRef<HTMLInputElement | null>(null);
  const extraRef = useRef<HTMLInputElement | null>(null);
  const bulkRef = useRef<HTMLInputElement | null>(null);
  const meta = FAMILY_BY_KEY[family];
  // Picking more than one artwork file only ever means something on
  // Wallpaper (the only family with a queue behind it) — everywhere else the
  // input stays single-file, same as before.
  const isBatch = Boolean(meta.hasBatch) && files.length > 1;
  // An exact, case-insensitive hit on an existing collection. Matching here is
  // what stops "ikat collection" quietly creating a second collection beside
  // "Ikat Collection".
  const matchFor = (v: string, kind: ShelfKind) =>
    collectionOptions.find((c) => c.kind === kind && c.name.toLowerCase() === v.trim().toLowerCase()) ?? null;
  const collectionMatch = matchFor(collection, "curated");
  const seriesMatch = matchFor(series, "series");
  const setMatch = matchFor(collectionSet, "set");
  // Autograph is a PRICE before it is a shelf: 29 of 29 designs tagged Autograph
  // are priced at the Autograph tier, and a design tagged into it at ₹300 would
  // be a bug in the catalogue, not a variation. So choosing it as the series is
  // choosing the tier — the checkbox below follows and locks rather than
  // offering a second, disagreeing answer to the same question.
  const seriesSetsAutograph = series.trim().toLowerCase() === AUTOGRAPH_LABEL.toLowerCase();
  const isAutographRun = autograph || seriesSetsAutograph;

  // A limited edition's price. Everything here is checked again in the API —
  // this is so the reason shows on the field instead of arriving as a failed
  // upload after the artwork has been read and named.
  const priceValue = Math.round(Number(editionPrice.replace(/[^0-9.]/g, "")) || 0);
  const priceSet = family === "canvas" && limited && priceValue > 0;
  //  · one price can only describe one size
  //  · fixed-size prices land on clean figures (see roundRetail)
  //  · Autograph pins its own rate in the database and would overwrite this
  const priceNeedsOneSize = priceSet && sizes.length !== 1;
  const priceNotClean = priceSet && roundRetail(priceValue) !== priceValue;
  const priceFightsAutograph = priceSet && isAutographRun;
  const priceProblem = priceNeedsOneSize
    ? `Pick ONE size above — a single price can't describe ${sizes.length} of them.`
    : priceNotClean
      ? `Use ${formatINR(roundRetail(priceValue))} — fixed-size prices land on the nearest ₹1,000.`
      : priceFightsAutograph
        ? "Autograph sets its own rate, so a price can't be set on top of it."
        : "";

  const goBulk = async () => {
    if (!bulkFiles.length || !onBulk) return;
    await onBulk(bulkFiles, media, sizes);
    setBulkFiles([]);
    if (bulkRef.current) bulkRef.current.value = "";
  };

  const go = async () => {
    if (!files.length || priceProblem) return;
    // Send the collection's own spelling when the typed text matches one that
    // exists — a tag differing only in case would make a second collection.
    // Send each shelf's own spelling when the typed text matches one that
    // exists — a tag differing only in case would make a second collection.
    const shelves = [
      { name: collectionMatch?.name ?? collection.trim(), kind: "curated" as const },
      { name: seriesMatch?.name ?? series.trim(), kind: "series" as const },
      { name: setMatch?.name ?? collectionSet.trim(), kind: "set" as const },
    ].filter((sh) => sh.name);
    if (isBatch) {
      if (!onQueue) return;
      await onQueue(files, { picks, styling, seamless, repeatWidthCm: repeatCm, autograph: isAutographRun, finish, ceiling, context: context.trim(), collections: shelves });
    } else {
      await onRun({
        family, file: files[0], context, styleFile, picks, sizes, media, extras, styling,
        repeatWidthCm: seamless ? repeatCm : null,
        editionLimit: family === "canvas" && limited ? editionLimit : null,
        editionPrice: priceSet ? priceValue : null,
        story,
        collections: shelves,
        isCeiling: family === "wallpaper" && ceiling,
        titleOverride: titleOverride.trim(),
        isAutograph: isAutographRun,
        finish,
      });
    }
    setFiles([]); setContext(""); setStyleFile(null); setExtras([]); setStyling(null);
    setSeamless(false); setRepeatCm(60); setCeiling(false); setTitleOverride("");
    // Autograph is deliberately NOT reset: uploads come in runs, and a whole
    // sitting is usually one tier. Reset it by hand when the run changes.

    setLimited(false); setEditionLimit(5); setEditionPrice(""); setStory("");
    // The three shelves are intentionally left as-is — the next design in
    // today's run stays on them unless the uploader changes them.
    setSizes(CANVAS_SIZES.map((s) => s.key));
    setMedia(CANVAS_MEDIA.map((m) => m.key));
    if (fileRef.current) fileRef.current.value = "";
    if (styleRef.current) styleRef.current.value = "";
    if (extraRef.current) extraRef.current.value = "";
  };

  // Numbers each visible FieldGroup in document order — a conditional group
  // that doesn't render for this family (e.g. "How it hangs" outside
  // Wallpaper) is never counted, because the `&&` short-circuit means
  // `step()` is never called for it.
  let stepN = 0;
  const step = () => String(++stepN).padStart(2, "0");

  const stylingHelper =
    styling === "bold"
      ? "Editorial: the artwork's strongest colour comes back as one hard-edged statement piece against black, chrome or stone, under hard directional light. No beige, no linen, no cosy clutter."
      : styling === "calm"
        ? "The house style — soft, natural and residential. Forced on even if the artwork reads as a statement piece, or is Limited Edition."
        : styling === "gallery"
          ? "Museum wall, track spotlight, polished floor, generous negative space — the piece as art, not decor. Forced on even for a non-Limited-Edition design."
          : "Auto — Limited Edition renders in the gallery register, a design tagged Dramatic/Bold/Dark renders bold, everything else gets the calm house style.";

  return (
    <div className="px-6 pb-24">
      <FieldGroup step={step()} title="Artwork">
        <input
          ref={fileRef} type="file" accept="image/*" disabled={busy}
          multiple={meta.hasBatch}
          onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, meta.hasBatch ? MAX_BATCH : 1))}
          className="text-sm file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-charcoal file:px-4 file:py-2 file:text-surface"
        />
        {files.length === 1 && <p className="mt-2 truncate text-[0.68rem] text-slate">{files[0].name}</p>}
        {isBatch && (
          <p className="mt-2 text-[0.68rem] text-slate">
            {files.length} files picked — Go queues them as an overnight batch, drop and go, safe to close this tab
            once queued. Everything below applies to every design in the run; a few fields only make sense for one
            design at a time and are switched off while more than one file is picked.
          </p>
        )}

        {/* Canvas: which of the fixed sizes this particular design is sold in.
            A busy composition may only read well large; a simple one works at
            every size. At least one must stay ticked. */}
        {family === "canvas" && (
          <div className="mt-5">
            <p className="text-[0.72rem] font-semibold">
              Sizes this design is sold in{" "}
              <span className="font-normal text-slate">— {sizes.length} of {CANVAS_SIZES.length}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {CANVAS_SIZES.map((s) => {
                const on = sizes.includes(s.key);
                const last = on && sizes.length === 1;
                return (
                  <button
                    key={s.key}
                    type="button"
                    disabled={busy || last}
                    title={last ? "A canvas needs at least one size." : `${s.label} — ${s.note}`}
                    onClick={() => setSizes((prev) => (on ? prev.filter((k) => k !== s.key) : [...prev, s.key]))}
                    className={`rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      on ? "border-charcoal bg-charcoal text-surface" : "border-edge text-slate hover:border-slate"
                    }`}
                  >
                    {on ? "✓ " : ""}{s.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[0.62rem] text-mist">
              Untick any size this artwork shouldn&apos;t be sold at. The exact inches follow the
              artwork&apos;s own shape — a 2:3 painting is sold at 2:3, a 3:5 at 3:5 — so no size ever
              crops it. A landscape image uses the same sizes the other way round.
            </p>

            {/* Which media it sells in — both by default. Amazon only ever
                takes the self-adhesive line; the site sells whichever are
                ticked. This is the "Canvas / Self-adhesive" choice. */}
            <p className="mt-5 text-[0.72rem] font-semibold">
              Sold as{" "}
              <span className="font-normal text-slate">— {media.length} of {CANVAS_MEDIA.length}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {CANVAS_MEDIA.map((m) => {
                const on = media.includes(m.key);
                const last = on && media.length === 1;
                return (
                  <button
                    key={m.key}
                    type="button"
                    disabled={busy || last}
                    title={last ? "Wall art needs at least one medium." : m.note}
                    onClick={() => setMedia((prev) => (on ? prev.filter((k) => k !== m.key) : [...prev, m.key]))}
                    className={`rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      on ? "border-charcoal bg-charcoal text-surface" : "border-edge text-slate hover:border-slate"
                    }`}
                  >
                    {on ? "✓ " : ""}{m.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[0.62rem] text-mist">
              Canvas ships rolled to frame at home · self-adhesive peels straight onto the wall (and is what Amazon gets).
            </p>

            {/* Limited edition: a small numbered edition with the artist's own
                story. The story IS the product page — the AI retells it
                faithfully, never inventing facts that aren't in it. */}
            <div className="mt-5 rounded-[16px] border border-edge bg-surface/60 p-4">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={limited}
                  disabled={busy}
                  onChange={(e) => setLimited(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-charcoal"
                />
                <span className="text-[0.72rem] leading-snug">
                  <span className="font-semibold">Limited edition piece</span>
                  <span className="block text-mist">
                    Sold as a small numbered edition — once it sells out, it is never printed again.
                    Gets the &ldquo;Limited edition&rdquo; badge and joins the Limited Edition collection.
                  </span>
                </span>
              </label>
              {limited && (
                <div className="mt-3 space-y-3 pl-6.5">
                  <div className="flex items-center gap-2">
                    <label className="text-[0.7rem] font-semibold">Edition of</label>
                    <input
                      type="number" min={1} max={500} value={editionLimit} disabled={busy}
                      onChange={(e) => setEditionLimit(Math.min(500, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="h-9 w-20 rounded-[10px] border border-edge bg-surface px-2 text-center text-[0.72rem] outline-none focus:border-charcoal"
                    />
                    <span className="text-[0.62rem] text-mist">pieces, ever. 5 is the house standard.</span>
                  </div>
                  {/* The price of the piece. A limited edition is not priced
                      by the square foot — it is worth what it is worth — so
                      this is the number the customer sees, GST included. Left
                      blank, the piece falls back to the standard
                      limited-edition rate, exactly as before. */}
                  <div className="flex items-center gap-2">
                    <label className="text-[0.7rem] font-semibold">Price ₹</label>
                    <input
                      type="text" inputMode="numeric" value={editionPrice} disabled={busy}
                      placeholder="31000"
                      onChange={(e) => setEditionPrice(e.target.value)}
                      className={`h-9 w-28 rounded-[10px] border bg-surface px-2 text-center text-[0.72rem] outline-none focus:border-charcoal ${
                        priceProblem ? "border-red-500" : "border-edge"
                      }`}
                    />
                    <span className="text-[0.62rem] text-mist">
                      {priceSet && !priceProblem
                        ? `the piece sells at ${formatINR(priceValue)}, inclusive.`
                        : "what the piece sells for, inclusive. Blank = the standard limited-edition rate."}
                    </span>
                  </div>
                  {priceProblem && (
                    <p className="text-[0.62rem] font-semibold text-red-600">{priceProblem}</p>
                  )}
                  <p className="text-[0.62rem] text-mist">
                    Write the piece&apos;s story in{" "}
                    <span className="font-semibold">The story behind it</span> below — on a limited
                    edition it is what the whole product page is written from.
                  </p>
                  <p className="text-[0.62rem] text-mist">
                    A named series is just a collection — set it in{" "}
                    <span className="font-semibold">Name &amp; tags</span> below.
                  </p>
                </div>
              )}
            </div>

            {/* Bulk lane: many artworks, no room scenes — each is named, coded,
                and configured in the ticked media, sized to its own shape
                (squares get the square ladder, rectangles the rectangle one,
                landscape auto-transposed). Drafts, ready on the export desk. */}
            {onBulk && (
              <div className="mt-5 rounded-[16px] border border-edge bg-surface/60 p-4">
                <p className="text-[0.72rem] font-semibold">
                  Bulk upload <span className="font-normal text-slate">— name &amp; code only, no room scenes</span>
                </p>
                <p className="mt-0.5 text-[0.62rem] text-mist">
                  Pick many artworks — batch squares together, rectangles together. Each is AI-named, given its ZYV
                  code, and set up in the media <em>and sizes ticked above</em>, so tick the batch&apos;s sizes first
                  (landscape images flip them automatically). Leave all six ticked and each artwork instead gets the
                  sizes matching its own shape. Drafts land on the FBA export desk; publish whenever you&apos;re ready.
                </p>
                <input
                  ref={bulkRef} type="file" accept="image/*" multiple disabled={busy}
                  onChange={(e) => setBulkFiles(Array.from(e.target.files ?? []))}
                  className="mt-2 text-[0.72rem] file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-charcoal file:px-4 file:py-2 file:text-surface"
                />
                {bulkFiles.length > 0 && (
                  <p className="mt-1 text-[0.62rem] text-slate">{bulkFiles.length} artwork{bulkFiles.length > 1 ? "s" : ""} ready</p>
                )}
                <button
                  onClick={goBulk} disabled={busy || !bulkFiles.length}
                  className="btn mt-3 h-10 px-5 text-[0.75rem] disabled:opacity-40"
                >
                  {busy ? "Working…" : `Upload ${bulkFiles.length || ""} artwork${bulkFiles.length === 1 ? "" : "s"}`}
                </button>
              </div>
            )}
          </div>
        )}
      </FieldGroup>

      <FieldGroup step={step()} title="Name & tags">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-[0.72rem] font-semibold">
              What is this image? <span className="font-normal text-slate">— optional</span>
            </label>
            <input
              type="text" value={context} disabled={busy} maxLength={200}
              onChange={(e) => setContext(e.target.value)}
              placeholder={isBatch ? "e.g. these are all patchwork quilt patterns…" : "e.g. Lord Ganesha, abstract botanical, Pichwai cow…"}
              className="mt-1 h-10 w-full rounded-[12px] border border-edge bg-surface px-3 text-[0.72rem] outline-none placeholder:text-mist focus:border-charcoal disabled:opacity-40"
            />
            <p className="mt-1 text-[0.62rem] text-mist">
              {isBatch ? "Applies to every design in this batch — helps the AI name and tag each one." : "Helps the AI name and tag it correctly."}
            </p>
          </div>

          {/* An explicit name always wins over the AI's. Left blank, the
              pipeline names it as before. */}
          <div>
            <label className="text-[0.72rem] font-semibold">
              Name it yourself <span className="font-normal text-slate">— optional</span>
            </label>
            <input
              type="text" value={titleOverride} disabled={busy || isBatch} maxLength={60}
              onChange={(e) => setTitleOverride(e.target.value)}
              placeholder="Leave blank and the Studio names it"
              className="mt-1 h-10 w-full rounded-[12px] border border-edge bg-surface px-3 text-[0.72rem] outline-none placeholder:text-mist focus:border-charcoal disabled:opacity-40"
            />
            <p className="mt-1 text-[0.62rem] text-mist">
              {isBatch
                ? "One design at a time only — one name can't cover a whole batch, so the Studio names each one."
                : "Type a name here and it is used exactly as written — the AI never overrides it."}
            </p>
          </div>

          {/* The three shelves. One field each, because they are independent
              questions and a design is routinely all three at once. Each offers
              the names that already exist WITH a design from them — a name like
              "Katha" or "Quiet Column" cannot explain itself — and anything
              typed that isn't on the list creates it on that shelf. */}
          <div className="md:col-span-2 grid gap-3 md:grid-cols-3">
            <CollectionPicker
              kind="curated" label="Collection"
              value={collection} onChange={setCollection}
              options={collectionOptions} disabled={busy}
              note={`${
                collectionMatch
                  ? `Joins "${collectionMatch.title}" — ${collectionMatch.count} design${collectionMatch.count === 1 ? "" : "s"} already in it.`
                  : collection.trim()
                    ? `New — creates a collection called "${collection.trim()}".`
                    : "Optional."
              }${collection.trim() && isBatch ? " Applies to every design in this batch." : ""}`}
            />
            <CollectionPicker
              kind="series" label="Series"
              value={series} onChange={setSeries}
              options={collectionOptions} disabled={busy}
              note={`${
                seriesSetsAutograph
                  ? `Autograph with a linen feel; default ${AUTOGRAPH_RATE_LABEL}, with collection exceptions. Never exported.`
                  : seriesMatch
                    ? `Joins "${seriesMatch.title}" — ${seriesMatch.count} design${seriesMatch.count === 1 ? "" : "s"} already in it.`
                    : series.trim()
                      ? `New — creates a series called "${series.trim()}".`
                      : "Optional."
              }${series.trim() && isBatch ? " Applies to every design in this batch." : ""}`}
            />
            <CollectionPicker
              kind="set" label="Set"
              value={collectionSet} onChange={setCollectionSet}
              options={collectionOptions} disabled={busy}
              note={`${
                setMatch
                  ? `Joins "${setMatch.title}" — ${setMatch.count} design${setMatch.count === 1 ? "" : "s"} already in it.`
                  : collectionSet.trim()
                    ? `New — creates a set called "${collectionSet.trim()}".`
                    : "Optional."
              }${collectionSet.trim() && isBatch ? " Applies to every design in this batch." : ""}`}
            />
          </div>
        </div>
      </FieldGroup>

      {/* The long-form field. Most designs never need it, but the ones with a
          real story behind them — where a motif came from, what a colourway
          means, what went into drawing it — used to have nowhere to put it
          unless they happened to be a limited-edition canvas. The Studio
          retells whatever is written here faithfully and invents nothing, so
          it is worth writing at length. Single designs only: one story cannot
          describe a whole queued batch. */}
      {!isBatch && (
        <FieldGroup
          step={step()}
          title="The story behind it"
          subtitle="Optional — leave it blank and the page is written from the image, as usual."
        >
          <textarea
            value={story} disabled={busy} rows={8} maxLength={6000}
            onChange={(e) => setStory(e.target.value)}
            placeholder="Where it came from, what it means, what went into it, what it is meant to do to a room — write freely and at length. The Studio writes the product page from this and stays faithful to it: nothing you didn't say will be added."
            className="w-full rounded-[12px] border border-edge bg-surface p-3 text-[0.72rem] leading-relaxed outline-none placeholder:text-mist focus:border-charcoal disabled:opacity-40"
          />
          <p className="mt-1 text-[0.62rem] text-mist">
            {story.length
              ? `${story.length} of 6,000 characters — the page is written from this, not from the image.`
              : "The richer the story, the better the page. Up to 6,000 characters."}
          </p>
        </FieldGroup>
      )}

      {/* Wallpaper only: a canvas is a finished piece, and a border already
          repeats along its length by construction. */}
      {family === "wallpaper" && (
        <FieldGroup step={step()} title="How it hangs">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={seamless}
                  disabled={busy}
                  onChange={(e) => setSeamless(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-charcoal"
                />
                <span className="text-[0.72rem] leading-snug">
                  <span className="font-semibold">{isBatch ? "Queue this batch as a seamless tile" : "This artwork is a seamless tile"}</span>
                  <span className="block text-mist">
                    {isBatch ? "Every design in this batch repeats" : "It repeats"} across the wall at a fixed size
                    instead of one copy being scaled up to fit. Only tick this if {isBatch ? "every artwork you're queuing" : "the artwork"}{" "}
                    actually butts against itself on all four edges.
                  </span>
                </span>
              </label>
              {seamless && (
                <div className="mt-2 flex items-center gap-2 pl-6.5">
                  <label className="text-[0.7rem] font-semibold">Repeats every</label>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    step={1}
                    value={repeatCm}
                    disabled={busy}
                    onChange={(e) => setRepeatCm(Number(e.target.value))}
                    className="h-9 w-20 rounded-[10px] border border-edge bg-surface px-2 text-[0.72rem] outline-none focus:border-charcoal"
                  />
                  <span className="text-[0.7rem] text-slate">cm across</span>
                </div>
              )}
              {seamless && (
                <p className="mt-1 pl-6.5 text-[0.62rem] text-mist">
                  This is the design&apos;s own scale and the customer can&apos;t change it — they can only shift
                  where the repeat falls. Height follows the artwork&apos;s shape, so the tile is never distorted.
                  5–300 cm.
                </p>
              )}
            </div>

            {/* Ceiling wallpaper: same wallpaper, same materials and sizing —
                the only difference is every generated room scene shows it
                applied to the CEILING instead of the wall. */}
            <div>
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={ceiling}
                  disabled={busy}
                  onChange={(e) => setCeiling(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-charcoal"
                />
                <span className="text-[0.72rem] leading-snug">
                  <span className="font-semibold">{isBatch ? "Queue this batch as ceiling wallpaper" : "This is a ceiling wallpaper"}</span>
                  <span className="block text-mist">
                    From the dedicated ceiling range. Pick rooms as usual below — every scene shows{" "}
                    {isBatch ? "every design in this batch" : "this design"} applied to that room&apos;s CEILING, not
                    its wall. Joins the Ceiling Wallpaper collection.
                  </span>
                </span>
              </label>
            </div>

            {/* The ONE finish this design is sold on. The product page never
                offers a choice between stocks; this is where the choice is made.
                Autograph answers it already (linen at its own rate). */}
            {!isAutographRun && (
              <div>
                <p className="text-[0.72rem] font-semibold">Finish{isBatch ? " for every design in this batch" : ""}</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {WALLPAPER_FINISHES.map((f) => (
                    <label
                      key={f.slug}
                      className={`flex cursor-pointer items-center gap-2 rounded-[12px] border px-3 py-2 text-[0.72rem] ${finish === f.slug ? "border-charcoal bg-charcoal/[0.05]" : "border-edge"}`}
                    >
                      <input
                        type="radio"
                        name="wallpaper-finish"
                        checked={finish === f.slug}
                        disabled={busy}
                        onChange={() => setFinish(f.slug)}
                        className="h-4 w-4 accent-charcoal"
                      />
                      <span className="font-semibold">{f.label}</span>
                      <span className="text-mist">Price follows the design’s collection</span>
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-[0.7rem] text-mist">
                  The customer is offered this finish only. Stays chosen between uploads.
                </p>
              </div>
            )}

            {/* Autograph — the PRICE CATEGORY, chosen at upload so the design is
                never briefly live at ₹200. Deliberately styled apart from the
                checkboxes above: those change how a design is rendered, this
                changes what the customer is charged and stops it reaching any
                marketplace. */}
            <div className={`rounded-[12px] border p-3 transition-colors ${isAutographRun ? "border-charcoal bg-charcoal/[0.05]" : "border-edge"}`}>
              <label className={`flex items-start gap-2.5 ${seriesSetsAutograph ? "" : "cursor-pointer"}`}>
                <input
                  type="checkbox"
                  checked={isAutographRun}
                  // Choosing Autograph as the SERIES has already answered this;
                  // a checkbox that could then be unticked would offer a design
                  // tagged Autograph at the standard rate, which the catalogue
                  // has never contained and should not learn to.
                  disabled={busy || seriesSetsAutograph}
                  onChange={(e) => setAutograph(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-charcoal"
                />
                <span className="text-[0.72rem] leading-snug">
                  <span className="font-semibold">
                    {isBatch ? "Queue this batch as Autograph" : "Autograph"} — {AUTOGRAPH_RATE_LABEL}
                  </span>
                  <span className="block text-mist">
                    {seriesSetsAutograph ? "Set by the Autograph series above. " : ""}
                    {isBatch ? "Every design in this batch. " : "Our premium price category. "}
                    Printed on Linen Textured (Non-Woven) only —
                    Soft Matte and Self-Adhesive are not offered. Sold only on zyvorah.com:
                    never exported to Amazon, Pepperfry or HomeLane. Stays ticked between
                    uploads so a whole run can go in as Autograph.
                  </span>
                </span>
              </label>
            </div>
          </div>
        </FieldGroup>
      )}

      {/* How the rooms are DRESSED, which is a separate question from which
          rooms they are. Left on Auto the artwork decides from its own tags —
          right for most of the catalogue. Bold is the override for a design
          that a soft residential render would undersell. */}
      <FieldGroup step={step()} title="Scenes">
        <div className="grid gap-5 md:grid-cols-3">
          <StylingChips
            value={styling}
            onChange={setStyling}
            disabled={busy}
            autoNote={isBatch ? "Each design decides from its own tags." : "Let the artwork decide — gallery for Limited Edition, bold if it's tagged Dramatic, Bold or Dark."}
            helper={
              isBatch
                ? (styling ? `Every design in this batch is rendered ${styling}.` : "Auto — each design is judged on its own tags, so a mixed batch needn't be split.")
                : stylingHelper
            }
          />

          <div>
            <p className="text-[0.72rem] font-semibold">Style reference <span className="font-normal text-slate">— optional</span></p>
            <p className="mt-0.5 text-[0.62rem] text-mist">
              {isBatch ? "One design at a time only — a batch can't share a single inspiration image." : "An inspiration image so the room scenes match this aesthetic."}
            </p>
            <input
              ref={styleRef} type="file" accept="image/*" disabled={busy || isBatch}
              onChange={(e) => setStyleFile(e.target.files?.[0] ?? null)}
              className="mt-2 text-[0.72rem] file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-[0.68rem] disabled:opacity-40"
            />
            {styleFile && <p className="mt-1 truncate text-[0.62rem] text-slate">{styleFile.name}</p>}
          </div>

          {/* Room pictures of your own — for a design already photographed or
              rendered elsewhere. They lead the gallery; anything ticked below
              is generated after them. A border is the usual case: the AI
              renders walls and framed pieces, not a 10 cm strip, so its room
              shots are nearly always supplied by hand. */}
          <div>
            <p className="text-[0.72rem] font-semibold">
              Your own room pictures <span className="font-normal text-slate">— optional, up to {MAX_EXTRA}</span>
            </p>
            <p className="mt-0.5 text-[0.62rem] text-mist">
              {isBatch
                ? "One design at a time only — each design in a batch gets its rooms generated."
                : family === "border"
                  ? "Recommended for borders — the room generator can't render a thin strip convincingly."
                  : "Already shot or rendered this design? Add those images and they lead the gallery."}
            </p>
            <input
              ref={extraRef} type="file" accept="image/*" multiple disabled={busy || isBatch}
              onChange={(e) => setExtras(Array.from(e.target.files ?? []).slice(0, MAX_EXTRA))}
              className="mt-2 text-[0.72rem] file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-[0.68rem] disabled:opacity-40"
            />
            {extras.length > 0 && (
              <p className="mt-1 text-[0.62rem] text-slate">
                {extras.length} picture{extras.length > 1 ? "s" : ""}: {extras.map((f) => f.name).join(", ")}
              </p>
            )}
          </div>
        </div>
      </FieldGroup>

      <FieldGroup step={step()} title="Rooms">
        <RoomPicker
          options={sceneOptions} selected={picks} onChange={setPicks} disabled={busy} project={project}
          note={
            isBatch
              ? "A pick here applies to every design in this batch. Leave blank and each one gets the rooms that suit it."
              : extras.length
                ? "Your own pictures come first. Tick rooms only if you also want generated ones — leave blank to use just yours."
                : meta.roomNote
          }
        />
      </FieldGroup>

      {/* Sticky so Go is always in reach, however long the form above gets. */}
      <div className="sticky bottom-0 -mx-6 mt-6 flex items-center justify-between gap-3 border-t border-edge bg-wash/95 px-6 py-3 backdrop-blur">
        <p className="text-[0.68rem] text-slate">
          {files.length === 0
            ? "Pick a file first"
            : files.length === 1
              ? <span className="truncate">&ldquo;{files[0].name}&rdquo; ready</span>
              : `${files.length} files ready`}
        </p>
        <button onClick={go} disabled={busy || !files.length || Boolean(priceProblem)} title={priceProblem || undefined} className="btn h-11 px-6 text-[0.8rem] disabled:opacity-40">
          {busy ? "Working…" : isBatch ? `Queue ${files.length} designs` : "Go"}
        </button>
      </div>
    </div>
  );
}

export default function StudioPage() {
  const staff = useStaff();
  const [recent, setRecent] = useState<RecentDesign[]>([]);
  /** The designs currently ticked in Recent designs. Handles, in the order
   *  they were ticked — order matters: the first three picked become the
   *  launch slider's three panes, in that order. */
  const [picked, setPicked] = useState<string[]>([]);
  const togglePick = (h: string) =>
    setPicked((p) => (p.includes(h) ? p.filter((x) => x !== h) : [...p, h]));
  const [launchPanel, setLaunchPanel] = useState(false);
  const [launchName, setLaunchName] = useState("");
  const [launchDate, setLaunchDate] = useState("");
  const [launchTeaserDays, setLaunchTeaserDays] = useState(7);
  const [launchWindowDays, setLaunchWindowDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string>("");
  const [handle, setHandle] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("");
  const [scenes, setScenes] = useState<SceneState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bulkLog, setBulkLog] = useState<string[]>([]);

  const [sceneOptions, setSceneOptions] = useState<SceneOptions | null>(null);
  // The commissioned-project switch. Parent-level on purpose: it applies to
  // fresh uploads AND the restage panel, and survives switching family tabs.
  const [projectKey, setProjectKey] = useState("");
  const activeProject = sceneOptions?.projects?.find((p) => p.key === projectKey) ?? null;
  const [collectionOptions, setCollectionOptions] = useState<CollectionOption[]>([]);

  // One tab is always active — no more "everything collapsed" starting
  // state. The choice persists across visits (TAB_STORE) since a daily
  // uploader who spends a week on Wall Art shouldn't re-click the tab every
  // morning; an unrecognised stored value falls back to Wallpaper.
  const [activeFamily, setActiveFamily] = useState<Family>("wallpaper");
  const [recentOpen, setRecentOpen] = useState(false);
  /** Free-text filter over the design list. The list is no longer the newest
   *  forty (0149) but the whole catalogue, so scrolling stopped being a way to
   *  find anything — a design from two years ago is exactly the one most
   *  likely to need re-staging. Filtering is done here rather than in the
   *  query: the rows are already in hand, so typing filters instantly instead
   *  of waiting on a round trip per keystroke. */
  const [recentQuery, setRecentQuery] = useState("");
  /** A failure from one of the per-design buttons in the list (delete, publish,
   *  price, tile). It is NOT the page-level `error`: that banner lives up by the
   *  uploader, hundreds of pixels above the list, so a refused delete on the
   *  fortieth design set a message nobody could see and the button read as dead.
   *  This one renders inside the Designs panel, next to the button that failed. */
  const [listError, setListError] = useState<string | null>(null);
  /** ...and scrolled to. The panel header is off-screen too once you are far
   *  enough down the list, so rendering the message is not the same as showing
   *  it. */
  const listErrorRef = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    if (listError) listErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [listError]);
  /** What the list actually renders: every design, or the ones matching the
   *  filter. Handle as well as title, because the twins a search has to tell
   *  apart often share a title — "Ganapati (गणपति)" is both a wallpaper and a
   *  canvas, and only the handle says which. */
  const shownRecent = useMemo(() => {
    const q = recentQuery.trim().toLowerCase();
    if (!q) return recent;
    return recent.filter(
      (r) => r.title.toLowerCase().includes(q) || r.handle.toLowerCase().includes(q),
    );
  }, [recent, recentQuery]);

  // "Open & review" panel: eyeball a design's images and delete the room scenes
  // you don't want. null when closed.
  type ReviewImage = { id: string; url: string; alt: string | null; is_flat: boolean; scene_key: string | null; position: number; is_featured: boolean };
  const [review, setReview] = useState<{ handle: string; title: string; images: ReviewImage[] } | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  // Re-staging an EXISTING design: which rooms to add, dressed how. Kept beside
  // the review panel's own state because that panel is where you already are
  // when you notice a design is under-photographed.
  const [restagePicks, setRestagePicks] = useState<string[]>([]);
  const [restageStyling, setRestageStyling] = useState<StylingKey | null>(null);
  const [restageBusy, setRestageBusy] = useState(false);
  const [restageNote, setRestageNote] = useState("");

  // Overnight batch queue: picking more than one file on the Wallpaper tab
  // queues them instead of running the single-design pipeline inline — the
  // config itself (picks/styling/seamless/autograph/ceiling) lives in
  // UploadPanel's own state and rides along in QueueOpts.
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string>("");
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);

  useEffect(() => {
    const savedTab = localStorage.getItem(TAB_STORE);
    if (savedTab && FAMILIES.some((f) => f.key === savedTab)) setActiveFamily(savedTab as Family);
  }, []);

  const selectFamily = (f: Family) => {
    setActiveFamily(f);
    localStorage.setItem(TAB_STORE, f);
  };

  const loadRecent = useCallback(async () => {
    const res = await fetch("/api/studio/recent");
    if (!res.ok) { setError("Couldn't load the designs — your sign-in may have lapsed. Reload the page."); return; }
    setError(null);
    setRecent((await res.json()).items ?? []);
  }, []);

  // The room picker's options come from the live site taxonomy (every "Shop by
  // Room" collection), so a new room collection becomes tickable here without a
  // code change on this page.
  const loadSceneOptions = useCallback(async () => {
    const res = await fetch("/api/studio/scenes");
    if (res.ok) setSceneOptions(await res.json());
  }, []);

  // Existing curated collections, so the upload form can offer them by name
  // instead of relying on the uploader to re-type one exactly.
  const loadCollections = useCallback(async () => {
    const res = await fetch("/api/studio/collections");
    if (res.ok) setCollectionOptions((await res.json()).items ?? []);
  }, []);

  const lastNudge = useRef(0);
  const loadBatchStatus = useCallback(async () => {
    const res = await fetch("/api/studio/batch-status");
    if (!res.ok) return;
    const items: BatchItem[] = (await res.json()).items ?? [];
    setBatchItems(items);
    // Keep the queue draining without manual "Resume queue" clicks: the
    // self-chaining worker can drop between designs on Vercel, so while this
    // page is open we re-kick it (at most every 20s) whenever work is pending.
    const active = items.some((b) => b.status !== "done" && b.status !== "failed");
    if (active && Date.now() - lastNudge.current > 20000) {
      lastNudge.current = Date.now();
      fetch("/api/studio/batch-nudge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).catch(() => {});
    }
  }, []);

  useEffect(() => { if (staff === "in") { loadRecent(); loadSceneOptions(); loadCollections(); } }, [staff, loadRecent, loadSceneOptions, loadCollections]);

  // Poll the overnight queue every 5s so this page (if left open, or reopened
  // in the morning) shows live progress. The work itself doesn't depend on
  // this poll — the server chain runs regardless.
  useEffect(() => {
    if (staff !== "in") return;
    loadBatchStatus();
    const t = setInterval(() => loadBatchStatus(), 5000);
    return () => clearInterval(t);
  }, [staff, loadBatchStatus]);

  const setStatus = async (handleToSet: string, status: "active" | "draft") => {
    // A refused publish must SAY so — the catalogue triggers reject for real
    // reasons (missing orientation, wrong media mix), and swallowing them made
    // the Publish button look dead while the product silently stayed a draft.
    setListError(null);
    const res = await fetch("/api/studio/status", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: handleToSet, status }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setListError(`Couldn't ${status === "active" ? "publish" : "unpublish"} ${handleToSet}: ${j?.error ?? `HTTP ${res.status}`}`);
    }
    loadRecent();
  };

  /**
   * Schedule a launch from the ticked designs.
   *
   * This does NOT publish anything. It creates the collection, tags the picked
   * designs into it, and writes one row on the launch calendar — the designs
   * stay drafts until the date arrives and the gate opens. Scheduling a launch
   * must never be the thing that accidentally makes it public.
   */
  const scheduleLaunch = async () => {
    if (!launchName.trim() || !launchDate || picked.length === 0) return;
    setBusy(true);
    setPhase("Scheduling the launch…");
    try {
      const res = await fetch("/api/studio/launch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: launchName.trim(),
          handles: picked,
          launchDate,
          teaserDays: launchTeaserDays,
          windowDays: launchWindowDays,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError(`Couldn't schedule the launch: ${j?.error ?? `HTTP ${res.status}`}`);
        return;
      }
      setPhase(`Scheduled — ${j.title} lands ${j.launchDate}, teasing from ${j.teaserDate}.`);
      setLaunchPanel(false);
      setPicked([]);
      loadRecent();
    } finally {
      setBusy(false);
    }
  };

  const rename = async (handleToSet: string, current: string) => {
    const t = window.prompt("Rename this design:", current);
    if (!t || !t.trim()) return;
    await fetch("/api/studio/rename", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: handleToSet, title: t.trim() }),
    });
    loadRecent();
  };

  // Re-price a limited edition. The price of a piece gets revisited — the
  // first figure was wrong, or the edition is half sold — and this is the
  // difference between changing it here and changing it in SQL.
  const reprice = async (r: RecentDesign) => {
    setListError(null);
    const typed = window.prompt(
      `What does "${r.title}" sell for? (₹, inclusive)`,
      r.price ? String(r.price) : "",
    );
    if (typed === null) return;
    const price = Math.round(Number(typed.replace(/[^0-9.]/g, "")) || 0);
    if (price <= 0) return;
    const res = await fetch("/api/studio/reprice", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: r.handle, price }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { setListError(out.error || "Could not set that price."); return; }
    loadRecent();
  };

  // Mark an existing design as a seamless tile, or clear the mark. The repeat is
  // asked for in the same breath as the toggle because the two are one fact:
  // "this repeats, and it repeats THIS big". Turning it off needs no number.
  const setSeamless = async (r: RecentDesign) => {
    setListError(null);
    if (r.isSeamless) {
      if (!window.confirm(`"${r.title}" will go back to being one composition stretched to the wall. Continue?`)) return;
      const res = await fetch("/api/studio/seamless", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: r.handle, seamless: false }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setListError(`Couldn't clear the tile on ${r.handle}: ${j?.error ?? `HTTP ${res.status}`}`);
      }
      loadRecent();
      return;
    }
    const entered = window.prompt(
      `How wide is one repeat of "${r.title}" on the wall, in cm?\n\n`
      + "This is the artwork's own size — the motif will be this wide on a 3 m wall and on a 12 m wall alike. 5–300 cm.",
      String(r.repeatWidthCm ?? 60),
    );
    if (entered == null) return;
    const cm = Number(entered.trim());
    if (!Number.isFinite(cm) || cm < 5 || cm > 300) {
      setListError("Repeat width must be a number between 5 and 300 cm.");
      return;
    }
    const res = await fetch("/api/studio/seamless", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: r.handle, seamless: true, repeatWidthCm: cm }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setListError(`Couldn't mark ${r.handle} as a tile: ${j?.error ?? `HTTP ${res.status}`}`);
    }
    loadRecent();
  };

  const deleteDesign = async (handleToDelete: string, title: string) => {
    if (!window.confirm(`Delete "${title}" and all its images? This can't be undone.`)) return;
    setListError(null);
    const res = await fetch("/api/studio/delete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: handleToDelete }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      const reason = String(j?.error ?? `HTTP ${res.status}`);
      // The RPC refuses to delete anything but a draft, and its raw message
      // ("refusing to delete non-draft product ... (status active)") names the
      // rule without naming the fix. A live design is deleted in two clicks —
      // say which two, rather than leaving it sitting in the list unexplained.
      setListError(
        reason.includes("non-draft")
          ? `"${title}" is published, and a live design can't be deleted. Unpublish it first, then delete.`
          : `Couldn't delete "${title}": ${reason}`,
      );
      return;
    }
    if (review?.handle === handleToDelete) setReview(null);
    loadRecent();
  };

  // Open the review panel for a design and load its images.
  const openReview = async (handleToOpen: string) => {
    setReviewBusy(true);
    setRestagePicks([]);
    setRestageNote("");
    setReview({ handle: handleToOpen, title: "…", images: [] });
    try {
      const res = await fetch(`/api/studio/images?handle=${encodeURIComponent(handleToOpen)}`);
      if (!res.ok) { setReview(null); return; }
      const j = await res.json();
      setReview({ handle: handleToOpen, title: j.title ?? handleToOpen, images: j.images ?? [] });
    } finally {
      setReviewBusy(false);
    }
  };

  // Delete one room scene (never the flat) and drop it from the open panel.
  const deleteScene = async (img: ReviewImage) => {
    if (img.is_flat) return;
    if (!window.confirm("Remove this room scene from the design?")) return;
    setReviewBusy(true);
    try {
      const res = await fetch("/api/studio/delete-scene", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: img.id }),
      });
      if (res.ok) setReview((r) => (r ? { ...r, images: r.images.filter((i) => i.id !== img.id) } : r));
    } finally {
      setReviewBusy(false);
    }
  };

  /** Reload just the open panel's pictures, keeping the panel on screen. */
  const reloadReviewImages = async (handleToLoad: string) => {
    const res = await fetch(`/api/studio/images?handle=${encodeURIComponent(handleToLoad)}`);
    if (!res.ok) return;
    const j = await res.json();
    setReview((r) => (r && r.handle === handleToLoad ? { ...r, images: j.images ?? [] } : r));
  };

  /**
   * Render more rooms for a design that ALREADY exists.
   *
   * The upload pipeline could only ever stage a design once, at the moment it
   * was created, so anything that arrived under-photographed stayed that way —
   * the Ganesha canvases sit in the grid as bare flat scans because there was
   * no second chance to shoot them. This is that second chance.
   *
   * Two placement rules, both of which matter:
   *  · A design with NO room scenes yet gets its first render at index 0, which
   *    is what makes it the card image — the whole point for a design currently
   *    showing its flat. One that already has scenes appends after them and does
   *    NOT take the card, because somebody chose that picture.
   *  · Positions continue from the highest scene already attached rather than
   *    counting the picks, so re-staging twice doesn't collide with itself.
   */
  const runRestage = async () => {
    if (!review || !restagePicks.length) return;
    const flat = review.images.find((i) => i.is_flat);
    if (!flat) { setRestageNote("This design has no flat image to render from."); return; }
    const scenes = review.images.filter((i) => !i.is_flat);
    const offset = scenes.length ? Math.max(...scenes.map((i) => i.position ?? 0)) + 1 : 0;
    const picks = restagePicks;

    setRestageBusy(true);
    let done = 0;
    const failed: string[] = [];
    try {
      for (let i = 0; i < picks.length; i++) {
        const sceneKey = picks[i];
        const label =
          [...(sceneOptions?.rooms ?? []), ...(sceneOptions?.extras ?? []), ...(activeProject?.scenes ?? [])].find((o) => o.key === sceneKey)?.label ?? sceneKey;
        setRestageNote(`Rendering ${i + 1} of ${picks.length}: ${label}…`);
        try {
          const res = await fetch("/api/studio/scene", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              handle: review.handle, title: review.title, flatUrl: flat.url,
              sceneKey, index: offset + i,
              ...(projectKey ? { project: projectKey } : {}),
              // Omitted on Auto so the API resolves the register from the
              // design's own tags, exactly as the upload flow does.
              ...(restageStyling ? { styling: restageStyling } : {}),
            }),
          });
          const j = await res.json().catch(() => ({}));
          // A scene the guard rejected for focal occlusion is reported rather
          // than counted as done — it produced no picture.
          if (res.ok && j.ok) done += 1;
          else failed.push(`${label}${j.skipped ? " (blocked: furniture over the artwork)" : ""}`);
        } catch {
          failed.push(label);
        }
      }
    } finally {
      setRestagePicks([]);
      setRestageNote(
        failed.length
          ? `Added ${done}. Could not render: ${failed.join(", ")}.`
          : `Added ${done} room${done === 1 ? "" : "s"}.`,
      );
      setRestageBusy(false);
      await reloadReviewImages(review.handle);
      loadRecent();
    }
  };

  // A flat's storage path is content-addressed: the same BYTES always land on
  // the same URL, which is the key every dedup layer (enqueue,
  // studio_create_or_get_product) matches on. A random path made every
  // re-upload look like a brand-new design — the bug this fixes.
  //
  // Hashing the bytes rather than reusing the filename matters: two genuinely
  // different textures both named "texture.png" (a real case for a batch of
  // exports from a design tool) would otherwise collide on one path and the
  // second would silently be treated as a duplicate of the first instead of
  // becoming its own design. Same content ⇒ same hash regardless of name;
  // different content ⇒ different hash even under the same name — so upsert
  // can safely be true, since a "conflict" only ever means identical bytes
  // being written back over themselves.
  const uploadFlat = async (file: File): Promise<string> => {
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
    // The hash still decides the path — it is the dedup key every layer
    // matches on — but the SIGNER builds it now, because the browser no
    // longer has write access to the bucket. Same bytes, same path, same URL.
    //
    // No key to pass: /api/admin/sign-upload derives it from the signed-in
    // staff session, and the shared argument is on its way out with the last
    // caller that still holds one.
    const target = await signAdminUpload({ kind: "studio-flat", ext, hash });
    return putSigned(target, file, file.type || "image/png");
  };

  // Room shots and style references are NOT identity-bearing: two designs can
  // both have an IMG_1234.jpg, so these keep unique random paths.
  const uploadPicture = async (file: File): Promise<string> => {
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const target = await signAdminUpload({ kind: "studio-picture", ext });
    return putSigned(target, file, file.type || "image/png");
  };

  /**
   * Generate the scenarios one at a time, painting progress as it goes.
   * `offset` shifts the gallery position past any pictures already attached by
   * hand, so an uploaded room shot keeps the card image.
   */
  const runScenes = async (
    createdHandle: string, createdTitle: string, flatUrl: string, scenarios: Scenario[], offset: number,
    styleUrl?: string, styling?: StylingKey | null,
  ) => {
    for (let i = 0; i < scenarios.length; i++) {
      setPhase(`Generating room ${i + 1} of ${scenarios.length}: ${scenarios[i].label}…`);
      setScenes((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: "running" } : s)));
      try {
        const sRes = await fetch("/api/studio/scene", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flatUrl, handle: createdHandle, title: createdTitle,
            sceneKey: scenarios[i].key, index: offset + i,
            ...(projectKey ? { project: projectKey } : {}),
            ...(styleUrl ? { styleUrl } : {}),
            // Omitted entirely on Auto, so the API resolves it from the
            // design's own tags rather than being told "calm" by default.
            ...(styling ? { styling } : {}),
          }),
        });
        const sj = await sRes.json();
        setScenes((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: sRes.ok ? "done" : "failed", url: sj.url } : s)));
      } catch {
        setScenes((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: "failed" } : s)));
      }
    }
  };

  const finalize = async (createdHandle: string) => {
    setPhase("Publishing…");
    await fetch("/api/studio/finalize", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: createdHandle, publish: true }),
    });
    setPhase("Published live ✓");
    loadRecent();
  };

  const run = async ({ family, file, context, styleFile, picks, sizes, media, extras, styling, repeatWidthCm, editionLimit, story, collections, isCeiling, titleOverride, isAutograph, finish }: UploadPayload) => {
    setBusy(true); setError(null); setHandle(null); setScenes([]); setPhase("Uploading artwork…");
    try {
      const flatUrl = await uploadFlat(file);

      const extraUrls: string[] = [];
      for (let i = 0; i < extras.length; i++) {
        setPhase(`Uploading your picture ${i + 1} of ${extras.length}…`);
        extraUrls.push(await uploadPicture(extras[i]));
      }

      let styleUrl: string | undefined;
      if (styleFile) {
        setPhase("Uploading style reference…");
        styleUrl = await uploadPicture(styleFile);
      }
      setPhase(family !== "wallpaper" ? `Setting up ${family} product…` : picks.length ? "Naming & tagging the design…" : "Naming, tagging & room-mapping the design…");
      const createBody: Record<string, unknown> = { flatUrl };
      // With pictures of your own, the pick is taken literally — empty means
      // "generate nothing, mine are the gallery". Without any, an empty pick
      // lets the pipeline choose the rooms that suit the design.
      if (extraUrls.length) createBody.sceneKeys = picks;
      else if (picks.length) createBody.sceneKeys = picks;
      if (family === "canvas") {
        createBody.isCanvas = true;
        // Only send a pick when it's actually narrowed — an untouched panel
        // means "every size", which is what the API defaults to.
        if (sizes.length && sizes.length < CANVAS_SIZES.length) createBody.canvasSizes = sizes;
        if (media.length && media.length < CANVAS_MEDIA.length) createBody.canvasMedia = media;
        // Limited edition: the edition size. The story is sent for every
        // family below — a wallpaper can have one too.
        if (editionLimit) createBody.editionLimit = editionLimit;
      }
      if (family === "border") createBody.isBorder = true;
      if (family === "wallpaper" && isCeiling) createBody.isCeiling = true;
      if (isAutograph) createBody.priceTier = "autograph";
      else if (family === "wallpaper") createBody.finish = finish;
      if (titleOverride.trim()) createBody.title = titleOverride.trim();
      if (context.trim()) createBody.context = context.trim();
      // Every family: when a story was written, the product page IS that
      // story, retold faithfully by the API's writer.
      if (story.trim()) createBody.story = story.trim();
      // Every family: each shelf is created on first use and joined thereafter
      // (see joinCuratedCollection in the studio route). The kind travels with
      // the name so a new one is created on the shelf it was typed into.
      if (collections.length) createBody.collections = collections;
      if (styling) createBody.styling = styling;
      if (repeatWidthCm) { createBody.seamless = true; createBody.repeatWidthCm = repeatWidthCm; }
      // The commissioned project rides create (so project scene keys survive
      // the pick) and every /scene call below (where the shell and anchor
      // actually apply).
      if (projectKey) createBody.project = projectKey;
      const cRes = await fetch("/api/studio/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createBody),
      });
      const created = await cRes.json();
      if (!cRes.ok) throw new Error(created.error || "create failed");
      if (created.duplicate) {
        setHandle(created.handle); setTitle(created.title);
      // A design may have just created a shelf — refresh the pickers so the
      // next upload in this sitting can choose it instead of retyping it.
      if (collections.length) loadCollections();
        setPhase(`Already exists as "${created.title}" — skipped.`);
        loadRecent();
        return;
      }
      setHandle(created.handle); setTitle(created.title);

      // Your own pictures land first, so they lead the gallery and any
      // generated room starts after them.
      if (extraUrls.length) {
        setPhase("Attaching your pictures…");
        const aRes = await fetch("/api/studio/attach", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: created.handle, title: created.title, urls: extraUrls, startPosition: 0 }),
        });
        if (!aRes.ok) throw new Error((await aRes.json()).error || "attach failed");
      }

      const scenarios: Scenario[] = created.scenarios ?? [];
      setScenes(scenarios.map((s) => ({ label: s.label, status: "pending" })));

      // `created.styling` is what the API resolved — the hand pick when there
      // was one, otherwise what it read off the artwork's fresh tags. Passing
      // it back keeps every room in this gallery in one register even though
      // each room is a separate request.
      await runScenes(created.handle, created.title, flatUrl, scenarios, extraUrls.length, styleUrl, created.styling ?? styling);
      await finalize(created.handle);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPhase("");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Bulk wall art: many artworks in one go, NO room scenes. Each file becomes a
   * draft product — AI-named, ZYV-coded, both-or-picked media, sizes matched to
   * its own shape server-side — ready on the FBA export desk. A failure logs
   * and moves on; one bad file never sinks the batch.
   */
  const runBulk = async (files: File[], media: string[], sizes: string[]) => {
    setBusy(true); setError(null); setHandle(null); setScenes([]); setBulkLog([]);
    let made = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        setPhase(`Wall art ${i + 1} of ${files.length} — uploading ${f.name}…`);
        const flatUrl = await uploadFlat(f);
        setPhase(`Wall art ${i + 1} of ${files.length} — naming & coding…`);
        // The batch obeys the tickboxes: a narrowed tier pick applies to every
        // file. The shape of each size always follows that file's own artwork.
        const createBody: Record<string, unknown> = { flatUrl, isCanvas: true, sceneKeys: [] };
        if (sizes.length && sizes.length < CANVAS_SIZES.length) createBody.canvasSizes = sizes;
        if (media.length && media.length < CANVAS_MEDIA.length) createBody.canvasMedia = media;
        const res = await fetch("/api/studio/create", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createBody),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "create failed");
        if (j.duplicate) setBulkLog((p) => [...p, `↺ ${f.name} — already exists as “${j.title}”`]);
        else { made++; setBulkLog((p) => [...p, `✓ ${j.title}`]); }
      } catch (e) {
        setBulkLog((p) => [...p, `✗ ${f.name} — ${e instanceof Error ? e.message : "failed"}`]);
      }
    }
    setPhase(`Bulk done — ${made} of ${files.length} created as drafts. Pick sizes & quantities on the FBA export desk; publish from Recent designs when ready.`);
    loadRecent();
    setBusy(false);
  };

  // Picking more than one file in the Artwork step (Wallpaper only) lands
  // here instead of `run` — same form, same config, applied to every file at
  // once via the self-chaining overnight queue rather than run inline.
  const queueBatch = async (filesToQueue: File[], opts: QueueOpts) => {
    if (!filesToQueue.length) return;
    setBatchUploading(true); setError(null);
    try {
      const flatUrls: string[] = [];
      for (let i = 0; i < filesToQueue.length; i++) {
        setBatchProgress(`Uploading ${i + 1} of ${filesToQueue.length}…`);
        flatUrls.push(await uploadFlat(filesToQueue[i]));
      }
      setBatchProgress("Queuing…");
      const res = await fetch("/api/studio/batch-enqueue", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatUrls,
          ...(opts.picks.length ? { sceneKeys: opts.picks } : {}),
          ...(opts.styling ? { styling: opts.styling } : {}),
          ...(opts.autograph ? { priceTier: "autograph" } : { finish: opts.finish }),
          ...(opts.seamless ? { seamless: true, repeatWidthCm: opts.repeatWidthCm } : {}),
          ...(opts.ceiling ? { isCeiling: true } : {}),
          ...(opts.context ? { context: opts.context } : {}),
          ...(opts.collections.length ? { collections: opts.collections } : {}),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "queue failed");
      // studio_batch_enqueue now catches an already-existing flat at enqueue
      // time, not just inside the worker's per-tick dedup — so a re-drop of
      // art that's already a product can say so right away, instead of the
      // queue strip going straight to nothing (done items are hidden from it)
      // with no sign anything ran.
      const alreadyLoaded = Number(j.already_loaded) || 0;
      const alreadyQueued = Math.max(0, Number(j.skipped ?? 0) - alreadyLoaded);
      const loadedNames = (j.already_loaded_designs ?? []).map((d: { title: string }) => d.title).join(", ");
      const loadedNote = alreadyLoaded > 0
        ? ` ${alreadyLoaded} ${alreadyLoaded === 1 ? "image was" : "images were"} already loaded as ${alreadyLoaded === 1 ? "an existing design" : "existing designs"}${loadedNames ? ` (${loadedNames})` : ""} — can't be reloaded, skipped.`
        : "";
      const queuedNote = alreadyQueued > 0 ? ` (${alreadyQueued} already in the queue — skipped)` : "";
      setBatchProgress(
        j.count > 0
          ? `Queued ${j.count} designs${queuedNote} — processing in the background. Safe to close this tab.${loadedNote}`
          : `Nothing new to queue.${loadedNote}${queuedNote}`
      );
      loadBatchStatus();
      // A run that created a new shelf should show it in the pickers straight
      // away, thumbnail and all, rather than after a reload.
      if (opts.collections.length) loadCollections();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong queuing the batch.");
    } finally {
      setBatchUploading(false);
    }
  };

  const nudgeQueue = async () => {
    await fetch("/api/studio/batch-nudge", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    });
    setTimeout(() => loadBatchStatus(), 1500);
  };

  if (staff !== "in") return <StaffGate state={staff} title="Zyvorah Studio" />;

  const doneCount = scenes.filter((s) => s.status === "done").length;
  const activeBatch = batchItems.filter((b) => b.status !== "done" && b.status !== "failed");
  const STATUS_LABEL: Record<BatchItem["status"], string> = {
    queued: "Queued", naming: "Naming…", scenes: "Generating rooms…", done: "Done", failed: "Failed",
  };
  const STATUS_BG: Record<BatchItem["status"], string> = {
    queued: "bg-mist/30 text-slate", naming: "bg-lavender/50", scenes: "bg-sky/50",
    done: "bg-sage/60", failed: "bg-blush/60",
  };

  return (
    <div className="container-x py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Zyvorah Studio</h1>
          <p className="mt-1 text-xs text-slate">Upload artwork — the Studio names it, renders its rooms, and builds the product.</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/studio/drafts" className="text-xs text-slate underline underline-offset-2">Review drafts →</Link>
          <Link href="/studio/exports" className="text-xs text-slate underline underline-offset-2">FBA export →</Link>
          <Link href="/studio/samples" className="text-xs text-slate underline underline-offset-2">Samples →</Link>
        </div>
      </div>

      {error && <p className="mt-4 rounded-[12px] bg-blush/50 px-4 py-3 text-sm">{error}</p>}
      {phase && (
        <p className="mt-4 text-sm font-medium">
          {phase} {scenes.length > 0 && `(${doneCount}/${scenes.length} rooms)`}
        </p>
      )}
      {bulkLog.length > 0 && (
        <ul className="mt-2 max-h-52 overflow-y-auto rounded-[12px] bg-wash px-4 py-3 text-[0.75rem] leading-6 text-slate">
          {bulkLog.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      )}
      {handle && (
        <p className="mt-2 text-sm">
          <span className="font-semibold">{title}</span> —{" "}
          <Link href={`/products/${handle}`} target="_blank" className="underline underline-offset-2">view product</Link>
        </p>
      )}
      {!busy && (phase || error || handle) && (
        <button
          type="button"
          onClick={() => { setPhase(""); setError(null); setHandle(null); setTitle(""); setScenes([]); setBulkLog([]); }}
          className="mt-3 rounded-full bg-charcoal px-5 py-2 text-[0.75rem] font-semibold text-surface"
        >
          New upload
        </button>
      )}

      {/* scene progress grid — always visible when a live job is running */}
      {scenes.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {scenes.map((s, i) => (
            <div key={i} className="relative aspect-[3/2] overflow-hidden rounded-[14px] bg-wash">
              {s.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.url} alt={s.label} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center text-[0.7rem] text-mist">
                  {s.status === "running" ? "generating…" : s.status === "failed" ? "failed" : "queued"}
                </div>
              )}
              <span className="absolute bottom-1 left-1 rounded-full bg-charcoal/70 px-2 py-0.5 text-[0.6rem] font-semibold text-surface">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs: Wallpaper / Wall Art / Border — bold, filled, one always active ── */}
      <FamilyTabs families={FAMILIES} active={activeFamily} onSelect={(f) => selectFamily(f as Family)} />

      {/* Overnight queue status. Lives outside any one tab's panel so it stays
          visible no matter which family you're looking at — the queue itself
          only ever makes wallpaper, but you shouldn't have to be ON the
          Wallpaper tab to see it's still running. */}
      {activeBatch.length > 0 && (
        <QueueStatusStrip
          count={activeBatch.length}
          currentLabel={
            activeBatch[0]?.status === "scenes"
              ? `${activeBatch[0].title ?? "a design"} — ${activeBatch[0].scene_index}/${activeBatch[0].scene_total} rooms`
              : undefined
          }
          onResume={nudgeQueue}
          onView={() => selectFamily("wallpaper")}
        />
      )}

      {(() => {
        const cfg = FAMILY_BY_KEY[activeFamily];
        return (
          <div className={`mt-3 rounded-[22px] border-t-4 bg-wash ${cfg.panelAccent}`}>
            <div className="px-6 pb-1 pt-5">
              <p className="text-xs text-slate">{cfg.note}</p>
              <p className="mt-0.5 text-[0.62rem] text-mist">{cfg.blurb}</p>
              {/* The queue has no product-family step of its own — the worker
                  can only make wallpaper murals. Say so here, where the file
                  picker lives, or a batch silently becomes made-to-measure
                  wallpaper without anyone having chosen that. */}
              {cfg.hasBatch && (
                <p className="mt-2 text-[0.62rem] text-mist">
                  Pick more than one file below (up to {MAX_BATCH}) and Go queues them as an overnight batch of
                  mural wallpaper designs instead — drop and go, safe to close this tab once queued.
                </p>
              )}
            </div>

            <ProjectPicker
              options={sceneOptions?.projects ?? []}
              value={projectKey}
              disabled={busy || batchUploading}
              onChange={(k) => {
                setProjectKey(k);
                // A project's own spaces leave the picker with it — a pick of
                // one must not survive as a key the API will reject.
                const everyProjectScene = new Set((sceneOptions?.projects ?? []).flatMap((p) => p.scenes.map((s) => s.key)));
                const keep = new Set((sceneOptions?.projects?.find((p) => p.key === k)?.scenes ?? []).map((s) => s.key));
                setRestagePicks((prev) => prev.filter((x) => !everyProjectScene.has(x) || keep.has(x)));
              }}
            />

            <UploadPanel
              key={activeFamily}
              family={activeFamily}
              sceneOptions={sceneOptions}
              collectionOptions={collectionOptions}
              project={activeProject}
              busy={busy || batchUploading}
              onRun={run}
              onBulk={cfg.hasBulk ? runBulk : undefined}
              onQueue={cfg.hasBatch ? queueBatch : undefined}
            />

            {cfg.hasBatch && (batchProgress || batchItems.length > 0) && (
              <div className="px-6 pb-6">
                {batchProgress && <p className="text-sm font-medium">{batchProgress}</p>}
                {activeBatch.length > 0 && (
                  <button onClick={nudgeQueue} className="mt-1 text-xs text-slate underline underline-offset-2">
                    Resume queue
                  </button>
                )}
                {batchItems.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {batchItems.map((b) => (
                      <div key={b.id} className="flex items-center justify-between gap-3 rounded-[10px] bg-surface px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">
                          {b.handle ? (
                            <Link href={`/products/${b.handle}`} target="_blank" className="font-medium hover:underline">{b.title}</Link>
                          ) : (
                            <span className="text-mist">Waiting to be named…</span>
                          )}
                        </span>
                        {b.status === "scenes" && <span className="shrink-0 text-xs text-mist">{b.scene_index}/{b.scene_total} rooms</span>}
                        {b.status === "failed" && b.error && <span className="shrink-0 truncate text-xs text-charcoal/70" title={b.error}>{b.error}</span>}
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase ${STATUS_BG[b.status]}`}>
                          {STATUS_LABEL[b.status]}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Recent designs ── */}
      <div className="mt-4 rounded-[22px] bg-wash">
        <button
          type="button" onClick={() => setRecentOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
        >
          <p className="caps text-slate">
            Designs{recent.length > 0 && (
              <span className="ml-1 text-mist">
                · {recentQuery.trim() ? `${shownRecent.length} of ${recent.length}` : recent.length}
              </span>
            )}
          </p>
          <span className="shrink-0 text-[0.7rem] text-slate">{recentOpen ? "▲" : "▼"}</span>
        </button>
        {recentOpen && (
          <div className="px-6 pb-6">
            {listError && (
              <p ref={listErrorRef} className="mb-3 rounded-[12px] bg-blush/50 px-4 py-3 text-sm">
                {listError}{" "}
                <button
                  type="button" onClick={() => setListError(null)}
                  className="underline underline-offset-2"
                >
                  dismiss
                </button>
              </p>
            )}
            {/* What a selection is FOR. It appears only once something is
                ticked, so the list is not permanently wearing a toolbar. */}
            {picked.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[12px] bg-charcoal px-4 py-2.5 text-surface">
                <span className="text-sm font-semibold">
                  {picked.length} selected
                </span>
                <span className="text-[0.72rem] text-surface/60">
                  {picked.length >= 3
                    ? "the first three lead the launch slider"
                    : `pick ${3 - picked.length} more to fill the slider`}
                </span>
                <div className="ml-auto flex flex-wrap gap-1.5">
                  <button
                    type="button" disabled={busy}
                    onClick={() => setLaunchPanel(true)}
                    className="rounded-full bg-surface px-3 py-1 text-[0.7rem] font-semibold text-charcoal hover:opacity-90 disabled:opacity-50"
                  >
                    Launch as a collection
                  </button>
                  <button
                    type="button"
                    onClick={() => setPicked(recent.map((r) => r.handle))}
                    className="rounded-full border border-surface/40 px-3 py-1 text-[0.7rem] font-semibold hover:bg-surface/10"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setPicked([])}
                    className="rounded-full border border-surface/40 px-3 py-1 text-[0.7rem] font-semibold hover:bg-surface/10"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
            {launchPanel && (
              /* Scheduling a launch, from the designs already ticked. The date
                 is the only thing that has to be right: everything else has a
                 sensible default, and a launch with a wrong teaser length is
                 recoverable in a way that a launch on the wrong day is not. */
              <div className="mb-3 rounded-[12px] border border-edge bg-surface p-4">
                <p className="caps text-slate">Schedule a launch</p>
                <p className="mt-1 text-[0.78rem] text-slate">
                  {picked.length} design{picked.length === 1 ? "" : "s"} — the first three lead the
                  homepage slider. The collection stays hidden until the launch date, then
                  publishes itself.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-[0.72rem] font-semibold text-slate">
                    Collection name
                    <input
                      value={launchName} onChange={(e) => setLaunchName(e.target.value)}
                      placeholder="Taash"
                      className="mt-1 w-full rounded-full border border-edge px-3 py-1.5 text-sm font-normal text-charcoal"
                    />
                  </label>
                  <label className="text-[0.72rem] font-semibold text-slate">
                    Launch date (IST)
                    <input
                      type="date" value={launchDate} onChange={(e) => setLaunchDate(e.target.value)}
                      className="mt-1 w-full rounded-full border border-edge px-3 py-1.5 text-sm font-normal text-charcoal"
                    />
                  </label>
                  <label className="text-[0.72rem] font-semibold text-slate">
                    Teaser, days before
                    <input
                      type="number" min={0} max={90} value={launchTeaserDays}
                      onChange={(e) => setLaunchTeaserDays(Number(e.target.value))}
                      className="mt-1 w-full rounded-full border border-edge px-3 py-1.5 text-sm font-normal text-charcoal"
                    />
                  </label>
                  <label className="text-[0.72rem] font-semibold text-slate">
                    Fronts homepage, days
                    <input
                      type="number" min={1} max={90} value={launchWindowDays}
                      onChange={(e) => setLaunchWindowDays(Number(e.target.value))}
                      className="mt-1 w-full rounded-full border border-edge px-3 py-1.5 text-sm font-normal text-charcoal"
                    />
                  </label>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button" disabled={busy || !launchName.trim() || !launchDate}
                    onClick={() => scheduleLaunch()}
                    className="rounded-full bg-charcoal px-4 py-1.5 text-[0.72rem] font-semibold text-surface hover:opacity-90 disabled:opacity-40"
                  >
                    Schedule
                  </button>
                  <button
                    type="button" onClick={() => setLaunchPanel(false)}
                    className="rounded-full border border-edge px-4 py-1.5 text-[0.72rem] font-semibold text-slate"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {/* The whole catalogue is in this list now, so it needs a way in
                other than scrolling. */}
            <div className="mb-3">
              <input
                type="search"
                value={recentQuery}
                onChange={(e) => setRecentQuery(e.target.value)}
                placeholder="Search designs by name or handle…"
                aria-label="Search designs"
                className="w-full rounded-full border border-edge bg-surface px-4 py-2 text-sm outline-none placeholder:text-mist focus:border-charcoal"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {shownRecent.map((r) => (
                <div
                  key={r.handle}
                  onDoubleClick={() => openReview(r.handle)}
                  title="Double-click to open & review its images"
                  /* Two rows, not one. The name used to share a line with five
                     buttons and lost — every design read as "T…", which makes
                     choosing between them impossible. The name now gets the
                     full width and the buttons sit under it. */
                  className={`rounded-[12px] px-4 py-2.5 text-sm transition-shadow ${
                    picked.includes(r.handle)
                      ? "bg-sage/25 ring-2 ring-charcoal"
                      : "bg-surface ring-1 ring-transparent hover:ring-edge"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {/* A selection you cannot see is not a selection. The tick,
                        the wash and the ring all say the same thing at once. */}
                    <input
                      type="checkbox"
                      checked={picked.includes(r.handle)}
                      onChange={() => togglePick(r.handle)}
                      aria-label={`Select ${r.title}`}
                      className="h-4 w-4 shrink-0 accent-charcoal"
                    />
                    <button
                      type="button"
                      onClick={() => openReview(r.handle)}
                      className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
                    >
                      {r.title}
                    </button>
                    {/* The family, when it is not the default. A canvas and a
                        wallpaper of the same artwork are two products sharing
                        one title — "Ganapati (गणपति)" is both — and until this
                        badge the only way to tell the rows apart was that one
                        of them lacked the tile button. That matters more now
                        the drawer can re-stage: the same room key renders a
                        framed print for the canvas and a full-wall mural for
                        the wallpaper, so picking the wrong row is a wrong
                        picture, not just a wrong label. */}
                    {(r.family ?? "wallpaper") !== "wallpaper" && (
                      <span className="shrink-0 rounded-full bg-charcoal/85 px-2 py-0.5 text-[0.6rem] font-semibold uppercase text-surface">
                        {r.family}
                      </span>
                    )}
                    {/* Drawn on commission — there is no artwork to review
                        yet, and the row must not read as a broken upload. */}
                    {r.concept && (
                      <span className="shrink-0 rounded-full bg-lavender/60 px-2 py-0.5 text-[0.6rem] font-semibold uppercase" title={`From the ${r.concept.slug} concept page — the artwork is drawn once it is bought.`}>
                        Concept · artwork on order
                      </span>
                    )}
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase ${r.status === "active" ? "bg-sage/60" : "bg-mist/30 text-slate"}`}>{r.status}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[26px]">
                  {/* Tile mark. Wallpaper only: a canvas is a fixed-size print
                      and a border repeats along its own length, so neither has
                      a wall repeat to set. When it IS a tile the repeat is
                      shown on the button — the number is the whole point, and
                      hiding it behind a click makes a wrong one easy to miss. */}
                  {(r.family ?? "wallpaper") === "wallpaper" && (
                    <button
                      onClick={() => setSeamless(r)}
                      title={r.isSeamless
                        ? `Repeats every ${r.repeatWidthCm} cm — click to make it one composition again`
                        : "Mark this design as a seamless tile that repeats at a fixed size"}
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[0.6rem] font-semibold ${
                        r.isSeamless
                          ? "bg-charcoal text-surface hover:opacity-90"
                          : "border border-edge text-slate hover:border-charcoal hover:text-charcoal"}`}
                    >
                      {r.isSeamless ? `Tile · ${r.repeatWidthCm} cm` : "Tile?"}
                    </button>
                  )}
                  <button onClick={() => rename(r.handle, r.title)} className="shrink-0 rounded-full border border-edge px-2.5 py-1 text-[0.6rem] font-semibold text-slate hover:border-charcoal hover:text-charcoal">
                    Rename
                  </button>
                  {/* Only a limited edition has a price of its own — everything
                      else is priced by its make rate and has nothing to set. */}
                  {r.isLimited && (
                    <button
                      onClick={() => reprice(r)}
                      title={r.price ? `Sells at ${formatINR(r.price)} — click to change` : "Set what this piece sells for"}
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[0.6rem] font-semibold ${
                        r.price
                          ? "bg-charcoal text-surface hover:opacity-90"
                          : "border border-edge text-slate hover:border-charcoal hover:text-charcoal"}`}
                    >
                      {r.price ? formatINR(r.price) : "Price?"}
                    </button>
                  )}
                  {r.status === "active" ? (
                    <button onClick={() => setStatus(r.handle, "draft")} className="shrink-0 rounded-full border border-edge px-2.5 py-1 text-[0.6rem] font-semibold text-slate hover:border-charcoal hover:text-charcoal">
                      Unpublish
                    </button>
                  ) : (
                    <button onClick={() => setStatus(r.handle, "active")} className="shrink-0 rounded-full bg-charcoal px-2.5 py-1 text-[0.6rem] font-semibold text-surface hover:opacity-90">
                      Publish
                    </button>
                  )}
                  <button
                    onClick={() => deleteDesign(r.handle, r.title)}
                    aria-label={`Delete ${r.title}`}
                    title="Delete this design"
                    className="shrink-0 rounded-full border border-edge p-1.5 text-slate hover:border-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                  </button>
                  </div>
                </div>
              ))}
              {recent.length === 0 && <p className="text-sm text-mist">No designs yet — upload one above.</p>}
              {recent.length > 0 && shownRecent.length === 0 && (
                <p className="text-sm text-mist">
                  Nothing matches “{recentQuery.trim()}”.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Open & review — eyeball a design's images and delete the room scenes
          you don't want. The flat pattern image is protected. */}
      {review && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/50 p-4"
          onClick={() => setReview(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-[22px] bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="caps text-slate">Review images</p>
                <p className="truncate text-lg font-semibold">{review.title}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {recent.find((r) => r.handle === review.handle)?.status === "active" ? (
                  <button onClick={() => setStatus(review.handle, "draft")} className="rounded-full border border-edge px-3 py-1.5 text-xs font-semibold text-slate hover:border-charcoal hover:text-charcoal">
                    Unpublish
                  </button>
                ) : (
                  <button onClick={() => setStatus(review.handle, "active")} className="rounded-full bg-charcoal px-3 py-1.5 text-xs font-semibold text-surface hover:opacity-90">
                    Publish
                  </button>
                )}
                <Link href={`/products/${review.handle}`} target="_blank" className="rounded-full border border-edge px-3 py-1.5 text-xs font-semibold text-slate hover:border-charcoal hover:text-charcoal">
                  View live ↗
                </Link>
                <button onClick={() => setReview(null)} className="rounded-full border border-edge px-3 py-1.5 text-xs font-semibold text-slate hover:border-charcoal hover:text-charcoal">
                  Close
                </button>
              </div>
            </div>
            {(() => {
              const concept = recent.find((r) => r.handle === review.handle)?.concept ?? null;
              if (!concept || review.images.length) return null;
              // Not a broken upload: the design is drawn when it is bought, so
              // there is no flat to review, delete rooms from, or render into.
              return (
                <div className="mb-4 flex gap-4 rounded-[14px] border border-edge bg-wash p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={concept.referenceUrl} alt="" className="h-28 w-28 shrink-0 rounded-[10px] object-cover" />
                  <div className="min-w-0 text-xs text-slate">
                    <p className="font-semibold text-charcoal">Concept design — artwork drawn on order</p>
                    <p className="mt-1">
                      This is a design from the <span className="font-medium">{concept.slug}</span> concept page
                      ({concept.space}). It deliberately has no product images: the picture on the left is the
                      concept page&apos;s room reference, and the artwork itself is drawn once a customer buys it.
                      There is no flat here to render rooms from. To give it real artwork, upload the flat as a
                      new design and file it into the concept from there.
                    </p>
                  </div>
                </div>
              );
            })()}
            <p className="mb-4 text-xs text-mist">
              Delete any room scene you don&apos;t want. The flat pattern image is protected and can&apos;t be removed.
            </p>
            {reviewBusy && review.images.length === 0 ? (
              <p className="py-10 text-center text-sm text-mist">Loading…</p>
            ) : review.images.length === 0 ? (
              <p className="py-10 text-center text-sm text-mist">
                {recent.find((r) => r.handle === review.handle)?.concept ? "No product images — see above." : "No images."}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {review.images.map((img) => (
                  <div key={img.id} className="relative overflow-hidden rounded-[12px] border border-edge bg-wash">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.alt ?? ""} className="aspect-square w-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 truncate bg-charcoal/60 px-2 py-1 text-[0.6rem] font-semibold uppercase text-surface">
                      {img.is_flat ? "Flat · protected" : (img.scene_key ?? "scene")}
                    </div>
                    {!img.is_flat && (
                      <button
                        onClick={() => deleteScene(img)}
                        disabled={reviewBusy}
                        aria-label="Delete this scene"
                        title="Delete this scene"
                        className="absolute right-1.5 top-1.5 rounded-full bg-surface/90 p-1.5 text-slate shadow hover:bg-red-500 hover:text-surface disabled:opacity-50"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
                          <path d="M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add rooms to a design that already exists. Until this, a design
                could only ever be staged once — at upload — so anything that
                arrived under-photographed stayed that way for good. */}
            {!(recent.find((r) => r.handle === review.handle)?.concept && review.images.length === 0) && (
            <div className="mt-5 border-t border-edge pt-4">
              <p className="text-[0.72rem] font-semibold">
                Add rooms{" "}
                <span className="font-normal text-slate">
                  {review.images.some((i) => !i.is_flat)
                    ? "— appended after the pictures above; the card image is left alone"
                    : "— this design has no room shots, so the first one becomes its card image"}
                </span>
              </p>
              {/* Say which picture the same room key is about to produce. The
                  wallpaper/canvas split is decided server-side from the
                  design's own Canvas Wall Art tag, so there is deliberately no
                  control for it here — but an uploader looking at two rooms
                  called "Living room" on two products called "Ganapati" cannot
                  see that, and reasonably assumes something is missing. */}
              {(recent.find((r) => r.handle === review.handle)?.family ?? "wallpaper") === "canvas" && (
                <p className="mt-1 text-[0.7rem] text-slate">
                  This one is a canvas piece, so every room renders it as a framed print hung on the
                  wall, never as a full-wall mural. That follows its own Canvas Wall Art tag — the
                  wallpaper of the same artwork is a separate design, and renders as the mural.
                </p>
              )}
              <RoomPicker
                options={sceneOptions}
                selected={restagePicks}
                onChange={setRestagePicks}
                disabled={restageBusy}
                project={activeProject}
                note="Ticking a shop-by-room space also files this design into that collection."
              />
              <div className="mt-3">
                <StylingChips
                  value={restageStyling}
                  onChange={setRestageStyling}
                  disabled={restageBusy}
                  autoNote="Auto — read from this design's own tags, the same way the upload flow does."
                  helper="Gallery suits a piece sold as art rather than decor."
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={runRestage}
                  disabled={restageBusy || !restagePicks.length}
                  className="rounded-full bg-charcoal px-4 py-2 text-xs font-semibold text-surface hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {restageBusy
                    ? "Rendering…"
                    : `Render ${restagePicks.length || ""} room${restagePicks.length === 1 ? "" : "s"}`.replace("  ", " ")}
                </button>
                {restageNote && <p className="text-[0.7rem] text-slate">{restageNote}</p>}
              </div>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
