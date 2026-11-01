// ─── Pulse: is this campus ready to be designed? ────────────────────────────
//
// Pure rules. A wall becomes a candidate the moment somebody taps it on a
// Trace walk or adds it by hand; it is READY when four facts are on the row:
//
//   photographed   a still from the walk, or a photograph from the Vault
//   measured       a size that was not merely spoken — read off a plan or
//                  typed from a tape. A spoken size is a hint, never a fact:
//                  a wall designed to a guessed size is printed wrong.
//   drawn          pinned to a plan in the Vault, so the design knows where
//                  the wall sits and what is around it
//   briefed        what the wall should do, in the college's words
//
// Prism may start on a Blueprint only when every candidate wall is ready and
// there is at least one. Nothing here is stored: the board derives it from
// the facts every time, so it can never disagree with the data.

export type WallFacts = {
  id: string;
  name: string;
  location?: string | null;
  photo: boolean;
  widthMm: number | null;
  heightMm: number | null;
  sizeSource: "spoken" | "plan" | "measured" | null;
  plan: boolean;
  brief: string | null;
  dropped: boolean;
};

export type WallReadiness = {
  photographed: boolean;
  measured: boolean;
  drawn: boolean;
  briefed: boolean;
  ready: boolean;
  /** What is still missing, in the order the board shows the ticks. */
  missing: ("photo" | "size" | "plan" | "brief")[];
};

export const MIN_BRIEF_CHARS = 8;

export function wallReadiness(w: WallFacts): WallReadiness {
  const photographed = w.photo;
  const measured = w.widthMm != null && w.heightMm != null && w.widthMm > 0 && w.heightMm > 0
    && (w.sizeSource === "plan" || w.sizeSource === "measured");
  const drawn = w.plan;
  const briefed = (w.brief ?? "").trim().length >= MIN_BRIEF_CHARS;
  const missing: WallReadiness["missing"] = [];
  if (!photographed) missing.push("photo");
  if (!measured) missing.push("size");
  if (!drawn) missing.push("plan");
  if (!briefed) missing.push("brief");
  return { photographed, measured, drawn, briefed, ready: missing.length === 0, missing };
}

export type BlueprintReadiness = {
  total: number;
  ready: number;
  dropped: number;
  canStart: boolean;
  /** Counts of what is missing across the live walls. */
  gaps: { photo: number; size: number; plan: number; brief: number };
  headline: string;
  /** The one sentence to put to the college. Null when nothing is wanted. */
  ask: string | null;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function blueprintReadiness(walls: WallFacts[]): BlueprintReadiness {
  const live = walls.filter((w) => !w.dropped);
  const dropped = walls.length - live.length;
  const gaps = { photo: 0, size: 0, plan: 0, brief: 0 };
  let ready = 0;
  for (const w of live) {
    const r = wallReadiness(w);
    if (r.ready) ready++;
    for (const m of r.missing) gaps[m]++;
  }
  const total = live.length;
  const canStart = total > 0 && ready === total;

  const headline = total === 0
    ? "No walls yet. They arrive from the campus walk, or can be added by hand."
    : canStart
      ? `Every wall is ready: ${plural(total, "wall")} photographed, measured, drawn and briefed. Prism can start.`
      : `${ready} of ${plural(total, "wall")} ready.`;

  const wants: string[] = [];
  if (gaps.size) wants.push(`sizes for ${plural(gaps.size, "wall")}`);
  if (gaps.plan) wants.push(`the plan each of ${plural(gaps.plan, "wall")} sits on`);
  if (gaps.photo) wants.push(`a photograph of ${plural(gaps.photo, "wall")}`);
  if (gaps.brief) wants.push(`a line on what ${plural(gaps.brief, "wall")} should do`);
  const ask = wants.length ? `Still needed: ${wants.join(", ")}.` : null;

  return { total, ready, dropped, canStart, gaps, headline, ask };
}

export type BlueprintStatus = "collecting" | "ready" | "designing" | "presented" | "closed";

/** Where the Blueprint's status should sit given its readiness. It moves
 *  forward to 'ready' on its own and back to 'collecting' if a wall is added
 *  or un-readied, but never touches a Blueprint that has gone past ready:
 *  once Prism is designing, a late wall is a change request, not a reset. */
export function pulseStatus(current: BlueprintStatus, readiness: Pick<BlueprintReadiness, "canStart">): BlueprintStatus {
  if (current === "designing" || current === "presented" || current === "closed") return current;
  return readiness.canStart ? "ready" : "collecting";
}

/** A spoken size is kept on the row as a hint but never counts; a person
 *  confirms it (by plan or by tape) and it becomes measured. */
export function confirmSize(w: WallFacts, source: "plan" | "measured"): WallFacts {
  if (w.widthMm == null || w.heightMm == null) return w;
  return { ...w, sizeSource: source };
}
