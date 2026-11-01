"use client";
import { useEffect, useRef, useState } from "react";

import Link from "next/link";
import PortalTour from "@/components/partners/portal-tour";
import ShortlistStrip from "@/components/partners/shortlist-strip";
import type { TourIdentity } from "@/lib/partner-tour";
import RoomPreview, { DEFAULT_WALL_CORNERS } from "./room-preview";
import { downloadPreviewPdf, type PreviewSheet } from "./preview-pdf";
import type { Point } from "@/lib/homography";
import type { PricedLine } from "@/lib/corporate-project";
import type { PartnerCapabilities } from "@/lib/partner-capabilities";
import { splitOptionsByArchive } from "@/lib/partner-workspace-view";
import { orderCityProblem, tier1City } from "@/lib/tier1-cities";
type Project = { id: string; customer_id: string; customer_name: string };
/** A door or window on the wall, in the mm the server takes (offset always
 *  from the left; `sillMm` present = window). `side` is only how the designer
 *  chose to measure it — from the left or the right edge — and never leaves
 *  the browser. */
type OpeningRow = {
  widthMm: number;
  heightMm: number;
  offsetMm: number;
  sillMm?: number;
  side?: "left" | "right";
};
const wireOpening = (o: OpeningRow) => ({
  widthMm: o.widthMm,
  heightMm: o.heightMm,
  offsetMm: o.offsetMm,
  ...(o.sillMm != null ? { sillMm: o.sillMm } : {}),
});
type Option = {
  id: string;
  project_id: string;
  room_name: string;
  wall_identifier: string;
  specification: PricedLine & {
    previewPhotoPath?: string;
    previewCorners?: Point[];
  };
  created_at: string;
  previewUrl?: string;
  photoUrl?: string;
};
type Confirmation = {
  id: string;
  project_id: string;
  version: number;
  status: string;
  option_ids: string[];
  po_number: string | null;
  po_accepted_at: string | null;
  promised_dispatch_at: string | null;
  shipping: Record<string, string>;
};
type Data = {
  projects: Project[];
  projectsMore?: boolean;
  options: Option[];
  decisions: {
    option_id: string;
    decision: string;
    note: string;
    actor: string;
    created_at: string;
  }[];
  confirmations: Confirmation[];
  lines: {
    confirmation_id: string;
    option_id: string;
    os_order_id: number | null;
    acknowledged_at: string | null;
  }[];
  statusesUnavailable?: boolean;
  statuses: Record<
    string,
    {
      dispatchedAt: string | null;
      printedAt: string | null;
      printStatus: string | null;
      trackingUrl: string | null;
    }
  >;
  canBuild: boolean;
  canPurchase: boolean;
  capabilities: PartnerCapabilities;
};
type Design = {
  handle: string;
  title: string;
  flatImage: string;
  materials: { slug: string; name: string; netPricePerSqft: number | null }[];
};
type Placement = {
  zoom: number;
  cropX: number;
  cropY: number;
  flipH: boolean;
  flipV: boolean;
};
const initialPlacement: Placement = {
  zoom: 1,
  cropX: 0.5,
  cropY: 0.5,
  flipH: false,
  flipV: false,
};
const initialShipping = {
  state: "",
  address_line: "",
  city: "",
  pincode: "",
  contact_name: "",
  contact_phone: "",
  gstin: "",
  billing_address: "",
};
const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
/** Rates are quoted per sq ft, so every area a designer sees is in sq ft,
 *  with square metres alongside for anyone working from a metric drawing. */
const SQM_PER_SQFT = 0.09290304;
const area = (sqft: number) =>
  `${sqft.toLocaleString("en-IN", { maximumFractionDigits: 1 })} sq ft (${(sqft * SQM_PER_SQFT).toLocaleString("en-IN", { maximumFractionDigits: 2 })} m²)`;
/** The plain wall rectangle in sq ft — before openings or the media floor,
 *  which only the server's price knows. */
const wallSqft = (widthMm: number, heightMm: number) =>
  (widthMm * heightMm) / (304.8 * 304.8);
const date = (v: string) =>
  new Date(v).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
function Composition({
  url,
  width,
  height,
  placement,
  openings = [],
}: {
  url: string;
  width: number;
  height: number;
  placement: Placement;
  openings?: { widthMm: number; heightMm: number; offsetMm: number; sillMm?: number }[];
}) {
  const [image, setImage] = useState({ width: 1, height: 1 });
  const ratio = width / height;
  const cover =
    Math.max(ratio / image.width, 1 / image.height) * placement.zoom;
  const iw = ((image.width * cover) / ratio) * 100;
  const ih = image.height * cover * 100;
  return (
    <div
      className="relative overflow-hidden bg-stone-100"
      style={{ aspectRatio: `${width}/${height}` }}
    >
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          transform: `scale(${placement.flipH ? -1 : 1},${placement.flipV ? -1 : 1})`,
        }}
      >
        <img
          alt="Exact catalogue composition"
          src={url}
          onLoad={(e) =>
            setImage({
              width: e.currentTarget.naturalWidth,
              height: e.currentTarget.naturalHeight,
            })
          }
          style={{
            position: "absolute",
            width: `${iw}%`,
            height: `${ih}%`,
            maxWidth: "none",
            left: `${(100 - iw) * placement.cropX}%`,
            top: `${(100 - ih) * placement.cropY}%`,
          }}
        />
      </div>
      {openings.map((o, i) => (
        <div
          key={i}
          className="absolute border border-dashed border-stone-600 bg-white/85"
          style={{
            left: `${(o.offsetMm / width) * 100}%`,
            bottom: `${((o.sillMm ?? 0) / height) * 100}%`,
            width: `${(o.widthMm / width) * 100}%`,
            height: `${(o.heightMm / height) * 100}%`,
          }}
        >
          <span className="text-xs">{(o.sillMm ?? 0) > 0 ? "Window" : "Door"}</span>
        </div>
      ))}
    </div>
  );
}
export default function Workspace({
  slug,
  name,
  email,
  city = null,
  tourIdentity,
}: {
  slug: string;
  name: string;
  email: string;
  /** The city this sign-in chose (HomeLane). Orders deliver only there, so
   *  the form fixes the city and offers only that city's states. */
  city?: string | null;
  tourIdentity?: TourIdentity;
}) {
  const cityStates = tier1City(city)?.states ?? [];
  const projectRef = useRef("");
  const loadSequence = useRef(0);
  const projectsPageRef = useRef(0);
  const [data, setData] = useState<Data | null>(null),
    [projectId, setProjectId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<
      { handle: string; title: string; image: string }[]
    >([]),
    [catalogue, setCatalogue] = useState({ page: 1, total: 0, hasMore: false }),
    [searchNotice, setSearchNotice] = useState(""),
    [design, setDesign] = useState<Design | null>(null),
    [material, setMaterial] = useState("");
  const [room, setRoom] = useState(""),
    [wall, setWall] = useState(""),
    [width, setWidth] = useState(3000),
    [height, setHeight] = useState(2700),
    [placement, setPlacement] = useState(initialPlacement),
    [openings, setOpenings] = useState<OpeningRow[]>([]),
    [photo, setPhoto] = useState<{ path: string; url: string } | null>(null),
    [supersedes, setSupersedes] = useState<string | undefined>();
  const [corners, setCorners] = useState(DEFAULT_WALL_CORNERS);
  const [selected, setSelected] = useState<string[]>([]),
    [shipping, setShipping] = useState(initialShipping),
    [poNumbers, setPoNumbers] = useState<Record<string, string>>({});
  async function load() {
    const sequence = ++loadSequence.current;
    const r = await fetch(
      `/api/corporate/private-workspace?projectsPage=${projectsPageRef.current}${projectRef.current ? `&projectId=${projectRef.current}` : ""}`,
      { cache: "no-store" },
    );
    const v = await r.json();
    if (sequence !== loadSequence.current) return;
    if (!r.ok) throw new Error(v.error);
    setData((current) => ({
      ...v,
      projects: [
        ...new Map(
          [...(current?.projects ?? []), ...v.projects].map((p) => [p.id, p]),
        ).values(),
      ],
    }));
    setProjectId((p) => p || v.projects[0]?.id || "");
  }
  useEffect(() => {
    projectRef.current = projectId;
    if (projectId) load().catch((e) => setError(e.message));
  }, [projectId]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
    const interval = setInterval(() => load().catch(() => {}), 30000);
    return () => clearInterval(interval);
  }, []);
  // The whole catalogue is browsable without typing anything: page 1 loads as
  // soon as the editor is available; search narrows. There are no room chips:
  // HomeLane designers search by look, and the room is typed per wall below
  // (Roheena, 30 September 2026 — "they don't need that search for room name").
  async function browse(opts: { q?: string; page?: number }) {
    const q = opts.q ?? query, page = opts.page ?? 1;
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (page > 1) params.set("page", String(page));
    const r = await fetch(`/api/corporate/catalogue?${params}`);
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    setResults((prev) => (page > 1 ? [...prev, ...(v.results ?? [])] : v.results ?? []));
    setCatalogue({ page, total: v.total ?? 0, hasMore: !!v.hasMore });
    setSearchNotice(typeof v.notice === "string" ? v.notice : "");
  }
  const canBrowse = !!(data?.canBuild && projectId);
  useEffect(() => {
    if (!canBrowse) return;
    const t = setTimeout(() => browse({ page: 1 }).catch((e) => setError(e.message)), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canBrowse]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }
  async function post(body: unknown) {
    const r = await fetch("/api/corporate/private-workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const v = await r.json();
    if (!r.ok)
      throw new Error(
        typeof v.error === "string" ? v.error : "Check required fields",
      );
    return v.data;
  }
  async function selectDesign(handle: string) {
    const r = await fetch(
      `/api/corporate/catalogue?handle=${encodeURIComponent(handle)}`,
    );
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    setDesign(v);
    setMaterial(v.materials[0]?.slug ?? "");
  }
  // Picking a tile from the grid. The generic run() puts its error at the top
  // of the page, six rows above a 36-tile grid — from the bottom of the grid a
  // failed click looked like nothing happened. The tile itself now shows it is
  // loading, a failure is reported right under the grid, and a success scrolls
  // the wall form into view so the next step is visible.
  const [picking, setPicking] = useState<string | null>(null),
    [pickError, setPickError] = useState("");
  async function pickTile(handle: string) {
    setPicking(handle);
    setPickError("");
    try {
      await selectDesign(handle);
      setTimeout(
        () => document.getElementById("wall-form")?.scrollIntoView({ behavior: "smooth", block: "start" }),
        0,
      );
    } catch (e) {
      setPickError(e instanceof Error ? e.message : "Could not open that design");
    } finally {
      setPicking(null);
    }
  }
  const [dragging, setDragging] = useState(false),
    [uploading, setUploading] = useState(false);
  function uploadPhoto(file: File) {
    setUploading(true);
    run(async () => {
      const f = new FormData();
      f.set("file", file);
      const r = await fetch("/api/corporate/private-workspace/photo", {
        method: "POST",
        body: f,
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setPhoto(v);
    }).finally(() => setUploading(false));
  }
  // One download at a time; the key says which button is working.
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  async function downloadPdf(key: string, sheet: PreviewSheet) {
    setPdfBusy(key);
    setError("");
    try {
      await downloadPreviewPdf(sheet);
    } catch {
      setError("The PDF could not be prepared — check your connection and try again.");
    } finally {
      setPdfBusy(null);
    }
  }
  const optionSheet = (o: Option): PreviewSheet => ({
    accountName: name,
    designTitle: o.specification.printName ?? "Wallpaper",
    roomName: o.room_name,
    wallIdentifier: o.wall_identifier,
    material: o.specification.materialSlug ?? "",
    widthMm: o.specification.widthMm,
    heightMm: o.specification.heightMm,
    chargeableSqft: o.specification.price?.areaSqft ?? null,
    wallSqft: wallSqft(o.specification.widthMm, o.specification.heightMm),
    price: data?.canPurchase ? o.specification.price : null,
    artUrl: o.previewUrl ?? o.specification.designUrl,
    placement: { ...initialPlacement, ...o.specification.placement },
    openings: o.specification.wireOpenings ?? [],
    photoUrl: o.photoUrl,
    corners: o.specification.previewCorners ?? DEFAULT_WALL_CORNERS,
  });
  const project = data?.projects.find((p) => p.id === projectId);
  const options = (data?.options ?? []).filter(
    (o) => o.project_id === projectId,
  );
  const confirmations = (data?.confirmations ?? []).filter(
    (c) => c.project_id === projectId,
  );
  const decision = (id: string) =>
    data?.decisions.find((d) => d.option_id === id)?.decision ?? "draft";
  const released = (id: string) =>
    confirmations.some((c) => c.po_accepted_at && c.option_ids.includes(id));
  const accepted = options.filter(
    (o) => decision(o.id) === "accepted" && !released(o.id),
  );
  const { active: activeOptions, archived: archivedOptions } =
    splitOptionsByArchive(options, decision);
  async function reopen(o: Option) {
    await selectDesign(o.specification.productHandle!);
    setDesign((current) =>
      current
        ? { ...current, flatImage: o.previewUrl ?? current.flatImage }
        : current,
    );
    setRoom(o.room_name);
    setWall(o.wall_identifier);
    setWidth(o.specification.widthMm);
    setHeight(o.specification.heightMm);
    setMaterial(o.specification.materialSlug ?? "");
    setPlacement({ ...initialPlacement, ...o.specification.placement });
    setOpenings(o.specification.wireOpenings ?? []);
    setPhoto(
      o.specification.previewPhotoPath && o.photoUrl
        ? { path: o.specification.previewPhotoPath, url: o.photoUrl }
        : null,
    );
    setCorners(o.specification.previewCorners ?? DEFAULT_WALL_CORNERS);
    setSupersedes(o.id);
    document
      .getElementById("option-editor")
      ?.scrollIntoView({ behavior: "smooth" });
  }
  return (
    <main
      data-portal-tour="projects"
      className="mx-auto max-w-7xl px-5 py-8 text-stone-800"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-6">
        <div>
          <p className="text-xs uppercase tracking-widest">{name}</p>
          <h1 className="mt-2 text-3xl">Customer projects</h1>
          <p className="mt-2 text-sm text-stone-500">
            {email} · Specify walls, record decisions and hand accepted
            selections to purchasing.
          </p>
          {city && (
            <p className="mt-1 text-sm text-stone-500">
              City: <strong className="text-stone-800">{city}</strong> · orders
              deliver only here ·{" "}
              <Link href={`/partners/${slug}?city=change`} className="underline">
                Change city
              </Link>
            </p>
          )}
        </div>
        <nav
          data-portal-tour="navigation"
          className="flex flex-wrap gap-4 text-sm"
        >
          {slug === "homelane" && tourIdentity && (
            <PortalTour slug={slug} identity={tourIdentity} page="projects" />
          )}
          <Link href={`/partners/${slug}/documents`}>Documents</Link>
          <Link href={`/partners/${slug}/team`}>Team</Link>
          <Link href={`/partners/${slug}/settings`}>Account</Link>
          <button
            onClick={() =>
              fetch("/api/corporate/logout", { method: "POST" }).then(() =>
                location.assign(`/partners/${slug}`),
              )
            }
          >
            Sign out
          </button>
        </nav>
      </header>
      {error && (
        <p
          role="alert"
          className="my-4 rounded border border-red-200 bg-red-50 p-4"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="my-4 bg-green-50 p-4">
          {notice}
        </p>
      )}
      {!data ? (
        <p className="py-8">Loading your private workspace…</p>
      ) : (
        <>
          <section className="my-6 grid gap-5 rounded border border-stone-200 p-5 md:grid-cols-2">
            <div>
              <label className="block text-sm">
                Customer
                <select
                  aria-label="Customer"
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    setSelected([]);
                    setSupersedes(undefined);
                  }}
                  className="mt-2 w-full rounded border p-3"
                >
                  <option value="">Choose a customer</option>
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.customer_id} · {p.customer_name}
                    </option>
                  ))}
                </select>
              </label>
              {data.projectsMore && (
                <button
                  type="button"
                  className="mt-2 text-sm underline"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      projectsPageRef.current++;
                      await load();
                    })
                  }
                >
                  Load more customers
                </button>
              )}
              <p className="mt-3 text-sm text-stone-500">
                Design activity and confirmations stay private to your partner
                account until an accepted PO. Dispatch is promised within{" "}
                {data.capabilities.dispatchPromiseDays} calendar days of PO
                acceptance.
              </p>
            </div>
            {data.canBuild && (
              <form
                data-portal-tour="create-customer"
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  run(async () => {
                    const p = await post({
                      action: "project",
                      customerId: f.get("customerId"),
                      customerName: f.get("customerName"),
                    });
                    setProjectId(p.id);
                    setNotice("Customer added");
                  });
                }}
              >
                <label className="flex-1 text-sm">
                  {/* The partner's own reference for the customer (HomeLane's,
                      Design Cafe's) — typed once, then picked from Customer.
                      HomeLane's account name is its legal entity, so its
                      brand is named here as the documents page does. */}
                  {slug === "homelane" ? "HomeLane" : name} customer ID
                  <input
                    name="customerId"
                    required
                    maxLength={120}
                    className="mt-2 w-full rounded border p-3"
                  />
                </label>
                <label className="flex-1 text-sm">
                  Customer name
                  <input
                    name="customerName"
                    required
                    maxLength={120}
                    className="mt-2 w-full rounded border p-3"
                  />
                </label>
                <button
                  disabled={busy}
                  className="w-full rounded bg-stone-800 p-3 text-white"
                >
                  Add customer
                </button>
              </form>
            )}
          </section>
          {project && (
            <>
              {data.canBuild && (
                <section
                  id="option-editor"
                  className="my-8 rounded border border-stone-200 p-5"
                >
                  <h2 className="text-xl">
                    {supersedes
                      ? "Create a revised option"
                      : "Find a design for this wall"}
                  </h2>
                  {!supersedes && (
                    <p className="mt-1 text-sm text-stone-500">
                      Paste a design's name or link from zyvorah.com, or search
                      a look, theme or colour — florals, cranes, sage green. The
                      room and wall come after you pick.
                    </p>
                  )}
                  <form
                    className="mt-4 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(() => browse({ page: 1 }));
                    }}
                  >
                    <input
                      aria-label="Search catalogue"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      // Pasting a name copied from zyvorah.com searches at
                      // once — the paste IS the request, no second click.
                      onPaste={(e) => {
                        const pasted = e.clipboardData.getData("text").trim();
                        if (!pasted || query.trim()) return;
                        e.preventDefault();
                        setQuery(pasted);
                        run(() => browse({ q: pasted, page: 1 }));
                      }}
                      placeholder="Paste a design name or link from zyvorah.com, or search e.g. cranes, sage green"
                      className="w-full rounded border p-3"
                    />
                    <button disabled={busy} className="rounded border px-5">
                      Search
                    </button>
                  </form>
                  <ShortlistStrip
                    onPick={(h) => void pickTile(h)}
                    selectedHandle={design?.handle}
                    picking={picking}
                  />
                  {searchNotice && (
                    <p role="status" className="mt-3 rounded border border-stone-200 bg-stone-50 p-3 text-sm">
                      {searchNotice}
                    </p>
                  )}
                  <p className="mt-3 text-sm text-stone-500">
                    {catalogue.total
                      ? `Showing ${results.length} of ${catalogue.total} designs`
                      : "No designs match — clear the search."}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
                    {results.map((r) => (
                      <button
                        key={r.handle}
                        type="button"
                        disabled={picking !== null}
                        aria-pressed={design?.handle === r.handle}
                        onClick={() => void pickTile(r.handle)}
                        className={`overflow-hidden rounded border text-left disabled:cursor-wait ${design?.handle === r.handle ? "ring-2 ring-stone-700" : ""} ${picking === r.handle ? "opacity-60" : ""}`}
                      >
                        <img
                          src={r.image}
                          alt=""
                          loading="lazy"
                          className="aspect-[3/4] w-full object-cover object-bottom"
                        />
                        <span className="block p-2 text-sm">
                          {picking === r.handle ? "Opening…" : r.title}
                        </span>
                      </button>
                    ))}
                  </div>
                  {pickError && (
                    <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm">
                      {pickError}
                    </p>
                  )}
                  {catalogue.hasMore && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => browse({ page: catalogue.page + 1 }))}
                      className="mt-4 w-full rounded border p-3"
                    >
                      Load more designs
                    </button>
                  )}
                  {design && (
                    <form
                      id="wall-form"
                      className="mt-6 grid gap-6 lg:grid-cols-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        run(async () => {
                          await post({
                            action: "option",
                            projectId,
                            roomName: room,
                            wallIdentifier: wall,
                            productHandle: design.handle,
                            materialSlug: material,
                            widthMm: width,
                            heightMm: height,
                            placement,
                            openings: openings.map(wireOpening),
                            previewPhotoPath: photo?.path,
                            previewCorners: photo ? corners : undefined,
                            supersedesId: supersedes,
                          });
                          setNotice(
                            "Option saved. Record the customer decision below.",
                          );
                          setSupersedes(undefined);
                        });
                      }}
                    >
                      <div>
                        <h3 className="text-lg">{design.title}</h3>
                        <div
                          data-portal-tour="wall"
                          className="mt-4 grid grid-cols-2 gap-3"
                        >
                          <label>
                            Room name
                            <input
                              required
                              value={room}
                              onChange={(e) => setRoom(e.target.value)}
                              className="mt-1 w-full rounded border p-2"
                            />
                          </label>
                          <label>
                            Wall identifier
                            <input
                              required
                              value={wall}
                              onChange={(e) => setWall(e.target.value)}
                              placeholder="e.g. W1"
                              className="mt-1 w-full rounded border p-2"
                            />
                          </label>
                          <label>
                            Width (mm)
                            <input
                              type="number"
                              required
                              min={100}
                              max={100000}
                              value={width}
                              onChange={(e) => setWidth(Number(e.target.value))}
                              className="mt-1 w-full rounded border p-2"
                            />
                          </label>
                          <label>
                            Height (mm)
                            <input
                              type="number"
                              required
                              min={100}
                              max={20000}
                              value={height}
                              onChange={(e) =>
                                setHeight(Number(e.target.value))
                              }
                              className="mt-1 w-full rounded border p-2"
                            />
                          </label>
                        </div>
                        <label className="mt-4 block">
                          Material
                          <select
                            required
                            value={material}
                            onChange={(e) => setMaterial(e.target.value)}
                            className="mt-1 w-full rounded border p-2"
                          >
                            {design.materials.map((m) => (
                              <option key={m.slug} value={m.slug}>
                                {m.name}
                                {data.canPurchase && m.netPricePerSqft != null
                                  ? ` · ${money(m.netPricePerSqft)}/sq ft ex GST`
                                  : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        {(["zoom", "cropX", "cropY"] as const).map((k) => (
                          <label key={k} className="mt-4 block text-sm">
                            {k === "zoom"
                              ? "Scale"
                              : k === "cropX"
                                ? "Horizontal crop"
                                : "Vertical crop"}{" "}
                            · {placement[k].toFixed(2)}
                            <input
                              aria-label={k}
                              type="range"
                              min={k === "zoom" ? 1 : 0}
                              max={k === "zoom" ? 8 : 1}
                              step={0.01}
                              value={placement[k]}
                              onChange={(e) =>
                                setPlacement({
                                  ...placement,
                                  [k]: Number(e.target.value),
                                })
                              }
                              className="block w-full"
                            />
                          </label>
                        ))}
                        <div className="mt-4 flex gap-5">
                          {(["flipH", "flipV"] as const).map((k) => (
                            <label key={k}>
                              <input
                                type="checkbox"
                                checked={placement[k]}
                                onChange={(e) =>
                                  setPlacement({
                                    ...placement,
                                    [k]: e.target.checked,
                                  })
                                }
                              />{" "}
                              {k === "flipH"
                                ? "Flip horizontal"
                                : "Flip vertical"}
                            </label>
                          ))}
                        </div>
                        <div className="mt-4">
                          <p data-portal-tour="openings" className="text-sm">
                            Doors &amp; windows
                          </p>
                          {openings.map((o, i) => {
                            const isWindow = o.sillMm != null;
                            const label = `${isWindow ? "Window" : "Door"} ${openings.slice(0, i + 1).filter((v) => (v.sillMm != null) === isWindow).length}`;
                            const patch = (p: Partial<OpeningRow>) =>
                              setOpenings(
                                openings.map((v, j) =>
                                  j === i ? { ...v, ...p } : v,
                                ),
                              );
                            const fromRight = o.side === "right";
                            const pos = fromRight
                              ? Math.max(0, width - o.offsetMm - o.widthMm)
                              : o.offsetMm;
                            const setPos = (mm: number) =>
                              patch({
                                offsetMm: fromRight
                                  ? Math.max(0, width - mm - o.widthMm)
                                  : mm,
                              });
                            const field = "mt-1 w-full rounded border p-2";
                            return (
                              <div
                                key={i}
                                className="mt-3 rounded border border-stone-200 p-3"
                              >
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-medium">{label}</span>
                                  <button
                                    type="button"
                                    className="underline"
                                    onClick={() =>
                                      setOpenings(
                                        openings.filter((_, j) => j !== i),
                                      )
                                    }
                                  >
                                    Remove
                                  </button>
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                                  <label className="text-xs">
                                    Width (mm)
                                    <input
                                      type="number"
                                      min={1}
                                      required
                                      value={o.widthMm}
                                      onChange={(e) =>
                                        patch({ widthMm: Number(e.target.value) })
                                      }
                                      className={field}
                                    />
                                  </label>
                                  <label className="text-xs">
                                    Height (mm)
                                    <input
                                      type="number"
                                      min={1}
                                      required
                                      value={o.heightMm}
                                      onChange={(e) =>
                                        patch({ heightMm: Number(e.target.value) })
                                      }
                                      className={field}
                                    />
                                  </label>
                                  {isWindow && (
                                    <label
                                      className="text-xs"
                                      title="Height of the window's bottom edge (sill) above the floor"
                                    >
                                      Sill from floor (mm)
                                      <input
                                        type="number"
                                        min={0}
                                        required
                                        value={o.sillMm ?? 0}
                                        onChange={(e) =>
                                          patch({ sillMm: Number(e.target.value) })
                                        }
                                        className={field}
                                      />
                                    </label>
                                  )}
                                  <label className="text-xs">
                                    <select
                                      aria-label={`${label} position measured from`}
                                      value={fromRight ? "right" : "left"}
                                      onChange={(e) =>
                                        patch({
                                          side:
                                            e.target.value === "right"
                                              ? "right"
                                              : "left",
                                        })
                                      }
                                      className="rounded border bg-white p-1"
                                    >
                                      <option value="left">From left (mm)</option>
                                      <option value="right">From right (mm)</option>
                                    </select>
                                    <input
                                      type="number"
                                      min={0}
                                      required
                                      aria-label={`${label} distance from the wall's ${fromRight ? "right" : "left"} edge in mm`}
                                      value={pos}
                                      onChange={(e) =>
                                        setPos(Number(e.target.value))
                                      }
                                      className={field}
                                    />
                                  </label>
                                </div>
                              </div>
                            );
                          })}
                          <div className="mt-3 flex gap-4">
                            <button
                              type="button"
                              className="text-sm underline"
                              disabled={openings.length >= 12}
                              onClick={() =>
                                setOpenings([
                                  ...openings,
                                  { widthMm: 900, heightMm: 2100, offsetMm: 0 },
                                ])
                              }
                            >
                              Add door
                            </button>
                            <button
                              type="button"
                              className="text-sm underline"
                              disabled={openings.length >= 12}
                              onClick={() =>
                                setOpenings([
                                  ...openings,
                                  {
                                    widthMm: 1200,
                                    heightMm: 1200,
                                    offsetMm: 0,
                                    sillMm: 900,
                                  },
                                ])
                              }
                            >
                              Add window
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-stone-500">
                            Doors and windows are drawn on the composition for
                            the installer. Large floor-to-top openings may
                            reduce chargeable print area; windows and small
                            marks print through and are trimmed on site.
                          </p>
                        </div>
                        <button
                          data-portal-tour="save"
                          disabled={busy}
                          className="mt-5 w-full rounded bg-stone-800 p-3 text-white"
                        >
                          {busy
                            ? "Saving…"
                            : "Save option and exact composition"}
                        </button>
                      </div>
                      <div>
                        <p className="mb-2 text-sm">
                          Print composition · {width} × {height} mm · wall
                          area {area(wallSqft(width, height))}
                        </p>
                        <p className="mb-2 text-xs text-stone-500">
                          The chargeable area is confirmed on the saved
                          option — openings and the print-roll minimum can change it.
                        </p>
                        <Composition
                          url={design.flatImage}
                          width={width}
                          height={height}
                          placement={placement}
                          openings={openings}
                        />
                        <button
                          type="button"
                          disabled={pdfBusy !== null}
                          onClick={() =>
                            void downloadPdf("editor", {
                              accountName: name,
                              designTitle: design.title,
                              roomName: room || "Room",
                              wallIdentifier: wall || "Wall",
                              material:
                                design.materials.find((m) => m.slug === material)
                                  ?.name ?? material,
                              widthMm: width,
                              heightMm: height,
                              chargeableSqft: null,
                              wallSqft: wallSqft(width, height),
                              price: null,
                              artUrl: design.flatImage,
                              placement,
                              openings: openings.map(wireOpening),
                              photoUrl: photo?.url,
                              corners,
                            })
                          }
                          className="mt-3 text-sm underline underline-offset-4 disabled:cursor-wait disabled:opacity-60"
                        >
                          {pdfBusy === "editor"
                            ? "Preparing PDF…"
                            : "Download this preview as PDF"}
                        </button>
                        {/* A bare file input read as plain text: nothing
                            said it could be clicked. The whole box is the
                            target — hand cursor, hover tint, drop a file on
                            it — and it says what it is before anyone tries. */}
                        <p className="mt-5 text-sm">
                          Room photo for visualisation{" "}
                          <span className="text-stone-500">(optional)</span>
                        </p>
                        <label
                          data-portal-tour="room-photo"
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragging(true);
                          }}
                          onDragLeave={() => setDragging(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDragging(false);
                            const file = e.dataTransfer.files?.[0];
                            if (file) uploadPhoto(file);
                          }}
                          className={`mt-2 flex cursor-pointer flex-col items-center justify-center gap-1 rounded border-2 border-dashed px-4 py-6 text-center text-sm transition-colors hover:border-stone-500 hover:bg-stone-50 focus-within:border-stone-500 ${dragging ? "border-stone-500 bg-stone-50" : "border-stone-300"} ${uploading ? "cursor-wait opacity-60" : ""}`}
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            className="h-6 w-6 text-stone-500"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                          </svg>
                          <span className="font-medium underline underline-offset-4">
                            {uploading
                              ? "Uploading…"
                              : photo
                                ? "Replace room photo"
                                : "Click to upload a room photo"}
                          </span>
                          <span className="text-xs text-stone-500">
                            or drag one here · JPG or PNG
                          </span>
                          <input
                            aria-label="Room photograph"
                            type="file"
                            accept="image/jpeg,image/png"
                            className="sr-only"
                            disabled={uploading}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) uploadPhoto(file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {photo && (
                          <div className="mt-3">
                            <RoomPreview
                              photoUrl={photo.url}
                              artUrl={design.flatImage}
                              width={width}
                              height={height}
                              placement={placement}
                              corners={corners}
                              onCorners={setCorners}
                            />
                            <p className="mt-2 text-xs text-stone-500">
                              Room reference accompanies this option. The
                              composition above is the printable specification.
                            </p>
                          </div>
                        )}
                      </div>
                    </form>
                  )}
                </section>
              )}
              <section className="my-8">
                <h2 data-portal-tour="decisions" className="text-xl">
                  Wall options and customer decisions
                </h2>
                {!options.length && (
                  <p className="mt-3 text-stone-500">
                    Save the first catalogue option for this customer.
                  </p>
                )}
                <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {activeOptions.map((o) => (
                    <article
                      key={o.id}
                      className="overflow-hidden rounded border border-stone-200"
                    >
                      <Composition
                        url={o.previewUrl ?? o.specification.designUrl}
                        width={o.specification.widthMm}
                        height={o.specification.heightMm}
                        placement={{
                          ...initialPlacement,
                          ...o.specification.placement,
                        }}
                        openings={o.specification.wireOpenings}
                      />
                      <div className="p-4">
                        <h3>
                          {o.room_name} · {o.wall_identifier}
                        </h3>
                        <p className="mt-1 text-sm">
                          {o.specification.printName} ·{" "}
                          {o.specification.materialSlug}
                        </p>
                        <p className="mt-1 text-sm">
                          {o.specification.widthMm} × {o.specification.heightMm}{" "}
                          mm
                          {data.canPurchase &&
                            ` · ${money(o.specification.price.total)} including GST`}
                        </p>
                        {o.specification.price?.areaSqft != null && (
                          <p className="mt-1 text-sm">
                            Chargeable area:{" "}
                            {area(o.specification.price.areaSqft)}
                            {data.canPurchase &&
                              ` at ${money(o.specification.price.ratePerSqft)}/sq ft ex GST`}
                          </p>
                        )}
                        <p className="mt-2 text-sm font-medium">
                          {released(o.id)
                            ? "PO accepted"
                            : decision(o.id) === "accepted"
                              ? "Ready for purchasing"
                              : decision(o.id)}
                        </p>
                        {data.canBuild && !released(o.id) && (
                          <div className="mt-3 flex flex-wrap gap-3 text-sm">
                            <button
                              disabled={busy}
                              onClick={() =>
                                run(async () => {
                                  await post({
                                    action: "decision",
                                    optionId: o.id,
                                    decision: "accepted",
                                    note: "Customer accepted",
                                  });
                                  setNotice("Ready for purchasing");
                                })
                              }
                            >
                              Accept
                            </button>
                            <button
                              disabled={busy}
                              onClick={() =>
                                run(async () => {
                                  await post({
                                    action: "decision",
                                    optionId: o.id,
                                    decision: "rejected",
                                    note: "Customer rejected",
                                  });
                                })
                              }
                            >
                              Reject
                            </button>
                            {/* One verb for "replace this": Revise reopens
                                the option in the editor and saving the
                                revision marks this one superseded
                                (partner_add_option). A separate Supersede
                                button did the marking without a replacement
                                — a Reject by another name — and read as a
                                synonym, so it went. */}
                            <button
                              disabled={busy}
                              onClick={() => run(() => reopen(o))}
                            >
                              Revise
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          disabled={pdfBusy !== null}
                          onClick={() => void downloadPdf(o.id, optionSheet(o))}
                          className="mt-3 block text-sm underline underline-offset-4 disabled:cursor-wait disabled:opacity-60"
                        >
                          {pdfBusy === o.id ? "Preparing PDF…" : "Download PDF"}
                        </button>
                        {o.photoUrl && (
                          <details className="mt-3 text-sm">
                            <summary>View in customer room</summary>
                            <RoomPreview
                              photoUrl={o.photoUrl}
                              artUrl={o.previewUrl ?? o.specification.designUrl}
                              width={o.specification.widthMm}
                              height={o.specification.heightMm}
                              placement={{
                                ...initialPlacement,
                                ...o.specification.placement,
                              }}
                              corners={
                                o.specification.previewCorners ??
                                DEFAULT_WALL_CORNERS
                              }
                            />
                          </details>
                        )}
                        <details className="mt-3 text-xs">
                          <summary>Decision history</summary>
                          {data.decisions
                            .filter((d) => d.option_id === o.id)
                            .map((d, i) => (
                              <p key={i} className="mt-2">
                                {d.decision} · {d.actor} · {date(d.created_at)}{" "}
                                · {d.note}
                              </p>
                            ))}
                        </details>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              <section className="my-8" data-portal-tour="archive">
                <h2 className="text-xl">Archive</h2>
                <p className="mt-2 text-sm text-stone-500">
                  Options rejected or superseded during design, kept here
                  instead of disappearing.
                </p>
                {!archivedOptions.length && (
                  <p className="mt-3 text-stone-500">Nothing archived yet.</p>
                )}
                <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {archivedOptions.map((o) => (
                    <article
                      key={o.id}
                      className="overflow-hidden rounded border border-stone-200 opacity-75"
                    >
                      <Composition
                        url={o.previewUrl ?? o.specification.designUrl}
                        width={o.specification.widthMm}
                        height={o.specification.heightMm}
                        placement={{
                          ...initialPlacement,
                          ...o.specification.placement,
                        }}
                        openings={o.specification.wireOpenings}
                      />
                      <div className="p-4">
                        <h3>
                          {o.room_name} · {o.wall_identifier}
                        </h3>
                        <p className="mt-1 text-sm">
                          {o.specification.printName} ·{" "}
                          {o.specification.materialSlug}
                        </p>
                        <p className="mt-1 text-sm">
                          {o.specification.widthMm} × {o.specification.heightMm}{" "}
                          mm
                          {data.canPurchase &&
                            ` · ${money(o.specification.price.total)} including GST`}
                        </p>
                        {o.specification.price?.areaSqft != null && (
                          <p className="mt-1 text-sm">
                            Chargeable area:{" "}
                            {area(o.specification.price.areaSqft)}
                            {data.canPurchase &&
                              ` at ${money(o.specification.price.ratePerSqft)}/sq ft ex GST`}
                          </p>
                        )}
                        <p className="mt-2 text-sm font-medium capitalize">
                          {decision(o.id)}
                        </p>
                        <details className="mt-3 text-xs">
                          <summary>Decision history</summary>
                          {data.decisions
                            .filter((d) => d.option_id === o.id)
                            .map((d, i) => (
                              <p key={i} className="mt-2">
                                {d.decision} · {d.actor} · {date(d.created_at)}{" "}
                                · {d.note}
                              </p>
                            ))}
                        </details>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              {data.canPurchase && (
                <section className="my-8 rounded border border-stone-200 p-5">
                  <h2 data-portal-tour="purchasing" className="text-xl">
                    Purchasing confirmation
                  </h2>
                  <p className="mt-2 text-sm text-stone-500">
                    Select the exact accepted options. Confirming prepares one
                    package for one PO.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(async () => {
                        const order = city
                          ? {
                              ...shipping,
                              city,
                              state:
                                cityStates.length === 1
                                  ? cityStates[0]
                                  : shipping.state,
                            }
                          : shipping;
                        // Said before the round trip; the server checks the
                        // same rule and is the one that decides.
                        const wrongCity = city
                          ? orderCityProblem(city, order)
                          : null;
                        if (wrongCity) throw new Error(wrongCity);
                        await post({
                          action: "confirm",
                          projectId,
                          optionIds: selected,
                          shipping: order,
                        });
                        setSelected([]);
                        setNotice(
                          "Order confirmed, however, not sent ahead. Awaiting PO.",
                        );
                      });
                    }}
                  >
                    <div className="my-4 space-y-2">
                      {accepted.map((o) => (
                        <label key={o.id} className="block">
                          <input
                            type="checkbox"
                            checked={selected.includes(o.id)}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...selected, o.id]
                                  : selected.filter((id) => id !== o.id),
                              )
                            }
                          />{" "}
                          {o.room_name} / {o.wall_identifier} /{" "}
                          {o.specification.printName} ·{" "}
                          {area(o.specification.price.areaSqft)} ·{" "}
                          {money(o.specification.price.total)}
                        </label>
                      ))}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {Object.keys(initialShipping).map((k) => (
                        <label key={k} className="text-sm">
                          {
                            (
                              {
                                state: "Dispatch state",
                                address_line: "Delivery address",
                                city: "City",
                                pincode: "PIN code",
                                contact_name: "Delivery contact",
                                contact_phone: "Contact phone",
                                gstin: "Billing GSTIN",
                                billing_address: "Billing address",
                              } as Record<string, string>
                            )[k]
                          }
                          {city &&
                          (k === "city" ||
                            (k === "state" && cityStates.length === 1)) ? (
                            // Fixed by the city chosen at sign-in; changing
                            // it means changing the city, not this form.
                            <input
                              readOnly
                              value={k === "city" ? city : cityStates[0]}
                              className="mt-1 w-full rounded border bg-stone-50 p-3 text-stone-500"
                            />
                          ) : city && k === "state" ? (
                            <select
                              required
                              value={shipping.state}
                              onChange={(e) =>
                                setShipping({ ...shipping, state: e.target.value })
                              }
                              className="mt-1 w-full rounded border p-3"
                            >
                              <option value="">Choose…</option>
                              {cityStates.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              required
                              value={shipping[k as keyof typeof shipping]}
                              onChange={(e) =>
                                setShipping({ ...shipping, [k]: e.target.value })
                              }
                              className="mt-1 w-full rounded border p-3"
                            />
                          )}
                        </label>
                      ))}
                    </div>
                    <p className="mt-4">
                      Package total:{" "}
                      {money(
                        accepted
                          .filter((o) => selected.includes(o.id))
                          .reduce((n, o) => n + o.specification.price.total, 0),
                      )}{" "}
                      · chargeable area{" "}
                      {area(
                        accepted
                          .filter((o) => selected.includes(o.id))
                          .reduce((n, o) => n + o.specification.price.areaSqft, 0),
                      )}
                    </p>
                    <button
                      data-portal-tour="confirm"
                      disabled={busy || !selected.length}
                      className="mt-4 rounded bg-stone-800 p-3 text-white disabled:opacity-40"
                    >
                      Confirm selections for PO
                    </button>
                  </form>
                </section>
              )}
              <section className="my-8">
                <h2 data-portal-tour="confirmations" className="text-xl">
                  Confirmed packages
                </h2>
                {confirmations.map((c) => {
                  const lines = data.lines.filter(
                    (l) => l.confirmation_id === c.id,
                  );
                  const statuses = lines.flatMap((l) =>
                    l.os_order_id && data.statuses[l.os_order_id]
                      ? [data.statuses[l.os_order_id]]
                      : [],
                  );
                  const dispatched =
                    lines.length > 0 &&
                    statuses.length === lines.length &&
                    statuses.every((s) => s.dispatchedAt);
                  return (
                    <article
                      key={c.id}
                      className="mt-4 rounded border border-stone-200 p-5"
                    >
                      <p className="text-xs text-stone-500">
                        Confirmation {c.id} · version {c.version} ·{" "}
                        {c.option_ids.length} wall options
                      </p>
                      <h3 className="mt-2 text-lg">
                        {c.status === "superseded"
                          ? "Superseded confirmation"
                          : !c.po_accepted_at
                            ? "Order confirmed, however, not sent ahead"
                            : dispatched
                              ? "Dispatched"
                              : c.status === "sent"
                                ? "Sent to production"
                                : "PO accepted · synchronising automatically"}
                      </h3>
                      {!c.po_accepted_at && c.status !== "superseded" && (
                        <p className="mt-1">Awaiting PO</p>
                      )}
                      <details className="mt-3 text-sm">
                        <summary>Confirmed selections and delivery</summary>
                        <p className="mt-2">
                          {c.option_ids
                            .map((id) => {
                              const o = options.find((o) => o.id === id);
                              return o
                                ? `${o.room_name}/${o.wall_identifier}: ${o.specification.printName}`
                                : id;
                            })
                            .join(" · ")}
                        </p>
                        <p className="mt-2">
                          {c.shipping.address_line}, {c.shipping.city},{" "}
                          {c.shipping.state} {c.shipping.pincode}
                        </p>
                      </details>
                      {c.po_accepted_at && (
                        <p className="mt-3 text-sm">
                          PO {c.po_number} accepted {date(c.po_accepted_at)}.
                          Promised dispatch by{" "}
                          {new Date(c.promised_dispatch_at!).toLocaleDateString(
                            "en-IN",
                            { timeZone: "Asia/Kolkata", dateStyle: "long" },
                          )}
                          . Delivery depends on courier transit.{" "}
                          <a
                            className="underline"
                            href={`/api/corporate/private-workspace/confirmations/${c.id}/document`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View immutable PO
                          </a>
                        </p>
                      )}
                      {data.canPurchase &&
                        c.status === "confirmed_awaiting_po" && (
                          <form
                            className="mt-4 flex flex-wrap gap-3"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const f = new FormData(e.currentTarget);
                              run(async () => {
                                const r = await fetch(
                                  `/api/corporate/private-workspace/confirmations/${c.id}/po`,
                                  { method: "POST", body: f },
                                );
                                const v = await r.json();
                                if (!r.ok) throw new Error(v.error);
                                setNotice(
                                  "PO accepted. Automatic release has been queued.",
                                );
                              });
                            }}
                          >
                            <label>
                              PO number
                              <input
                                name="poNumber"
                                required
                                maxLength={120}
                                value={poNumbers[c.id] ?? ""}
                                onChange={(e) =>
                                  setPoNumbers({
                                    ...poNumbers,
                                    [c.id]: e.target.value,
                                  })
                                }
                                className="ml-2 rounded border p-2"
                              />
                            </label>
                            <input
                              data-portal-tour="po"
                              aria-label="Purchase order document"
                              name="file"
                              type="file"
                              required
                              accept="application/pdf,image/png,image/jpeg"
                            />
                            <button
                              disabled={busy}
                              className="rounded bg-stone-800 px-4 py-2 text-white"
                            >
                              Accept PO and release automatically
                            </button>
                          </form>
                        )}
                      {c.po_accepted_at &&
                        data.statusesUnavailable &&
                        lines.some(
                          (l) => l.os_order_id && !data.statuses[l.os_order_id],
                        ) && (
                          <p
                            role="status"
                            className="mt-3 text-sm text-stone-500"
                          >
                            Production progress is temporarily unavailable. Your
                            promised dispatch date remains unchanged.
                          </p>
                        )}
                      {statuses.map((s, i) => (
                        <p key={i} className="mt-2 text-sm">
                          Wall {i + 1}:{" "}
                          {s.dispatchedAt
                            ? "Dispatched"
                            : s.printedAt
                              ? "Printing complete"
                              : (s.printStatus ?? "Received")}{" "}
                          {s.trackingUrl && (
                            <a className="underline" href={s.trackingUrl}>
                              Courier tracking
                            </a>
                          )}
                        </p>
                      ))}
                    </article>
                  );
                })}
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
