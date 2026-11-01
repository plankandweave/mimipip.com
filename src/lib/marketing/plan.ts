import { storyProductUrl } from "./story-link";
import { ideaSource } from "./idea-source";
import { slotFrameTextProblem } from "./frame-text";
import { preparedCarouselIdea } from "./prepared-carousel";
import { productionHold } from "./production-readiness";
import { isPersonalPlan, PERSONAL_PLAN_PREFIX } from "./profiles";
// The marketing plan: strategies and the posts they intend, as data.
//
// A plan slot is INTENT — the day, the channel, the kind, the beat, the design,
// the approved copy, the visual brief. The composed, publishable artefact is a
// marketing_posts row that points back at it (plan_slot_id). The desk joins the
// two; the engine reads the first and writes the second.
//
// Three readers, one shape:
//   - select.ts asks planSlotsBetween() which days a live plan covers and what
//     to compose on each — the calendar decides, not the rotation.
//   - the desk API reads the same rows to draw the grid and the calendar.
//   - importPlan() is how a new strategy arrives — a JSON document in the shape
//     of campaign.json (see docs/marketing-desk.md), written by any agent.
//
// Server-only: every read here uses the service client, because the tables are
// RLS-locked to it. Without a service role every read returns [] and the engine
// falls back to the static calendar in campaign.ts (a dry run still plans).

import { serviceClient, hasServiceRole, uploadMedia } from "./db";
import type { MediaKind } from "./media/types";
import { assertDesignSequence, designSequenceViolations, designSlotKey, type DesignSlot, type DesignViolation } from "./design-sequence";
import { assertReelSequence, type ReelSeqSlot } from "./reel-sequence";
import { CADENCE_KEY, CADENCE_PLAN, cadenceRejections, cadenceRowNeedsRedraw, cadenceSlotRow, designsUsedByFormat, type CadenceKind, type CadenceLedgerRow } from "./cadence";
import { isLanguage, type FilmLanguage } from "./film-language";

export type PlanChannel = "instagram" | "linkedin" | "youtube" | "google" | "meta" | "chatgpt";
export type PlanKind = MediaKind | "ad";
export type Beat = "wall" | "detail" | "word" | "story" | "launch" | "ad";
export type PlanStatus = "draft" | "live" | "done" | "archived";
export type SlotStatus = "idea" | "planned" | "removed";

export type PlanWeek = { week: number; dates: string; theme: string; goal: string };

export type MarketingPlan = {
  key: string;
  name: string;
  big_idea: string | null;
  why_now: string | null;
  grid_system: string | null;
  weeks: PlanWeek[];
  window_start: string;
  window_end: string;
  status: PlanStatus;
  source: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SlotComment = {
  at: string;
  by: string;
  text: string;
  kind: "comment" | "variation";
  /** Set once the composer has acted on this note (directivesFromNotes) or an
   *  agent has addressed it. A resolved note stops steering composition —
   *  without this, "some other wallpaper please" would hold the slot forever,
   *  including after the design was actually changed. */
  resolved?: boolean;
};

export type PlanSlot = {
  id: string;
  plan_key: string;
  day_key: string;
  seq: number;
  channel: PlanChannel;
  kind: PlanKind;
  beat: Beat | null;
  collection: string | null;
  handle: string | null;
  title: string | null;
  devanagari: string | null;
  meaning: string | null;
  price: string | null;
  hook: string | null;
  caption: string | null;
  visual_brief: string | null;
  cta: string | null;
  art: Record<string, unknown>;
  status: SlotStatus;
  comments: SlotComment[];
  removed_at: string | null;
  removed_by: string | null;
  created_at: string;
  updated_at: string;
};

/** marketing_posts.slot_key for a plan slot — the same key the daily tick and
 *  the week-ahead composer build, so all three agree on what "done" means. */
export function slotKeyOf(slot: Pick<PlanSlot, "day_key" | "seq">): string {
  return `${slot.day_key}#${slot.seq}`;
}

const SLOT_COLS =
  "id, plan_key, day_key, seq, channel, kind, beat, collection, handle, title, devanagari, meaning, price, hook, caption, visual_brief, cta, art, status, comments, removed_at, removed_by, created_at, updated_at";

/** Every plan, newest window first. */
export async function listPlans(): Promise<MarketingPlan[]> {
  if (!hasServiceRole()) return [];
  const { data, error } = await serviceClient()
    .from("marketing_plans")
    .select("*")
    .order("window_start", { ascending: false });
  if (error) throw new Error(`marketing_plans read: ${error.message}`);
  return (data ?? []) as MarketingPlan[];
}

/** Plans whose window covers `dayKey` and which the engine may compose from. */
export async function livePlansCovering(dayKey: string): Promise<MarketingPlan[]> {
  if (!hasServiceRole()) return [];
  const { data, error } = await serviceClient()
    .from("marketing_plans")
    .select("*")
    .eq("status", "live")
    .lte("window_start", dayKey)
    .gte("window_end", dayKey);
  if (error) throw new Error(`marketing_plans read: ${error.message}`);
  return (data ?? []) as MarketingPlan[];
}

/**
 * Slots between two day keys (inclusive). `includeRemoved` is for the desk's
 * "show removed" toggle; the engine never asks for them.
 */
export async function planSlotsBetween(
  from: string,
  to: string,
  opts: { includeRemoved?: boolean; plans?: string[]; profile?: "roheena" | "zyvorah" } = {},
): Promise<PlanSlot[]> {
  if (!hasServiceRole()) return [];
  let q = serviceClient()
    .from("marketing_plan_slots")
    .select(SLOT_COLS)
    .gte("day_key", from)
    .lte("day_key", to)
    .order("day_key", { ascending: true })
    .order("seq", { ascending: true });
  if (opts.profile === "roheena") q = q.like("plan_key", `${PERSONAL_PLAN_PREFIX}%`);
  if (opts.profile === "zyvorah") q = q.not("plan_key", "like", `${PERSONAL_PLAN_PREFIX}%`);
  if (!opts.includeRemoved) q = q.neq("status", "removed");
  if (opts.plans?.length) q = q.in("plan_key", opts.plans);
  const { data, error } = await q;
  if (error) throw new Error(`marketing_plan_slots read: ${error.message}`);
  return (data ?? []) as PlanSlot[];
}

export async function planSlotById(id: string): Promise<PlanSlot | null> {
  if (!hasServiceRole()) return null;
  const { data, error } = await serviceClient()
    .from("marketing_plan_slots")
    .select(SLOT_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`marketing_plan_slots read: ${error.message}`);
  return (data as PlanSlot | null) ?? null;
}

/**
 * What the engine composes: the planned organic slots of LIVE plans in a day
 * range, keyed by day. A day with an entry (even an empty one — the window
 * covers it but nothing is planned) is a day the rotation must leave alone.
 */
export async function composableByDay(
  from: string,
  to: string,
): Promise<Map<string, PlanSlot[]>> {
  if (!hasServiceRole()) throw new Error("cannot read the live marketing plan without the service role");
  const { data: plans, error } = await serviceClient()
    .from("marketing_plans")
    .select("key, window_start, window_end")
    .eq("status", "live")
    .lte("window_start", to)
    .gte("window_end", from);
  if (error) throw new Error(`marketing_plans read: ${error.message}`);
  const live = ((plans ?? []) as { key: string; window_start: string; window_end: string }[]).filter((p) => !isPersonalPlan(p.key));
  const out = new Map<string, PlanSlot[]>();
  if (!live.length) return out;

  // The cadence plan covers every day so the cadence keeps running, but its
  // own items are the cadence's output, not an authored calendar: they are
  // never read back as plan slots (cadenceTopUp re-derives them).
  const slots = await planSlotsBetween(from, to, { plans: live.map((p) => p.key).filter((k) => k !== CADENCE_KEY) });
  // Walk every day in range: a covered day is present even when it has no slot.
  for (let d = from; d <= to; d = nextDay(d)) {
    if (live.some((p) => p.window_start <= d && p.window_end >= d)) out.set(d, []);
  }
  for (const s of slots) {
    if (s.status !== "planned") continue;
    if (s.kind === "ad") continue; // ads are not composed by the organic engine
    if (!["instagram", "linkedin"].includes(s.channel)) continue;
    out.get(s.day_key)?.push(s);
  }
  return out;
}

export function nextDay(dayKey: string): string {
  const t = Date.parse(`${dayKey}T00:00:00Z`) + 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export type StoryReservation = { slotKey: string; handle: string | null; sourceUrl: string | null };

/** Published or queued authored Stories still occupy their day even when their
 * plan was archived. The live-plan reader deliberately excludes those plans,
 * but cadence must not mistake their finished Stories for empty slots. */
export async function authoredStoryReservationsByDay(from: string, to: string): Promise<Map<string, StoryReservation[]>> {
  const out = new Map<string, StoryReservation[]>();
  if (!hasServiceRole()) return out;
  const { data, error } = await serviceClient()
    .from("marketing_posts")
    .select("slot_key, plan_slot_id, plan_key, status, channel, approved_at, media_urls, thumbnail_url")
    .gte("slot_key", `${from}#`)
    .lt("slot_key", `${nextDay(to)}#`)
    .eq("channel", "instagram")
    .eq("format", "story")
    .in("status", ["queued", "published"])
    .not("plan_slot_id", "is", null);
  if (error) throw new Error(`marketing_posts Story reservations read: ${error.message}`);
  const posts = (data ?? []) as { slot_key: string; plan_slot_id: string; plan_key: string | null; status: string; channel: string | null; approved_at: string | null; media_urls: string[] | null; thumbnail_url: string | null }[];
  const slots = new Map<string, Pick<PlanSlot, "handle" | "art">>();
  const ids = [...new Set(posts.map((p) => p.plan_slot_id))];
  for (let i = 0; i < ids.length; i += 100) {
    const { data: found, error: slotError } = await serviceClient()
      .from("marketing_plan_slots")
      .select("id, handle, art")
      .in("id", ids.slice(i, i + 100));
    if (slotError) throw new Error(`marketing_plan_slots Story reservations read: ${slotError.message}`);
    for (const slot of (found ?? []) as { id: string; handle: string | null; art: Record<string, unknown> }[]) {
      slots.set(slot.id, slot);
    }
  }
  for (const post of posts) {
    const slot = slots.get(post.plan_slot_id);
    // A cadence Story the review gate will hold for ever (its receipt vouches
    // for another picture) does not occupy its key: left reserved, the
    // top-up never selected it and alreadyDone never got to redraw it
    // (15 October 2026, the Bar lounge Story).
    if (slot && cadenceRowNeedsRedraw(post, slot.art)) continue;
    const dayKey = post.slot_key.split("#")[0];
    const existing = out.get(dayKey) ?? [];
    existing.push({
      slotKey: post.slot_key,
      handle: slot ? designHandleForSlot(slot) : null,
      sourceUrl: typeof slot?.art?.source_image === "string" ? slot.art.source_image : null,
    });
    out.set(dayKey, existing);
  }
  return out;
}

/** Days from `from` inclusive, `n` of them. */
export function dayRange(from: string, n: number): string[] {
  const out: string[] = [];
  let d = from;
  for (let i = 0; i < n; i++) {
    out.push(d);
    d = nextDay(d);
  }
  return out;
}

// ── founder actions ─────────────────────────────────────────────────────────

/**
 * Remove a slot: it vanishes from the desk, and its composed post (if any and
 * not yet published) is skipped so the engine will not compose it again.
 * Nothing is deleted — "show removed" can bring it back.
 */
export async function removeSlot(id: string, by: string, reason?: string): Promise<void> {
  const sb = serviceClient();
  const now = new Date().toISOString();
  const { error } = await sb
    .from("marketing_plan_slots")
    .update({ status: "removed", removed_at: now, removed_by: by, updated_at: now })
    .eq("id", id);
  if (error) throw new Error(`remove: ${error.message}`);
  // The live post row for this slot, if it exists and has not gone out.
  const { error: pErr } = await sb
    .from("marketing_posts")
    .update({
      status: "skipped",
      approved_at: null,
      approved_by: null,
      approved_digest: null,
      error: reason ? `removed by ${by}: ${reason}` : `removed by ${by}`,
    })
    .eq("plan_slot_id", id)
    .in("status", ["queued", "approved", "failed"]);
  if (pErr) throw new Error(`remove post: ${pErr.message}`);
}

/**
 * Pure: may this idea be composed, and with what art? An idea is intent the
 * desk shows and never composes — but an idea that already carries everything
 * a planned slot needs (copy, and a design or a finished frame) is not intent
 * any more, it is a post nobody can reach. On 3 October 2026 every Instagram
 * slot from 2 to 9 October sat as "idea" with caption, design and picture all
 * present, and the desk offered no way to compose, approve or post one.
 *
 * The test is the import's own: the slot is re-read as a planned document
 * slot, so a promoted idea meets exactly the bar an imported one does —
 * including the Story rule's exact-design Link sticker fields, which are
 * filled here the same way. Instagram only; LinkedIn and personal ideas keep
 * their own flows.
 */
export function ideaReadyArt(
  slot: Pick<PlanSlot, "day_key" | "seq" | "channel" | "kind" | "beat" | "collection" | "handle" | "title" | "caption" | "visual_brief" | "art" | "status" | "plan_key"> & { hook?: string | null },
): { art: Record<string, unknown>; handle: string | null } | { reason: string } {
  if (slot.status !== "idea") return { reason: "only an idea is promoted" };
  if (isPersonalPlan(slot.plan_key)) return { reason: "personal creative is authored separately" };
  if (slot.channel !== "instagram") return { reason: "only Instagram ideas compose from the desk" };
  if (slot.kind === "ad") return { reason: "ads are not composed by the organic engine" };
  if (!slot.caption?.trim()) return { reason: "this idea has no caption yet — add the copy before composing" };
  const frameProblem = slotFrameTextProblem(slot);
  if (frameProblem) return { reason: frameProblem };
  // The review board's fields (product_url, review_image_url,
  // review_library_id) read as the design, frame and film — see idea-source.ts.
  const source = ideaSource(slot);
  try {
    const row = normaliseDocumentSlot(
      {
        date: slot.day_key,
        format: slot.kind,
        channel: slot.channel,
        seq: slot.seq,
        beat: slot.beat ?? undefined,
        collection: slot.collection ?? undefined,
        product_handle: source.handle,
        title: slot.title ?? undefined,
        caption: slot.caption,
        visual_brief: slot.visual_brief ?? undefined,
        art: source.art,
        status: "planned",
      },
      0,
    );
    return { art: row.art, handle: row.handle };
  } catch (e) {
    return { reason: (e as Error).message.replace(/^slot 0 \([^)]*\): /, "") };
  }
}

/** The Instagram ideas from `fromDay` on that would compose now: finished
 *  (ideaReadyArt) or a prepared Ahimsa carousel, in a draft or live plan —
 *  the plans the desk shows. A done or archived plan's ideas are history. */
export async function readyIdeaSlots(fromDay: string): Promise<PlanSlot[]> {
  if (!hasServiceRole()) return [];
  const sb = serviceClient();
  const { data: plans, error: pErr } = await sb.from("marketing_plans").select("key, status").in("status", ["draft", "live"]);
  if (pErr) throw new Error(`marketing_plans read: ${pErr.message}`);
  const keys = ((plans ?? []) as { key: string }[]).map((p) => p.key).filter((k) => !isPersonalPlan(k));
  if (!keys.length) return [];
  const { data, error } = await sb
    .from("marketing_plan_slots")
    .select(SLOT_COLS)
    .eq("status", "idea")
    .eq("channel", "instagram")
    .gte("day_key", fromDay)
    .in("plan_key", keys)
    .order("day_key", { ascending: true })
    .order("seq", { ascending: true });
  if (error) throw new Error(`marketing_plan_slots read: ${error.message}`);
  return ((data ?? []) as PlanSlot[]).filter((s) => !productionHold(s) && (preparedCarouselIdea(s) || "art" in ideaReadyArt(s)));
}

/** Turn a finished idea into a planned slot so it composes. Same guards as an
 *  import: one design per day where a Story is involved, and the Library-reel
 *  sequence. Only moves a slot that is still an idea. */
export async function promoteIdea(slot: PlanSlot): Promise<PlanSlot> {
  const ready = ideaReadyArt(slot);
  if ("reason" in ready) throw new Error(ready.reason);
  const promoted: PlanSlot = { ...slot, status: "planned", art: ready.art, handle: ready.handle };
  await assertDesignChange(promoted);
  const sb = serviceClient();
  const { data: sameDay, error: dErr } = await sb
    .from("marketing_plan_slots")
    .select("id, day_key, seq, channel, kind, status, handle, art")
    .eq("day_key", slot.day_key)
    .not("plan_key", "like", `${PERSONAL_PLAN_PREFIX}%`);
  if (dErr) throw new Error(`marketing_plan_slots read: ${dErr.message}`);
  assertDistinctStoryDesigns(
    ((sameDay ?? []) as (Pick<PlanSlot, "id" | "day_key" | "seq" | "channel" | "kind" | "status" | "handle" | "art">)[]).map((r) =>
      r.id === slot.id ? promoted : r,
    ),
  );
  if (slot.kind === "reel" && typeof ready.art.library_id === "string") {
    // The film may only now be named (a review_library_id read as the film),
    // so this slot's entry is rebuilt from the promoted art, not the stored row.
    const lib = ready.art.library_id;
    const film = (await libraryFilms([lib])).get(lib);
    const seq = (await reelSequenceSlots()).filter((s) => s.id !== slot.id);
    seq.push({ id: slot.id, day_key: slot.day_key, seq: slot.seq, channel: slot.channel, kind: slot.kind, status: "planned", library_id: lib, language: film?.language ?? null, title: film?.title ?? null });
    assertReelSequence(seq, new Set([slotKeyOf(slot)]));
  }
  const { data, error } = await sb
    .from("marketing_plan_slots")
    .update({ status: "planned", art: ready.art, handle: ready.handle, updated_at: new Date().toISOString() })
    .eq("id", slot.id)
    .eq("status", "idea")
    .select(SLOT_COLS)
    .maybeSingle();
  if (error) throw new Error(`promote idea: ${error.message}`);
  if (!data) throw new Error("this slot changed while you were looking at it — reload the desk");
  return data as PlanSlot;
}

/** Undo a removal. The skipped post is superseded so a fresh compose can run. */
export async function restoreSlot(id: string, by: string): Promise<void> {
  const slot = await planSlotById(id);
  if (slot) await assertDesignChange({ ...slot, status: "planned" });
  // A restored Library reel re-enters the reel sequence: it must not repeat a
  // film or land next to another voiced reel of its language.
  if (slot && slot.kind === "reel" && typeof slot.art?.library_id === "string") {
    const seq = (await reelSequenceSlots()).map((s) => (s.id === id ? { ...s, status: "planned" } : s));
    assertReelSequence(seq, new Set([slotKeyOf(slot)]));
  }
  const sb = serviceClient();
  const now = new Date().toISOString();
  const { error } = await sb
    .from("marketing_plan_slots")
    .update({ status: isPersonalPlan(slot?.plan_key) && slot?.art?.unscheduled ? "idea" : "planned", removed_at: null, removed_by: null, updated_at: now })
    .eq("id", id);
  if (error) throw new Error(`restore: ${error.message}`);
  const { error: pErr } = await sb
    .from("marketing_posts")
    .update({ status: "superseded", error: `restored by ${by}` })
    .eq("plan_slot_id", id)
    .eq("status", "skipped");
  if (pErr) throw new Error(`restore post: ${pErr.message}`);
}

/**
 * A comment, or a request for a variation. A variation request also marks the
 * composed post for regeneration, so the next composing run reads the note and
 * tries again — the same path as "Rewrite", but the note stays on the plan slot
 * where the next agent session can see every request in one place.
 */
export async function commentOnSlot(
  slot: PlanSlot,
  by: string,
  text: string,
  kind: "comment" | "variation",
): Promise<SlotComment[]> {
  const sb = serviceClient();
  const now = new Date().toISOString();
  const comments: SlotComment[] = [...(slot.comments ?? []), { at: now, by, text, kind }];
  const { error } = await sb
    .from("marketing_plan_slots")
    .update({ comments, updated_at: now })
    .eq("id", slot.id);
  if (error) throw new Error(`comment: ${error.message}`);
  if (kind === "variation") {
    const { error: pErr } = await sb
      .from("marketing_posts")
      .update({
        regenerate_requested_at: now,
        regenerate_requested_by: by,
        regenerate_reason: text,
        approved_at: null,
        approved_by: null,
        approved_digest: null,
      })
      .eq("plan_slot_id", slot.id)
      .in("status", ["queued", "failed"]);
    if (pErr) throw new Error(`variation: ${pErr.message}`);
  }
  return comments;
}

/**
 * The founder's framing for a slot, saved from the desk's grid-frame tool:
 * where the composed picture's cover window sits (focus) and how far in it
 * reaches (zoom). Written onto the slot's art — the same three keys the
 * composer already reads — and the composed post is marked for regeneration
 * so "Compose again" (or the next hourly run) redraws the frame she chose.
 * `null` clears a saved framing and returns the slot to the composer's own
 * defaults. Approval is cleared with it: an approval signs an exact picture,
 * and this exists precisely because that picture is about to change.
 */
export async function setSlotFrame(
  slot: PlanSlot,
  by: string,
  crop: { zoom: number; x: number; y: number; sceneUrl?: string } | null,
): Promise<void> {
  const sb = serviceClient();
  const now = new Date().toISOString();
  const art = { ...(slot.art ?? {}) };
  if (crop) {
    art.zoom = crop.zoom;
    art.focus_x = crop.x;
    art.focus_y = crop.y;
    // Pin the exact picture she framed. The composer must apply her window to
    // THIS render — re-deriving the lead scene under a saved frame would crop
    // a different room with her coordinates.
    if (crop.sceneUrl) art.scene_url = crop.sceneUrl;
  } else {
    delete art.zoom;
    delete art.focus_x;
    delete art.focus_y;
    delete art.scene_url;
  }
  const { error } = await sb
    .from("marketing_plan_slots")
    .update({ art, updated_at: now })
    .eq("id", slot.id);
  if (error) throw new Error(`frame: ${error.message}`);
  const { error: pErr } = await sb
    .from("marketing_posts")
    .update({
      regenerate_requested_at: now,
      regenerate_requested_by: by,
      regenerate_reason: crop ? "reframed on the desk" : "framing reset on the desk",
      approved_at: null,
      approved_by: null,
      approved_digest: null,
    })
    .eq("plan_slot_id", slot.id)
    .in("status", ["queued", "failed"]);
  if (pErr) throw new Error(`frame post: ${pErr.message}`);
}

// ── import: how a strategy arrives ──────────────────────────────────────────

/** The document another agent hands us. The shape of campaign.json, plus the
 *  fields the desk added (channel, seq, kind for ads). See docs/marketing-desk.md. */
export type PlanDocument = {
  campaign: {
    key?: string;
    name: string;
    big_idea?: string;
    why_now?: string;
    grid_system?: string;
    weeks?: PlanWeek[];
    window?: { start: string; end: string };
    status?: PlanStatus;
    source?: string;
  };
  slots: PlanDocumentSlot[];
};

export type PlanDocumentSlot = {
  date: string;
  /** feed | carousel | story | reel | ad */
  format: PlanKind;
  channel?: PlanChannel;
  seq?: number;
  /** wall | detail | word | story | launch | ad — inferred when absent */
  beat?: Beat;
  /** "typographic" marks a plate with no design (the launch triptych) */
  kind?: string;
  order?: number;
  collection?: string;
  product_handle?: string | null;
  title?: string;
  devanagari?: string;
  meaning?: string;
  price?: string;
  hook?: string;
  caption?: string;
  visual_brief?: string;
  cta?: string;
  /** any art direction the composer reads (mat, word, detail_mode, pillar…) */
  art?: Record<string, unknown>;
  mat?: string;
  word?: string;
  detail_mode?: string;
  pillar?: string;
  status?: SlotStatus;
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Identity of the wallpaper behind a finished frame, when the plan records
 * its catalogue source. Finished-frame slots have no product handle, so the
 * ordinary candidate guard cannot spot a duplicate Story. */
export function designHandleForSlot(slot: { handle?: string | null; art?: Record<string, unknown> | null }): string | null {
  const explicit = slot.art?.story_design_handle;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const source = slot.art?.source_image;
  if (typeof source === "string") {
    const match = source.match(/\/product-images\/(?:[^/]+\/)?([^/]+)\/scene-[^/]+$/);
    if (match) return match[1];
  }
  return slot.handle ?? null;
}

export function assertDistinctStoryDesigns(rows: Array<{ day_key: string; seq: number; channel: PlanChannel; kind: PlanKind; status: string; handle?: string | null; art?: Record<string, unknown> | null }>): void {
  const dailyDesigns = new Map<string, { kind: PlanKind; seq: number; scope?: unknown }>();
  for (const r of rows) {
    if (r.channel !== "instagram" || r.status === "removed" || r.status === "idea") continue;
    const design = designHandleForSlot(r);
    if (!design) continue;
    const key = `${r.day_key}:${design}`;
    const previous = dailyDesigns.get(key);
    if (previous && (r.kind === "story" || previous.kind === "story") &&
      !(r.kind !== previous.kind && r.art?.owner_scope && r.art.owner_scope === previous.scope)) {
      throw new Error(`${r.day_key}: Story #${r.seq} repeats ${design} from #${previous.seq}; choose a different wallpaper`);
    }
    dailyDesigns.set(key, { kind: r.kind, seq: r.seq, scope: r.art?.owner_scope });
  }
}

/** Pure: a document slot → the row to write. Throws with the slot named when
 *  it cannot be stored, so an import fails before it half-writes. */
export function normaliseDocumentSlot(s: PlanDocumentSlot, i: number): Omit<PlanSlot, "id" | "plan_key" | "comments" | "removed_at" | "removed_by" | "created_at" | "updated_at"> {
  if (!DAY_RE.test(s.date)) throw new Error(`slot ${i}: date "${s.date}" is not YYYY-MM-DD`);
  const kinds: PlanKind[] = ["feed", "carousel", "story", "reel", "ad"];
  if (!kinds.includes(s.format)) throw new Error(`slot ${i} (${s.date}): format "${s.format}" is not one of ${kinds.join(", ")}`);
  const channel: PlanChannel = s.channel ?? (s.format === "ad" ? "google" : "instagram");
  const isLaunch = s.kind === "typographic" || s.beat === "launch";
  const beat: Beat =
    s.beat ?? (s.format === "ad" ? "ad" : s.format === "story" ? "story" : isLaunch ? "launch" : "wall");
  const seq =
    s.seq ??
    (s.format === "ad"
      ? 90 + i
      : channel === "linkedin"
        ? 7
        : s.format === "story"
          ? 5
          : Number(s.order ?? 0));
  const art: Record<string, unknown> = { ...(s.art ?? {}) };
  if (s.mat) art.mat = s.mat;
  if (s.word) art.word = s.word;
  if (s.detail_mode) art.detail_mode = s.detail_mode;
  if (s.pillar) art.pillar = s.pillar;
  // A finished frame (Astra's own creative) stands in for a catalogue design:
  // the composer posts it as-is, so no handle is needed. An idea is intent
  // without content yet — it shows on the desk and never composes, so it needs
  // neither. Everything else that will compose organically needs a design and
  // the copy to post.
  const isIdea = s.status === "idea";
  // art.scene_urls counts for a reel: the engine renders the motion itself
  // from the named room renders, so no finished frame is needed.
  const hasFinishedFrame = !!(
    s.art?.image_url ||
    s.art?.image_b64 ||
    s.art?.video_url ||
    (s.format === "reel" && Array.isArray(s.art?.scene_urls) && s.art.scene_urls.length) ||
    // A Library film posts as itself (or fails with its reason) — it is the frame.
    (s.format === "reel" && typeof s.art?.library_id === "string" && s.art.library_id)
  );
  if (!isLaunch && !isIdea && !hasFinishedFrame && s.format !== "ad" && !s.product_handle) {
    throw new Error(
      `slot ${i} (${s.date}): an organic post needs product_handle, a finished frame (art.image_url / art.image_b64), or kind "typographic" for a plate`,
    );
  }
  if (channel === "instagram" && s.format === "story" && !isIdea) {
    // Record the exact-design destination for a Link sticker. The sticker is
    // optional (founder, 6 October 2026, confirmed 9 October): a Story the
    // Graph API cannot give one is posted without it, never held (story-link.ts).
    const design = designHandleForSlot({ handle: s.product_handle, art });
    const destination = storyProductUrl(design);
    if (destination) {
      art.story_design_handle = design;
      art.story_link_url = destination;
      art.story_link_sticker_text = "Shop this wallpaper";
    }
    art.story_link_required = false;
  }
  if (s.format !== "ad" && !isIdea && !s.caption) throw new Error(`slot ${i} (${s.date}): caption is required (or send it as status "idea")`);
  return {
    day_key: s.date,
    seq,
    channel,
    kind: s.format,
    beat,
    collection: s.collection ?? null,
    handle: isLaunch ? null : (s.product_handle ?? null),
    title: s.title ?? null,
    devanagari: s.devanagari ?? null,
    meaning: s.meaning ?? null,
    price: s.price ?? null,
    hook: s.hook ?? null,
    caption: s.caption ?? null,
    visual_brief: s.visual_brief ?? null,
    cta: s.cta ?? null,
    art,
    status: s.status ?? "planned",
  };
}

export function planKeyFor(doc: PlanDocument): string {
  if (doc.campaign.key) return doc.campaign.key;
  const slug = doc.campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const year = (doc.slots[0]?.date ?? new Date().toISOString()).slice(0, 4);
  return `${slug}-${year}`;
}

export function windowFor(doc: PlanDocument): { start: string; end: string } {
  if (doc.campaign.window) return doc.campaign.window;
  const days = doc.slots.map((s) => s.date).filter((d) => DAY_RE.test(d)).sort();
  if (!days.length) throw new Error("a plan needs a window or at least one dated slot");
  return { start: days[0], end: days[days.length - 1] };
}

export type ImportResult = { key: string; inserted: number; updated: number; skipped: number };

/**
 * Write a plan document. Upserts the plan by key and each slot by (day, seq);
 * a slot that already exists is updated in place — its comments and its
 * removed status are KEPT, because an agent re-sending the plan must not undo
 * what the founder decided on the desk.
 */
export async function importPlan(doc: PlanDocument, by: string): Promise<ImportResult> {
  if (!doc?.campaign?.name) throw new Error("campaign.name is required");
  if (!Array.isArray(doc.slots)) throw new Error("slots must be an array");
  const rows = doc.slots.map((s, i) => normaliseDocumentSlot(s, i));
  // Duplicate keys inside one document are the author's mistake, not a merge.
  const seen = new Set<string>();
  for (const r of rows) {
    const k = `${r.day_key}#${r.seq}`;
    if (seen.has(k)) throw new Error(`two slots share ${k} — give one a different seq`);
    seen.add(k);
  }
  assertDistinctStoryDesigns(rows);
  if (hasServiceRole()) {
    const saved = await designSequenceSlots();
    const byDay = new Map(saved.map(s => [`${s.day_key}#${s.seq}`, s]));
    const touched = new Set<string>();
    for (const r of rows) {
      const k = `${r.day_key}#${r.seq}`; const old = byDay.get(k);
      if (old?.status === "removed") continue;
      const next = { ...r, id: old?.id, published: old?.published };
      byDay.set(k, next); touched.add(designSlotKey(next));
    }
    assertDesignSequence([...byDay.values()], touched);
  }
  // Library reels: no film twice, no two voiced reels of one language back to
  // back — checked against the whole calendar as it would stand afterwards.
  if (hasServiceRole()) {
    const after = await reelSequenceAfterImport(rows, (doc.campaign.status ?? "live") === "live");
    assertReelSequence(after, new Set(rows.map((r) => `${r.day_key}#${r.seq}`)));
  }

  const key = planKeyFor(doc);
  const window = windowFor(doc);
  const sb = serviceClient();
  const now = new Date().toISOString();

  const { error: pErr } = await sb.from("marketing_plans").upsert(
    {
      key,
      name: doc.campaign.name,
      big_idea: doc.campaign.big_idea ?? null,
      why_now: doc.campaign.why_now ?? null,
      grid_system: doc.campaign.grid_system ?? null,
      weeks: doc.campaign.weeks ?? [],
      window_start: window.start,
      window_end: window.end,
      status: doc.campaign.status ?? "live",
      source: doc.campaign.source ?? `imported ${now.slice(0, 10)} by ${by}`,
      created_by: by,
      updated_at: now,
    },
    { onConflict: "key" },
  );
  if (pErr) throw new Error(`plan write: ${pErr.message}`);

  const { data: existing, error: eErr } = await sb
    .from("marketing_plan_slots")
    .select("id, plan_key, day_key, seq, status")
    .in("day_key", [...new Set(rows.map((r) => r.day_key))]);
  if (eErr) throw new Error(`slots read: ${eErr.message}`);
  const byKey = importSlotTargets(existing ?? [], key);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  for (const r of rows) {
    const hit = byKey.get(`${r.day_key}#${r.seq}`);
    if (hit?.status === "removed") { skipped++; continue; }
    // A finished frame embedded in the document (base64) becomes a public URL
    // here, on the server, where the storage key lives — so an agent can hand
    // over its own creative without holding any credential. ~500 KB per frame;
    // the route's JSON body carries a six-post opening comfortably.
    const b64 = r.art.image_b64;
    if (typeof b64 === "string" && b64.length) {
      const bytes = Buffer.from(b64.replace(/^data:image\/\w+;base64,/, ""), "base64");
      if (bytes.length > 8_000_000) throw new Error(`slot ${r.day_key}#${r.seq}: embedded frame is over 8 MB — host it and send art.image_url instead`);
      const url = await uploadMedia(`plans/${key}/${r.day_key}_${r.seq}.jpg`, bytes, "image/jpeg");
      r.art = { ...r.art, image_url: url };
      delete r.art.image_b64;
    }
    if (hit) {
      // Everything but status: what the founder set on the desk stays.
      const rest: Partial<typeof r> = { ...r };
      delete rest.status;
      const { error } = await sb
        .from("marketing_plan_slots")
        .update({ ...rest, plan_key: key, updated_at: now })
        .eq("id", hit.id);
      if (error) throw new Error(`slot ${r.day_key}#${r.seq} update: ${error.message}`);
      updated++;
      continue;
    }
    const { error } = await sb.from("marketing_plan_slots").insert({ ...r, plan_key: key });
    if (error) {
      // A removed slot still holds no unique key, so this is a real conflict.
      if (error.code === "23505") {
        skipped++;
        continue;
      }
      throw new Error(`slot ${r.day_key}#${r.seq} insert: ${error.message}`);
    }
    inserted++;
  }
  return { key, inserted, updated, skipped };
}

// ── the Library-reel sequence (reel-sequence.ts) ────────────────────────────

/**
 * The Instagram reel calendar as the sequence rule sees it: every brand reel
 * slot, whether its post already went out, and each Library film's declared
 * language — read from the Library itself, never from the plan, so a language
 * edited later is seen. A slot of a plan that is not live never composes, so
 * it is out of the sequence unless its reel already went out.
 */
export async function reelSequenceSlots(): Promise<ReelSeqSlot[]> {
  if (!hasServiceRole()) return [];
  const sb = serviceClient();
  const [slotsRes, plansRes] = await Promise.all([
    sb.from("marketing_plan_slots")
      .select("id, plan_key, day_key, seq, channel, kind, status, art")
      .eq("kind", "reel")
      .eq("channel", "instagram")
      .not("plan_key", "like", `${PERSONAL_PLAN_PREFIX}%`),
    sb.from("marketing_plans").select("key, status"),
  ]);
  if (slotsRes.error) throw new Error(`reel slots read: ${slotsRes.error.message}`);
  if (plansRes.error) throw new Error(`marketing_plans read: ${plansRes.error.message}`);
  const livePlan = new Set(((plansRes.data ?? []) as { key: string; status: string }[]).filter((p) => p.status === "live").map((p) => p.key));
  const rows = (slotsRes.data ?? []) as Pick<PlanSlot, "id" | "plan_key" | "day_key" | "seq" | "channel" | "kind" | "status" | "art">[];
  const films = await libraryFilms(rows.map((r) => r.art?.library_id).filter((v): v is string => typeof v === "string"));
  const published = new Set<string>();
  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await sb.from("marketing_posts").select("plan_slot_id").in("plan_slot_id", ids.slice(i, i + 100)).eq("status", "published");
    if (error) throw new Error(`reel posts read: ${error.message}`);
    for (const p of data ?? []) published.add(p.plan_slot_id as string);
  }
  return rows.map((r) => {
    const lib = typeof r.art?.library_id === "string" ? (r.art.library_id as string) : null;
    const film = lib ? films.get(lib) : undefined;
    return {
      id: r.id,
      day_key: r.day_key,
      seq: r.seq,
      channel: r.channel,
      kind: r.kind,
      status: livePlan.has(r.plan_key) ? r.status : "removed",
      library_id: lib,
      language: film?.language ?? null,
      title: film?.title ?? null,
      published: published.has(r.id),
    };
  });
}

async function libraryFilms(ids: string[]): Promise<Map<string, { language: FilmLanguage | null; title: string }>> {
  const out = new Map<string, { language: FilmLanguage | null; title: string }>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 100) {
    const { data, error } = await serviceClient().from("marketing_asset_library").select("id, title, language").in("id", unique.slice(i, i + 100));
    if (error) throw new Error(`Library read: ${error.message}`);
    for (const f of data ?? []) out.set(f.id as string, { language: isLanguage(f.language) ? f.language : null, title: String(f.title ?? "") });
  }
  return out;
}

/** The reel calendar as it would stand after an import: the document's rows
 *  take the (day, seq) they name, keeping a status the desk already set. */
async function reelSequenceAfterImport(rows: ReturnType<typeof normaliseDocumentSlot>[], planLive: boolean): Promise<ReelSeqSlot[]> {
  const byKey = new Map((await reelSequenceSlots()).map((s) => [`${s.day_key}#${s.seq}`, s]));
  const incoming = rows.filter((r) => r.channel === "instagram" && r.kind === "reel");
  const films = await libraryFilms(incoming.map((r) => r.art?.library_id).filter((v): v is string => typeof v === "string"));
  for (const r of incoming) {
    const k = `${r.day_key}#${r.seq}`;
    const hit = byKey.get(k);
    const lib = typeof r.art?.library_id === "string" ? (r.art.library_id as string) : null;
    const film = lib ? films.get(lib) : undefined;
    const status = hit && hit.status !== "removed" ? hit.status : r.status;
    byKey.set(k, {
      id: hit?.id,
      day_key: r.day_key,
      seq: r.seq,
      channel: r.channel,
      kind: r.kind,
      status: planLive ? status : "removed",
      library_id: lib,
      language: film?.language ?? null,
      title: film?.title ?? null,
      published: hit?.published,
    });
  }
  return [...byKey.values()];
}


/** All brand drafts/live plans plus publication history. Date filtering here
 * would make a duplicate outside the current desk window disappear. */
export async function designSequenceSlots(): Promise<DesignSlot[]> {
  if (!hasServiceRole()) throw new Error("Design sequence cannot be verified without the publishing database");
  const sb = serviceClient();
  const {data: plans, error: pe} = await sb.from("marketing_plans").select("key,status");
  if (pe) throw new Error(`design sequence plans: ${pe.message}`);
  const active = new Set((plans ?? []).filter(p=>["draft","live"].includes(p.status)).map(p=>p.key));
  const slots: (DesignSlot & {id:string;plan_key:string})[] = [];
  for (let start=0;;start+=1000) {
    const {data,error} = await sb.from("marketing_plan_slots").select("id,plan_key,day_key,seq,channel,kind,status,handle,art")
      .eq("channel","instagram").not("plan_key","like",`${PERSONAL_PLAN_PREFIX}%`).order("id").range(start,start+999);
    if(error) throw new Error(`design sequence slots: ${error.message}`);
    slots.push(...(data ?? []) as typeof slots); if((data?.length ?? 0)<1000) break;
  }
  const published = new Map<string, string | null>();
  const orphans: DesignSlot[] = [];
  for (let start=0;;start+=1000) {
    const {data,error} = await sb.from("marketing_posts").select("id,plan_slot_id,slot_key,format,product_handle")
      .eq("channel","instagram").eq("status","published").or(`plan_key.is.null,plan_key.not.like.${PERSONAL_PLAN_PREFIX}%`).order("id").range(start,start+999);
    if(error) throw new Error(`design sequence receipts: ${error.message}`);
    for(const p of data ?? []) {
      if(p.plan_slot_id) published.set(p.plan_slot_id,p.product_handle);
      else orphans.push({id:`post:${p.id}`,day_key:p.slot_key.split("#")[0],seq:parseInt(p.slot_key.split("#")[1])||0,channel:"instagram",kind:p.format,status:"planned",handle:p.product_handle,published:true});
    }
    if((data?.length ?? 0)<1000) break;
  }
  return [...slots.filter(s=>active.has(s.plan_key)||published.has(s.id)).map(s=>({...s,handle:published.get(s.id) ?? s.handle,published:published.has(s.id)})),...orphans];
}
export async function designSequenceCheck(): Promise<DesignViolation[]> {
  return designSequenceViolations(await designSequenceSlots());
}
async function assertDesignChange(slot: PlanSlot): Promise<void> {
  if(slot.channel !== "instagram" || isPersonalPlan(slot.plan_key)) return;
  const rows = (await designSequenceSlots()).filter(s=>s.id!==slot.id);
  rows.push(slot); assertDesignSequence(rows,new Set([slot.id]));
}
export async function designSequenceHold(slotId: string): Promise<string | null> {
  try { return (await designSequenceCheck()).find(v=>v.slot===slotId)?.reason ?? null; }
  catch(e) { return `Design sequence could not be verified: ${(e as Error).message}`; }
}


/** A removed row has a partial unique key and therefore would not conflict
 * with INSERT. Preserve that removal explicitly when the same plan returns. */
export function importSlotTargets<T extends {id:string;plan_key:string;day_key:string;seq:number;status:string}>(rows:T[], planKey:string):Map<string,T> {
  const relevant=rows.filter(r=>r.status!=="removed" || r.plan_key===planKey);
  return new Map(relevant.sort((a,b)=>Number(a.status!=="removed")-Number(b.status!=="removed")).map(r=>[`${r.day_key}#${r.seq}`,r]));
}


/** Every design already given a format on Instagram (published history and
 *  every active plan), keyed "format:handle" → the slots (day#seq) holding it.
 *  The cadence picks around these, so it cannot propose a repeat the
 *  design-sequence rule would then hold. */
export async function loadDesignsUsedByFormat(): Promise<Map<string, Set<string>>> {
  return designsUsedByFormat(await designSequenceSlots());
}

/**
 * The plan item a daily-cadence post is composed from (see cadence.ts).
 * Creates the `daily-cadence` plan if it is missing — never overwriting it, so
 * an archived cadence stays archived — then the item for this day and seq.
 * Returns null, composing nothing, when the founder removed this item or an
 * authored plan already holds the day#seq.
 */
/** Designs the day has already refused (a skipped or failed cadence row), by
 *  day — see cadenceRejections. Read for the compose window so the cadence
 *  picks past them instead of re-offering the same picture. */
export async function loadCadenceRejections(from: string, to: string): Promise<Map<string, Set<string>>> {
  if (!hasServiceRole()) return new Map();
  const { data, error } = await serviceClient()
    .from("marketing_posts")
    .select("slot_key, plan_key, status, product_handle")
    .in("status", ["skipped", "failed"])
    .gte("slot_key", `${from}#`)
    .lt("slot_key", `${nextDay(to)}#`);
  if (error) throw new Error(`cadence rejections read: ${error.message}`);
  return cadenceRejections((data ?? []) as CadenceLedgerRow[]);
}

export async function ensureCadencePlanSlot(input: {
  slotKey: string; kind: CadenceKind; beat?: string | null; handle: string; title: string;
}): Promise<{ id: string } | { held: string }> {
  if (!hasServiceRole()) return { held: "The cadence plan cannot be written without the publishing database." };
  const sb = serviceClient();
  const { error: planError } = await sb.from("marketing_plans").upsert(CADENCE_PLAN, { onConflict: "key", ignoreDuplicates: true });
  if (planError) throw new Error(`daily-cadence plan: ${planError.message}`);
  const row = cadenceSlotRow(input);
  const { data: existing, error } = await sb.from("marketing_plan_slots")
    .select("id, plan_key, status")
    .eq("day_key", row.day_key).eq("seq", row.seq);
  if (error) throw new Error(`daily-cadence slot read: ${error.message}`);
  const rows = (existing ?? []) as { id: string; plan_key: string; status: string }[];
  const live = rows.find((r) => r.status !== "removed");
  if (live && live.plan_key !== CADENCE_KEY) return { held: `${input.slotKey} belongs to the ${live.plan_key} plan.` };
  if (!live && rows.some((r) => r.plan_key === CADENCE_KEY)) return { held: `The founder removed ${input.slotKey} from the daily cadence.` };
  if (live) {
    const { error: upd } = await sb.from("marketing_plan_slots")
      .update({ kind: row.kind, beat: row.beat, handle: row.handle, title: row.title, updated_at: new Date().toISOString() })
      .eq("id", live.id);
    if (upd) throw new Error(`daily-cadence slot update: ${upd.message}`);
    return { id: live.id };
  }
  const { data: made, error: ins } = await sb.from("marketing_plan_slots").insert(row).select("id").single();
  if (ins) throw new Error(`daily-cadence slot insert: ${ins.message}`);
  return { id: (made as { id: string }).id };
}
