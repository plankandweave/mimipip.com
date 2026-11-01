// Pure rules for measured store orders (site batches). No database, no AI,
// no `server-only` — everything here is a function of its arguments so the
// rules that decide what the client is shown and what goes to print are
// unit-tested in src/lib/site-batch-rules.test.ts, not merely requested in a
// prompt. site-batch.ts, the import/propose/approve routes and the review
// page all draw through these.

import { arrangementOf, holdsFloorLine, tipsStayInFrame, standsInBand, type CompositionStyle, type DesignGeometry } from "./band-geometry";

/** The two facts a wall carries beyond its measurements. */
export type WallScope = {
  seq: number;
  status: string;
  /** Zyvorah's own suggestion, not in the client's drawing (migration
   *  20261006123000). Undefined on rows older than the column = false. */
  suggested?: boolean | null;
};

export const isSuggested = (w: { suggested?: boolean | null }) => w.suggested === true;

/** The client's own walls — what they measured and asked for. */
export function drawnWalls<T extends { suggested?: boolean | null }>(walls: readonly T[]): T[] {
  return walls.filter((w) => !isSuggested(w));
}

/** The walls Zyvorah added as suggestions, in sequence order. */
export function suggestedWalls<T extends { suggested?: boolean | null }>(walls: readonly T[]): T[] {
  return walls.filter(isSuggested);
}

/**
 * Which walls an approval releases to print.
 *
 * Named seqs release exactly those walls (a suggested wall included, when the
 * approver ticked it on purpose). No seqs means "all remaining" — and all
 * remaining means the CLIENT'S walls: a suggestion is an offer, and an offer
 * does not become an order because a button said "all".
 */
export function wallsToApprove<T extends WallScope>(walls: readonly T[], seqs?: readonly number[] | null): T[] {
  const wanted = seqs?.length ? new Set(seqs.map(Number)) : null;
  return walls.filter((w) =>
    w.status !== "ordered" && (wanted ? wanted.has(w.seq) : !isSuggested(w)));
}

/** The walls that must be ordered before the batch itself counts as ordered.
 *  A suggestion the client never took up does not hold the store open. */
export function wallsStillOpen<T extends WallScope>(walls: readonly T[]): T[] {
  return walls.filter((w) => w.status !== "ordered" && !isSuggested(w));
}

export const sqftOf = (w: { width_mm: number; height_mm: number }) =>
  (w.width_mm / 304.8) * (w.height_mm / 304.8);

/**
 * The allocator's rule 2b — where the city collection goes — as a function of
 * whether this survey begins at the street entrance.
 *
 * Measurement of a WHOLE floor starts at the door and runs clockwise, so wall
 * 1 and the last wall are the two entrance walls and lead with the city's own
 * collection. A survey that covers only interior walls has no entrance wall
 * at all: on 6 October 2026 Vijay Sales sent two interior runs (washing
 * machines, refrigerators) and the unconditional rule would have put city
 * skylines over the appliances.
 */
export function entranceRule(entranceInScope: boolean, cityLabel: string): string {
  if (!entranceInScope) {
    return `2b. THIS SURVEY DOES NOT START AT THE STORE ENTRANCE. The walls below are interior walls photographed away from the door, so NONE of them is an entrance wall: do not lead wall 1 or the last wall with the ${cityLabel} collection or any city artwork. Every wall here carries category/product creatives matched to its department. (Wall numbering is still the clockwise order the walls were measured in.)`;
  }
  return `2b. THE ENTRANCE IS THE CITY. Measurement always starts at the store entrance and runs clockwise, so on the floor that holds the entrance, wall 1 is the first wall on your LEFT as you walk in and the last wall of that floor's loop is the first wall on your RIGHT. BOTH of those entrance walls lead with the city's own collection named above — this OVERRIDES the series preference in rule 2 for those two walls only. Every other wall in the store carries category/product creatives matched to its department, never city artwork. If an entrance wall is longer than the city creatives can cover, lead with the city creative(s) at the entrance end and continue along the rest of that wall with category work, and say in that wall's note where the city run ends. Floors with no street entrance (upper floors) have no city walls.`;
}

/** How a suggested wall is introduced to the allocator: it is ours, it is
 *  optional, and the approver will read the reason beside the creative. */
export function suggestionBrief(reason: string | null | undefined): string {
  const why = (reason ?? "").trim();
  return `ZYVORAH'S SUGGESTION — this wall is NOT in the client's drawing; we are proposing it${why ? ` because ${why.replace(/\.$/, "")}` : ""}. Treat it as a category wall (never an entrance wall), choose a creative that makes the case for covering it, and keep rule 1 (no repetition) across it like any other wall.`;
}

/**
 * The AI intake's wall-to-photo mapping, checked in code. The old rule was
 * "exactly one wall per photograph", which could not describe a drawing with
 * five wallpaper bands on one refrigerator wall and one photograph of that
 * wall. The rule now: every photograph is used at least once (a photo nobody
 * matched is a mismatch), a drawn wall always has a photo, and a suggested
 * wall may have none (it sits where no one pointed a camera).
 */
export function checkIntakeMapping(
  walls: readonly { photoIndex: number | null; suggested: boolean }[],
  photoCount: number,
): string | null {
  if (!walls.length) return "The measurement document resolved to no walls.";
  const used = new Set<number>();
  for (const [i, w] of walls.entries()) {
    if (w.photoIndex == null) {
      if (!w.suggested) return `Wall ${i + 1} is in the drawing but matched no photograph — attach one photograph of every measured wall.`;
      continue;
    }
    if (!Number.isInteger(w.photoIndex) || w.photoIndex < 1 || w.photoIndex > photoCount) {
      return `Wall ${i + 1} points at photograph ${w.photoIndex}, which was not uploaded.`;
    }
    used.add(w.photoIndex);
  }
  const unused = Array.from({ length: photoCount }, (_, i) => i + 1).filter((n) => !used.has(n));
  if (unused.length) {
    return `Photograph${unused.length === 1 ? "" : "s"} ${unused.join(", ")} matched no measured wall — every photograph must show a wall in the drawing.`;
  }
  return null;
}

/**
 * May a design tagged for `designCity` go into a store at this city/state?
 *
 * Untagged designs are city-neutral and go anywhere. A tagged design goes
 * only to its own place, and "its own place" is the store's city OR state:
 * the Vijay Sales library tags Gujarat artwork "Gujarat" while the Narol
 * store's city is "Ahmedabad", and tags Bengaluru artwork "Bangalore" while
 * the Bommasandra store says "Bengaluru". Comparing city to city only, both
 * collections were invisible to the very stores they were drawn for
 * (6 October 2026). Spellings of one city are one city.
 */
const CITY_ALIASES: Record<string, string> = {
  bangalore: "bengaluru", bombay: "mumbai", madras: "chennai", calcutta: "kolkata",
  gurgaon: "gurugram", poona: "pune", baroda: "vadodara",
};
const place = (s: string | null | undefined) => {
  const k = (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return CITY_ALIASES[k] ?? k;
};

/** The store's city from a ship_city like "Bhosari, Pune" — the last segment. */
export function storeCity(shipCity: string | null | undefined): string | null {
  return ((shipCity ?? "").split(",").pop() ?? "").trim() || null;
}

export function cityAllows(
  designCity: string | null | undefined,
  store: { city: string | null | undefined; state?: string | null | undefined },
): boolean {
  const d = place(designCity);
  if (!d) return true;
  const here = [place(store.city), place(store.state)].filter(Boolean);
  if (!here.length) return true; // a store with no place on file sees everything, as before
  return here.includes(d);
}

/**
 * May the pipeline email this composed batch's proposal on its own? Not when
 * the founder has held it (`hold_proposal`, migration 20261013160000): a store
 * composed from bespoke artwork she supplied (Nelamangala, 13 October 2026) is
 * hers to look at first, and the drive cron would otherwise send it to the
 * client ten minutes after the last wall composed. A held batch still composes
 * and is still proposed by hand; only the automatic send stands down.
 */
export function autoProposes(batch: {
  proposed_at: string | null; email_error: string | null; revision: number;
  proposed_revision: number | null; hold_proposal?: boolean | null;
}): boolean {
  if (batch.hold_proposal) return false;
  return batch.proposed_at == null
    || batch.email_error != null
    || batch.revision > (batch.proposed_revision ?? 0);
}

/** A wall's place in the pipeline when a person has decided it by hand. */
type HandSet = { context_json?: { pinned?: boolean; awaitingArt?: boolean } | null };

/**
 * A PINNED wall carries designs the founder chose herself (Nelamangala,
 * 13 October 2026: her own "Namma Bangalore" mural for Entry right side
 * wall 1). A whole-store allocation leaves it alone, so its designs stay
 * off the table for every other wall and the store never shows them twice;
 * naming the wall explicitly (`onlySeqs`) still re-allocates it.
 */
export function allocatable(w: HandSet & { seq: number }, onlySeqs?: readonly number[]): boolean {
  if (onlySeqs?.length) return onlySeqs.includes(w.seq);
  return !w.context_json?.pinned;
}

/**
 * A wall AWAITING ART is pinned to artwork that is still being made for it
 * (a wider version is coming). The composer passes it over, so the rest of
 * the store composes now and this wall composes the moment the flag is
 * cleared, rather than printing a stand-in nobody chose.
 */
export function awaitsArt(w: HandSet): boolean {
  return Boolean(w.context_json?.awaitingArt);
}

/**
 * Will this design survive composition in a chain of this style?
 *
 * The composer drops a design from a band when it has no floor to stand on
 * (`standsInBand`), when it speaks the other visual language from its
 * neighbours (`sameLanguage`), or when meeting the store's floor line would
 * enlarge it past 1.25× (`holdsFloorLine`) — and the designs left over TILE
 * to fill the wall. On 13 October 2026 Nelamangala's 11.2 m front wall came
 * back as one vacuum-cleaner design repeated two and a half times: the
 * allocator had chained a block design with a scene and a low-floor design,
 * and the composer kept only the first. So the allocator now asks the
 * composer's own questions before it commits a design to a wall, and tops up
 * a chain only with designs that pass them. Unmeasured designs pass (they are
 * measured, and judged, when they compose — as before).
 */
export function fitsChain(
  geo: DesignGeometry | null | undefined,
  aspect: number,
  chainStyle: CompositionStyle | null,
  floorLinePct: number | null,
): boolean {
  if (!geo) return true;
  if (!standsInBand(geo)) return false;
  if (chainStyle && geo.style && geo.style !== chainStyle) return false;
  // Appliances stand in one line (Roheena, 14 October 2026): a stacked
  // design — a grid, a TV on a cabinet — is never allocated to a band.
  if (arrangementOf(geo) === "stacked") return false;
  // Nothing is cut off (Roheena, 14 October 2026): a design whose tallest
  // appliance would touch the top edge once placed is never allocated — the
  // stick vacuums of walls 2 and 8 had their heads shaved.
  const d = { w: Math.max(0.01, aspect), h: 1, floorY: geo.floorY, subjects: geo.subjects };
  return holdsFloorLine(d, floorLinePct, 1000) && tipsStayInFrame(d, floorLinePct, 1000);
}

/** The language a chain already speaks: blocks win, as in `sameLanguage`. */
export function chainStyle(styles: ReadonlyArray<CompositionStyle | null | undefined>): CompositionStyle | null {
  if (styles.includes("blocks")) return "blocks";
  if (styles.includes("scene")) return "scene";
  return null;
}

/** A wall handed to the artwork service whose last stage marker is older than
 *  this was lost with its container (a restart, a deploy) and is handed over
 *  again. Longer than the slowest wall: two image completions of 80 s plus
 *  the band itself. */
export const COMPOSING_STALE_MS = 8 * 60 * 1000;

/** Whether a `composing` wall's last marker ("… at <ISO time>") is stale. No
 *  readable time counts as stale, so a wall can never be stuck composing. */
export function composingStale(warning: string | null | undefined, now = Date.now()): boolean {
  const iso = warning?.match(/at (\d{4}-\d{2}-\d{2}T[\d:.]+Z)/g)?.pop()?.slice(3);
  const t = iso ? Date.parse(iso) : NaN;
  return !Number.isFinite(t) || now - t > COMPOSING_STALE_MS;
}

/** Our own mailboxes. A survey whose creator is one of these was keyed in by
 *  Zyvorah, not measured by Zyvorah. */
const OWN_DOMAINS = /@(?:[a-z0-9-]+\.)*(?:plankandweave\.com|zyvorah\.com|magnitudegroup\.in|rvvarde\.com)\b/i;

/**
 * Who a store order came from, as the proposal email and the survey list say
 * it, or null when nothing true can be said. Narsingi (Roheena, 23 October
 * 2026): Amit sent the wall on the Vijay Sales WhatsApp group, Roheena keyed it
 * in, and the proposal said "Measured on site by roheena@plankandweave.com".
 * It must say "Order received from Amit". `created_by` is whoever typed the
 * survey in, so it is a measurer only for a store link or the calculator;
 * an import is the partner's own drawing, received, not measured; and one of
 * our own addresses is never shown as the measurer.
 */
export function orderOrigin(batch: {
  received_from?: string | null; created_by?: string | null; source?: string | null;
}): string | null {
  const from = batch.received_from?.trim();
  if (from) return `Order received from ${from}`;
  const by = batch.created_by?.trim();
  if (!by || by === "os-bridge" || OWN_DOMAINS.test(by)) return null;
  return batch.source === "staff_import" ? `Order received from ${by}` : `Measured on site by ${by}`;
}

/** "1 wall", "2 walls". */
export const wallsWord = (n: number) => `${n} wall${n === 1 ? "" : "s"}`;

/**
 * The account's saved store a batch with no `store_id` is for, or null.
 *
 * EBD Gurgaon (25 October 2026) was keyed in by hand with only a typed site
 * address and no store link, so approval had no PIN to book the courier on
 * and Vijay Sales' approver got "We could not establish a 6-digit PIN code"
 * — while "Gurgaon - Sector 89 EBD", PIN 122505, sat on their Stores page.
 * A store is taken only when every word of its NAME is in the batch's title
 * or typed address (so "Sector 89" never matches a "Sector 84" store), it is
 * in the batch's state, and it is the only one that qualifies. Anything less
 * is no match: a wrong store ships to the wrong showroom, which is worse than
 * the refusal.
 */
export function storeForBatch<S extends { id: string; name: string; state?: string | null }>(
  batch: { title?: string | null; ship_address?: string | null; ship_city?: string | null; state?: string | null },
  stores: readonly S[],
): S | null {
  const words = (s: string | null | undefined) =>
    (s ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 0).map((w) => CITY_ALIASES[w] ?? w);
  const said = new Set(words([batch.title, batch.ship_address, batch.ship_city].join(" ")));
  const state = place(batch.state);
  const hits = stores.filter((s) => {
    if (state && s.state && place(s.state) !== state) return false;
    const name = words(s.name).filter((w) => !["vijay", "sales", "store", "showroom"].includes(w));
    return name.length > 0 && name.every((w) => said.has(w));
  });
  return hits.length === 1 ? hits[0] : null;
}
