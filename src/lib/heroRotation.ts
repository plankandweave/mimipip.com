import type { ShowcaseEntry, ProductCardData } from "@/lib/types";
import { sceneKeyForRoom } from "@/lib/rooms";
import { seededShuffle } from "@/lib/dailyRotation";
import { heroSafe } from "@/lib/image-orientation";

/**
 * THE HERO ROTATION RULE (see AGENTS.md, homepage rules 5 and 6).
 *
 * The hero is the first thing anyone sees, so it carries three promises the
 * rest of the homepage does not:
 *
 *   5. The hero image never repeats. Not "rarely" — the rotation is a CYCLE
 *      over every eligible DESIGN, not a daily reshuffle. Each design leads
 *      the hero exactly once before any design leads a second time, so an
 *      image cannot return until every eligible design has had its turn (450-odd
 *      today — well over a year, and it grows every time a landscape design is
 *      published). That is the strongest promise arithmetic allows: a finite
 *      catalogue on an endless calendar must come round eventually, and this
 *      makes "eventually" as late as it can possibly be.
 *
 *      Cycling over DESIGNS rather than collections is the point. The earlier
 *      per-collection rotation repeated within a fortnight, because one design
 *      sits in many collections — Bedroom and Botanical hand back the same
 *      artwork. Deduping candidates by design handle is what fixes that.
 *
 *   6. No two consecutive days share a room setting. Yesterday's bedroom is
 *      never followed by another bedroom. `spreadByRoom` builds each cycle so
 *      neighbours differ by construction; `page.tsx` then checks the real
 *      chosen image against yesterday's and skips to the next candidate if
 *      they still land in the same room (which is what covers the seam
 *      between one cycle and the next, where two shuffles meet).
 *
 *   7. The hero is landscape artwork only. A composed vertical piece is never
 *      cropped into the hero band — `buildHeroCandidates` refuses it, so it
 *      cannot reach the rotation at all rather than being caught by the eye
 *      afterwards. `src/lib/image-orientation.ts` owns the arithmetic.
 *
 * All of this stays a pure function of the logical day index — no cron, no
 * stored "already shown" table, nothing that can drift or fail silently.
 */

/** The room scene baked into an image URL (`/scene-bedroom-…` → `bedroom`). A
 *  flat pattern or plain mockup carries no scene and returns null. */
export function sceneOfImage(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /\/scene-([a-z0-9]+)/i.exec(url);
  return m ? m[1].toLowerCase() : null;
}

/** The room setting a hero READS as: the scene in its image, or — for a room
 *  collection whose design has no scene render yet — the room it fronts.
 *  `null` means "no room at all" (a flat pattern), which never clashes. */
export function roomSettingOf(image: string | null | undefined, entry?: ShowcaseEntry | null): string | null {
  const scene = sceneOfImage(image);
  if (scene) return scene;
  if (entry?.kind === "room") return sceneKeyForRoom(entry.handle, entry.rule_tag) ?? null;
  return null;
}

/** One design as the hero could show it: the collection that fronts it (which
 *  decides the link and the room render) plus the image that would appear. */
export type HeroCandidate = {
  entry: ShowcaseEntry;
  design: ProductCardData;
  /** The room the image reads as — null for a flat pattern, which never clashes. */
  room: string | null;
};

/**
 * The full candidate field, in a STABLE order (pool order, then list order) —
 * stability matters: the cycle is a permutation of this list, so an order that
 * churned daily would quietly break the no-repeat promise.
 *
 * A design belongs to many collections; it enters the field ONCE, under the
 * first collection that offers it. That single fact is what stops the hero
 * showing the same artwork twice in a fortnight under two different headings.
 */
export function buildHeroCandidates(
  entries: ShowcaseEntry[],
  listFor: (entry: ShowcaseEntry) => ProductCardData[],
): HeroCandidate[] {
  const seen = new Set<string>();
  const out: HeroCandidate[] = [];
  for (const entry of entries) {
    for (const design of listFor(entry)) {
      // Two exclusions, both applied HERE rather than skipped at render time —
      // that is what keeps the rotation reproducible for ANY day, which is how
      // the "not yesterday's room" check knows what yesterday actually showed.
      //
      //  - Signature designs belong to the spotlight (rule 2).
      //  - A vertical artwork cannot lead a horizontal band (rule 7). The hero
      //    frame is ~2:1 on the desktop that sees it widest, and `object-cover`
      //    on a 2:3 mural keeps only its top third — which is how a Ganesha
      //    once fronted the shop as a crown and a pair of ears.
      //    See src/lib/image-orientation.ts.
      if (!design.image || design.isSignature || !heroSafe(design) || seen.has(design.handle)) continue;
      seen.add(design.handle);
      out.push({ entry, design, room: roomSettingOf(design.image, entry) });
    }
  }
  return out;
}

/** Candidates grouped by room. A flat pattern (room `null`) clashes with
 *  nothing, so each one is its own group — they are the natural separators. */
function groupByRoom(cands: HeroCandidate[]): { room: string | null; items: HeroCandidate[] }[] {
  const rooms = new Map<string, HeroCandidate[]>();
  const loners: { room: null; items: HeroCandidate[] }[] = [];
  for (const c of cands) {
    if (c.room === null) loners.push({ room: null, items: [c] });
    else rooms.set(c.room, [...(rooms.get(c.room) ?? []), c]);
  }
  return [...[...rooms.entries()].map(([room, items]) => ({ room: room as string | null, items })), ...loners];
}

/**
 * How many of a room's designs one cycle can carry. Alternation has a hard
 * ceiling: a room can never hold more than one more slot than everything else
 * put together, or two of its days must touch. The catalogue sits well past
 * that line — bedroom renders are most of it — so the honest answer is to take
 * as many bedrooms as a cycle can SEPARATE and let the rest wait for the next
 * cycle, rather than break the no-repeat-room rule or thin the catalogue.
 * (Which bedrooms wait rotates: see `ringSlice`.)
 */
function capForAlternation(groups: { room: string | null; items: HeroCandidate[] }[]): Map<string | null, number> {
  const caps = new Map<string | null, number>();
  const sizes = groups.map((g) => ({ key: g.room, n: g.items.length }));
  for (const g of sizes) caps.set(g.key, g.n);
  // Cap the biggest room first, then re-check the next: capping one shrinks
  // the total everything else has to work with.
  const order = [...sizes].sort((a, b) => b.n - a.n);
  for (const g of order) {
    if (g.key === null) continue; // roomless candidates never clash
    let others = 0;
    for (const [k, v] of caps) if (k !== g.key) others += v;
    caps.set(g.key, Math.min(caps.get(g.key)!, others + 1));
  }
  return caps;
}

/** `take` items from a stable ring, starting where cycle `cycle` left off — so
 *  the designs a cycle has no room for are exactly the ones the NEXT cycle
 *  starts with. Nothing is permanently benched. */
function ringSlice(items: HeroCandidate[], take: number, cycle: number, salt: string): HeroCandidate[] {
  const ring = seededShuffle(items, `hero-room-${salt}`);
  if (take >= ring.length) return ring;
  const start = ((cycle * take) % ring.length + ring.length) % ring.length;
  const out: HeroCandidate[] = [];
  for (let i = 0; i < take; i++) out.push(ring[(start + i) % ring.length]);
  return out;
}

/**
 * One cycle's running order: every candidate it carries, arranged so no two
 * neighbours share a room, and led by a flat pattern where one exists (a
 * roomless day is what makes the JOIN between two cycles safe as well).
 */
function cycleOrder(cands: HeroCandidate[], cycle: number): HeroCandidate[] {
  const groups = groupByRoom(cands);
  const caps = capForAlternation(groups);
  // Merge the roomless loners back into one pool — they were only split apart
  // so the cap arithmetic would count them as separators.
  const pools = new Map<string | null, HeroCandidate[]>();
  for (const g of groups) {
    const cap = g.room === null ? g.items.length : caps.get(g.room)!;
    const picked = g.room === null ? g.items : ringSlice(g.items, cap, cycle, g.room);
    pools.set(g.room, [...(pools.get(g.room) ?? []), ...picked]);
  }
  // NOT reshuffled per cycle. Each room keeps ONE stable ring order, so a
  // design lands in the same slot of every cycle it appears in — which is what
  // makes the gap between two showings a whole cycle even at the seam where
  // one cycle meets the next. An independent shuffle per cycle looked more
  // varied and quietly allowed the same image two days running across that
  // seam. Variety comes from WHICH designs a cycle carries (ringSlice), not
  // from rearranging them.

  // Greedy interleave: always draw from the largest room that isn't the one we
  // just used. Largest-first is what keeps the big room from piling up at the
  // end with nothing left to separate it.
  const out: HeroCandidate[] = [];
  let prev: string | null | undefined = undefined;
  for (;;) {
    let bestKey: string | null | undefined = undefined;
    let bestN = 0;
    for (const [room, items] of pools) {
      if (!items.length || (room !== null && room === prev)) continue;
      if (items.length > bestN) { bestN = items.length; bestKey = room; }
    }
    if (bestKey === undefined) break;
    out.push(pools.get(bestKey)!.shift()!);
    prev = bestKey;
  }
  // Lead on a flat pattern so the first day of a cycle cannot repeat the last
  // day of the one before it (two independent cycles, nothing else in common).
  const flat = out.findIndex((c) => c.room === null);
  if (flat > 0) out.unshift(...out.splice(flat, 1));
  return out;
}

/** How long one full pass takes — a cycle carries every roomless design and as
 *  many of each room's as it can keep apart, so it is shorter than the
 *  catalogue whenever one room dominates it. */
export function heroCycleLength(cands: HeroCandidate[]): number {
  const groups = groupByRoom(cands);
  const caps = capForAlternation(groups);
  return groups.reduce((n, g) => n + (g.room === null ? g.items.length : caps.get(g.room)!), 0);
}

/**
 * The day's hero candidates, best first: today's position in this cycle leads,
 * the rest follow as fallbacks (used only if the leader's collection or design
 * has already been claimed by an earlier row).
 */
export function heroCandidatesForDay(cands: HeroCandidate[], dayIndex: number): HeroCandidate[] {
  if (!cands.length) return [];
  const len = heroCycleLength(cands);
  if (len <= 0) return [];
  const cycle = Math.floor(dayIndex / len);
  const pos = ((dayIndex % len) + len) % len;
  const order = cycleOrder(cands, cycle);
  return [...order.slice(pos), ...order.slice(0, pos)];
}
