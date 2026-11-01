// ─── Prism: the rules of a campus proposal ──────────────────────────────────
//
// Pure. The engine (lib/prism.ts) writes the story and finds the designs;
// these rules decide what may be presented, which revision is next, and that
// no design fronts two walls by accident.

import type { BlueprintReadiness } from "@/lib/pulse";

export const PRISM_VERSION = "1.0";

export type WallConcept = {
  seq: number;
  title: string;
  rationale: string;
  concept: string;
  mood: string;
  scale: "mural" | "band" | "panel";
  /** What the wall would say aloud, one line, in English. Sonar's seed. */
  voiceLine: string;
  searchPhrases: string[];
  commissioned: boolean;
  commissionNote: string | null;
};

export type Candidate = { handle: string; title: string; image: string | null; flat: string | null; why: string };

export type Narrative = {
  direction: string;
  standfirst: string;
  theme: string;
  palette: { name: string; hex: string; purpose: string }[];
  motifs: { name: string; description: string }[];
  journeys: { who: string; route: string[]; body: string }[];
  walls: WallConcept[];
  summary: string;
};

export type ProposalStatus = "draft" | "presented" | "superseded";

/** A proposal may go to the college only when Pulse says every live wall is
 *  ready: a direction shown on a wall nobody has measured is a promise we
 *  cannot keep. Exploring before that is fine; presenting is not. */
export function presentable(readiness: Pick<BlueprintReadiness, "canStart" | "ask">): { ok: boolean; reason: string | null } {
  if (readiness.canStart) return { ok: true, reason: null };
  return { ok: false, reason: readiness.ask ?? "Add at least one wall before presenting." };
}

export const nextRevision = (latest: number | null | undefined) => (latest ?? 0) + 1;

/** Candidates per wall, with no design leading two walls. The engine searches
 *  the catalogue per wall; two walls that asked for "botanical line art" would
 *  otherwise both lead with the same design. The first wall keeps it; later
 *  walls promote their next candidate, and a wall with nothing left keeps its
 *  list so a person can still choose. */
export function dedupeLeads(perWall: { seq: number; candidates: Candidate[] }[]): { seq: number; candidates: Candidate[] }[] {
  const taken = new Set<string>();
  return [...perWall].sort((a, b) => a.seq - b.seq).map((w) => {
    const fresh = w.candidates.filter((c) => !taken.has(c.handle));
    const ordered = fresh.length ? [...fresh, ...w.candidates.filter((c) => taken.has(c.handle))] : w.candidates;
    if (ordered[0]) taken.add(ordered[0].handle);
    return { seq: w.seq, candidates: ordered };
  });
}

/** One line a list reads a proposal by. */
export function proposalHeadline(n: Narrative, revision: number): string {
  const commissioned = n.walls.filter((w) => w.commissioned).length;
  const parts = [`Rev. ${revision} · ${n.direction}`, `${n.walls.length} ${n.walls.length === 1 ? "wall" : "walls"}`];
  if (commissioned) parts.push(`${commissioned} commissioned`);
  return parts.join(" · ");
}

/** The walls a revision must cover: every live wall of the Blueprint, by seq.
 *  A model that returned extra or missing walls is corrected here, never
 *  trusted: the taps and the board decide how many walls there are. */
export function alignWalls(returned: WallConcept[], live: { seq: number; name: string }[]): WallConcept[] {
  const bySeq = new Map(returned.map((w) => [w.seq, w]));
  return live.map((l) => bySeq.get(l.seq) ?? {
    seq: l.seq, title: l.name, rationale: "", concept: "Not yet written for this wall.", mood: "",
    scale: "mural" as const, voiceLine: "", searchPhrases: [], commissioned: false, commissionNote: null,
  });
}
