"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DesignVisualizer } from "@/components/DesignVisualizer";
import { proposalConfigurationSchema, type ProposalConfiguration } from "@/lib/proposal-configuration";
import ProposalCart from "./proposal-cart";
import ProposalRoomEditor from "./proposal-room-editor";
import ProposalArtwork from "./proposal-artwork";
import Lightbox, { type LightboxImage } from "@/components/Lightbox";
import type { Point } from "@/lib/homography";
import { areaLabel, type AreaRow, type BuildingRow } from "@/lib/portfolio";
import { showFeet } from "@/lib/wall-measure";

// The wall as it is, beside the wall wearing a design.
//
// The mockup is drawn HERE, in the browser: WallMockup warps the artwork onto
// the photograph on a canvas. Nothing server-side can do that — workerd has no
// canvas and no sharp — so when a study needs to appear in a PDF, this page
// exports the very canvas it drew and uploads it. Exporting rather than
// re-rendering is what stops the document and the screen from disagreeing.
//
// When the wall surface could not be found in the photograph, the study shows
// the photo beside the flat design instead of on it. That is deliberate and
// says so on screen: a mockup drawn on an imagined plane looks deliberate, and
// would be approved as though it meant something.

type Study = {
  purchasable: boolean; roomPhotoUrl: string | null; roomMids: [Point,Point,Point,Point] | null;
  configuration: ProposalConfiguration;
  revision: number;
  id: string;
  designId: string;
  quad: [Point, Point, Point, Point] | null;
  status: "draft" | "approved";
  note: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  artUrl: string;
  renderUrl: string | null;
  renderError: string | null;
};

type StudyWall = {
  id: string;
  seq: number;
  name: string;
  widthMm: number;
  heightMm: number;
  brief: string | null;
  photoUrl: string | null;
  quad: [Point, Point, Point, Point] | null;
  studies: Study[];
};

type Design = {
  id: string;
  title: string;
  design_code: string | null;
  series_name: string | null;
};

export default function StudiesPanel({
  tree, canBuild,
}: {
  tree: { store: BuildingRow; areas: AreaRow[] }[];
  canBuild: boolean;
}) {
  const [open, setOpen] = useState<{ area: AreaRow; building: string } | null>(() => {
    const spaces = tree.flatMap(({store, areas}) => areas.map(area => ({area, building: store.name})));
    return spaces.length === 1 ? spaces[0] : null;
  });

  if (open) {
    return (
      <AreaStudies
        area={open.area} buildingName={open.building} canBuild={canBuild}
        onBack={() => setOpen(null)}
      />
    );
  }

  const spaces = tree.flatMap(({ store, areas }) =>
    areas.map((area) => ({ area, building: store.name })));

  if (spaces.length === 0) {
    return (
      <div className="mt-6 rounded-[18px] border border-dashed border-edge bg-wash px-6 py-12 text-center">
        <p className="font-display text-base font-bold">No spaces yet</p>
        <p className="mx-auto mt-2 max-w-[46ch] text-sm text-slate">
          Add a building and a space under Buildings, capture its walls, and the
          proposals for it appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <p className="max-w-[54ch] text-sm text-slate">
        Your design proposals. Open a space to adjust the size and composition, save
        your changes and approve the version you want. Payment comes before production.
      </p>
      <ul className="mt-5 space-y-1.5">
        {spaces.map(({ area, building }) => (
          <li key={area.id}>
            <button type="button" onClick={() => setOpen({ area, building })}
              className="flex w-full items-center justify-between gap-3 rounded-[12px] bg-wash px-4 py-3 text-left hover:bg-edge/40">
              <div className="min-w-0">
                <p className="text-sm font-medium">{areaLabel(area)}</p>
                <p className="mt-0.5 text-xs text-slate">{building}</p>
              </div>
              <span className="text-xs text-slate">Open proposal →</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ────────────────────────── One space ─────────────────────────────────── */

function AreaStudies({
  area, buildingName, canBuild, onBack,
}: {
  area: AreaRow; buildingName: string; canBuild: boolean; onBack: () => void;
}) {
  const [walls, setWalls] = useState<StudyWall[]>([]);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [zoom, setZoom] = useState<LightboxImage | null>(null);
  const [pdf, setPdf] = useState<{ url: string; filename: string } | null>(null);

  const fetchAll = useCallback(async () => {
    const [sRes, dRes] = await Promise.all([
      fetch(`/api/corporate/studies?areaId=${encodeURIComponent(area.id)}`, { cache: "no-store" }),
      fetch("/api/corporate/designs", { cache: "no-store" }),
    ]);
    const [s, d] = await Promise.all([sRes.json(), dRes.json()]);
    if (!sRes.ok || !s.ok) throw new Error(s.error ?? "Could not load these studies.");
    return {
      walls: (s.walls ?? []) as StudyWall[],
      designs: dRes.ok ? ((d.designs ?? []) as Design[]) : [],
    };
  }, [area.id]);

  const reload = useCallback(async () => {
    try {
      const { walls, designs } = await fetchAll();
      setWalls(walls); setDesigns(designs); setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load these studies.");
    }
  }, [fetchAll]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const { walls, designs } = await fetchAll();
        if (!alive) return;
        setWalls(walls); setDesigns(designs); setErr(null);
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "Could not load these studies.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [fetchAll]);

  async function post(body: Record<string, unknown>, tag: string) {
    setBusy(tag); setErr(null); setNote(null);
    try {
      const r = await fetch("/api/corporate/studies", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areaId: area.id, ...body }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "That didn't work.");
      if (j.note) setNote(j.note as string);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't work.");
    } finally { setBusy(null); }
  }

  async function buildPdf(approvedOnly: boolean) {
    setBusy("pdf"); setErr(null); setPdf(null);
    try {
      const r = await fetch("/api/corporate/studies/pdf", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areaId: area.id, approvedOnly }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Could not build the document.");
      setPdf({ url: j.url as string, filename: j.filename as string });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not build the document.");
    } finally { setBusy(null); }
  }

  const withPhoto = walls.filter((w) => w.photoUrl);
  const anyStudy = walls.some((w) => w.studies.length > 0);

  return (
    <div className="mt-6">
      <button onClick={onBack} className="text-xs text-slate underline">← All spaces</button>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold leading-tight">{areaLabel(area)}</h2>
          <p className="mt-0.5 text-xs text-slate">{buildingName}</p>
        </div>
        {anyStudy && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void buildPdf(false)} disabled={busy === "pdf"}
              className="btn h-10 px-4 text-[0.8rem] disabled:opacity-50">
              {busy === "pdf" ? "Building…" : "Download as PDF"}
            </button>
            <button onClick={() => void buildPdf(true)} disabled={busy === "pdf"}
              className="rounded-[10px] border border-edge px-4 py-2 text-xs disabled:opacity-50">
              Approved only
            </button>
          </div>
        )}
      </div>

      {pdf && (
        <p className="mt-3 rounded-[12px] border border-edge bg-surface px-4 py-3 text-sm">
          <a href={pdf.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">
            {pdf.filename}
          </a>{" "}
          <span className="text-slate">
            — ready. The link keeps working for 90 days, so it can be forwarded to
            anyone who does not sign in here.
          </span>
        </p>
      )}
      {note && <p className="mt-3 text-sm text-slate">{note}</p>}
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      {loading ? (
        <p className="mt-6 text-sm text-slate">Loading…</p>
      ) : withPhoto.length === 0 ? (
        <div className="mt-6 rounded-[18px] border border-dashed border-edge bg-wash px-6 py-10 text-center">
          <p className="font-display text-base font-bold">Nothing to study yet</p>
          <p className="mx-auto mt-1.5 max-w-[44ch] text-sm text-slate">
            A study is drawn on a wall&apos;s photograph. Capture the walls in this
            space under Buildings first.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {withPhoto.map((wall) => (
            <WallStudies
              key={wall.id} wall={wall} designs={designs} areaId={area.id}
              canBuild={canBuild} busy={busy}
              onZoom={setZoom}
              onCreate={(designId) => post({ action: "create", seq: wall.seq, designId }, `create-${wall.seq}`)}
              onRedetect={() => post({ action: "redetect", seq: wall.seq }, `redetect-${wall.seq}`)}
              onApprove={(s) => post({ action: s.status === "approved" ? "unapprove" : "approve", studyId: s.id, revision: s.revision }, `approve-${s.id}`)}
              onConfigure={(s, configuration) => post({ action: "configure", studyId: s.id, revision: s.revision, configuration }, `configure-${s.id}`)}
              onDelete={(s) => post({ action: "delete", studyId: s.id, revision: s.revision }, `delete-${s.id}`)}
            />
          ))}
        </div>
      )}

      <Lightbox image={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}

/* ────────────────────────── One wall ──────────────────────────────────── */

function WallStudies({
  wall, designs, areaId, canBuild, busy, onZoom, onCreate, onRedetect, onApprove, onDelete, onConfigure,
}: {
  wall: StudyWall;
  designs: Design[];
  areaId: string;
  canBuild: boolean;
  busy: string | null;
  onZoom: (i: LightboxImage) => void;
  onCreate: (designId: string) => Promise<void>;
  onRedetect: () => Promise<void>;
  onApprove: (s: Study) => Promise<void>;
  onDelete: (s: Study) => Promise<void>;
  onConfigure: (s: Study, configuration: ProposalConfiguration) => Promise<void>;
}) {
  const [picking, setPicking] = useState(false);
  const size = `${showFeet(wall.widthMm)} × ${showFeet(wall.heightMm)}`;
  const used = new Set(wall.studies.map((s) => s.designId));
  const available = designs.filter((d) => !used.has(d.id));

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-base font-bold">
          <span className="text-slate">{wall.seq}.</span> {wall.name}
        </p>
        <p className="text-xs text-slate">{size}</p>
      </div>
      {wall.brief && <p className="mt-1 max-w-[62ch] text-sm text-slate">{wall.brief}</p>}

      {wall.studies.length === 0 ? (
        <div className="mt-3 rounded-[14px] border border-dashed border-edge bg-wash px-4 py-6 text-center">
          <p className="text-sm text-slate">No direction studied on this wall yet.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {wall.studies.map((study) => (
            <StudyPair
              key={`${study.id}-${study.revision}`} wall={wall} study={study} areaId={areaId}
              canBuild={canBuild} busy={busy} onZoom={onZoom}
              onApprove={onApprove} onDelete={onDelete} onConfigure={onConfigure}
            />
          ))}
        </div>
      )}

      {canBuild && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {picking ? (
            <>
              <select
                autoFocus defaultValue=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) { setPicking(false); void onCreate(id); }
                }}
                className="rounded-[10px] border border-edge bg-wash px-3 py-2 text-sm"
              >
                <option value="" disabled>Choose a design…</option>
                {available.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.series_name ? `${d.series_name} · ` : ""}{d.title}
                  </option>
                ))}
              </select>
              <button onClick={() => setPicking(false)} className="text-xs text-slate underline">Cancel</button>
            </>
          ) : (
            <button
              onClick={() => setPicking(true)}
              disabled={available.length === 0 || busy === `create-${wall.seq}`}
              className="rounded-[10px] border border-edge px-4 py-2 text-xs disabled:opacity-50"
            >
              {busy === `create-${wall.seq}`
                ? "Composing…"
                : available.length === 0
                  ? designs.length === 0 ? "No designs in your library yet" : "All library designs are included"
                  : "Add a design option"}
            </button>
          )}

          {/* Offered only when it would change something: the surface was not
              found, so the studies are showing side by side. */}
          {!wall.quad && (
            <button onClick={() => void onRedetect()} disabled={busy === `redetect-${wall.seq}`}
              className="text-xs text-slate underline disabled:opacity-50">
              {busy === `redetect-${wall.seq}` ? "Looking…" : "Find the wall surface again"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/* ────────────────────────── As it is / as it could be ─────────────────── */

function StudyPair({
  wall, study, areaId, canBuild, busy, onZoom, onApprove, onDelete, onConfigure,
}: {
  wall: StudyWall;
  study: Study;
  areaId: string;
  canBuild: boolean;
  busy: string | null;
  onZoom: (i: LightboxImage) => void;
  onApprove: (s: Study) => Promise<void>;
  onDelete: (s: Study) => Promise<void>;
  onConfigure: (s: Study, configuration: ProposalConfiguration) => Promise<void>;
}) {
  // Exported once per study, and only when there is nothing stored yet. The
  // upload exists solely so the PDF can embed what was drawn here; re-uploading
  // an identical picture on every visit would be traffic for nothing.
  const [configuration, setConfiguration] = useState(study.configuration);
  const [unit, setUnit] = useState<"in" | "mm">("in");
  const [editing, setEditing] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const dirty = JSON.stringify(configuration) !== JSON.stringify(study.configuration);
  const valid = proposalConfigurationSchema.safeParse(configuration).success;
  const factor = unit === "in" ? 25.4 : 1;
  const placement = configuration.placement;
  const exported = useRef(false);

  const exportCanvas = useCallback(async (canvas: HTMLCanvasElement) => {
    if (exported.current || study.renderUrl || study.roomPhotoUrl) return;
    exported.current = true;
    try {
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/jpeg", 0.86));
      if (!blob) return;

      const signRes = await fetch("/api/corporate/studies/render", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sign", areaId, studyId: study.id, revision: study.revision, bytes: blob.size }),
      });
      const sign = await signRes.json();
      if (!signRes.ok || !sign.ok) return;

      const put = await fetch(sign.signedUrl as string, {
        method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob,
      });
      if (!put.ok) return;

      await fetch("/api/corporate/studies/render", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "commit", areaId, studyId: study.id, revision: study.revision }),
      });
    } catch {
      // Silent by design. The export is for the PDF, and the mockup on screen
      // is correct whether or not it uploaded — telling someone their picture
      // failed to save when they can see it would be a lie about what broke.
    }
  }, [areaId, study.id, study.renderUrl, study.revision, study.roomPhotoUrl]);

  const canWarp = Boolean(wall.photoUrl && study.quad);
  const approved = study.status === "approved" && !dirty;

  return (
    <div className={`rounded-[16px] border p-3 ${approved ? "border-charcoal" : "border-edge"}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <figure className="min-w-0">
          <figcaption className="mb-1.5 text-[0.7rem] uppercase tracking-wide text-mist">
            As it is
          </figcaption>
          <button type="button"
            onClick={() => wall.photoUrl && onZoom({ src: wall.photoUrl, alt: `${wall.name} today`, caption: `${wall.name} — as it is` })}
            className="block w-full overflow-hidden rounded-[12px] border border-edge">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived
                signed storage URL; the optimiser cannot fetch it. */}
            <img src={wall.photoUrl ?? ""} alt={`${wall.name} today`}
              className="aspect-[3/2] w-full object-cover" />
          </button>
        </figure>

        <figure className="min-w-0">
          <figcaption className="mb-1.5 flex items-center justify-between gap-2 text-[0.7rem] uppercase tracking-wide">
            <span className={approved ? "font-semibold text-charcoal" : "text-mist"}>
              {approved ? "Approved" : canWarp ? "With this design" : "The design"}
            </span>
          </figcaption>

          {study.roomPhotoUrl && study.renderUrl && !dirty ? <img src={study.renderUrl} alt="Saved design in your room" className="h-auto w-full rounded-xl" onLoad={() => setPreviewReady(true)} /> : <ProposalArtwork
            artUrl={study.artUrl} photoUrl={study.roomPhotoUrl ? null : wall.photoUrl} quad={study.roomPhotoUrl ? null : study.quad}
            configuration={configuration} onStatus={setPreviewReady} onReady={dirty ? undefined : exportCanvas}
          />}
        </figure>
      </div>

      {!canWarp && !study.roomPhotoUrl && (
        // Said plainly rather than silently showing a flat swatch — the reader
        // needs to know this is not a picture of their wall.
        <p className="mt-2 text-xs text-slate">
          We couldn&apos;t pick out the wall surface in that photo, so the design is
          shown on its own rather than on the wall. A straight-on shot usually fixes it.
        </p>
      )}

      {study.roomPhotoUrl && (!study.renderUrl || dirty) && <p className="mt-2 text-sm">The composition changed. Open the room editor to save an updated room preview.</p>}
      {canBuild && <ProposalRoomEditor areaId={areaId} studyId={study.id} revision={study.revision} artUrl={study.artUrl} photoUrl={study.roomPhotoUrl ?? wall.photoUrl} corners={study.quad} mids={study.roomMids} configuration={configuration} disabled={busy !== null || !valid} />}
      <p className="mt-3 text-sm">Proposed size: {showFeet(configuration.widthMm)} × {showFeet(configuration.heightMm)}</p>
      {canBuild && <div className="mt-3 rounded-xl border border-edge p-3">
        <button type="button" className="min-h-10 font-medium underline" onClick={() => setEditing(!editing)} aria-expanded={editing}>
          {editing ? "Hide editing controls" : "Edit size & design"}
        </button>
        {editing && <div className="mt-3 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">Units<select aria-label="Measurement units" value={unit} onChange={e => setUnit(e.target.value as "in" | "mm")} className="ml-2 min-h-10 rounded-lg border border-edge px-2"><option value="in">inches</option><option value="mm">mm</option></select></label>
            {(["widthMm", "heightMm"] as const).map(key => <label key={key} className="text-sm">
              {key === "widthMm" ? "Width" : "Height"} ({unit})
              <input type="number" inputMode="decimal" min={100 / factor} step={unit === "in" ? 0.1 : 1}
                aria-label={`${key === "widthMm" ? "Width" : "Height"} in ${unit === "in" ? "inches" : "millimetres"}`}
                value={configuration[key] ? Number((configuration[key] / factor).toFixed(unit === "in" ? 1 : 0)) : ""}
                onChange={e => setConfiguration(c => ({ ...c, [key]: Math.round(Number(e.target.value) * factor) }))}
                className="ml-2 min-h-10 w-28 rounded-lg border border-edge px-2" />
            </label>)}
          </div>
          {valid ? <DesignVisualizer
            imageUrl={study.artUrl} imageAlt="Proposed wallpaper composition"
            wallWidthCm={configuration.widthMm / 10} wallHeightCm={configuration.heightMm / 10}
            zoom={placement.zoom} offsetX={placement.cropX} offsetY={placement.cropY}
            flipH={placement.flipH} flipV={placement.flipV} heading="Adjust your design"
            onImageMeta={() => {}}
            onChange={v => setConfiguration(c => ({ ...c, placement: { zoom: v.zoom, cropX: v.offsetX, cropY: v.offsetY, flipH: v.flipH, flipV: v.flipV } }))}
          /> : <p role="alert" className="text-sm text-red-600">Enter a valid size: at least 100 mm per side, up to 38 m wide and 15 m high.</p>}
          <p className="text-xs text-slate">Drag to position the artwork, then use the scale and flip controls. Saving changes clears the previous design approval. The original site measurements stay on the wall record.</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn min-h-10 px-4 disabled:opacity-50" disabled={!dirty || !valid || busy !== null}
              onClick={() => void onConfigure(study, configuration)}>{busy === `configure-${study.id}` ? "Saving…" : "Save changes"}</button>
            <button type="button" className="min-h-10 px-3 underline" disabled={busy !== null} onClick={() => setConfiguration(study.configuration)}>Discard changes</button>
          </div>
        </div>}
        {dirty && <p role="status" className="mt-2 text-sm">Unsaved changes — save before approving.</p>}
      </div>}
      {study.purchasable && <ProposalCart areaId={areaId} studyId={study.id} revision={study.revision} dirty={dirty} />}
      {canBuild && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={() => void onApprove(study)} disabled={busy !== null || dirty || !valid || !previewReady}
            className={approved
              ? "min-h-10 rounded-[10px] border border-edge px-4 py-1.5 text-xs disabled:opacity-50"
              : "btn min-h-10 px-4 text-[0.78rem] disabled:opacity-50"}>
            {busy === `approve-${study.id}` ? "Saving…" : approved ? "Withdraw approval" : "Approve design"}
          </button>
          <button onClick={() => void onDelete(study)} disabled={busy !== null}
            className="text-xs text-slate underline disabled:opacity-50">
            Remove
          </button>
          {approved && study.approvedBy && (
            <span className="text-xs text-mist">Approved by {study.approvedBy}</span>
          )}
        </div>
      )}
    </div>
  );
}
