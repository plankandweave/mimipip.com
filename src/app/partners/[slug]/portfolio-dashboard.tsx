"use client";

import Image from "@/components/SiteImage";
import { useCallback, useState } from "react";
import {
  areaLabel, groupAreasByStore, nextStep,
  type AreaRow, type BuildingRow, type NextStep, type Progress,
} from "@/lib/portfolio";
import AreaWalls from "./area-walls";
import NextStepBanner from "./next-step";
import LibraryPanel from "./library-panel";
import StudiesPanel from "./studies-panel";
import ProposalsPanel from "./proposals-panel";
import TeamPanel from "./team-panel";
import VaultPanel from "./vault-panel";

// ─── The portfolio dashboard ────────────────────────────────────────────────
//
// ONE page. The reseller portal grew a page per thing — stores, library, team,
// orders, site batches, settings — each with its own URL, and using it means
// knowing where things live. This is the same account seen once: bookmarks
// along the top, and switching between them swaps the panel in place. Nothing
// here navigates.
//
// The tab lives in component state rather than the URL on purpose. A portfolio
// is walked on a phone, often on hotel wifi in a lift lobby, and a tab that
// re-renders is instant where a tab that re-routes is a page load.

type Tab = "buildings" | "vault" | "library" | "studies" | "proposals" | "team";

const TABS: { id: Tab; label: string }[] = [
  { id: "buildings", label: "Buildings" },
  { id: "vault", label: "Vault" },
  { id: "library", label: "Library" },
  { id: "proposals", label: "Proposals" },
  { id: "team", label: "Team" },
];

export default function PortfolioDashboard({
  accountName, logoPath, you, isAdmin, canBuild, canUpload, initialBuildings, initialAreas, progress,
}: {
  accountName: string;
  logoPath: string | null;
  you: string;
  isAdmin: boolean;
  /** May this person size and draft a wall? Deliberately not the ordering
   *  right — capturing a wall spends nothing, and gating it on money would
   *  lock out exactly the facilities staff the feature is for. */
  canBuild: boolean;
  /** May this person put artwork INTO the library? For a portfolio account
   *  that is normally us, signing in as staff — which is why the library sat
   *  empty with no way to fill it from here. */
  canUpload: boolean;
  /** The tree, already read by the page. There is deliberately no fetch on
   *  mount: the dashboard opens painted, and re-reads only after it has itself
   *  changed something. */
  initialBuildings: BuildingRow[];
  initialAreas: AreaRow[];
  /** Counts behind the "what now?" prompt, read by the page with the tree. */
  progress: Progress;
}) {
  const [tab, setTab] = useState<Tab>(progress.studies > 0 ? "proposals" : "buildings");
  const [buildings, setBuildings] = useState<BuildingRow[]>(initialBuildings);
  const [areas, setAreas] = useState<AreaRow[]>(initialAreas);
  const [err, setErr] = useState<string | null>(null);
  // Which space is open, held HERE rather than inside the buildings panel, so
  // the prompt's button can open one directly. Being told where to go and then
  // having to find it is exactly the discovery this is meant to remove.
  const [openArea, setOpenArea] = useState<{ area: AreaRow; building: string } | null>(null);

  /** Re-read after a write. Called by the forms, never on mount. */
  const load = useCallback(async () => {
    setErr(null);
    try {
      // Both lists in parallel: the tree needs them together.
      const [sRes, aRes] = await Promise.all([
        fetch("/api/corporate/stores"),
        fetch("/api/corporate/areas"),
      ]);
      const [s, a] = await Promise.all([sRes.json(), aRes.json()]);
      if (!sRes.ok) throw new Error(s.error ?? "Could not load your buildings.");
      if (!aRes.ok) throw new Error(a.error ?? "Could not load your floors.");
      setBuildings((s.stores ?? []) as BuildingRow[]);
      setAreas((a.areas ?? []) as AreaRow[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load your portfolio.");
    }
  }, []);

  const tree = groupAreasByStore(buildings, areas);
  const areaCount = areas.length;
  const step = nextStep(progress);

  /** Follow the prompt: switch tab, and open the space it named if it named one. */
  function go(s: NextStep) {
    if (s.openAreaId) {
      const found = tree.find(({ areas }) => areas.some((a) => a.id === s.openAreaId));
      const area = found?.areas.find((a) => a.id === s.openAreaId);
      if (found && area) setOpenArea({ area, building: found.store.name });
    } else {
      setOpenArea(null);
    }
    if (s.tab) setTab(s.tab);
  }

  return (
    <div className="container-x py-8">
      {/* ── Header + bookmarks ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          {logoPath && (
            <Image src={logoPath} alt={accountName} width={40} height={40}
              className="rounded-[10px]" priority />
          )}
          <div>
            <h1 className="font-display text-2xl font-bold leading-tight">{accountName}</h1>
            <p className="mt-0.5 text-xs text-slate">
              {buildings.length} {buildings.length === 1 ? "building" : "buildings"}
              {" · "}
              {areaCount} {areaCount === 1 ? "space" : "spaces"}
            </p>
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto rounded-[14px] bg-wash p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`whitespace-nowrap rounded-[10px] px-3 py-1.5 text-xs ${
                tab === t.id ? "bg-surface font-semibold" : "text-slate"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}

      {/* Only while a space is not open: inside one, the panel does its own
          prompting and a second instruction competes with it. */}
      {!openArea && <NextStepBanner step={step} onGo={go} />}

      {tab === "buildings" && (
        <BuildingsPanel
          tree={tree} isAdmin={isAdmin} canBuild={canBuild} onChanged={load}
          openArea={openArea} onOpenArea={setOpenArea}
        />
      )}
      {tab === "vault" && <VaultPanel />}
      {tab === "library" && <LibraryPanel canUpload={canUpload} />}
      {(tab === "proposals" || tab === "studies") && <>
        <StudiesPanel tree={tree} canBuild={canBuild} />
        <ProposalsPanel />
      </>}
      {tab === "team" && <TeamPanel />}

      <p className="mt-10 text-xs text-mist">Signed in as {you}</p>
    </div>
  );
}

/* ────────────────────────── Buildings ─────────────────────────────────── */

function BuildingsPanel({
  tree, isAdmin, canBuild, onChanged, openArea, onOpenArea,
}: {
  tree: { store: BuildingRow; areas: AreaRow[] }[];
  isAdmin: boolean;
  canBuild: boolean;
  onChanged: () => Promise<void>;
  /** Opening a space replaces this panel in place — state, not a route, so that
   *  on a phone "back" leaves the portal rather than undoing one click. Owned by
   *  the dashboard so the next-step prompt can open a space directly. */
  openArea: { area: AreaRow; building: string } | null;
  onOpenArea: (o: { area: AreaRow; building: string } | null) => void;
}) {
  const [adding, setAdding] = useState(false);

  if (openArea) {
    return (
      <AreaWalls
        area={openArea.area}
        buildingName={openArea.building}
        canEdit={canBuild}
        onBack={() => onOpenArea(null)}
      />
    );
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-[52ch] text-sm text-slate">
          An asset is a building; inside it, each floor and space is captured on
          its own. Walls are added to a space — photographed, measured and
          described by whoever is standing in front of them.
        </p>
        {isAdmin && !adding && (
          <button onClick={() => setAdding(true)} className="btn h-10 px-4 text-[0.8rem]">
            Add a building
          </button>
        )}
      </div>

      {adding && (
        <BuildingForm
          onDone={async () => { setAdding(false); await onChanged(); }}
          onCancel={() => setAdding(false)}
        />
      )}

      {tree.length === 0 && !adding && (
        <div className="mt-6 rounded-[18px] border border-dashed border-edge bg-wash px-6 py-10 text-center">
          <p className="font-display text-base font-bold">No buildings yet</p>
          <p className="mx-auto mt-1.5 max-w-[42ch] text-sm text-slate">
            Start with one asset — its name and the state it stands in. Floors
            and spaces go inside it.
          </p>
          {/* The button lives HERE as well as in the header: an empty state that
              describes what to do and then makes you find the control is the
              exact discovery step this app is not allowed to have. */}
          {isAdmin && (
            <button onClick={() => setAdding(true)} className="btn mt-4 h-10 px-5 text-[0.8rem]">
              Add your first building
            </button>
          )}
        </div>
      )}

      <div className="mt-6 space-y-4">
        {tree.map(({ store, areas }) => (
          <BuildingCard key={store.id} building={store} areas={areas}
            isAdmin={isAdmin} onChanged={onChanged}
            onOpenArea={(area) => onOpenArea({ area, building: store.name })} />
        ))}
      </div>
    </div>
  );
}

function BuildingCard({
  building, areas, isAdmin, onChanged, onOpenArea,
}: {
  building: BuildingRow;
  areas: AreaRow[];
  isAdmin: boolean;
  onChanged: () => Promise<void>;
  onOpenArea: (area: AreaRow) => void;
}) {
  const [open, setOpen] = useState(true);
  const [addingArea, setAddingArea] = useState(false);

  const where = [building.city, building.state].filter(Boolean).join(", ");

  return (
    <section className="rounded-[18px] border border-edge bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <button onClick={() => setOpen((o) => !o)} className="min-w-0 text-left">
          <p className="font-display text-base font-bold">{building.name}</p>
          <p className="mt-0.5 text-xs text-slate">
            {where}
            {where && " · "}
            {areas.length} {areas.length === 1 ? "space" : "spaces"}
          </p>
        </button>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button onClick={() => { setOpen(true); setAddingArea(true); }}
              className="rounded-[10px] border border-edge px-3 py-1.5 text-xs">
              Add a space
            </button>
          )}
          <button onClick={() => setOpen((o) => !o)}
            className="rounded-[10px] px-2 py-1.5 text-xs text-slate"
            aria-label={open ? "Collapse" : "Expand"}>
            {open ? "−" : "+"}
          </button>
        </div>
      </header>

      {open && (
        <div className="border-t border-edge px-5 py-4">
          {addingArea && (
            <AreaForm
              storeId={building.id}
              onDone={async () => { setAddingArea(false); await onChanged(); }}
              onCancel={() => setAddingArea(false)}
            />
          )}

          {areas.length === 0 && !addingArea && (
            <div className="text-sm text-slate">
              <p>No spaces yet — a lift lobby, an arrival hall, a corridor.</p>
              {isAdmin && (
                <button onClick={() => setAddingArea(true)}
                  className="btn mt-3 h-9 px-4 text-[0.78rem]">
                  Add the first space
                </button>
              )}
            </div>
          )}

          <ul className="space-y-1.5">
            {areas.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => onOpenArea(a)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 rounded-[12px] bg-wash px-4 py-3 text-left hover:bg-edge/40">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{areaLabel(a)}</p>
                    {a.brief && <p className="mt-0.5 line-clamp-1 text-xs text-slate">{a.brief}</p>}
                  </div>
                  <span className="text-xs text-slate">Walls →</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ────────────────────────── Forms ─────────────────────────────────────── */

const field =
  "w-full rounded-[12px] border border-edge bg-wash px-4 py-2.5 text-sm outline-none focus:border-charcoal";

function BuildingForm({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [state, setState] = useState("Maharashtra");
  const [city, setCity] = useState("Mumbai");
  const [addressLine, setAddressLine] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const res = await fetch("/api/corporate/stores", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, state, city, addressLine }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not add that building.");
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add that building.");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="mt-5 rounded-[18px] border border-edge bg-surface p-5">
      <p className="font-display text-sm font-bold">New building</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-slate">Name</span>
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder="One BKC" className={`mt-1 ${field}`} />
        </label>
        <label className="block">
          <span className="text-xs text-slate">State</span>
          {/* The state resolves this account's GSTIN at approval time — it is a
              tax fact, not an address line, which is why it is asked for even
              when the street address is not known yet. */}
          <input required value={state} onChange={(e) => setState(e.target.value)}
            placeholder="Maharashtra" className={`mt-1 ${field}`} />
        </label>
        <label className="block">
          <span className="text-xs text-slate">City</span>
          <input value={city} onChange={(e) => setCity(e.target.value)}
            placeholder="Mumbai" className={`mt-1 ${field}`} />
        </label>
        <label className="block">
          <span className="text-xs text-slate">Address <span className="text-mist">(optional)</span></span>
          <input value={addressLine} onChange={(e) => setAddressLine(e.target.value)}
            placeholder="Bandra Kurla Complex" className={`mt-1 ${field}`} />
        </label>
      </div>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={busy} className="btn h-10 px-5 text-[0.8rem] disabled:opacity-50">
          {busy ? "Saving…" : "Add building"}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-[10px] border border-edge px-4 py-2 text-xs">Cancel</button>
      </div>
    </form>
  );
}

function AreaForm({
  storeId, onDone, onCancel,
}: { storeId: string; onDone: () => Promise<void>; onCancel: () => void }) {
  const [floor, setFloor] = useState("");
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const res = await fetch("/api/corporate/areas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, floor, name, brief }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not add that space.");
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add that space.");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="mb-4 rounded-[14px] border border-edge bg-wash p-4">
      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <label className="block">
          <span className="text-xs text-slate">Floor</span>
          {/* Free text: buildings have Ground, Mezzanine, Basement 2 and 12A,
              and what is on the lift button beats our idea of storey order. */}
          <input value={floor} onChange={(e) => setFloor(e.target.value)}
            placeholder="Level 12" className={`mt-1 ${field}`} />
        </label>
        <label className="block">
          <span className="text-xs text-slate">Space</span>
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Lift lobby" className={`mt-1 ${field}`} />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="text-xs text-slate">
          What is this space for? <span className="text-mist">(optional)</span>
        </span>
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={2}
          placeholder="Arrival for the tower — should feel calm and confident before anyone reads a word."
          className={`mt-1 ${field}`} />
      </label>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={busy} className="btn h-9 px-4 text-[0.78rem] disabled:opacity-50">
          {busy ? "Saving…" : "Add space"}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-[10px] border border-edge px-4 py-1.5 text-xs">Cancel</button>
      </div>
    </form>
  );
}
