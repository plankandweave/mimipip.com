// ─── Commercial portfolio: buildings, floors, and the walls inside them ─────
//
// Shared types for a portfolio_mode account (migration 0156). No server-only
// machinery here, so the dashboard's client components can import it too.
//
// The shape, and why it is this shape:
//
//   account → BUILDING (corporate_stores) → AREA (corporate_site_areas)
//           → SURVEY (corporate_site_batches, one per area)
//           → WALLS (corporate_site_batch_walls, seq 1..n within the survey)
//
// A building reuses corporate_stores because that table already models exactly
// what a building is — a physical place with an address, a contact and a
// standing brief — and everything downstream (dispatch, the state → GSTIN
// lookup) reads from it. The genuinely new level is the area, because a tower
// is surveyed a floor at a time and 'floors: 4' cannot be surveyed.

/** A building, as the dashboard needs it.
 *
 *  The row is corporate_stores — this is deliberately a re-declaration rather
 *  than a re-export of StoreRow, because lib/measure-link.ts is `server-only`
 *  and the dashboard that renders these is a client component. */
export type BuildingRow = {
  id: string;
  code: string;
  name: string;
  state: string;
  city: string | null;
  address_line: string | null;
  pincode: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  floors: number | null;
  notes: string | null;
  active: boolean;
};

/** A floor/location inside a building. */
export type AreaRow = {
  id: string;
  account_id: string;
  store_id: string;
  /** Stable handle, frozen at creation: 'l12-lift-lobby'. */
  code: string;
  /** Free text, not a number — real buildings have 'Ground', 'Mezzanine',
   *  'Basement 2' and '12A', and what is written on the lift button beats our
   *  idea of storey order. Null for a single-level building. */
  floor: string | null;
  name: string;
  /** Display order only. Never confused with wall.seq, which is the
   *  allocator's and lives per survey. */
  sort: number;
  /** What this space is for, in the client's words. Copied onto a new survey
   *  as its starting brief. */
  brief: string | null;
  notes: string | null;
  active: boolean;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
};

/** How an area is written when it has to read as one line. */
export function areaLabel(area: Pick<AreaRow, "floor" | "name">): string {
  return area.floor ? `${area.floor} · ${area.name}` : area.name;
}

// ─── What to do next ────────────────────────────────────────────────────────
//
// Nobody is going to be trained on this and nobody should have to explore it.
// Someone opens the link, and the app tells them the ONE thing to do now, in
// the words they would use themselves, with the button that does it.
//
// So the dashboard always answers "what now?" out loud rather than presenting a
// set of tabs and hoping. The ladder below is that answer, and it is a pure
// function of what the account actually contains — which is what makes it
// testable, and what stops it drifting into a static "getting started" panel
// that keeps congratulating you on things you did last month.
//
// One rule worth keeping: when the next move is OURS, it says so and offers no
// button. An instruction somebody cannot act on is worse than silence, because
// they will hunt for the control it implies.

export type Progress = {
  buildings: number;
  areas: number;
  walls: number;
  /** Walls that can actually be designed on — a study is drawn on a photo. */
  wallsWithPhoto: number;
  designs: number;
  studies: number;
  approvedStudies: number;
  /** Named so the prompt can say "Add a space inside One BKC" rather than
   *  "Add a space", which is the difference between an instruction and a label. */
  firstBuildingName: string | null;
  firstAreaLabel: string | null;
  firstAreaId: string | null;
};

export type NextStep = {
  id: string;
  /** Imperative, and specific to this account's own names. */
  title: string;
  body: string;
  /** Null when there is nothing for this person to press. */
  cta: string | null;
  tab: "buildings" | "library" | "proposals" | null;
  /** Set when the button should open one particular space, not just a tab. */
  openAreaId?: string | null;
  /** True when we are the ones holding things up. No button, and it says so. */
  waitingOnUs?: boolean;
};

export function nextStep(p: Progress): NextStep {
  const building = p.firstBuildingName ?? "your building";
  const space = p.firstAreaLabel ?? "your space";

  if (p.buildings === 0) {
    return {
      id: "add-building",
      title: "Start with the building",
      body: "The tower or address the walls are in. Floors and spaces go inside it.",
      cta: "Add a building", tab: "buildings",
    };
  }
  if (p.areas === 0) {
    return {
      id: "add-area",
      title: `Add a space inside ${building}`,
      body: "A lift lobby, an arrival hall, a corridor. Each one is captured on its own.",
      cta: "Add a space", tab: "buildings",
    };
  }
  if (p.walls === 0) {
    return {
      id: "walk",
      title: `Walk ${space} with your phone`,
      body: "Record once, talking as you go, and tap each wall as you reach it. That is the whole site visit.",
      cta: "Open this space", tab: "buildings", openAreaId: p.firstAreaId,
    };
  }
  if (p.wallsWithPhoto === 0) {
    return {
      id: "photograph",
      title: "Photograph your walls",
      body: "A design is shown standing on the wall's own photo, so each wall needs one straight-on shot.",
      cta: "Open this space", tab: "buildings", openAreaId: p.firstAreaId,
    };
  }
  if (p.designs === 0) {
    return {
      id: "await-library",
      title: "We are putting your designs together",
      body: "Nothing to do here — we will tell you the moment your library is ready to try on these walls.",
      cta: null, tab: null, waitingOnUs: true,
    };
  }
  if (p.studies === 0) {
    return {
      id: "study",
      title: "See a design on your wall",
      body: "Pick one from your library and it is drawn onto the photograph you took.",
      cta: "Open Proposals", tab: "proposals",
    };
  }
  if (p.approvedStudies === 0) {
    return {
      id: "approve",
      title: "Say which ones are right",
      body: "Approving one tells us to take it forward. You can approve more than one per wall.",
      cta: "Open Proposals", tab: "proposals",
    };
  }
  return {
    id: "share",
    title: "Take it to whoever decides",
    body: "Download the space as a PDF — the wall as it is beside the wall with the design on it. It opens for anyone, with no sign-in.",
    cta: "Open Proposals", tab: "proposals",
  };
}

/** Group areas under the building they belong to, preserving the order each
 *  list arrived in — the API sorts, and the tree must not re-sort behind it. */
export function groupAreasByStore<T extends { id: string }>(
  stores: T[],
  areas: AreaRow[],
): { store: T; areas: AreaRow[] }[] {
  const byStore = new Map<string, AreaRow[]>();
  for (const a of areas) {
    const list = byStore.get(a.store_id);
    if (list) list.push(a);
    else byStore.set(a.store_id, [a]);
  }
  return stores.map((store) => ({ store, areas: byStore.get(store.id) ?? [] }));
}
