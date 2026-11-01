// Picks WHAT to post and in WHICH pillar for a given slot. Reads only the live
// catalogue (via the read-only anon client) plus a lightweight "posted ledger"
// so nothing repeats too soon. Selection is deterministic for a given day +
// slot (reusing the site's own seeded shuffle), so a re-run produces the same
// plan rather than a different one — no stored plan state required.

import { supabase as offlineCatalogue } from "../supabase";
import { seededShuffle, logicalDayKey } from "../dailyRotation";
import type { Pillar } from "./voice";
import type { MediaKind } from "./media/types";
import { campaignFeedSlot, inCampaignWindow, CAMPAIGN_KEY } from "./campaign";
import { CADENCE_KEY, takenElsewhere, freeStorySeqs } from "./cadence";
import { fitsHouseTitle } from "./media/social-layout";
import { hasServiceRole } from "./db";
import { authoredStoryReservationsByDay, composableByDay, loadCadenceRejections, loadDesignsUsedByFormat, designHandleForSlot, slotKeyOf, type StoryReservation, type PlanSlot, type Beat, type PlanChannel, type PlanKind } from "./plan";

// Built on first use, not on import. As a module-level constant this threw
// "supabaseUrl is required" the moment anything imported this file, so the
// scheduling rules below could not be tested without a live database — which is
// part of why they had no tests, and why a slot-key bug reachable through
// ?count= sat here unnoticed. A pure function should not need credentials to run.
function supabaseClient() { return offlineCatalogue; }

export type Candidate = {
  handle: string;
  title: string;
  descriptionPlain: string;
  isSignature: boolean;
  isFoundersFavourite: boolean;
  foundersNote: string | null;
  tags: string[];
  rooms: string[];
  fromPrice: number | null;
  flatUrl: string | null;
  sceneUrls: string[];
};

export type Selection = {
  slotKey: string; // e.g. "2026-07-20#0"
  pillar: Pillar;
  candidate: Candidate;
  /**
   * Present when this slot is driven by an active campaign calendar rather than
   * the default rotation. The copy is posted verbatim (still safety-gated) and
   * the media format is fixed by the calendar, not derived from the pillar.
   */
  campaign?: {
    key: string;
    beat: Beat;
    collection: string;
    caption: string;
    format: MediaKind;
    artDirection: string;
    /** Present when the slot came from the database plan (marketing_plan_slots)
     *  rather than the static calendar: the desk joins the composed post back
     *  to this row, and the composer reads the beat's art direction from it. */
    planSlotId?: string;
    kind?: PlanKind;
    title?: string;
    devanagari?: string | null;
    meaning?: string | null;
    price?: string | null;
    hook?: string | null;
    art?: Record<string, unknown>;
    /** The founder's notes on this slot ("ask for a variation", "add note"),
     *  in the order they were left. The composer must act on these — see
     *  directivesFromNotes in pipeline.ts. */
    notes?: string[];
    /** This slot's position among the feed slots of its own chapter (its
     *  collection), 0-based, and the rooms its earlier siblings already lead
     *  on. chooseLeadScene uses both so a week is never three of the same kind
     *  of room. Filled by planSlots, which is the only place that can see a
     *  slot's siblings. */
    chapterIndex?: number;
    chapterRooms?: string[];
    /** Images this DAY has already used. No two frames in one day may be the
     *  same picture — the same wallpaper in another room is fine, the same
     *  render twice is not (founder, 26 Sep 2026). */
    avoidUrls?: string[];
  };
  /** Which channel this slot posts to. Absent = instagram. */
  channel?: PlanChannel;
  /** Reels only: false posts the reel off the profile grid (share_to_feed).
   *  Set by the daily cadence; a plan-authored reel stays on the grid. */
  shareToFeed?: boolean;
};

/**
 * A plan slot → a Selection the composer can run. A slot that names a design
 * the catalogue does not carry is refused (null) with a warning, never posted
 * with the wrong picture. A plate with no design (the launch triptych) gets a
 * stand-in candidate so the rest of the pipeline has a handle to key on.
 */
export function selectionFromPlanSlot(
  ps: PlanSlot,
  byHandle: Map<string, Candidate>,
): Selection | null {
  let candidate = ps.handle ? byHandle.get(ps.handle) : undefined;
  if (ps.handle && !candidate) {
    console.warn(`plan: ${ps.day_key}#${ps.seq} names "${ps.handle}" but it is not in the postable catalogue — skipping`);
    return null;
  }
  if (!candidate) {
    candidate = {
      handle: `plate-${(ps.art?.word as string | undefined) ?? ps.title ?? ps.seq}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title: ps.title ?? String(ps.art?.word ?? ""),
      descriptionPlain: ps.hook ?? "",
      isSignature: false,
      isFoundersFavourite: false,
      foundersNote: null,
      tags: [],
      rooms: [],
      fromPrice: null,
      flatUrl: null,
      sceneUrls: [],
    };
  }
  const pillarFromArt = ps.art?.pillar as Pillar | undefined;
  const pillar: Pillar =
    pillarFromArt ?? (ps.beat === "word" ? "collection_story" : ps.beat === "launch" ? "agentic_story" : "reveal");
  const format: MediaKind = ps.kind === "ad" ? "feed" : ps.kind;
  return {
    slotKey: slotKeyOf(ps),
    pillar,
    candidate,
    channel: ps.channel,
    // A plan-authored reel sits on the grid unless the plan says otherwise.
    shareToFeed: ps.art?.share_to_feed === false ? false : undefined,
    campaign: {
      key: ps.plan_key,
      beat: ps.beat ?? "wall",
      collection: ps.collection ?? "",
      caption: ps.caption ?? "",
      format,
      artDirection: ps.visual_brief ?? "",
      planSlotId: ps.id,
      kind: ps.kind,
      title: ps.title ?? candidate.title,
      devanagari: ps.devanagari,
      meaning: ps.meaning,
      price: ps.price,
      hook: ps.hook,
      art: ps.art ?? {},
      // The founder's own words on this slot, newest last. The desk has always
      // STORED these; until 25 Sep 2026 nothing downstream ever read them, so
      // "ask for a variation" recomposed the identical frame. The composer now
      // acts on them (directivesFromNotes in pipeline.ts) — carrying them here
      // is what makes a note on the desk an instruction rather than a diary.
      notes: (ps.comments ?? []).filter((cm) => !cm.resolved).map((cm) => cm.text).filter(Boolean),
    },
  };
}

// A weekly pillar rhythm. The workhorse (reveal) leads; the rest rotate so the
// feed stays varied without a human curating it.
const PILLAR_WEEK: Pillar[] = [
  "reveal",
  "agentic_story",
  "room_story",
  "founders_favourite",
  "the_zyvorah_way",
  "reveal",
  "collection_story",
  "feature",
];

const ROOM_TAGS = new Set([
  "Bedroom",
  "Living Room",
  "Dining Room",
  "Foyer",
  "Home Office",
  "Office",
  "Nursery",
  "Kids",
  "Hotel Lobby & Reception",
  "Pooja Room",
]);

/** Pull the postable catalogue once, shaped for the generator. */
export async function loadCandidates(): Promise<Candidate[]> {
  const { data, error } = await supabaseClient()
    .from("products")
    .select(
      `handle, title, description, is_signature, is_founders_favourite, founders_note,
       product_images ( url, is_flat, position ),
       product_tags ( tag ),
       product_materials ( price_per_sqft, available )`,
    )
    .eq("status", "active").eq("is_service", false);

  if (error) throw new Error(`loadCandidates: ${error.message}`);

  return (data ?? []).map((p: Record<string, any>): Candidate => {
    const images = (p.product_images ?? []) as any[];
    const flat = images.find((i) => i.is_flat);
    const scenes = images
      .filter((i) => !i.is_flat)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((i) => i.url as string);
    const tags = ((p.product_tags ?? []) as any[]).map((t) => t.tag as string);
    const prices = ((p.product_materials ?? []) as any[])
      .filter((m) => m.available)
      .map((m) => Number(m.price_per_sqft));
    return {
      handle: p.handle,
      title: p.title,
      descriptionPlain: (p.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      isSignature: !!p.is_signature,
      isFoundersFavourite: !!p.is_founders_favourite,
      foundersNote: p.founders_note ?? null,
      tags,
      rooms: tags.filter((t) => ROOM_TAGS.has(t)),
      fromPrice: prices.length ? Math.min(...prices) : null,
      flatUrl: flat?.url ?? null,
      sceneUrls: scenes,
    };
  }).filter(publishableArtwork);
}

/**
 * Customer artwork must never be published.
 *
 * `custom-uploads/` is written by the Print Your Own flow (PrintYourOwn.tsx) —
 * it is a CUSTOMER's own image, uploaded to have it printed. We hold it to
 * fulfil their order, not to advertise with.
 *
 * As of 2026-08-25 no active product references one, so nothing was at risk.
 * But that was true by accident of the data, not by design: attach a customer
 * upload to an active product and the autonomous publisher would happily post
 * it. This makes the guarantee structural instead of lucky.
 *
 * Deliberately NOT filtering studio-uploads/ — that is our own studio tool's
 * output and is the flat artwork for 162 live designs.
 */
function publishableArtwork(c: Candidate): boolean {
  const isCustomerUpload = (u: string | null) => !!u && u.includes("/custom-uploads/");
  if (isCustomerUpload(c.flatUrl) || c.sceneUrls.some(isCustomerUpload)) {
    console.warn(
      `marketing: refusing ${c.handle} — references customer artwork under custom-uploads/`,
    );
    return false;
  }
  return true;
}

/** Handles posted within `days` — so we don't repeat a design too soon. */
async function recentlyPosted(days: number): Promise<Set<string>> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabaseClient()
    .from("marketing_posts")
    .select("product_handle")
    .gte("created_at", since);
  // If the ledger table doesn't exist yet (pre-migration), treat as empty.
  if (error) return new Set();
  return new Set((data ?? []).map((r: any) => r.product_handle));
}

/** Does a candidate satisfy the pillar's hard requirements? */
function eligible(c: Candidate, pillar: Pillar): boolean {
  if (!c.flatUrl) return false; // need at least the flat artwork
  switch (pillar) {
    case "founders_favourite":
      return c.isFoundersFavourite || !!c.foundersNote;
    case "room_story":
      return c.sceneUrls.length >= 2 && c.rooms.length >= 2;
    case "collection_story":
      return c.descriptionPlain.length > 60; // needs a story to tell
    default:
      return true;
  }
}

export type PlanOptions = {
  startDate?: Date;
  /** handle -> bias multiplier (from insights.learnedSignals). >1 surfaces sooner. */
  bias?: Map<string, number>;
  /**
   * How many days from the start the DAILY CADENCE tops up (default 14).
   * The founder's doctrine (26 Sep 2026): "Why should we not post every day?
   * … I want a reel every day … a minimum of 4 stories a day", finalised a
   * rolling fortnight ahead. Within this window every day is topped up to
   * one grid post + one reel + four Stories; beyond it only the plan's own
   * slots compose, so "compose the whole calendar" cannot fabricate three
   * months of filler nobody has reviewed.
   */
  cadenceDays?: number;
};

/** The daily cadence's own seq numbers. Deliberately clear of everything the
 *  plans use (feed 0-4, story 5-6/20-29, LinkedIn 7, ads 90+) AND of every
 *  slot key any retired plan ever wrote — a skipped post on an old key would
 *  make alreadyDone() read the founder's old rejection as a rejection of the
 *  new day (a stored 'skipped' means exactly that, see pipeline.ts). */
export const CADENCE_SEQ = { still: 30, reel: 40, storyBase: 50 } as const;
export { CADENCE_KEY };

/** Grid rhythm: every fourth day the daily reel IS the grid post. Pure of
 *  the calendar date so the rhythm holds across compose runs and re-runs. */
export function isGridReelDay(dayKey: string): boolean {
  const epochDay = Math.floor(Date.parse(`${dayKey}T00:00:00Z`) / 86_400_000);
  return ((epochDay % 4) + 4) % 4 === 0;
}

/**
 * Build a plan of `count` selections, one slot per day. Deterministic for a
 * given date range + catalogue + bias: re-running yields the same plan (so a
 * retried cron never diverges). The optional `bias` folds the agentic loop's
 * learned scores into ordering without breaking that determinism — cold items
 * (no data, bias 1.0) keep their seeded position; proven ones move up.
 */
export type ScheduledSlot = { slotKey: string; dayKey: string; pillar: Pillar };

/**
 * Which day, which pillar, which key — decided without touching the catalogue.
 *
 * Split out because the keying is the part that must be right and the part that
 * was wrong: the suffix used to be the index within the RUN, which equals the
 * index within the day only while a run is one day long. Planning a week
 * therefore produced `2026-09-08#1` while the next morning's daily tick produced
 * `2026-09-08#0`, and since a slot_key only dedupes against a key built the same
 * way, that is two posts for one day. The `?count=` parameter already reached
 * three, so it was reachable in production, not merely latent.
 *
 * Pure, so the rule can be tested without a database — which is why the bug
 * survived: every test of this file needed the catalogue, so none ran.
 */
export function planSchedule(count: number, startDate: Date): ScheduledSlot[] {
  const perDay = new Map<string, number>();
  const out: ScheduledSlot[] = [];

  for (let i = 0; i < count; i++) {
    const day = new Date(startDate.getTime() + i * 86_400_000);
    const dayKey = logicalDayKey(day);

    // The rhythm has to continue ACROSS runs, not restart inside each plan.
    // Indexing by the logical day keeps it deterministic for a given day — a
    // re-run of that day repeats it — while still advancing as documented.
    const epochDay = Math.floor(Date.parse(`${dayKey}T00:00:00Z`) / 86_400_000);
    const pillar =
      PILLAR_WEEK[((epochDay % PILLAR_WEEK.length) + PILLAR_WEEK.length) % PILLAR_WEEK.length];

    const nth = perDay.get(dayKey) ?? 0;
    perDay.set(dayKey, nth + 1);
    out.push({ slotKey: `${dayKey}#${nth}`, dayKey, pillar });
  }

  return out;
}

/**
 * THE CHAPTER RULE (founder, 26 Sep 2026): "we are doing the whole story of
 * Taash. It should pick only from Taash, and even when it's doing a rotation,
 * it should pick from that collection that's being posted during that time."
 *
 * The rotation used to draw from the whole catalogue, so a week telling one
 * story was interrupted by whatever the shuffle surfaced: an office mural and
 * an Ikat in the middle of Taash. Now every automatic pick is scoped to the
 * chapter the plan is running. A chapter is the `collection` the plan's slots
 * name, and the catalogue tags designs with that exact name (TAASH, Katha,
 * Maharaja's Court, Stallion Spirit, Spiritual).
 *
 * The scope widens in a fixed order, and never leaves the chapter's world:
 *   1. a fresh design from the chapter itself;
 *   2. for an Indian chapter (more than half its designs are Indian Ethnic),
 *      only its Indian designs, then a fresh Indian Ethnic design from outside
 *      it, preferring pooja-room designs when the chapter is Spiritual, and
 *      never one that belongs to another chapter in the plan. A Katha week
 *      never borrows a stallion or a Taash card;
 *   3. a chapter design shown again. A repeat from the story beats an
 *      interruption from outside it.
 * A chapter the catalogue carries no designs for (A Life Collected is a
 * concept serial, not a collection) gets no automatic pick at all. The plan's
 * own posts carry those days.
 */
export type ChapterScope = { name: string; tiers: { pool: Candidate[]; reuse: boolean }[] };

const INDIAN = "indian ethnic";

export function chapterScope(
  name: string | null | undefined,
  catalogue: Candidate[],
  otherChapters: string[] = [],
): ChapterScope | null {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return null;
  const has = (c: Candidate, t: string) => c.tags.some((x) => x.toLowerCase() === t);
  const members = catalogue.filter((c) => has(c, n));
  if (!members.length) return { name: n, tiers: [] };
  const indianShare = members.filter((c) => has(c, INDIAN)).length / members.length;
  if (indianShare <= 0.5) {
    return { name: n, tiers: [{ pool: members, reuse: false }, { pool: members, reuse: true }] };
  }
  // An Indian chapter keeps to its Indian designs, and the wider Indian pool
  // leaves out designs that belong to ANOTHER story the plan is telling
  // (a Taash card carries "Indian Ethnic" too, and must not front a Katha day).
  const foreign = otherChapters.map((c) => c.trim().toLowerCase()).filter((c) => c && c !== n);
  const own = members.filter((c) => has(c, INDIAN));
  const indian = catalogue.filter((c) => has(c, INDIAN) && !foreign.some((f) => has(c, f)));
  const tiers: ChapterScope["tiers"] = [{ pool: own, reuse: false }];
  if (n === "spiritual") tiers.push({ pool: indian.filter((c) => has(c, "pooja room")), reuse: false });
  tiers.push({ pool: indian, reuse: false }, { pool: own, reuse: true });
  return { name: n, tiers };
}

/** The chapter each day belongs to: the collection its own plan slots name,
 *  else the most recent chapter before it, else the next one after it. */
export function chaptersByDay(dayKeys: string[], planned: Map<string, PlanSlot[]>): Map<string, string> {
  // Instagram's chapters only. A LinkedIn post on the same day tells its own
  // story (a hotel lobby, an office floor) and must not pull the Instagram
  // grid's cadence picks into its collection.
  const own = (d: string) =>
    (planned.get(d) ?? [])
      .filter((ps) => (ps.channel ?? "instagram") === "instagram")
      .map((ps) => (ps.collection ?? "").trim())
      .find(Boolean) ?? null;
  const out = new Map<string, string>();
  let last: string | null = null;
  for (const d of dayKeys) {
    last = own(d) ?? last;
    if (last) out.set(d, last);
  }
  let next: string | null = null;
  for (const d of [...dayKeys].reverse()) {
    next = own(d) ?? next;
    if (!out.has(d) && next) out.set(d, next);
  }
  return out;
}

/** First candidate the scope allows, tier by tier. No scope = the old
 *  whole-catalogue behaviour (no plan anywhere near this day). */
export function pickInScope(
  scope: ChapterScope | null,
  fallbackPool: Candidate[],
  used: Set<string>,
  pred: (c: Candidate) => boolean,
  order: (arr: Candidate[]) => Candidate[],
): Candidate | undefined {
  if (!scope) return order(fallbackPool.filter((c) => pred(c) && !used.has(c.handle)))[0];
  for (const t of scope.tiers) {
    const c = order(t.pool.filter((c) => pred(c) && (t.reuse || !used.has(c.handle))))[0];
    if (c) return c;
  }
  return undefined;
}

export async function planSlots(count: number, opts: PlanOptions = {}): Promise<Selection[]> {
  const startDate = opts.startDate ?? new Date();
  const bias = opts.bias;
  const [candidates, blocked] = await Promise.all([loadCandidates(), recentlyPosted(30)]);
  const pool = candidates.filter((c) => !blocked.has(c.handle));
  // The campaign addresses designs by handle directly, so it must see the whole
  // catalogue — a design named in the calendar is posted even if the rotation
  // showed it recently. (The "no design twice" rule is the calendar's own, not
  // the recency ledger's.)
  const byHandle = new Map(candidates.map((c) => [c.handle, c]));

  const out: Selection[] = [];
  const usedThisRun = new Set<string>();
  const schedule = planSchedule(count, startDate);

  // The plan in the database decides first. A day a live plan covers is the
  // plan's — every planned slot on it composes, and an empty covered day stays
  // empty. Only when no plan exists at all (no service role, or nothing
  // imported yet) does the static calendar in campaign.ts stand in.
  // A database read failure is not evidence that the founder's live plan is
  // absent. Falling back to rotation on a transient error replaced queued
  // Taash frames with unrelated designs, then replaced them again on retry.
  // Fail the compose run and keep the existing queue intact.
  const planned = schedule.length
    ? await composableByDay(schedule[0].dayKey, schedule[schedule.length - 1].dayKey)
    : new Map<string, PlanSlot[]>();
  // Designs already given a format on Instagram, so the cadence never offers
  // a repeat the design-sequence rule would hold at review.
  const usedByFormat = schedule.length && hasServiceRole() ? await loadDesignsUsedByFormat() : new Map<string, Set<string>>();
  // Designs a day has already refused (a skipped or failed cadence row): the
  // day is composed again PAST them, never left empty (see cadenceRejections).
  const rejections = schedule.length && hasServiceRole()
    ? await loadCadenceRejections(schedule[0].dayKey, schedule[schedule.length - 1].dayKey)
    : new Map<string, Set<string>>();
  const reservations = schedule.length
    ? await authoredStoryReservationsByDay(schedule[0].dayKey, schedule[schedule.length - 1].dayKey)
    : new Map<string, StoryReservation[]>();
  const otherAuthoredStories = (dayKey: string, daySels: Selection[]) => {
    const selectedKeys = new Set(daySels.map((s) => s.slotKey));
    return (reservations.get(dayKey) ?? []).filter((story) => !selectedKeys.has(story.slotKey));
  };

  // Apply the learned bias as a stable re-rank: multiply each item's seeded
  // rank position by its bias so higher-scoring items rise, ties stay seeded.
  const rank = (arr: Candidate[], seed: string): Candidate[] => {
    const shuffled = seededShuffle(arr, seed);
    if (!bias) return shuffled;
    return shuffled
      .map((c, idx) => ({ c, key: idx / (bias.get(c.handle) ?? 1) }))
      .sort((a, b) => a.key - b.key)
      .map((x) => x.c);
  };

  const chapters = chaptersByDay(schedule.map((x) => x.dayKey), planned);
  const scopeCache = new Map<string, ChapterScope | null>();
  const scopeFor = (dayKey: string): ChapterScope | null => {
    const name = chapters.get(dayKey);
    if (!name) return null;
    if (!scopeCache.has(name)) scopeCache.set(name, chapterScope(name, candidates, [...new Set(chapters.values())]));
    return scopeCache.get(name) ?? null;
  };

  let dayIndex = -1;
  for (const { slotKey, dayKey, pillar } of schedule) {
    dayIndex++;
    if (planned.has(dayKey)) {
      const daySels: Selection[] = [];
      for (const ps of planned.get(dayKey) ?? []) {
        const sel = selectionFromPlanSlot(ps, byHandle);
        if (!sel) continue;
        usedThisRun.add(sel.candidate.handle);
        daySels.push(sel);
      }
      out.push(...daySels);
      if (dayIndex < (opts.cadenceDays ?? 14)) {
        out.push(...cadenceTopUp(dayKey, daySels, pool, usedThisRun, bias, scopeFor(dayKey), otherAuthoredStories(dayKey, daySels), usedByFormat, rejections.get(dayKey)));
      }
      continue;
    }
    if (planned.size > 0) {
      // A LIVE PLAN IS THE ONLY CALENDAR. This used to fall through to the
      // rotation, so any day outside the plan's window got a design the
      // rotation picked for itself. On 26 September 2026, three days into the
      // Taash launch, that put Emerald Canopy, Imperial Flourish and two
      // fa-000xx patterns into the grid and the Stories — unrelated to the
      // collection being launched, several times each, and with no copy, so
      // their Story frames rendered as a black bar. The founder read the whole
      // desk as random, correctly.
      //
      // When the founder has a plan live, a day it does not cover is a day
      // with nothing on it. Silence is the honest answer; an invented post is
      // not.
      continue;
    } else if (inCampaignWindow(dayKey)) {
      // No plan in the database at all — the static calendar stands in.
    // A day the calendar covers is composed from its named design + copy; a day
    // inside the window it deliberately leaves blank (e.g. the launch triptych,
    // which is bespoke creative the feed engine does not compose) yields no
    // slot at all — the window must not fall back to a generic post.
      const cs = campaignFeedSlot(dayKey);
      if (!cs) continue;
      const candidate = byHandle.get(cs.handle);
      if (!candidate) {
        console.warn(`campaign: ${dayKey} names "${cs.handle}" but it is not in the postable catalogue — skipping`);
        continue;
      }
      usedThisRun.add(candidate.handle);
      out.push({
        slotKey,
        pillar: cs.pillar,
        candidate,
        campaign: {
          key: CAMPAIGN_KEY,
          beat: cs.beat,
          collection: cs.collection,
          caption: cs.caption,
          format: cs.format,
          artDirection: cs.artDirection,
        },
      });
      continue;
    }

    // Deterministic candidate order for this slot, biased toward Signature /
    // Founder's picks by ranking those first, then learned performance.
    // Signature / Founder's picks first, then learned performance — inside
    // the day's chapter when there is one (see chapterScope).
    const orderFor = (arr: Candidate[]) => [
      ...rank(arr.filter((c) => c.isSignature || c.isFoundersFavourite), `${dayKey}#${pillar}#p`),
      ...rank(arr.filter((c) => !c.isSignature && !c.isFoundersFavourite), `${dayKey}#${pillar}#r`),
    ];
    const scope = scopeFor(dayKey);
    const candidate =
      pickInScope(scope, pool, usedThisRun, (c) => eligible(c, pillar), orderFor) ??
      // A chapter design that suits no pillar still beats leaving the story.
      (scope ? pickInScope(scope, pool, usedThisRun, () => true, orderFor) : undefined);
    const daySels: Selection[] = [];
    if (candidate) {
      usedThisRun.add(candidate.handle);
      daySels.push({ slotKey, pillar, candidate });
    }
    out.push(...daySels);
    if (dayIndex < (opts.cadenceDays ?? 14)) {
      out.push(...cadenceTopUp(dayKey, daySels, pool, usedThisRun, bias, scope, otherAuthoredStories(dayKey, daySels), usedByFormat, rejections.get(dayKey)));
    }
  }

  return withChapterPositions(out);
}

/**
 * THE DAILY CADENCE (founder, 26 Sep 2026): every day carries one grid post,
 * one reel, and at least four Stories — "we have no dearth of content". The
 * plan's own slots always come first; this only fills what the day is
 * missing, from the same deterministic rotation the uncovered days use, so a
 * re-run fills identically and slot_key idempotency holds.
 *
 * The grid stays a designed surface: the daily reel posts OFF the grid
 * (share_to_feed=false), except every fourth day, when the reel IS the grid
 * post and no still is added beside it. Stories ride the day's own designs —
 * four Stories a day must not burn four fresh designs from the pool — and
 * rotate rooms so they are four different pictures, not one frame four times.
 *
 * Fresh seq numbers (30/40/50+) on purpose: retired plans left skipped posts
 * on the low keys, and a stored 'skipped' reads as "the founder rejected
 * this slot" (see alreadyDone in pipeline.ts).
 */
export function cadenceTopUp(
  dayKey: string,
  daySels: Selection[],
  pool: Candidate[],
  usedThisRun: Set<string>,
  bias: Map<string, number> | undefined,
  scope: ChapterScope | null = null,
  reservedStories: StoryReservation[] = [],
  usedByFormat: Map<string, Set<string>> = new Map(),
  /** Designs this day has already refused (cadenceRejections): a rejected
   *  cadence post is "not this design", and the day is filled past it. */
  rejected: Set<string> = new Set(),
): Selection[] {
  const added: Selection[] = [];
  const ig = daySels.filter((s) => (s.channel ?? "instagram") === "instagram");
  const kindOf = (s: Selection) => s.campaign?.kind ?? (PILLAR_FORMAT_KIND[s.pillar] ?? "feed");
  const hasGridPost = ig.some((s) => ["feed", "carousel", "reel"].includes(kindOf(s)));
  const hasReel = ig.some((s) => kindOf(s) === "reel");
  const storyCount = ig.filter((s) => kindOf(s) === "story").length + reservedStories.length;
  const gridReelDay = isGridReelDay(dayKey);

  const rank = (arr: Candidate[], seed: string): Candidate[] => {
    const shuffled = seededShuffle(arr, seed);
    if (!bias) return shuffled;
    return shuffled
      .map((c, idx) => ({ c, key: idx / (bias.get(c.handle) ?? 1) }))
      .sort((a, b) => a.key - b.key)
      .map((x) => x.c);
  };
  const pick = (seed: string, pred: (c: Candidate) => boolean): Candidate | undefined =>
    pickInScope(scope, pool, usedThisRun, (c) => !rejected.has(c.handle.toLowerCase()) && pred(c), (arr) => rank(arr, seed));

  const epochDay = Math.floor(Date.parse(`${dayKey}T00:00:00Z`) / 86_400_000);
  const cadenceSel = (
    seq: number,
    kind: PlanKind,
    candidate: Candidate,
    extra: Partial<NonNullable<Selection["campaign"]>> = {},
  ): Selection => ({
    slotKey: `${dayKey}#${seq}`,
    pillar: kind === "reel" ? "reveal" : kind === "story" ? "room_story" : "feature",
    candidate,
    campaign: {
      key: CADENCE_KEY,
      beat: kind === "story" ? "story" : "wall",
      collection: "",
      caption: "",
      format: (kind === "ad" ? "feed" : kind) as MediaKind,
      artDirection: "",
      kind,
      title: candidate.title,
      price: candidate.fromPrice != null ? `from ₹${candidate.fromPrice}/sq ft` : null,
      art: {},
      ...extra,
    },
  });

  // The grid post: a wall still most days, the artwork macro every third —
  // the beat variety the founder missed when "everything became walls".
  let gridCand: Candidate | undefined;
  if (!hasGridPost && !gridReelDay) {
    gridCand = pick(`${dayKey}#cadence-grid`, (c) => !!c.flatUrl && c.sceneUrls.length >= 1 && fitsHouseTitle(c.title) &&
      !takenElsewhere(usedByFormat, "feed", c.handle, `${dayKey}#${CADENCE_SEQ.still}`));
    if (gridCand) {
      usedThisRun.add(gridCand.handle);
      const beat = ((epochDay % 3) + 3) % 3 === 2 ? "detail" : "wall";
      added.push(cadenceSel(CADENCE_SEQ.still, "feed", gridCand, { beat }));
    }
  }

  // The daily reel — off-grid, except every fourth day when it IS the grid.
  let reelCand: Candidate | undefined;
  if (!hasReel) {
    reelCand = pick(`${dayKey}#cadence-reel`, (c) => c.sceneUrls.length >= 2 && fitsHouseTitle(c.title) &&
      !takenElsewhere(usedByFormat, "reel", c.handle, `${dayKey}#${CADENCE_SEQ.reel}`));
    if (reelCand) {
      usedThisRun.add(reelCand.handle);
      added.push({
        ...cadenceSel(CADENCE_SEQ.reel, "reel", reelCand),
        shareToFeed: gridReelDay,
      });
    }
  }

  // Count the plan's Stories first. Cadence owns the first available top-up
  // keys (#50 onward), regardless of how many authored Stories precede them.
  if (storyCount < 4) {
    const usedRooms: string[] = [];
    const usedHandles = new Set([...ig, ...added].map((s) => s.candidate.handle));
    for (const sel of ig) {
      const pinnedDesign = designHandleForSlot({ art: sel.campaign?.art });
      if (pinnedDesign) usedHandles.add(pinnedDesign);
    }
    for (const story of reservedStories) if (story.handle) usedHandles.add(story.handle);
    // Every picture the day has already committed to — the plan's own slots
    // and the cadence's grid post and reel included, because a Story must not
    // repeat the frame the day's post already used either.
    const usedUrls = new Set<string>();
    for (const sel of [...ig, ...added]) {
      const lead = roomResolver ? roomResolver(sel.candidate.sceneUrls, { chapterIndex: 0, usedRooms: [] }) : null;
      if (lead) usedUrls.add(lead);
    }
    for (const story of reservedStories) if (story.sourceUrl) usedUrls.add(story.sourceUrl);
    // The keys to fill are the first FREE Story keys, never #50 + i: a day
    // whose #50–#52 are drawn and whose #53 failed needs #53, and a Story
    // numbered #50 is found taken and skipped (16 October 2026).
    const storySeqs = freeStorySeqs(
      [...ig.filter((s) => kindOf(s) === "story").map((s) => s.slotKey), ...reservedStories.map((s) => s.slotKey)],
      4 - storyCount,
    );
    for (let i = 0; i < storySeqs.length; i++) {
      // A Story must use a fresh design in this day. If the chapter is
      // exhausted, leave the slot empty instead of repeating a wallpaper.
      const unseen = (c: Candidate) => c.sceneUrls.some((u) => !usedUrls.has(u));
      // The measured frame sets the name in two lines of 20 characters and
      // refuses a longer one (9 Oct 2026: a Story failed on its title).
      const candidate = pick(`${dayKey}#cadence-story-${i}`, (c) => c.sceneUrls.length >= 1 && !usedHandles.has(c.handle) && unseen(c) && fitsHouseTitle(c.title) &&
        !takenElsewhere(usedByFormat, "story", c.handle, `${dayKey}#${storySeqs[i]}`));
      if (!candidate) break;
      usedThisRun.add(candidate.handle);
      usedHandles.add(candidate.handle);
      added.push(
        cadenceSel(storySeqs[i], "story", candidate, {
          chapterIndex: storyCount + i,
          chapterRooms: [...usedRooms],
          avoidUrls: [...usedUrls],
        }),
      );
      if (roomResolver && roomNamer) {
        const url = roomResolver(candidate.sceneUrls.filter((u) => !usedUrls.has(u)), { chapterIndex: storyCount + i, usedRooms });
        if (url) usedUrls.add(url);
        const room = url ? roomNamer(url) : null;
        if (room) usedRooms.push(room);
      }
    }
  }

  return added;
}

/** What a rotation pillar posts as — mirrored from pipeline.ts's
 *  PILLAR_FORMAT (select cannot import pipeline; the dependency is one-way). */
const PILLAR_FORMAT_KIND: Record<string, PlanKind> = {
  reveal: "reel",
  room_story: "carousel",
  founders_favourite: "feed",
  the_zyvorah_way: "feed",
  collection_story: "carousel",
  feature: "feed",
  agentic_story: "feed",
};

/**
 * Stamp each campaign slot with its position in its own chapter and the rooms
 * its earlier siblings will lead on.
 *
 * This is the only place a slot can learn about its siblings — everything
 * downstream sees one slot at a time, which is exactly why a whole week could
 * come out as three living rooms and nothing noticed. Feed-bearing slots only:
 * a Story riding alongside a post is not a separate argument in the grid.
 */
export function withChapterPositions(sels: Selection[]): Selection[] {
  const seen = new Map<string, { n: number; rooms: string[] }>();
  return sels.map((sel) => {
    const camp = sel.campaign;
    if (!camp || camp.kind === "story" || camp.kind === "ad") return sel;
    const key = `${camp.key}::${camp.collection}`;
    const state = seen.get(key) ?? { n: 0, rooms: [] };
    const next: Selection = {
      ...sel,
      campaign: { ...camp, chapterIndex: state.n, chapterRooms: [...state.rooms] },
    };
    // Record the room this slot will actually lead on, so the next sibling
    // avoids it. Imported lazily to keep this module free of pipeline imports.
    const lead = leadRoomFor(sel, state);
    seen.set(key, { n: state.n + 1, rooms: lead ? [...state.rooms, lead] : state.rooms });
    return next;
  });
}

/** Resolved lazily to avoid a cycle: pipeline imports select, not the reverse. */
let roomResolver: ((urls: string[], o: { chapterIndex: number; usedRooms: string[] }) => string | null) | null = null;
let roomNamer: ((url: string) => string | null) | null = null;
export function registerSceneChooser(
  choose: (urls: string[], o: { chapterIndex: number; usedRooms: string[] }) => string | null,
  nameRoom: (url: string) => string | null,
): void {
  roomResolver = choose;
  roomNamer = nameRoom;
}
function leadRoomFor(sel: Selection, state: { n: number; rooms: string[] }): string | null {
  if (!roomResolver || !roomNamer) return null;
  const explicit = sel.campaign?.art?.scene;
  if (typeof explicit === "string") return explicit;
  const url = roomResolver(sel.candidate.sceneUrls, { chapterIndex: state.n, usedRooms: state.rooms });
  return url ? roomNamer(url) : null;
}
