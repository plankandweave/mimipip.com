import { designSequenceHold } from "./plan";
import {approvalMedia} from "./digest-web";
import {LAYOUT_VERSION,type LayoutAsset,type LayoutReceipt} from "./layout-check";
import { needsPlanItem, PLAN_REQUIRED } from "./review-readiness";
import { cadenceComposeOrder, cadenceComposes, cadenceRowNeedsRedraw, isPlanlessCadenceRow } from "./cadence";
import { INSTAGRAM_KEYS, instagramKeySet } from "./providers/copy";
import {composeMeasuredStillRemote, composeMeasuredStoryRemote, renderMeasuredReelRemote} from "../media-client";
import { verifyLayoutFiles } from "./layout-verify";
import { productionHold } from "./production-readiness";
import { publishTimeHold } from "./publish-time";
import { finishedCarouselUrls } from "./finished-carousel";
import { ahimsaCarouselSources } from "./ahimsa-carousel";
import {preparedCarouselIdea,preparedCarouselReviewLocked,preparedCarouselCompletedState,withPreparedCarouselLease} from './prepared-carousel';
import { isPersonalPlan } from "./profiles";
import { slotFrameTextProblem } from "./frame-text";
// The orchestrator: turn one planned slot into a real, published (or queued)
// Instagram post, and record it in the ledger. This is what the cron calls.
//
//   select → caption (safety-gated) → compose media → upload → ledger(queued)
//          → publish if channel configured → ledger(published|failed)
//
// Idempotency: each slot has a stable slot_key. Before doing work we check the
// ledger; a slot already published is skipped, so re-running the cron (or a
// retry) never double-posts.

import { CADENCE_KEY, planSlots, type Selection } from "./select";
import { createHash, randomUUID } from "node:crypto";
import { logicalDayKey } from "../dailyRotation";
import { slotDigest } from "./digest";
import { generateCaption } from "./caption";
import { checkCaption, autoCorrect, type SafetyResult } from "./safety";
// Stills and carousels compose in the media container now (sharp cannot run
// on workerd). renderReel stays imported from its module: its remote branch
// (REEL_WORKER_URL → the container) does the HTTP itself, and the module-scope
// sharp import resolves to the Workers build's throwing stub, which is only
// dangerous to USE — the remote branch never touches it.
import { composeStillRemote, composeCarouselRemote, composePlateRemote, probeVideoRemote, imageMetaRemote } from "../media-client";
import { renderReel } from "./media/reel";
import { publisherFor, type PublishRequest } from "./publish";
import { youtubeCaption, youtubeTwinKey } from "./youtube-twin";
import { libraryVideoForSlot, recordLibraryPost } from "./library-publish";
import { recentInstagramMedia, type LiveMedia } from "./publish/instagram";
import { isStale, judgeClaim } from "./publish/reconcile";
import { serviceClient, uploadMedia, hasServiceRole } from "./db";
import { learnedSignals } from "./insights";
import { CANVAS, type MediaKind } from "./media/types";
import { PALETTE } from "./media/brand";
import { MAT_BY_COLLECTION, englishName, matFor } from "./media/mats";
import { linkedInCommercial, linkedInRevise } from "./channels";
import { ensureCadencePlanSlot, ideaReadyArt, nextDay, planSlotById, promoteIdea, readyIdeaSlots, reelSequenceSlots, slotKeyOf, type PlanSlot } from "./plan";
import { describeViolation, reelSequenceViolations, type ReelViolation } from "./reel-sequence";
import { loadCandidates, selectionFromPlanSlot, registerSceneChooser } from "./select";
import { isRetiredStoryFrame, storyFramePath } from "./story-frame";

// select.ts assigns each slot its chapter position and needs to know which
// room a slot will lead on, to keep the next sibling off it — but it cannot
// import this module (pipeline imports select). Registering these two pure
// helpers keeps the dependency one-way.
registerSceneChooser(chooseLeadScene, roomOfScene);

// Which media format each pillar posts as.
const PILLAR_FORMAT: Record<string, MediaKind> = {
  reveal: "reel",
  room_story: "carousel",
  // (see SCENE_ROOM below for the room-name → filename matching this map's
  //  siblings rely on when a slot names the room it is about)
  founders_favourite: "feed",
  the_zyvorah_way: "feed",
  collection_story: "carousel",
  feature: "feed",
  agentic_story: "feed",
};

const BADGE_FOR = (sel: Selection) => {
  const c = sel.candidate;
  if (c.isFoundersFavourite) return { label: "Founder's Favourite", bg: PALETTE.blush };
  if (c.isSignature) return { label: "Signature", bg: PALETTE.lavender };
  return undefined;
};

export type SlotOutcome = {
  slotKey: string;
  handle: string;
  pillar: string;
  format: MediaKind;
  safetyPassed: boolean;
  status: "published" | "queued" | "failed" | "skipped";
  externalId?: string;
  url?: string;
  error?: string;
};

/**
 * Room names a plan slot may ask for (`art.scene`), and the filename fragments
 * that identify that room in a product's renders. The catalogue names its
 * scenes after the room — "…-Pooja-room.png", "scene-entryway.png" — so the
 * room a picture shows is knowable without looking at it, which is what makes
 * the refusal in composeSlot cheap and reliable.
 *
 * Deliberately NOT a fuzzy match: "entrance" must not quietly settle for
 * "Reception-lobby". A commercial reception under a caption about welcoming
 * guests into a home is the same failure in a politer disguise.
 */
const SCENE_ROOM: Record<string, string[]> = {
  pooja: ["pooja-room", "puja-room", "scene-pooja"],
  entrance: ["entrance-foyer", "scene-entryway", "entryway"],
  living: ["living-room", "scene-living"],
  bedroom: ["master-bedroom", "bedroom", "scene-bedroom"],
  dining: ["dining", "fine-dining"],
  bar: ["bar"],
  passage: ["passage", "stairway", "corridor", "breakout"],
  library: ["library", "reading-corner"],
  nursery: ["nursery", "playroom", "kids"],
  // Not a bare "spa": that matched "play-SPAce", so a kids' play space could
  // front a spa story. "spa" must end the word (spa. spa- spa@).
  spa: ["wellness", "spa.", "spa-", "spa@", "gym"],
  cafe: ["caf", "cafeteria", "pantry", "restaurant"],
  retail: ["fitting", "trial-room", "boutique", "jewellery"],
  office: ["scene-office", "home-office", "boardroom", "workstations", "meeting", "conference", "phone-booth", "focus-pod"],
  // The corporate floor only — no home office. LinkedIn's workplace stories
  // (founder, 26 Sep 2026) are about a team's floor, and "office" above
  // includes a study at home. Same fragments otherwise, so an existing slot
  // naming "office" composes exactly as before.
  workplace: ["scene-office", "boardroom", "workstation", "meeting", "conference", "phone-booth", "focus-pod", "corpoffice", "corporate", "open-office", "breakout"],
  hotel: ["hotel-lobby", "reception-lobby", "office-reception"],
};

/**
 * What KIND of space each room is. A chapter that shows three sofas has made
 * one argument three times — the founder, 25 Sep 2026: "in the Calm
 * collection, all three sofas… there should be three different settings
 * always. One of them should be residential, and one maybe a hotel or a
 * restaurant." A living room and a bedroom are two rooms but one idea (this is
 * somebody's home), so a chapter rotates across CATEGORIES, not just rooms.
 */
const ROOM_CATEGORY: Record<string, "home" | "public" | "work" | "sacred"> = {
  living: "home",
  bedroom: "home",
  nursery: "home",
  entrance: "home",
  passage: "home",
  library: "home",
  pooja: "sacred",
  hotel: "public",
  cafe: "public",
  dining: "public",
  bar: "public",
  spa: "public",
  retail: "public",
  office: "work",
  workplace: "work",
};

/** Which room a render shows, from its filename. Null when it says nothing. */
export function roomOfScene(url: string): string | null {
  const u = url.toLowerCase();
  // Longest fragment wins, so "master-bedroom" beats "bedroom" and
  // "office-reception" (a hotel front desk) is never read as an office.
  let best: { room: string; len: number } | null = null;
  for (const [room, frags] of Object.entries(SCENE_ROOM)) {
    for (const f of frags) {
      if (u.includes(f) && (!best || f.length > best.len)) best = { room, len: f.length };
    }
  }
  return best?.room ?? null;
}

/**
 * The lead render for one slot in a chapter. Two failures this ends, both seen
 * on the desk on 25 September 2026:
 *
 *  1. SAMENESS. A design's first render is nearly always its living room, so a
 *     week of three designs composed as a week of three sofas.
 *  2. A ROOM THE DESIGN DOES NOT BELONG IN. A ceremonial bull mural led on a
 *     bedroom. A design the studio rendered for a pooja room was rendered that
 *     way deliberately, and that intent outranks file order.
 *
 * So a devotional render always leads when the design has one; otherwise the
 * chapter rotates categories by the slot's position and avoids rooms its
 * siblings already used. Deterministic: the same plan always composes the same.
 */
export function chooseLeadScene(
  sceneUrls: string[],
  opts: { chapterIndex?: number; usedRooms?: string[]; avoidUrls?: string[] } = {},
): string | null {
  if (!sceneUrls.length) return null;
  const used = new Set(opts.usedRooms ?? []);
  // NEVER THE SAME PICTURE TWICE (founder, 26 Sep 2026: "it can be the same
  // wallpaper, but it should be another display of it… never the same image
  // in two stories"). A design may legitimately come round again inside a
  // chapter; the IMAGE may not. Exhausting a design's own renders is the
  // signal to move to another design, not to repeat a frame.
  const avoid = new Set(opts.avoidUrls ?? []);
  const pool = sceneUrls.filter((u) => !avoid.has(u));
  if (!pool.length) return null;
  sceneUrls = pool;
  const withRoom = sceneUrls.map((url) => ({ url, room: roomOfScene(url) }));

  const sacred = withRoom.find((x) => x.room && ROOM_CATEGORY[x.room] === "sacred");
  if (sacred) return sacred.url;

  const order: ("home" | "public" | "work")[] = ["home", "public", "work"];
  const start = (((opts.chapterIndex ?? 0) % order.length) + order.length) % order.length;
  for (let i = 0; i < order.length; i++) {
    const want = order[(start + i) % order.length];
    const fresh = withRoom.filter((x) => x.room && ROOM_CATEGORY[x.room] === want && !used.has(x.room));
    if (fresh.length) return fresh[0].url;
  }
  return withRoom.find((x) => x.room && !used.has(x.room))?.url ?? sceneUrls[0];
}

/** Does this render's URL show `room`? Filename-based; see SCENE_ROOM. */
export function sceneMatchesRoom(url: string, room: string): boolean {
  const frags = SCENE_ROOM[room.toLowerCase()];
  if (!frags) return false;
  const u = url.toLowerCase();
  return frags.some((f) => u.includes(f));
}

/**
 * What the founder's notes on a slot ask the composer to DO.
 *
 * Until 25 Sep 2026 a note was stored and never read: "ask for a variation"
 * superseded the frame and composed the identical one again, and the founder
 * concluded, correctly, that the desk ignored her. The notes are hers — plain
 * language, not parameters — so this maps the plain language onto the
 * composition controls the pipeline already has, deterministically:
 *
 *   - the picture is cut off / should be central  → crop from the centre
 *   - show it in <room>                            → that room's render (via
 *     SCENE_ROOM; a room the design has no render for still refuses loudly)
 *   - closer / detail / the artwork itself        → the detail beat
 *   - a different design / some other wallpaper   → HOLD. Swapping the product
 *     is a curation decision, not a crop; composing the same design again
 *     would ignore her, and guessing a replacement would decide for her.
 *   - anything else                               → carried into the caption
 *     writer as an instruction that must be honoured
 *
 * Deterministic on purpose: a mapping she can predict beats a model that
 * usually understands her. Everything acted on is written back to the slot
 * (art.acted_on_notes) so the desk can say what was done.
 */
export type NoteDirectives = {
  position?: "centre";
  scene?: string;
  detail?: boolean;
  hold?: string;
  captionNote?: string;
  acted: string[];
};

export function directivesFromNotes(notes: string[]): NoteDirectives {
  const d: NoteDirectives = { acted: [] };
  const captionNotes: string[] = [];
  for (const note of notes) {
    const n = note.toLowerCase();
    if (/different (wallpaper|design)|another design|other wallpaper|change the (design|wallpaper)|some other design/.test(n)) {
      d.hold = note;
      d.acted.push(note);
      continue;
    }
    let actedOn = false;
    if (/cut ?off|cropped|central|centre|center|whole|full (mural|wall|view)|not.*cut/.test(n)) {
      d.position = "centre";
      actedOn = true;
    }
    // Words only: filename fragments like "spa." / "spa@" are for matching
    // render URLs, and as regex source their "." would read "span" as spa.
    const room = Object.keys(SCENE_ROOM).find((r) =>
      new RegExp(
        `\\b(${[r, ...SCENE_ROOM[r].filter((f) => /^[a-z-]+$/.test(f))].join("|").replace(/-/g, "[ -]?")})\\b`,
      ).test(n),
    );
    if (/show|in the|room|see it/.test(n) && room) {
      d.scene = room;
      actedOn = true;
    }
    if (/closer|close.?up|detail|macro|artwork itself|the drawing/.test(n)) {
      d.detail = true;
      actedOn = true;
    }
    if (actedOn) d.acted.push(note);
    else captionNotes.push(note);
  }
  if (captionNotes.length) {
    d.captionNote = captionNotes.join(" · ");
    d.acted.push(...captionNotes);
  }
  return d;
}

/**
 * The accounts a collection is posted WITH, from `marketing_collaborators`.
 *
 * This read an environment variable first. Nobody set it, so every post went
 * out with no collaborator and no error for a day — the founder, 27 September
 * 2026: "Marketing collab, I don't see it run." A rule that depends on a
 * secret somebody remembered to set is not a rule, and an invisible one
 * cannot be checked. A partner is a ROW now, like every other decision in
 * this engine that costs something or changes what the world sees.
 *
 * Cached for the life of a compose/publish run: a week of Taash posts must
 * not be a week of identical queries.
 */
let collabCache: { at: number; map: Map<string, string[]> } | null = null;
const COLLAB_TTL_MS = 60_000;

export async function collaboratorMap(): Promise<Map<string, string[]>> {
  if (collabCache && Date.now() - collabCache.at < COLLAB_TTL_MS) return collabCache.map;
  const map = new Map<string, string[]>();
  if (hasServiceRole()) {
    const { data } = await serviceClient()
      .from("marketing_collaborators")
      .select("collection, handle")
      .eq("enabled", true);
    for (const row of (data ?? []) as { collection: string; handle: string }[]) {
      const key = row.collection.trim().toLowerCase();
      const handle = row.handle.trim().replace(/^@/, "");
      if (!key || !handle) continue;
      map.set(key, [...(map.get(key) ?? []), handle]);
    }
  }
  collabCache = { at: Date.now(), map };
  return map;
}

/** The collaborators for one collection, or none. */
export async function collaboratorsForCollection(collection: string | null | undefined): Promise<string[]> {
  const key = (collection ?? "").trim().toLowerCase();
  if (!key) return [];
  return (await collaboratorMap()).get(key) ?? [];
}

/** The collaborators for one slot's collection, or none. */
export async function collaboratorsFor(sel: Selection): Promise<string[]> {
  return collaboratorsForCollection(sel.campaign?.collection);
}

/**
 * The mention line a collaborated post carries in its caption.
 *
 * The Instagram collab invite puts the post on their grid, but it is invisible
 * on the desk and absent from a Story, which takes no collaborator at all. The
 * mention is the half that always works and that the founder can SEE before
 * she approves — so it is appended to the caption, once, and never twice.
 */
export function withMentions(caption: string, handles: string[]): string {
  if (!handles.length) return caption;
  const missing = handles.filter((h) => !new RegExp(`@${h}\\b`, "i").test(caption));
  if (!missing.length) return caption;
  return `${caption.trimEnd()}\n\nWith ${missing.map((h) => `@${h}`).join(" and ")}.`;
}

/** Has this slot already been published/queued? (idempotency)
 *
 *  A slot the founder marked for regeneration in the Monday review is NOT done:
 *  the whole point of that mark is "not this one, try again". The tower cannot
 *  recompose anything itself — composition needs the catalogue, Sharp, the
 *  safety gate and the render worker — so it marks and this honours, keeping one
 *  composer rather than two.
 *
 *  The database forbids marking an already-approved slot, so this cannot
 *  regenerate underneath an approval the founder has signed.
 *
 *  'skipped' counts as done, and only the approval board ever writes it. The
 *  engine returns "skipped" as an outcome but never stores it, so a stored
 *  'skipped' means exactly one thing: the founder rejected this slot. Without
 *  it, rejecting a post would quietly recompose the same day and "reject" would
 *  be indistinguishable from "regenerate" — which is the other button. */
async function alreadyDone(slotKey: string): Promise<boolean> {
  if (!hasServiceRole()) return false;
  const sb = serviceClient();
  const { data } = await sb
    .from("marketing_posts")
    .select("id,status,format,media_urls,thumbnail_url,approved_at,regenerate_requested_at,channel,plan_key,plan_slot_id")
    .eq("slot_key", slotKey)
    .in("status", ["published", "queued", "approved", "skipped"])
    .is("regenerate_requested_at", null)
    .limit(1);
  const row = data?.[0];
  if (!row) return false;
  // A skipped DAILY-CADENCE row is not a settled day. The founder's doctrine
  // is a post every day; her rejection of a cadence picture (or a hold
  // written on the row by hand, 10–15 October 2026) means "not this design",
  // and the day is composed again past it — see cadenceRejections. "Remove"
  // on the desk still retires the slot: ensureCadencePlanSlot holds it.
  if (row.status === "skipped" && row.plan_key === CADENCE_KEY) return false;
  // An unsigned Story still in a retired frame is not done: the frame changed
  // after it was drawn, and it is drawn again rather than offered for review
  // (see story-frame.ts). A signed one is left alone — she approved it.
  if (row.status === "queued" && !row.approved_at && isRetiredStoryFrame(row)) return false;
  // Likewise a cadence post drawn before it had a plan item: no check can
  // pass it, so it is redrawn in place (writeSlotRow updates the same row).
  if (isPlanlessCadenceRow(row)) return false;
  // Nor is a cadence post whose plan item's receipt vouches for another
  // picture: the review gate would hold it for ever, so it is drawn again in
  // place (cadenceRowNeedsRedraw). One plan read per unsigned cadence row.
  if (row.plan_key === CADENCE_KEY && row.plan_slot_id && row.status === "queued" && !row.approved_at) {
    const slot = await planSlotById(row.plan_slot_id).catch(() => null);
    if (slot && cadenceRowNeedsRedraw(row, slot.art)) return false;
  }
  return true;
}

/** The room renders a plan slot names for a reel (`art.scene_urls`): the
 *  engine renders the motion itself — full-bleed push-ins over the named
 *  rooms — instead of depending on delivered footage. Http URLs only. */
function sceneUrlsFromArt(art: Record<string, unknown> | undefined): string[] {
  const raw = art?.scene_urls;
  if (!Array.isArray(raw)) return [];
  return raw.filter((u): u is string => typeof u === "string" && u.startsWith("http"));
}

/**
 * The founder's saved framing for a slot (the desk's grid-frame tool writes
 * art.zoom / art.focus_x / art.focus_y). Undefined when she has not framed it —
 * the composer's own defaults then apply. zoom 1 with a focus still matters:
 * it slides the cover window across the picture without magnifying.
 */
function cropFromArt(
  art: Record<string, unknown> | undefined,
): { zoom: number; x: number; y: number } | undefined {
  if (!art) return undefined;
  if (art.zoom == null && art.focus_x == null && art.focus_y == null) return undefined;
  return {
    zoom: Math.min(6, Math.max(1, Number(art.zoom ?? 1))),
    x: Math.min(1, Math.max(0, Number(art.focus_x ?? 0.5))),
    y: Math.min(1, Math.max(0, Number(art.focus_y ?? 0.5))),
  };
}

/** Story assets are immutable at the CDN and in browsers. Put the rendered
 * pixels in the key so a repaired frame cannot resolve to a cached old one. */
async function uploadStoryFrame(base: string, frame: Buffer): Promise<string> {
  const digest = createHash("sha256").update(frame).digest("hex").slice(0, 16);
  return uploadMedia(storyFramePath(`${base}_${digest}.jpg`), frame, "image/jpeg");
}

/** One measured grid still: the house frame drawn and measured in the media
 *  container, uploaded under its content hash, with the receipt review reads. */
async function measuredFeedStill(
  source: string, title: string, kicker: string, base: string,
  opts: { sub?: string; crop?: { zoom: number; x?: number; y?: number } },
): Promise<{ urls: string[]; thumbnailUrl: string; layoutReceipt: LayoutReceipt }> {
  const { bytes, frame } = await composeMeasuredStillRemote(source, title, kicker, opts);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const url = await uploadMedia(`feed/measured/${base}_${sha256.slice(0, 16)}.jpg`, bytes, "image/jpeg");
  return { urls: [url], thumbnailUrl: url, layoutReceipt: { version: LAYOUT_VERSION, assets: [{ url, sha256, frames: [frame] }] } };
}

/** Compose + upload the media for a slot, returning public URLs + poster. */
async function buildMedia(
  sel: Selection,
  format: MediaKind,
): Promise<{ urls: string[]; thumbnailUrl?: string; layoutReceipt?:LayoutReceipt }> {
  const c = sel.candidate;
  // NO PRICE ON A PICTURE (founder, 26 Sep 2026: "I don't want to add a price
  // ever on any story"). The frames are museum labels — name, provenance,
  // meaning. A price belongs in the caption, where it can be read as an
  // answer, not stamped across someone's room as a claim.
  const sub = undefined;
  const spec = { title: c.title, sub, badge: BADGE_FOR(sel) };
  const stamp = sel.slotKey.replace(/[#]/g, "_");
  const base = `${c.handle}/${stamp}`;

  if (format === "carousel") {
    const delivered = finishedCarouselUrls(sel.campaign?.art);
    if (delivered) {
      for (const url of delivered) {
        const meta = await imageMetaRemote({ url });
        if (meta.width !== 1080 || meta.height !== 1350) {
          throw new Error("Finished carousel slides must each be 1080×1350; the delivered sequence was not replaced.");
        }
      }
      const urls:string[]=[], assets:LayoutAsset[]=[];
      for(const [i,url] of delivered.entries()){
        const {bytes,frame}=await composeMeasuredStillRemote(url,c.title,sel.campaign?.collection??undefined);
        const sha256=createHash("sha256").update(bytes).digest("hex");
        const finalUrl=await uploadMedia(`carousels/branded/${base}_${i}_${sha256.slice(0,16)}.jpg`,bytes,"image/jpeg");
        urls.push(finalUrl);assets.push({url:finalUrl,sha256,frames:[frame]});
      }
      return {urls,thumbnailUrl:urls[0],layoutReceipt:{version:LAYOUT_VERSION,assets}};
    }
  }

  if (format === "carousel" && sel.campaign?.art?.native_ahimsa_carousel_sources !== undefined) {
    const frames = ahimsaCarouselSources(sel.campaign.art.native_ahimsa_carousel_sources);
    if (frames[0].handle !== c.handle) throw new Error("AHIMSA first slide must match the actual cover design");
    const catalogue = new Map((await loadCandidates()).map(p => [p.handle, p]));
    for (const frame of frames) {
      if (catalogue.get(frame.handle)?.flatUrl !== frame.image_url) throw new Error(`AHIMSA source no longer matches the active catalogue: ${frame.handle}`);
      const meta = await imageMetaRemote({ url: frame.image_url });
      if (meta.width !== frame.width || meta.height !== frame.height) throw new Error(`AHIMSA source geometry changed: ${frame.handle}`);
    }
    const urls: string[] = [];
    for (const [i, frame] of frames.entries()) {
      const jpeg = await composeStillRemote(frame.image_url, 1080, 720, { title: "", wordmark: false, text: "none", position: "centre", preserveSource: true });
      urls.push(await uploadMedia(`carousels/ahimsa-native/${base}_${i}.jpg`, jpeg, "image/jpeg"));
    }
    return { urls };
  }

  // A plan slot carries a BEAT, and the three beats are three different
  // frames. Until this existed the engine composed the same framed catalogue
  // still for "the room", "the close-up" and "the name" alike — and the
  // founder, correctly, rejected all of them.
  // A FINISHED frame from the plan: the strategy session's own creative (a
  // hospitality concept, a workplace story — things no catalogue render can
  // supply). Already a public URL, already the final image; posted as-is. The
  // caption still passes the brand-safety gate and the approval still signs
  // exactly this picture — the seatbelts are on the words and the decision,
  // not on who drew the frame.
  // The founder's notes as composition directives. Hold is decided in runSlot
  // BEFORE this is called; here the notes steer the frame itself.
  const noteDirectives = directivesFromNotes(sel.campaign?.notes ?? []);

  // The room this slot is ABOUT, if it named one. Read at function scope
  // because both the single still and the carousel have to honour it — a
  // carousel that opened on an arbitrary render would bring back the exact
  // caption/picture mismatch the guard exists to stop. A note ("show it in the
  // bedroom") outranks the plan's own art direction: it is newer and it is hers.
  const wantRoom =
    noteDirectives.scene ??
    (typeof sel.campaign?.art?.scene === "string" ? (sel.campaign.art.scene as string) : null);

  if (sel.campaign) {
    const finished = sel.campaign.art?.image_url;
    // A Library film goes out as itself or not at all: its checks throw with
    // the reason, and a refused probe below is a refusal, never a fallback.
    const libraryId = typeof sel.campaign.art?.library_id === "string" ? (sel.campaign.art.library_id as string) : null;
    if (libraryId && format !== "reel") throw new Error(`a Library film posts as a reel, not a ${format}`);
    const video = libraryId ? await libraryVideoForSlot(libraryId) : sel.campaign.art?.video_url;
    if ((format === "reel" || format === "story") && typeof video === "string" && video.startsWith("http")) {
      if (format === "story" && isRetiredStoryFrame({ format, media_urls: [video] })) {
        throw new Error("Story video needs a fresh visual review in the current frame; an old supplied video cannot bypass the Story branding rules.");
      }
      // THE FULL-BLEED GATE. A delivered video plays full-screen 9:16, so its
      // frames must BE the picture. On 25 Sep 2026 "Taash, in three moves"
      // shipped as a slideshow of 4:5 editorial cards floating on a beige
      // ground — the poster was a full-bleed room and the video was mostly
      // margin, with cross-dissolves melting one card's type into the next
      // (the founder: "totally off the grid"). Probe the middle frame; a
      // page-style video is refused, and the slot falls back to what the
      // engine CAN make full-bleed: a rendered reel from art.scene_urls, or
      // the editorial Story from the finished image. A probe that cannot run
      // (an old container) passes rather than blocking every delivery.
      const probe = await probeVideoRemote(video).catch((e) => {
        console.warn(`video probe unavailable for ${sel.slotKey}: ${(e as Error).message}`);
        return null;
      });
      if (!probe || probe.coverage >= 0.55) {
        return { urls: [video], thumbnailUrl: typeof sel.campaign.art?.reel_cover_url === "string" ? sel.campaign.art.reel_cover_url : typeof finished === "string" ? finished : undefined };
      }
      const pct = Math.round(probe.coverage * 100);
      if (libraryId) {
        throw new Error(`the Library film is not full-bleed (only ${pct}% of the frame is picture) — it was not posted, and nothing was posted in its place`);
      }
      const planScenes = sceneUrlsFromArt(sel.campaign.art);
      const fallbackWorks =
        (format === "reel" && (planScenes.length || c.sceneUrls.length)) ||
        (format === "story" && typeof finished === "string" && finished.startsWith("http"));
      if (!fallbackWorks) {
        throw new Error(
          `the delivered ${format} video is a page layout, not full-bleed (only ${pct}% of the frame is picture) — ` +
            `deliver full-bleed 9:16 footage, or name the room renders in art.scene_urls and the engine renders the motion itself`,
        );
      }
      console.warn(`refusing delivered ${format} video for ${sel.slotKey} (${pct}% picture) — composing full-bleed instead`);
      // fall through: the reel branch renders from scenes, the story branch
      // composes the editorial page from the finished frame.
    }
    if (format !== "reel" && typeof finished === "string" && finished.startsWith("http")) {
      // A finished FEED frame posts as-is — it is the final image. A finished
      // frame on a STORY slot is usually source material, not a Story: a
      // landscape room render posted raw into a 9:16 surface is the letterbox
      // the founder rejected, so it goes through the editorial page. But a
      // frame DESIGNED for the Story surface (already 9:16, like the
      // chapters' own story pages) is the final artwork — running it through
      // the editorial page again would stack a second kicker and title over
      // the one it already carries.
      if (format === "story") {
        // Never layer new words over an old finished frame: baked branding
        // cannot be removed that way. Catalogue artwork is unbranded source;
        // every other delivery must already have the current frame provenance.
        const source = new URL(finished);
        const catalogueSource = ["zyvorah.com", "media.zyvorah.com"].includes(source.hostname)
          && /\/(?:media\/)?product-images\//.test(source.pathname);
        if (!catalogueSource && isRetiredStoryFrame({ format, media_urls: [finished] })) {
          throw new Error("Supplied Story frame is retired. Redraw from the exact catalogue scene or upload a corrected frame for fresh visual approval.");
        }
        const meta = await imageMetaRemote({ url: finished }).catch(() => null);
        const storyShaped =
          !!meta?.width && !!meta?.height && Math.abs(meta.width / meta.height - CANVAS.story.w / CANVAS.story.h) < 0.06;
        if (storyShaped && !catalogueSource) return { urls: [finished] };
        const still = await composeStillRemote(finished, CANVAS.story.w, CANVAS.story.h, {
          layout: "editorial-story",
          title: sel.campaign.title ?? c.title,
          kicker: sel.campaign.collection ? `Zyvorah · ${sel.campaign.collection}` : "Zyvorah",
          line: sel.campaign.hook ?? sel.campaign.caption?.split("\n")[0] ?? undefined,
        });
        return { urls: [await uploadStoryFrame(base, still)] };
      }
      return { urls: [finished] };
    }
  }

  if (sel.campaign && format !== "reel" && format !== "carousel") {
    const camp = sel.campaign;
    const art = camp.art ?? {};
    const title = camp.title ?? c.title;
    // ROOM. A chapter is about a room — "The Puja Room", "The Welcome" — and
    // sceneUrls[0] is merely the design's FEATURED render, which is a different
    // question entirely. On 25 Sep 2026 that gap put a home office under a puja
    // caption, a boardroom under an entrance caption and a framed gallery print
    // in a wallpaper chapter: the words said one thing and the picture another,
    // and nothing failed. So a slot may NAME the room (art.scene), and we pick
    // the render whose filename is that room — or refuse the slot outright.
    // Refusing is the point: a design with no render in the chapter's room does
    // not belong in the chapter, and silence is what produced the bad grid.
    // The exact render the founder framed on the desk (art.scene_url, written
    // beside her zoom/focus). Pinned by URL, not re-derived: the grid-frame
    // tool showed her ONE picture, and the frame she saved must apply to that
    // picture — a chapter re-pick underneath it would crop a different room
    // with her coordinates. A note naming a room is newer and still wins.
    const pinnedScene =
      typeof art.scene_url === "string" && c.sceneUrls.includes(art.scene_url) && !noteDirectives.scene
        ? (art.scene_url as string)
        : null;
    const roomScene =
      pinnedScene ??
      (wantRoom ? c.sceneUrls.find((u) => sceneMatchesRoom(u, wantRoom)) ?? null : null);
    if (wantRoom && !roomScene) {
      throw new Error(
        `slot asks for a "${wantRoom}" render of ${c.handle}, which has none — ` +
          `pick a design that does, or drop it from this chapter`,
      );
    }
    // No named room: choose one that suits the design and that this chapter has
    // not already shown — never simply the first render, which is what made a
    // week come out as three sofas.
    const scene =
      roomScene ??
      chooseLeadScene(c.sceneUrls, {
        chapterIndex: camp.chapterIndex ?? 0,
        usedRooms: camp.chapterRooms ?? [],
        avoidUrls: camp.avoidUrls ?? [],
      }) ??
      c.flatUrl;
    const flat = c.flatUrl ?? c.sceneUrls[0];
    const priceLine = undefined; // design and collection identify the picture
    const mat = (art.mat as string | undefined) ?? MAT_BY_COLLECTION[camp.collection] ?? "ink";
    const whole = art.detail_mode === "whole";
    // "Closer / show the detail" in a note turns a wall post into the detail
    // beat — the macro of the artwork — without touching the plan row.
    const beat = noteDirectives.detail && camp.beat === "wall" ? "detail" : camp.beat;
    const folder = sel.channel === "linkedin" ? "linkedin" : "feed";

    if (camp.kind === "story" || format === "story") {
      // fullbleed-editorial-v2 (founder, 25 Sep 2026): the image bleeds to the
      // frame's edges and the words live in a serif type block — a designed
      // page, never the old centred letterbox. The compositor picks the page
      // shape from the source's own aspect and keeps the floor in every crop.
      if (!scene) throw new Error("story: no artwork for this design");
      if (camp.key === CADENCE_KEY) {
        // The daily cadence's Story: the measured portrait frame, so it
        // carries the layout receipt review checks (cadence.ts).
        const { bytes, frame } = await composeMeasuredStoryRemote(scene, {
          title, sub: "sized to your wall", kicker: camp.collection ? `Zyvorah · ${camp.collection}` : "Zyvorah",
        });
        const url = await uploadStoryFrame(base, bytes);
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        return { urls: [url], layoutReceipt: { version: LAYOUT_VERSION, assets: [{ url, sha256, frames: [frame] }] } };
      }
      const still = await composeStillRemote(scene, CANVAS.story.w, CANVAS.story.h, {
        layout: "editorial-story",
        title,
        kicker: camp.collection ? `Zyvorah · ${camp.collection}` : "Zyvorah",
        line: camp.hook ?? camp.caption?.split("\n")[0] ?? undefined,
        fit: whole ? "contain" : "cover",
        ground: matFor(mat).ground,
      });
      return { urls: [await uploadStoryFrame(base, still)] };
    }

    if (beat === "launch") {
      const plate = await composePlateRemote({
        w: CANVAS.feed.w,
        h: CANVAS.feed.h,
        word: (art.word as string | undefined) ?? title,
        title: camp.hook ?? "",
        mat,
      });
      return { urls: [await uploadMedia(`plates/${base}.jpg`, plate, "image/jpeg")] };
    }

    if (beat === "word") {
      const plate = await composePlateRemote({
        w: CANVAS.feed.w,
        h: CANVAS.feed.h,
        title: englishName(title),
        devanagari: camp.devanagari ?? undefined,
        meaning: camp.meaning ?? undefined,
        kicker: camp.collection || undefined,
        mat,
        bandUrl: flat ?? undefined,
      });
      return { urls: [await uploadMedia(`plates/${base}.jpg`, plate, "image/jpeg")] };
    }

    // An Instagram grid still carries its measured layout receipt, or review
    // refuses it ("Layout check failed"). The measured compositor draws the
    // same house frame and measures the overlay it drew.
    const measured = format === "feed" && sel.channel !== "linkedin";
    const kicker = camp.collection ? `Zyvorah · ${camp.collection}` : "Zyvorah";

    if (beat === "detail" && measured && !whole) {
      if (!flat) throw new Error("detail: no flat artwork for this design");
      return measuredFeedStill(flat, title, kicker, base, {
        sub: "up close",
        crop: { zoom: Number(art.zoom ?? 2.4), x: Number(art.focus_x ?? 0.5), y: Number(art.focus_y ?? 0.45) },
      });
    }

    if (beat === "detail") {
      if (!flat) throw new Error("detail: no flat artwork for this design");
      const still = whole
        ? await composeStillRemote(flat, CANVAS.feed.w, CANVAS.feed.h, {
            title,
            sub: "the artwork, whole",
            fit: "contain",
            ground: matFor(mat).ground,
          })
        : await composeStillRemote(flat, CANVAS.feed.w, CANVAS.feed.h, {
            title,
            sub: "up close",
            crop: { zoom: Number(art.zoom ?? 2.4), x: Number(art.focus_x ?? 0.5), y: Number(art.focus_y ?? 0.45) },
          });
      return { urls: [await uploadMedia(`${folder}/${base}.jpg`, still, "image/jpeg")] };
    }

    // wall (and LinkedIn, which carries the room): the design in a real room.
    // "centre", not sharp's attention heuristic — the render is a composed
    // picture with the mural placed deliberately, and the crop's job is to
    // keep that composition rather than rediscover a subject of its own.
    // A framing the founder saved on the desk (art.zoom/focus) outranks both.
    if (!scene) throw new Error("wall: no room render or flat for this design");
    if (measured) return measuredFeedStill(scene, title, kicker, base, { sub: priceLine, crop: cropFromArt(art) });
    const still = await composeStillRemote(scene, CANVAS.feed.w, CANVAS.feed.h, {
      title,
      sub: priceLine,
      kicker: camp.collection ? `Zyvorah · ${camp.collection}` : "Zyvorah",
      position: "centre",
      crop: cropFromArt(art),
    });
    return { urls: [await uploadMedia(`${folder}/${base}.jpg`, still, "image/jpeg")] };
  }

  if (format === "reel") {
    // The scenes, in order of authority: the rooms the plan itself names
    // (art.scene_urls — this is how a chapter reel like "Taash, in three
    // moves" spans three designs), then the design's own catalogue renders,
    // then the finished frame, then the flat. A plate slot with none of these
    // has nothing to film and fails with that said.
    const planScenes = sceneUrlsFromArt(sel.campaign?.art);
    const finishedFrame = sel.campaign?.art?.image_url;
    const scenes = planScenes.length
      ? planScenes
      : c.sceneUrls.length
        ? c.sceneUrls
        : typeof finishedFrame === "string" && finishedFrame.startsWith("http")
          ? [finishedFrame]
          : c.flatUrl
            ? [c.flatUrl]
            : [];
    if (!scenes.length) throw new Error("reel: no scenes — name the room renders in art.scene_urls");
    const title = sel.campaign?.title ?? c.title;
    // `||`, not `??`: the cadence's collection is "" and an empty line is
    // not a line (measuredSub, media/reel.ts).
    const reelSub = sel.campaign ? (sel.campaign.hook || sel.campaign.collection || sub) : sub;
    const reelKicker = sel.campaign?.collection ? `Zyvorah · ${sel.campaign.collection}` : "Zyvorah";
    if (sel.channel !== "linkedin") {
      // Instagram review needs the measured house frame on the film AND on
      // its profile cover (layout-check.ts); both are drawn and measured in
      // the media container and uploaded under their content hash.
      const r = await renderMeasuredReelRemote(scenes, { title, sub: reelSub, kicker: reelKicker });
      const sha = createHash("sha256").update(r.video).digest("hex");
      const coverSha = createHash("sha256").update(r.cover).digest("hex");
      const url = await uploadMedia(`reels/measured/${base}_${sha.slice(0, 16)}.mp4`, r.video, "video/mp4");
      const coverUrl = await uploadMedia(`reels/measured/${base}_${coverSha.slice(0, 16)}_cover.jpg`, r.cover, "image/jpeg");
      return {
        urls: [url],
        thumbnailUrl: coverUrl,
        layoutReceipt: { version: LAYOUT_VERSION, assets: [
          { url, sha256: sha, frames: [r.frame] },
          { url: coverUrl, sha256: coverSha, frames: [r.coverFrame] },
        ] },
      };
    }
    const mp4 = await renderReel(scenes, { title, sub: reelSub, kicker: reelKicker });
    const url = await uploadMedia(`reels/${base}.mp4`, mp4, "video/mp4");
    // Poster = a framed still of the opening scene (this is also the frame the
    // grid tile shows, so it and the video now open on the same picture).
    const poster = await composeStillRemote(scenes[0], CANVAS.feed.w, CANVAS.feed.h, {
      ...spec,
      title,
      ...(sel.campaign?.collection ? { kicker: `Zyvorah · ${sel.campaign.collection}` } : {}),
      position: "centre",
    });
    const posterUrl = await uploadMedia(`reels/${base}_poster.jpg`, poster, "image/jpeg");
    return { urls: [url], thumbnailUrl: posterUrl };
  }

  if (format === "carousel") {
    // The room a chapter names leads the swipe; the design's other rooms follow
    // as the variations, and the flat closes it. A carousel that opened on an
    // arbitrary render would reintroduce the caption/picture mismatch the room
    // guard exists to stop.
    const pinnedLead =
      sel.campaign &&
      !noteDirectives.scene &&
      typeof sel.campaign.art?.scene_url === "string" &&
      c.sceneUrls.includes(sel.campaign.art.scene_url as string)
        ? (sel.campaign.art.scene_url as string)
        : undefined;
    const lead =
      pinnedLead ??
      (wantRoom
        ? c.sceneUrls.find((u) => sceneMatchesRoom(u, wantRoom))
        : chooseLeadScene(c.sceneUrls, {
            chapterIndex: sel.campaign?.chapterIndex ?? 0,
            usedRooms: sel.campaign?.chapterRooms ?? [],
          }) ?? undefined);
    const ordered = lead ? [lead, ...c.sceneUrls.filter((u) => u !== lead)] : c.sceneUrls;
    const scenes = ordered.length ? ordered : [c.flatUrl!];
    if (sel.channel !== "linkedin") {
      // Instagram review needs every slide in the measured house frame
      // (layout-check.ts); the composite swipe has no receipt and is held.
      // Up to five rooms, the founder's framing on the cover; the artwork
      // closes the swipe when there is more than one room, as before.
      const title = sel.campaign?.title ?? c.title;
      const kicker = sel.campaign?.collection ? `Zyvorah · ${sel.campaign.collection}` : "Zyvorah";
      const sources = [...scenes.slice(0, 5), ...(ordered.length >= 2 && c.flatUrl ? [c.flatUrl] : [])];
      const urls: string[] = [];
      const assets: LayoutAsset[] = [];
      for (const [i, source] of sources.entries()) {
        const isFlat = source === c.flatUrl && i > 0;
        const { bytes, frame } = await composeMeasuredStillRemote(source, title, kicker, {
          sub: isFlat ? "the artwork" : "sized to your wall",
          crop: i === 0 ? cropFromArt(sel.campaign?.art) : undefined,
        });
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        const url = await uploadMedia(`carousels/measured/${base}_${i}_${sha256.slice(0, 16)}.jpg`, bytes, "image/jpeg");
        urls.push(url);
        assets.push({ url, sha256, frames: [frame] });
      }
      return { urls, thumbnailUrl: urls[0], layoutReceipt: { version: LAYOUT_VERSION, assets } };
    }
    const slides = await composeCarouselRemote(scenes, {
      ...spec,
      // The founder's saved framing applies to the hero slide — the one the
      // grid shows; the quiet scene slides keep their own centred cover.
      crop: cropFromArt(sel.campaign?.art),
      // Only when there are rooms to swipe through — a carousel of one room and
      // a flat is a single post wearing a swipe.
      flatUrl: ordered.length >= 2 ? (c.flatUrl ?? undefined) : undefined,
      // The artwork slide sits on its collection's named mat, like every other
      // plate the brand draws — not on a default grey.
      ground: matFor(
        (sel.campaign?.collection && MAT_BY_COLLECTION[sel.campaign.collection]) || "ink",
      ).ground,
    });
    const urls: string[] = [];
    for (let i = 0; i < slides.length; i++) {
      urls.push(await uploadMedia(`carousels/${base}_${i}.jpg`, slides[i], "image/jpeg"));
    }
    return { urls };
  }

  // Unplanned/rotation Stories use the same current frame as planned ones.
  if (format === "story") {
    const still = await composeStillRemote(c.sceneUrls[0] ?? c.flatUrl!, CANVAS.story.w, CANVAS.story.h, {
      ...spec, layout: "editorial-story",
    });
    return { urls: [await uploadStoryFrame(base, still)] };
  }
  // Feed single still.
  const still = await composeStillRemote(c.sceneUrls[0] ?? c.flatUrl!, CANVAS.feed.w, CANVAS.feed.h, spec);
  const url = await uploadMedia(`feed/${base}.jpg`, still, "image/jpeg");
  return { urls: [url] };
}

/** THE SLOT BUDGET. On 12 October 2026 three compose runs in a row wedged on
 *  one reel — each for the full half hour until cron-health declared the run
 *  dead — and nothing behind it was drawn. A per-request deadline on the media
 *  client was not enough: the third run stuck somewhere before the render.
 *  So every slot now runs against ONE wall-clock budget for the whole of its
 *  work (caption, render, upload, write). A slot that overruns is recorded as
 *  a failed row naming the stage it was in (the cadence re-picks the design),
 *  and the run moves on to the next slot. */
export const SLOT_BUDGET_MS: Record<MediaKind, number> = { feed: 150_000, story: 150_000, carousel: 300_000, reel: 330_000 };
/** The most a slot of this format may take before runSlot records it as timed out. */
export const slotBudgetMs = (format: MediaKind): number => SLOT_BUDGET_MS[format] ?? 150_000;

export async function runSlot(sel: Selection): Promise<SlotOutcome> {
  const format = (sel.campaign?.format ?? PILLAR_FORMAT[sel.pillar] ?? "feed") as MediaKind;
  const budget = slotBudgetMs(format);
  const stage = { at: "start" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const overrun = new Promise<SlotOutcome>((resolve) => {
    timer = setTimeout(async () => {
      const error = `timed out after ${Math.round(budget / 1000)}s at: ${stage.at}`;
      await recordFailure(sel, format, "", null, error).catch(() => {});
      resolve({ slotKey: sel.slotKey, handle: sel.candidate.handle, pillar: sel.pillar, format, safetyPassed: false, status: "failed", error });
    }, budget);
  });
  try {
    return await Promise.race([runSlotInner(sel, stage), overrun]);
  } finally {
    clearTimeout(timer);
  }
}

/** Process a single planned slot end-to-end (see runSlot for the budget). */
async function runSlotInner(sel: Selection, stage: { at: string } = { at: "start" }): Promise<SlotOutcome> {
  if (isPersonalPlan(sel.campaign?.key)) throw new Error("Personal creative is authored separately; the brand composer cannot run it.");
  // A campaign slot fixes its own format (the calendar's art direction), so the
  // pillar-to-format table only decides the rotation's own posts.
  const format = sel.campaign?.format ?? PILLAR_FORMAT[sel.pillar] ?? "feed";
  const c = sel.candidate;
  const outcome: SlotOutcome = {
    slotKey: sel.slotKey,
    handle: c.handle,
    pillar: sel.pillar,
    format,
    safetyPassed: false,
    status: "failed",
  };

  const readiness = sel.campaign ? productionHold({ title: sel.campaign.title, kind: format, art: sel.campaign.art }) : null;
  if (readiness) return { ...outcome, status: "failed", error: readiness };

  if (sel.campaign?.key === CADENCE_KEY && !cadenceComposes(sel.campaign.kind)) {
    return { ...outcome, status: "skipped", error: `the daily cadence does not compose ${sel.campaign.kind ?? "this kind"}` };
  }

  // A compose run may have selected cadence slots before an authored Story
  // was approved or published. Check the ledger again before doing any work:
  // an archived plan's published Story still occupies a place in this day.
  if (sel.campaign?.key === CADENCE_KEY && format === "story" && hasServiceRole()) {
    const dayKey = sel.slotKey.split("#")[0];
    const sb = serviceClient();
    const { data: active, error } = await sb.from("marketing_posts")
      .select("slot_key")
      .gte("slot_key", `${dayKey}#`)
      .lt("slot_key", `${nextDay(dayKey)}#`)
      .eq("channel", "instagram")
      .eq("format", "story")
      .in("status", ["queued", "published"]);
    if (error) throw new Error(`Story cadence ledger read: ${error.message}`);
    if ((active ?? []).length >= 4 && !(active ?? []).some((post) => post.slot_key === sel.slotKey)) {
      await sb.from("marketing_posts").update({ status: "superseded" })
        .eq("slot_key", sel.slotKey).eq("status", "failed");
      return { ...outcome, status: "skipped" };
    }
  }

  // Only an explicit authored plan slot may take over an old rotation row.
  // Cadence selections also carry `campaign`, but their candidate can vary
  // between runs; allowing one to supersede a queued row made the desk flip
  // repeatedly between unrelated designs and overwrite repaired Story URLs.
  if (sel.campaign?.planSlotId && hasServiceRole()) {
    const sb = serviceClient();
    const { data: live } = await sb
      .from("marketing_posts")
      .select("id, product_handle, plan_slot_id, approved_at")
      .eq("slot_key", sel.slotKey)
      .neq("status", "superseded")
      .is("regenerate_requested_at", null)
      .maybeSingle();
    if (live && !live.approved_at && !live.plan_slot_id && live.product_handle !== c.handle) {
      await sb.from("marketing_posts").update({ status: "superseded" }).eq("id", live.id);
    }
  }

  stage.at = "checking the ledger";
  if (await alreadyDone(sel.slotKey)) return { ...outcome, status: "skipped" };
  // A cadence day composed again past a refused design keeps the refusal on
  // record: the skipped or failed row is superseded, not overwritten, and the
  // new design gets a row of its own (writeSlotRow would otherwise update the
  // refused row in place and lose why it was refused).
  if (sel.campaign?.key === CADENCE_KEY && hasServiceRole()) {
    const sb = serviceClient();
    const { data: refused, error } = await sb.from("marketing_posts")
      .select("id, product_handle")
      .eq("slot_key", sel.slotKey)
      .in("status", ["skipped", "failed"])
      .is("approved_at", null);
    if (error) throw new Error(`cadence refusal read: ${error.message}`);
    for (const r of refused ?? []) {
      if ((r.product_handle ?? "").toLowerCase() === c.handle.toLowerCase()) continue;
      const { error: sup } = await sb.from("marketing_posts").update({ status: "superseded" }).eq("id", r.id);
      if (sup) throw new Error(`cadence refusal supersede: ${sup.message}`);
    }
  }
  // A cadence post is composed from a plan item of its own, made here — after
  // alreadyDone, so a settled day never gains one (see cadence.ts). Its
  // caption is written by the model on Instagram's own key; with no key the
  // day waits untouched rather than being recorded as a failure.
  if (sel.campaign?.key === CADENCE_KEY && !instagramKeySet()) {
    return { ...outcome, status: "skipped", error: `waiting for an Instagram caption key (${INSTAGRAM_KEYS.anthropic})` };
  }
  if (sel.campaign?.key === CADENCE_KEY && !sel.campaign.planSlotId) {
    const item = await ensureCadencePlanSlot({
      slotKey: sel.slotKey, kind: sel.campaign.kind ?? "feed", beat: sel.campaign.beat,
      handle: c.handle, title: sel.campaign.title ?? c.title,
    });
    if ("held" in item) return { ...outcome, status: "skipped", error: item.held };
    sel = { ...sel, campaign: { ...sel.campaign, planSlotId: item.id } };
  }
  // Review, approval and the publisher all refuse an Instagram row with no
  // measured plan item, so rendering one only spends a render on a post that
  // can never be offered to the founder (see needsPlanItem).
  if (needsPlanItem(sel.channel, sel.campaign?.planSlotId)) return { ...outcome, status: "skipped", error: PLAN_REQUIRED };
  if(sel.channel !== "linkedin" && sel.campaign?.planSlotId) {
    const sequenceError = await designSequenceHold(sel.campaign.planSlotId);
    if(sequenceError) return {...outcome,status:"failed",error:sequenceError};
  }

  // The headline, line and kicker are printed on the picture; the caption
  // gate never reads them. A working note there is refused before any render
  // (see frame-text.ts) — and recorded, so the desk says why.
  const frameProblem = sel.campaign ? slotFrameTextProblem(sel.campaign) : null;
  if (frameProblem) {
    await recordFailure(sel, format, sel.campaign?.caption ?? "", [], `frame text: ${frameProblem}`);
    return { ...outcome, error: `frame text: ${frameProblem}` };
  }

  // 1) Caption (safety-gated inside).
  //
  // This was the one step in runSlot that could THROW rather than record. Every
  // other failure here calls recordFailure and returns; a caption that could not
  // be generated at all escaped, and on 2026-08-28 an exhausted API credit
  // balance therefore aborted an entire week-ahead run and wrote nothing to the
  // ledger — the run existed only as a 500 in the cron heartbeat.
  //
  // Note the distinction kept below: a caption that FAILS THE SAFETY GATE is a
  // judgement about content and is the system working. A caption that could not
  // be written is infrastructure — an expired key, no credit, a rate limit — and
  // says nothing about the design. Recording both as plain "failed" would make a
  // billing problem look like seven brand-safety problems.
  // A campaign slot carries approved copy — post it verbatim, but still through
  // the same brand-safety gate (a hand-written caption is not exempt from the
  // seatbelt). Only the rotation's own posts call the model, so a spent API
  // credit can never stop the campaign from composing.
  // The founder's notes, read BEFORE any work. A note that needs her decision
  // holds the slot with the reason on the tile; a note about the words sends
  // even hand-written campaign copy back through the writer with her note as
  // the instruction. Composing the identical frame under an unread note is the
  // failure this exists to end (25 Sep 2026).
  const notes = directivesFromNotes(sel.campaign?.notes ?? []);
  if (notes.hold) {
    const why = `needs your decision — "${notes.hold}" asks for a different design, which only you can choose. Change the design on this slot, then Compose again.`;
    await recordFailure(sel, format, "", null, why);
    return { ...outcome, status: "failed", error: why };
  }

  stage.at = "writing the caption";
  let gen: { caption: string; safety: SafetyResult };
  // A Story posts no caption, so a note on one is never sent to the caption
  // writer: that is how "this is the old format" came back as the same frame
  // with a feed caption, "link in bio" and hashtags under it (30 Sep 2026).
  // The note steers the frame instead (buildMedia reads the same notes).
  if (format === "story" && (sel.campaign?.key === CADENCE_KEY || !sel.campaign?.caption)) {
    // Instagram Stories carry no posted caption. Asking the model to invent
    // one blocked otherwise valid frames when its credits ran out, and put
    // unreviewed claims in the desk's "Story text" field. Keep a short,
    // factual ledger description so the same safety gate still runs.
    const caption = "Explore Zyvorah mural wallpaper designs at zyvorah.com.";
    gen = { caption, safety: checkCaption(caption) };
  } else if (sel.campaign && sel.campaign.caption && (!notes.captionNote || format === "story")) {
    const caption = autoCorrect(sel.campaign.caption);
    gen = { caption, safety: checkCaption(caption, { fromPrice: c.fromPrice ?? undefined, channel: sel.channel }) };
  } else if (sel.campaign && sel.campaign.caption && notes.captionNote) {
    // Her note is about the words: rewrite the existing copy around it rather
    // than posting the copy she already asked to change. A LinkedIn post is
    // rewritten in the LinkedIn voice — the Instagram writer adds "link in bio".
    try {
      if (sel.channel === "linkedin") {
        const li = await linkedInRevise(sel.campaign.caption, notes.captionNote, c.fromPrice != null ? c : undefined);
        gen = { caption: li.text, safety: li.safety };
      } else {
        gen = await generateCaption(sel, undefined, 3, {
          original: sel.campaign.caption,
          note: notes.captionNote,
        });
      }
    } catch (e) {
      const why = (e as Error).message ?? String(e);
      await recordFailure(sel, format, "", null, `caption rewrite unavailable: ${why}`);
      return { ...outcome, status: "failed", error: `caption rewrite unavailable: ${why}` };
    }
  } else if (sel.channel === "linkedin") {
    // A LinkedIn slot the plan left without copy: the commercial lane writes it.
    try {
      const li = await linkedInCommercial(c);
      gen = { caption: li.text, safety: li.safety };
    } catch (e) {
      const why = (e as Error).message ?? String(e);
      await recordFailure(sel, format, "", null, `caption unavailable: ${why}`);
      return { ...outcome, status: "failed", error: `caption unavailable: ${why}` };
    }
  } else {
    try {
      gen = await generateCaption(sel);
    } catch (e) {
      const why = (e as Error).message ?? String(e);
      await recordFailure(sel, format, "", null, `caption unavailable: ${why}`);
      return { ...outcome, status: "failed", error: `caption unavailable: ${why}` };
    }
  }
  if (format === "story") {
    // Stories have no posted caption, but their review text and any line
    // derived from it should not revive the retired wallpaper-only sign-off.
    const caption = gen.caption.replace(/\s*Wallpaper only\.(?=\s|$)/gi, "").replace(/([?!])\./g, "$1").trim();
    gen = { caption, safety: checkCaption(caption, { fromPrice: c.fromPrice ?? undefined }) };
  }
  outcome.safetyPassed = gen.safety.ok;
  if (!gen.safety.ok) {
    await recordFailure(sel, format, gen.caption, gen.safety.issues, "caption failed safety gate");
    return { ...outcome, status: "failed", error: "caption failed safety gate" };
  }

  // 2) Media — only if we can persist it (need a public URL to publish).
  if (!hasServiceRole()) {
    // Dry mode: no storage → we can still report what WOULD post.
    return { ...outcome, status: "queued", error: "no service role — media not persisted (dry run)" };
  }

  stage.at = `rendering the ${format}`;
  let media: { urls: string[]; thumbnailUrl?: string; layoutReceipt?:LayoutReceipt };
  // A reel needs ffmpeg, which is absent from the Vercel serverless runtime.
  // reel.ts already documents the intended behaviour — "if ffmpeg is missing,
  // renderReel throws and the pipeline falls back to a still/carousel for the
  // slot" — but that fallback was never implemented, so the slot failed
  // outright. Downgrade once to a still, which needs only Sharp.
  let effectiveFormat: MediaKind = format;
  try {
    media = await buildMedia(sel, format);
  } catch (e) {
    const first = (e as Error).message;
    // A Library film is never downgraded to a still: it fails with its reason.
    if (format !== "reel" || !!sel.campaign?.planSlotId || typeof sel.campaign?.art?.library_id === "string") {
      await recordFailure(sel, format, gen.caption, gen.safety.issues, `media: ${first}`);
      return { ...outcome, status: "failed", error: `media: ${first}` };
    }
    try {
      media = await buildMedia(sel, "feed");
      effectiveFormat = "feed";
      outcome.format = "feed";
      console.warn(`reel unavailable for ${sel.slotKey}, posted as a still: ${first}`);
    } catch (e2) {
      const second = (e2 as Error).message;
      await recordFailure(
        sel, format, gen.caption, gen.safety.issues,
        `media: ${first}; still fallback also failed: ${second}`,
      );
      return { ...outcome, status: "failed", error: `media: ${first}` };
    }
  }

  // 3) Ledger row (queued) — the audit record exists before we attempt to post.
  const sb = serviceClient();

  // If this slot is being recomposed at the founder's request, retire the row
  // they rejected. Marked rather than deleted: the review should be able to show
  // that a slot WAS rejected and why, not silently present a second attempt as
  // though the first never happened.
  await sb
    .from("marketing_posts")
    .update({ status: "superseded" })
    .eq("slot_key", sel.slotKey)
    .not("regenerate_requested_at", "is", null)
    .neq("status", "superseded");
  // The mentions join the caption before it is stored, so the founder reviews
  // and signs exactly what posts — not a caption that grows a line later.
  const collabs = await collaboratorsFor(sel);
  gen = { ...gen, caption: withMentions(gen.caption, collabs) };

  if(media.layoutReceipt && sel.campaign?.planSlotId){
    const {data:latest,error:readError}=await sb.from("marketing_plan_slots").select("art").eq("id",sel.campaign.planSlotId).single();
    if(readError)throw readError;
    const {error}=await sb.from("marketing_plan_slots").update({art:{...latest.art,brand_layout:LAYOUT_VERSION,layout_receipt:media.layoutReceipt}}).eq("id",sel.campaign.planSlotId);
    if(error)throw error;
  }
  stage.at = "recording the post";
  await writeSlotRow(sel, {
    channel: sel.channel ?? "instagram",
    format: effectiveFormat,
    pillar: sel.pillar,
    product_handle: c.handle,
    caption: gen.caption,
    media_urls: media.urls,
    thumbnail_url: media.thumbnailUrl ?? null,
    status: "queued",
    safety_passed: true,
    safety_issues: gen.safety.issues,
    error: null,
    plan_slot_id: sel.campaign?.planSlotId ?? null,
    plan_key: sel.campaign?.key ?? null,
    // Reels only: the daily cadence reel posts off the profile grid.
    share_to_feed: sel.shareToFeed !== false,
  });

  // What her notes changed, written back to the slot so the desk can say
  // "acted on your note" next to the new frame instead of leaving her to
  // guess whether anyone read it.
  if (notes.acted.length && sel.campaign?.planSlotId) {
    // A render just saved its measured receipt. Merge the current art, not
    // the pre-render selection, or acting on a note discards that receipt.
    // Resolve what was acted on, so an old note stops steering every future
    // compose. A held note (a design swap) is NOT acted and stays open until
    // the design is actually changed.
    const { data: slotRow } = await sb
      .from("marketing_plan_slots")
      .select("comments,art")
      .eq("id", sel.campaign.planSlotId)
      .maybeSingle();
    const art = { ...(slotRow?.art ?? sel.campaign.art ?? {}), acted_on_notes: notes.acted, acted_at: new Date().toISOString() };
    const comments = ((slotRow?.comments as { text?: string; resolved?: boolean }[] | null) ?? []).map((cm) =>
      cm.text && notes.acted.includes(cm.text) ? { ...cm, resolved: true } : cm,
    );
    await sb
      .from("marketing_plan_slots")
      .update({ art, comments, updated_at: new Date().toISOString() })
      .eq("id", sel.campaign.planSlotId);
  }

  // Re-read what is now stored, because whether this publishes depends on the
  // approval already on the row — never on anything this run just decided.
  const { data: row, error: rowErr } = await sb
    .from("marketing_posts")
    .select("id, approved_at, approved_by, approved_digest")
    .eq("slot_key", sel.slotKey)
    .neq("status", "superseded")
    .maybeSingle();
  if (rowErr) throw new Error(`marketing_posts read-back: ${rowErr.message}`);

  // 4) Publish ONLY when the slot carries a weekly approval.
  //
  // Decision D32: organic content is approved by the founder as a weekly batch,
  // reviewed on Monday. A composed slot is queued until then. This check exists
  // BEFORE Instagram credentials do, deliberately — otherwise setting that
  // credential would start autonomous publishing that the founder has said they
  // do not want, and the gate would arrive after the thing it guards.
  //
  // The brand-safety gate above is unchanged and still fails closed. It is a
  // precondition for reaching the founder, not a substitute for them.
  if (!row?.approved_at) {
    return {
      ...outcome,
      status: "queued",
      error: "awaiting approval on the desk",
    };
  }

  // The immediate compose-and-publish path must obey the same exact-file
  // checks as the scheduled publisher, even for a legacy approved row.
  if (sel.channel !== "linkedin") {
    if(!sel.campaign?.planSlotId) return {...outcome,status:"queued",error:"A measured source plan is required before Instagram publication."};
    const planned = await planSlotById(sel.campaign.planSlotId);
    const hold = planned ? productionHold(planned) : "The source plan item is missing.";
    if(hold) return {...outcome,status:"queued",error:hold};
    const layoutError = await verifyLayoutFiles(planned?.art,media.urls,media.thumbnailUrl,true);
    if(layoutError) return {...outcome,status:"queued",error:layoutError};
    const current = slotDigest(gen.caption, approvalMedia({format:effectiveFormat,media_urls:media.urls,thumbnail_url:media.thumbnailUrl ?? null}));
    if(row.approved_digest !== current) return {...outcome,status:"queued",error:"The exact composed files need approval before publication."};
  }

  const ig = publisherFor(sel.channel === "linkedin" ? "linkedin" : "instagram");
  if (!ig.configured) {
    return { ...outcome, status: "queued", url: media.urls[0] };
  }
  // Same Library-reel sequence check as publishApproved: a breach waits.
  if (sel.channel !== "linkedin" && effectiveFormat === "reel") {
    const breach = (await reelSequenceSlots().then(reelSequenceViolations)).find((v) => v.slot === sel.slotKey);
    if (breach) return { ...outcome, status: "queued", error: `reel sequence: ${describeViolation(breach)}` };
  }

  if (sel.channel !== "linkedin" && sel.campaign?.planSlotId) {
    const sequenceError = await designSequenceHold(sel.campaign.planSlotId);
    if(sequenceError) return {...outcome,status:"queued",error:sequenceError};
  }
  const req: PublishRequest = {
    kind: effectiveFormat,
    caption: gen.caption,
    mediaUrls: media.urls,
    thumbnailUrl: media.thumbnailUrl,
    shareToFeed: sel.shareToFeed !== false,
    collaborators: collabs,
  };
  const result = await ig.publish(req);

  await sb
    .from("marketing_posts")
    .update({
      status: result.ok ? "published" : "failed",
      external_id: result.externalId ?? null,
      published_at: result.ok ? new Date().toISOString() : null,
      error: result.ok ? null : result.error ?? null,
    })
    .eq("id", row?.id ?? "");

  return {
    ...outcome,
    status: result.ok ? "published" : "failed",
    externalId: result.externalId,
    url: result.url ?? media.urls[0],
    error: result.ok ? undefined : result.error,
  };
}


/**
 * Write the one LIVE row for a slot — updating it if it exists, inserting if not.
 *
 * Not an upsert, because the unique index is partial (it excludes superseded
 * rows so the regenerate flow can keep what was rejected), and ON CONFLICT
 * cannot target a partial index through this client.
 *
 * AND IT CHECKS THE ERROR. That is the actual lesson of 2026-08-28: every write
 * in this file discarded its result. The success path used insert(), so a slot
 * that had failed could never be updated to succeeded — the retry composed
 * correctly and quietly added a second row. Three days of the first real week
 * showed as broken in the review while the work had in fact succeeded. A write
 * whose failure is unobservable is not a write, it is a hope.
 */
async function writeSlotRow(
  sel: Selection,
  row: Record<string, unknown>,
): Promise<void> {
  const sb = serviceClient();
  const { data: existing, error: readErr } = await sb
    .from("marketing_posts")
    .select("id")
    .eq("slot_key", sel.slotKey)
    .neq("status", "superseded")
    .maybeSingle();
  if (readErr) throw new Error(`marketing_posts read: ${readErr.message}`);

  const { error: writeErr } = existing
    ? await sb.from("marketing_posts").update(row).eq("id", existing.id)
    : await sb.from("marketing_posts").insert({ slot_key: sel.slotKey, ...row });
  if (writeErr) throw new Error(`marketing_posts write: ${writeErr.message}`);
}

async function recordFailure(
  sel: Selection,
  format: MediaKind,
  caption: string,
  issues: unknown,
  error: string,
) {
  if (!hasServiceRole()) return;
  await writeSlotRow(sel, {
    channel: sel.channel ?? "instagram",
    format,
    pillar: sel.pillar,
    product_handle: sel.candidate.handle,
    caption,
    status: "failed",
    safety_passed: false,
    safety_issues: issues,
    error,
    plan_slot_id: sel.campaign?.planSlotId ?? null,
    plan_key: sel.campaign?.key ?? null,
  });
}

/**
 * Compose ONE plan slot now, on demand from the desk — so the founder can see
 * a day's visual before the week-ahead run reaches it, or see it again after
 * a "make it different" note. Past days compose too: whether a missed day
 * posts late is her decision at approval, not the composer's.
 */
export async function composePlanSlot(slotId: string): Promise<SlotOutcome> {
  const ps = await planSlotById(slotId);
  if (!ps) throw new Error("plan slot not found");
  if (isPersonalPlan(ps.plan_key)) throw new Error("Personal creative is authored separately from the brand composer.");
  if (ps.status === "removed") throw new Error("this slot was removed — restore it first");
  const sequenceError = ps.channel === "instagram" ? await designSequenceHold(ps.id) : null;
  if(sequenceError) throw new Error(sequenceError);
  const hold = productionHold(ps);
  if (hold) throw new Error(hold);
  const preparedIdea=preparedCarouselIdea(ps);
  if (ps.kind === "ad") throw new Error("ads are not composed by the organic engine");
  // A finished idea (copy + design or frame) becomes a planned slot on the
  // founder's click, then composes like any other — see ideaReadyArt.
  if (ps.status === "idea" && !preparedIdea) {
    const ready = ideaReadyArt(ps);
    if ("reason" in ready) throw new Error(`this is still an idea — ${ready.reason}`);
    const candidates = await loadCandidates();
    const promotedSel = selectionFromPlanSlot({ ...ps, status: "planned", art: ready.art, handle: ready.handle }, new Map(candidates.map((c) => [c.handle, c])));
    if (!promotedSel) throw new Error(`"${ready.handle}" is not in the postable catalogue`);
    const promoted = await promoteIdea(ps);
    return runSlot(selectionFromPlanSlot(promoted, new Map(candidates.map((c) => [c.handle, c]))) ?? promotedSel);
  }
  const candidates = await loadCandidates();
  const sel = selectionFromPlanSlot(ps, new Map(candidates.map((c) => [c.handle, c])));
  if (!sel) throw new Error(`"${ps.handle}" is not in the postable catalogue`);
  if(!preparedIdea)return runSlot(sel);
  const skipped:SlotOutcome={slotKey:sel.slotKey,handle:sel.candidate.handle,pillar:sel.pillar,format:'carousel',safetyPassed:false,status:'skipped'};
  const sb=serviceClient();
  // A signed or already rendered row is immutable on this first-compose path.
  const {data:signed,error:signedErr}=await sb.from('marketing_posts').select('status,approved_at,regenerate_requested_at').eq('slot_key',sel.slotKey);
  if(signedErr)throw new Error(`prepared carousel approval read: ${signedErr.message}`);
  if(signed?.some(preparedCarouselReviewLocked))return skipped;
  const token=randomUUID();
  let composed:SlotOutcome|undefined;
  const result=await withPreparedCarouselLease(async()=>{
    if(ps.art?.prepared_carousel_compose_token)return false;
    const {data,error}=await sb.from('marketing_plan_slots').update({art:{...ps.art,prepared_carousel_compose_token:token},updated_at:new Date().toISOString()}).eq('id',ps.id).eq('status','idea').eq('updated_at',ps.updated_at).select('id');
    if(error)throw new Error(`prepared carousel claim: ${error.message}`);
    return !!data?.length;
  },async()=>{
    // Note writebacks merge this art; retain the claim until the final review
    // transition, rather than dropping it mid-render when notes are acted on.
    composed=await runSlot({...sel,campaign:sel.campaign?{...sel.campaign,art:{...sel.campaign.art,prepared_carousel_compose_token:token}}:undefined});
    return composed;
  },async()=>{
    const current=await planSlotById(ps.id);
    if(current?.art?.prepared_carousel_compose_token!==token)return;
    const {prepared_carousel_compose_token:_,...art}=current.art;
    const {error}=await sb.from('marketing_plan_slots').update({art,status:preparedCarouselCompletedState(current.status,composed?.status),updated_at:new Date().toISOString()}).eq('id',ps.id).eq('updated_at',current.updated_at).eq('art->>prepared_carousel_compose_token',token);
    if(error)throw new Error(`prepared carousel release: ${error.message}`);
  });
  return result??{...skipped,error:'this carousel is already composing; reload the desk before trying again'};
}

/** Run the next `count` slots (default 1 — one post per cron tick). Folds the
 *  agentic loop's learned signals into what gets picked. */
export type PublishOutcome = {
  slotKey: string;
  status: "published" | "failed" | "held";
  externalId?: string;
  url?: string;
  reason?: string;
};

/**
 * Publish the slots the founder has approved, on the day they are for.
 *
 * THIS IS THE STEP THAT DID NOT EXIST, and without it the whole design was a
 * loop with no exit. runSlot only ever published a slot in the same run that
 * composed it — but composition always writes the row unapproved, so that branch
 * could never be taken. A slot approved afterwards is `queued`, and `queued`
 * counts as already done, so the next day's tick skipped it. Approval had
 * nowhere to go: the founder could approve a week and nothing would ever post.
 *
 * Three refusals, each deliberate:
 *
 *  - Not approved -> not published. The gate, unchanged.
 *  - Not yet its day -> held. Approving Friday's post on Monday approves it FOR
 *    Friday. A weekly batch approval must not collapse the week into one day.
 *  - Content changed since approval -> held, never published. The approver signed
 *    specific words and specific images; if the digest no longer matches, the
 *    approval is for something that no longer exists.
 */
export async function publishApproved(
  today = new Date(),
  opts: { todayOnly?: boolean; timedOnly?: boolean; channels?: ("instagram" | "linkedin" | "youtube")[] } = {},
): Promise<PublishOutcome[]> {
  if (!hasServiceRole()) return [];
  const sb = serviceClient();
  const out: PublishOutcome[] = [];
  const todayKey = logicalDayKey(today);
  let reelBreaches: ReelViolation[] | Error | undefined;

  // Settle interrupted publishes BEFORE claiming anything new — the evidence
  // is Instagram's own record, and a row it proves unposted today is picked
  // up below by the same run.
  if (!opts.channels || opts.channels.includes("instagram")) {
    await reconcileInterrupted(today, todayKey, out).catch((e) =>
      out.push({ slotKey: "reconcile", status: "failed", reason: `could not check interrupted publishes against Instagram: ${(e as Error).message}` }),
    );
  }

  const { data, error } = await sb
    .from("marketing_posts")
    .select("id, plan_key, slot_key, status, channel, format, pillar, product_handle, safety_passed, caption, media_urls, thumbnail_url, approved_at, approved_by, approved_digest, share_to_feed, plan_slot_id")
    // "failed" too, when the failure was Instagram not being ready: the post
    // is approved and nothing about it is wrong, so it is tried again on the
    // next run (same day only — see the day checks below) instead of sitting
    // failed with nobody told.
    // An interrupted publish Instagram proved never landed is retried too.
    .or("status.eq.queued,and(status.eq.failed,error.ilike.*Media ID is not available*),and(status.eq.failed,error.ilike.*not ready within timeout*),and(status.eq.failed,error.ilike.*interrupted mid-publish*)")
    .not("approved_at", "is", null)
    .order("slot_key", { ascending: true });
  if (error) throw new Error(`marketing_posts read: ${error.message}`);

  // Words a frame already carries cannot be changed by holding the caption, so
  // a post whose slot headline is a working note never goes out, approved or
  // not (frame-text.ts). Read once for the whole run.
  const frameNotes = new Map<string, string>();
  const slotIds = [...new Set((data ?? []).map((r) => r.plan_slot_id as string | null).filter((v): v is string => !!v))];
  for (let i = 0; i < slotIds.length; i += 100) {
    const { data: slots, error: sErr } = await sb.from("marketing_plan_slots").select("id, title, hook, collection").in("id", slotIds.slice(i, i + 100));
    if (sErr) throw new Error(`marketing_plan_slots read: ${sErr.message}`);
    for (const sl of slots ?? []) {
      const problem = slotFrameTextProblem(sl as { title: string | null; hook: string | null; collection: string | null });
      if (problem) frameNotes.set(sl.id as string, problem);
    }
  }

  // A hold on TODAY's approved post is written on the row ("held: …") so the
  // review page and the brief can say why an approved post did not go out —
  // for weeks these reasons existed only in this function's return value,
  // which no person ever read. Cleared by the publish write below.
  const byKey = new Map((data ?? []).map((r) => [r.slot_key as string, r]));
  const recordHold = async (slotKey: string, reason: string) => {
    const r = byKey.get(slotKey);
    if (!r || r.channel !== "instagram" || slotKey.split("#")[0] !== todayKey) return;
    await sb.from("marketing_posts").update({ error: `held: ${reason}`.slice(0, 1000) }).eq("id", r.id).then(() => {}, () => {});
  };

  for (const row of data ?? []) {
    const frameNote = row.plan_slot_id ? frameNotes.get(row.plan_slot_id as string) : undefined;
    if (frameNote) {
      out.push({ slotKey: row.slot_key as string, status: "held", reason: `frame text: ${frameNote}` });
      continue;
    }
    if (isPersonalPlan(row.plan_key)) {
      out.push({ slotKey: row.slot_key, status: "held", reason: "Personal account publishing is not connected. Brand credentials cannot publish this post." });
      continue;
    }
    const slotKey = row.slot_key as string;
    const dayKey = slotKey.split("#")[0];
    // The 09:30 IST LinkedIn run publishes LinkedIn only; the 11:30 run takes
    // everything, so a LinkedIn post approved after 09:30 on its own day still
    // goes out that day rather than a day late.
    const rowChannel = (["linkedin", "youtube"] as const).find((c) => c === row.channel) ?? "instagram";
    if (opts.channels && !opts.channels.includes(rowChannel)) continue;
    // A LinkedIn post never goes out after its day. Until the page connection
    // is approved, posts are put up by hand from the desk; the day LinkedIn
    // switches automatic posting on, every approved post from the weeks before
    // would otherwise go out at once, three weeks late.
    if (rowChannel === "linkedin" && dayKey < todayKey) {
      out.push({ slotKey, status: "held", reason: `its day (${dayKey}) has passed — post it by hand from the desk, or move it` });
      continue;
    }

    if (opts.todayOnly && dayKey !== todayKey) continue;
    if (dayKey > todayKey) {
      out.push({ slotKey, status: "held", reason: `approved, waiting for ${dayKey}` });
      continue;
    }
    // A transient failure is retried on its own day only — a Story that
    // missed its day must not surface days later out of sequence.
    if ((row as { status?: string }).status === "failed" && dayKey !== todayKey) continue;

    // Frequent release ticks concern explicit times only; the daily cadence
    // of older rows remains with the existing hourly marketing owner.
    if (opts.timedOnly && !row.plan_slot_id) continue;

    // The Library-reel rule (no film twice, no two voiced reels of one
    // language back to back) is checked against the live calendar before a
    // reel goes out. A breach holds THAT reel, loudly, with the swap that
    // fixes it; every other post carries on. Approved posts are never
    // reordered by the machine — the desk shows the warning.
    if (rowChannel === "instagram" && row.format === "reel") {
      reelBreaches ??= await reelSequenceSlots().then(reelSequenceViolations).catch((e) => (e as Error));
      if (reelBreaches instanceof Error) {
        out.push({ slotKey, status: "held", reason: `the reel sequence could not be checked, so this reel waits: ${reelBreaches.message}` });
        continue;
      }
      const breach = reelBreaches.find((v) => v.slot === slotKey);
      if (breach) {
        out.push({ slotKey, status: "held", reason: `reel sequence: ${describeViolation(breach)}` });
        continue;
      }
    }

    if(row.channel === "instagram" && !row.plan_slot_id){out.push({slotKey,status:"held",reason:"A measured source plan is required before Instagram publication."});continue;}
    // Re-read the plan: a hold or removal may have arrived after approval.
    if (row.plan_slot_id) {
      const planned = await planSlotById(row.plan_slot_id as string);
      const sequenceError = rowChannel === "instagram" ? await designSequenceHold(row.plan_slot_id as string) : null;
      if(sequenceError) { out.push({slotKey,status:"held",reason:sequenceError}); continue; }
      if (opts.timedOnly && planned?.art?.publish_at === undefined) continue;
      const hold = planned ? productionHold(planned) : "The source plan item is missing.";
      if (hold) { out.push({ slotKey, status: "held", reason: hold }); continue; }
      const layoutError = await verifyLayoutFiles(planned?.art, row.media_urls as string[] | null, row.thumbnail_url as string | null, row.channel === "instagram");
      if (layoutError) { out.push({ slotKey, status: "held", reason: layoutError }); continue; }
      const timing = publishTimeHold(planned?.art, today);
      if (timing) { out.push({ slotKey, status: "held", reason: timing }); continue; }
    }

    const current = slotDigest(row.caption as string | null, approvalMedia(row as {media_urls:string[]|null;format:string;thumbnail_url:string|null}));
    if (row.approved_digest && row.approved_digest !== current) {
      out.push({
        slotKey,
        status: "held",
        reason: "content changed since it was approved — the approval is for something that no longer exists",
      });
      continue;
    }

    const channel = rowChannel;
    const ig = publisherFor(channel);
    if (!(ig.ready ? await ig.ready() : ig.configured)) {
      out.push({
        slotKey,
        status: "held",
        reason:
          channel === "linkedin"
            ? "LinkedIn is not connected — press Connect LinkedIn on the desk; the post is approved and waiting"
            : channel === "youtube"
              ? "YouTube is not connected — run `node scripts/youtube-connect.mjs` once; the Short is approved and waiting"
              : "no Instagram credentials — approved and ready",
      });
      continue;
    }

    // Claim before contacting the platform: a manual click and a cron must
    // never publish the same row. A crash leaves it claimed for reconciliation,
    // rather than automatically retrying a potentially successful publication.
    const { data: claimed, error: claimError } = await sb.from("marketing_posts")
      .update({ status: "approved", claimed_at: new Date().toISOString() })
      .eq("id", row.id).eq("status", row.status)
      .eq("approved_at", row.approved_at)
      .select("id");
    if (claimError) throw new Error(`marketing_posts claim: ${claimError.message}`);
    if (!claimed?.length) continue;

    // The collab invite rides on the approved post too. Weekly approval means
    // almost every post goes out HERE, not from compose — and until 27 Sep
    // 2026 this request carried no collaborators, so every approved Taash post
    // went out on our grid alone. Only Instagram takes the invite.
    const collabs =
      channel === "instagram" ? await collaboratorsForCollection(await slotCollection(row.plan_slot_id as string | null)) : [];
    const result = await ig.publish(approvedRequest(row, collabs));

    const { error: upErr } = await sb
      .from("marketing_posts")
      .update({
        status: result.ok ? "published" : "failed",
        external_id: result.externalId ?? null,
        published_at: result.ok ? new Date().toISOString() : null,
        error: result.ok ? null : result.error ?? null,
      })
      .eq("id", row.id as string);
    if (upErr) throw new Error(`marketing_posts write: ${upErr.message}`);

    // A post that carried a Library film files its link on that film.
    if (result.ok) {
      await recordLibraryPost(row, result.externalId).catch((e) =>
        out.push({ slotKey, status: "failed", reason: `published, but the Library record was not updated: ${(e as Error).message}` }),
      );
    }

    if (result.ok && channel === "instagram" && row.format === "reel") {
      await queueYouTubeTwin(row as TwinSource).catch((e) =>
        out.push({ slotKey, status: "failed", reason: `YouTube Short not queued: ${(e as Error).message}` }),
      );
    }

    out.push({
      slotKey,
      status: result.ok ? "published" : "failed",
      externalId: result.externalId,
      url: result.url,
      reason: result.ok ? result.note : result.error,
    });
  }

  for (const o of out) if (o.status === "held" && o.reason) await recordHold(o.slotKey, o.reason);
  return out;
}

/**
 * Rows publishApproved claimed and never finished (the Worker died between
 * the claim and the platform's answer), settled from Instagram's own record —
 * see publish/reconcile.ts for the rules. A proven post gets everything a
 * live publish gets (the Library link, the YouTube Short twin).
 * TODO: YouTube and LinkedIn claims are not reconciled yet — only Instagram
 * exposes a list of what went live that we read here.
 */
async function reconcileInterrupted(today: Date, todayKey: string, out: PublishOutcome[]): Promise<void> {
  if (!publisherFor("instagram").configured) return;
  const sb = serviceClient();
  const { data, error } = await sb
    .from("marketing_posts")
    .select("id, plan_key, slot_key, status, channel, format, pillar, product_handle, safety_passed, caption, media_urls, thumbnail_url, approved_at, approved_by, share_to_feed, plan_slot_id, claimed_at")
    .eq("status", "approved")
    .eq("channel", "instagram");
  if (error) throw new Error(`marketing_posts read: ${error.message}`);
  const now = today.getTime();
  const stale = (data ?? []).filter((r) => isStale(r as never, todayKey, now));
  if (!stale.length) return;

  const cache: Partial<Record<"media" | "stories", LiveMedia[]>> = {};
  const live = async (edge: "media" | "stories") => (cache[edge] ??= await recentInstagramMedia(edge));

  for (const row of stale) {
    const verdict = judgeClaim(row as never, await live(row.format === "story" ? "stories" : "media"), now);
    const patch =
      verdict.kind === "published"
        ? { status: "published", external_id: verdict.media.id, published_at: verdict.media.timestamp, error: null }
        : { status: "failed", error: verdict.error };
    // Only a row still claimed: a live publish that finished meanwhile wins.
    const { data: moved, error: upErr } = await sb
      .from("marketing_posts").update(patch).eq("id", row.id).eq("status", "approved").select("id");
    if (upErr) throw new Error(`marketing_posts write: ${upErr.message}`);
    if (!moved?.length) continue;

    if (verdict.kind === "published") {
      await recordLibraryPost(row, verdict.media.id).catch((e) =>
        out.push({ slotKey: row.slot_key, status: "failed", reason: `found on Instagram, but the Library record was not updated: ${(e as Error).message}` }),
      );
      if (row.format === "reel") {
        await queueYouTubeTwin(row as TwinSource).catch((e) =>
          out.push({ slotKey: row.slot_key, status: "failed", reason: `YouTube Short not queued: ${(e as Error).message}` }),
        );
      }
    }
    out.push({
      slotKey: row.slot_key,
      status: verdict.kind === "published" ? "published" : "failed",
      externalId: verdict.kind === "published" ? verdict.media.id : undefined,
      url: verdict.kind === "published" ? verdict.media.permalink ?? undefined : undefined,
      reason: verdict.kind === "published" ? "interrupted publish — confirmed live on Instagram" : verdict.error,
    });
  }
}

/** The collection a plan slot names, or null. */
async function slotCollection(planSlotId: string | null): Promise<string | null> {
  if (!planSlotId) return null;
  const { data } = await serviceClient()
    .from("marketing_plan_slots")
    .select("collection")
    .eq("id", planSlotId)
    .maybeSingle();
  return (data?.collection as string | null) ?? null;
}

/** What an approved row asks the platform to post: exactly the approved words
 *  and media, plus the collection's collaborators. */
export function approvedRequest(
  row: { format?: unknown; caption?: unknown; media_urls?: unknown; thumbnail_url?: unknown; share_to_feed?: unknown },
  collaborators: string[],
): PublishRequest {
  return {
    // A YouTube Short is the Reel's video under a second name.
    kind: row.format === "short" ? "reel" : ((row.format as MediaKind) ?? "feed"),
    caption: (row.caption as string) ?? "",
    mediaUrls: (row.media_urls as string[]) ?? [],
    thumbnailUrl: (row.thumbnail_url as string | undefined) ?? undefined,
    shareToFeed: (row.share_to_feed as boolean | null) !== false,
    ...(collaborators.length ? { collaborators } : {}),
  };
}

type TwinSource = {
  slot_key: string;
  plan_slot_id?: string | null;
  plan_key?: string | null;
  pillar: string;
  product_handle: string | null;
  safety_passed: boolean;
  caption: string | null;
  media_urls: string[] | null;
  thumbnail_url: string | null;
  approved_at: string;
  approved_by: string | null;
};

/**
 * Every Reel that goes out on Instagram is syndicated to YouTube as a Short.
 * The twin is queued here, AFTER Instagram accepted the Reel, so YouTube only
 * ever mirrors what actually went live — and the next tick publishes it through
 * the ordinary approved path above, where a failure is reported like any other
 * post. It inherits the Reel's approval: same video, same approved words (see
 * youtube-twin.ts), second destination.
 */
async function queueYouTubeTwin(reel: TwinSource): Promise<void> {
  const media = reel.media_urls ?? [];
  if (!media[0]) return;
  const caption = youtubeCaption(reel.caption ?? "", reel.product_handle);
  const { error } = await serviceClient()
    .from("marketing_posts")
    .insert(
      {
        channel: "youtube",
        format: "short",
        pillar: reel.pillar,
        product_handle: reel.product_handle,
        slot_key: youtubeTwinKey(reel.slot_key),
        plan_slot_id: reel.plan_slot_id ?? null,
        plan_key: reel.plan_key ?? null,
        caption,
        media_urls: media,
        thumbnail_url: reel.thumbnail_url,
        status: "queued",
        safety_passed: reel.safety_passed,
        approved_at: reel.approved_at,
        approved_by: reel.approved_by,
        approved_digest: slotDigest(caption, approvalMedia({format:"reel",media_urls:media,thumbnail_url:reel.thumbnail_url})),
      },
    );
  // 23505: a twin for this Reel already exists (the live-row index on
  // slot_key) — it is left alone, never duplicated.
  if (error && error.code !== "23505") throw new Error(error.message);
}

export async function runNextSlots(count = 1): Promise<SlotOutcome[]> {
  const { byHandle } = await learnedSignals().catch(() => ({ byHandle: undefined }));
  // Reels last here too (cadenceComposeOrder): the 17:30 IST tick is the
  // day's last composer, and a reel must never stand between it and the
  // day's Stories.
  const plan = cadenceComposeOrder(await planSlots(count, { bias: byHandle }));
  const out: SlotOutcome[] = [];
  for (const sel of plan) out.push(await runSlot(sel));
  return out;
}

/**
 * THE INSTAGRAM DAILY RUN (founder, 9 October 2026: "ensure that the daily
 * schedule … keeps going forward … a specialized workflow only for the
 * Zyvorah Instagram workflow"). Composes the daily cadence — the grid post
 * and the reel — for today and the next `aheadDays` days, so each reaches the
 * approval queue with time to be looked at. It composes ONLY the cadence:
 * authored plan slots stay on the founder's Compose button, and anything
 * already composed is left exactly as it is (alreadyDone). Nothing is
 * approved or published here; captions spend only Instagram's own keys
 * (providers/copy.ts). Bounded by time, resuming next run, like the week run.
 */
/** How long one instagram-daily run may spend composing. The cron worker
 *  cancels a route at TICK_TIMEOUT_MS (13 min) and a cancelled request
 *  records nothing, so this plus the summary and brief that follow must
 *  finish well inside it. */
export const CADENCE_RUN_BUDGET_MS = 9 * 60_000;

export async function composeInstagramCadence(
  aheadDays = 3,
  budgetMs = CADENCE_RUN_BUDGET_MS,
  now = new Date(),
): Promise<{ composed: SlotOutcome[]; remaining: string[] }> {
  const started = Date.now();
  const { byHandle } = await learnedSignals().catch(() => ({ byHandle: undefined }));
  // Grid posts and Stories first, reels last: a reel is the slowest render
  // and the only one that has wedged, and the day's pictures must not wait
  // behind it (cadenceComposeOrder).
  const sels = cadenceComposeOrder((await planSlots(aheadDays + 1, { bias: byHandle, startDate: now }))
    .filter((sel) => sel.campaign?.key === CADENCE_KEY && cadenceComposes(sel.campaign.kind)));
  const composed: SlotOutcome[] = [];
  const remaining: string[] = [];
  for (const sel of sels) {
    const format = (sel.campaign?.format ?? "feed") as MediaKind;
    // A slot is started only when its WHOLE budget (SLOT_BUDGET_MS, the
    // worst case runSlot allows) still fits: a reel begun with a typical
    // minute left used to be cut off by the cron worker at its worst case,
    // and a cut-off slot leaves no row (12–13 October 2026).
    if (Date.now() - started + slotBudgetMs(format) > budgetMs) { remaining.push(sel.slotKey); continue; }
    composed.push(await runSlot(sel));
  }
  return { composed, remaining };
}

export type WeekAheadResult = {
  composed: SlotOutcome[];
  /** Slots the plan wanted but this invocation ran out of time for. */
  remaining: string[];
  /** True when every day of the window now has a slot. */
  complete: boolean;
};

/**
 * Compose the days AHEAD, so the Monday review has a week to review.
 *
 * The engine composed one slot on the morning of the day it was for, which
 * meant a weekly batch approval had at most one thing in it — the doctrine said
 * "approve the week" and the surface could only ever offer today. This fills the
 * window in advance; the daily tick stays as the safety net, and recognises
 * these slots as already done because they are keyed identically (see
 * planSchedule).
 *
 * BOUNDED BY TIME, NOT BY FAITH. A reel takes ~30s to render and upload, and
 * seven of them do not fit in one serverless invocation. Rather than compose
 * blindly until the platform kills the function mid-slot — leaving a
 * half-uploaded post and no record of where it stopped — this stops while it
 * still has room, reports what it did not reach, and relies on slot_key
 * idempotency so the next invocation resumes rather than repeats.
 */
/**
 * Roughly how long one slot takes to compose, by format, in seconds —
 * measured from real runs on the media container. A carousel fetches and
 * frames up to six renders plus the flat; a reel renders video.
 *
 * Used to answer the founder's question BEFORE the work starts ("tell me
 * approximately how long it takes"), because a progress bar that only appears
 * once you are committed is not an answer.
 */
const SECONDS_PER_SLOT: Record<MediaKind, number> = {
  feed: 10,
  story: 10,
  carousel: 30,
  reel: 55,
};

export type ComposeSurvey = {
  /** Slots that would actually be composed — approved and already-composed
   *  days are excluded, because those are settled and must not be touched. */
  todo: { slotKey: string; format: MediaKind; handle: string }[];
  estimateSeconds: number;
};

/**
 * What a compose run would DO, without doing any of it.
 *
 * The founder approves days ahead of time; if she has signed off the next ten
 * days, those ten days are finished business and a compose run must start
 * past them, not reach back over them. alreadyDone() is the same check
 * runSlot uses, so this survey and the run agree by construction.
 */
export async function surveyCompose(
  days = 92,
  opts: { startDate?: Date } = {},
): Promise<ComposeSurvey> {
  const { byHandle } = await learnedSignals().catch(() => ({ byHandle: undefined }));
  const plan = await planSlots(days, { bias: byHandle, startDate: opts.startDate });
  const todo: ComposeSurvey["todo"] = [];
  for (const sel of plan) {
    if (await alreadyDone(sel.slotKey)) continue;
    const format = sel.campaign?.format ?? PILLAR_FORMAT[sel.pillar] ?? "feed";
    todo.push({ slotKey: sel.slotKey, format, handle: sel.candidate.handle });
  }
  const estimateSeconds = todo.reduce((n, t) => n + (SECONDS_PER_SLOT[t.format] ?? 15), 0);
  return { todo, estimateSeconds };
}

export async function composeWeekAhead(
  days = 14,
  opts: { budgetMs?: number; startDate?: Date } = {},
): Promise<WeekAheadResult> {
  const budgetMs = opts.budgetMs ?? 240_000;
  const startedAt = Date.now();
  // The slowest thing that can happen next is a reel. Stopping with less than
  // that left is what keeps a slot from being cut in half.
  const SLOWEST_SLOT_MS = 60_000;

  const { byHandle } = await learnedSignals().catch(() => ({ byHandle: undefined }));
  // Reels last here too (cadenceComposeOrder). This is what the desk runs when
  // the founder opens it: on 12 October 2026 the day's reel was the one slot
  // that wedged, and a reel first in the round would spend the whole budget
  // and leave the four Stories behind it for the next round.
  const plan = cadenceComposeOrder(await planSlots(days, { bias: byHandle, startDate: opts.startDate }));

  const composed: SlotOutcome[] = [];
  const remaining: string[] = [];

  for (const sel of plan) {
    if (Date.now() - startedAt > budgetMs - SLOWEST_SLOT_MS) {
      remaining.push(sel.slotKey);
      continue;
    }
    // runSlot already skips a slot that is published/queued/approved, so a
    // resumed run costs one cheap read per finished day rather than redoing it.
    //
    // Wrapped because a week is seven independent days: whatever goes wrong on
    // Tuesday, Wednesday should still be composed. runSlot records its own
    // failures, so this catch is for the unforeseen — and the unforeseen is
    // exactly what cost the first real run every one of its seven days.
    try {
      composed.push(await runSlot(sel));
    } catch (e) {
      composed.push({
        slotKey: sel.slotKey,
        handle: sel.candidate.handle,
        pillar: sel.pillar,
        format: PILLAR_FORMAT[sel.pillar] ?? "feed",
        safetyPassed: false,
        status: "failed",
        error: (e as Error).message ?? String(e),
      });
    }
  }

  return { composed, remaining, complete: remaining.length === 0 };
}

/**
 * Every finished Instagram idea from today on, composed for review.
 *
 * The whole-calendar run (composeWeekAhead) reads PLANNED slots of live plans
 * only, so a finished idea — copy, and a design, frame or Library film — sat
 * on the desk as "catalogue picture — not composed yet" until somebody opened
 * it and pressed Compose, one at a time. "Compose everything" means the ideas
 * too (founder, 3 Oct 2026). Each goes through composePlanSlot, so it is
 * promoted with the import's own guards and lands queued and UNAPPROVED; an
 * idea that is still intent stays an idea, with its reason.
 *
 * `survey` counts what would compose and does nothing.
 */
export async function composeReadyIdeas(
  opts: { budgetMs?: number; survey?: boolean; today?: string } = {},
): Promise<WeekAheadResult & { ideas: string[] }> {
  const budgetMs = opts.budgetMs ?? 240_000;
  const startedAt = Date.now();
  const today = opts.today ?? logicalDayKey(new Date());
  const ideas = await readyIdeaSlots(today);
  const todo: PlanSlot[] = [];
  for (const ps of ideas) if (!(await alreadyDone(slotKeyOf(ps)))) todo.push(ps);
  if (opts.survey) return { composed: [], remaining: todo.map(slotKeyOf), complete: todo.length === 0, ideas: todo.map(slotKeyOf) };

  const composed: SlotOutcome[] = [];
  const remaining: string[] = [];
  for (const ps of todo) {
    if (Date.now() - startedAt > budgetMs - 60_000) {
      remaining.push(slotKeyOf(ps));
      continue;
    }
    try {
      composed.push(await composePlanSlot(ps.id));
    } catch (e) {
      composed.push({
        slotKey: slotKeyOf(ps),
        handle: ps.handle ?? "",
        pillar: "reveal",
        format: ps.kind === "ad" ? "feed" : ps.kind,
        safetyPassed: false,
        status: "failed",
        error: (e as Error).message ?? String(e),
      });
    }
  }
  return { composed, remaining, complete: remaining.length === 0, ideas: todo.map(slotKeyOf) };
}

/**
 * Act on the founder's note NOW, not on the next hourly run.
 *
 * On 26 September 2026 "add hashtags #cards #taash …" sat for 25 minutes
 * as "composes again on the next run". Every note, even one about four words,
 * marked the whole post (pictures included) for a full rebuild and then waited
 * for the cron. For a rotation post it was worse: "Rewrite it" never read the
 * note at all, and the next tick wrote an unrelated caption.
 *
 * What a note asks for decides how much work happens, all inside the request:
 *   - "add #these #hashtags" → appended exactly as typed. No model, no
 *     guessing, a second or two.
 *   - any other note about the WORDS → the caption writer rewrites the existing
 *     caption with the note as its instruction (a few seconds), through the
 *     same brand-safety gate as every caption.
 *   - a note about the PICTURE (crop, room, closer, another design) → that one
 *     plan slot is composed again right away (about a minute), not the week.
 *
 * The approval is already cleared by the caller, so the new version comes
 * back to the review queue for her to see before anything posts.
 */
export type NoteOutcome =
  | { done: "caption"; caption: string; how: "hashtags" | "rewritten" }
  | { done: "composed"; outcome: SlotOutcome }
  | { done: "waiting"; why: string };

const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;

/** "add hashtags #a #b" → the caption with the missing tags appended, or null
 *  when the note is not purely an ask to add tags. */
export function withHashtagsFromNote(caption: string, note: string): string | null {
  const tags = note.match(HASHTAG_RE) ?? [];
  if (!tags.length) return null;
  const rest = note.replace(HASHTAG_RE, " ").toLowerCase().replace(/[^a-z ]/g, " ");
  const words = rest.split(/\s+/).filter(Boolean);
  const allowed = new Set(["add", "also", "include", "put", "the", "these", "hashtag", "hashtags", "tags", "tag", "and", "with", "please", "pls", "in", "to", "caption", "plus"]);
  if (words.some((w) => !allowed.has(w))) return null;
  const have = new Set((caption.match(HASHTAG_RE) ?? []).map((t) => t.toLowerCase()));
  const fresh = [...new Set(tags)].filter((t) => !have.has(t.toLowerCase()));
  if (!fresh.length) return caption;
  const lines = caption.trimEnd().split("\n");
  const last = lines[lines.length - 1] ?? "";
  if (/#[\p{L}\p{N}_]+/u.test(last)) lines[lines.length - 1] = `${last} ${fresh.join(" ")}`;
  else lines.push("", fresh.join(" "));
  return lines.join("\n");
}

export async function applyNoteNow(postId: string, note: string): Promise<NoteOutcome> {
  const sb = serviceClient();
  const { data: row, error } = await sb
    .from("marketing_posts")
    .select("id, plan_key, slot_key, plan_slot_id, caption, product_handle, pillar, status, channel, format")
    .eq("id", postId)
    .maybeSingle();
  if (error) throw new Error(`note: ${error.message}`);
  if (!row) return { done: "waiting", why: "that post is no longer live" };
  if (isPersonalPlan(row.plan_key)) return { done: "waiting", why: "saved for your personal creative review" };

  // A Story has no caption to rewrite — the frame IS the post, so every note
  // on one is about the frame, whatever words it uses ("wrong format", "old
  // layout"). It is drawn again now, in the current frame, with the note
  // steering it. Rewriting the caption instead is what sent the same old
  // frame back to the queue on 30 Sep 2026.
  if (row.format === "story") return recomposeStory(row, note);

  const d = directivesFromNotes([note]);
  const aboutPicture = !!(d.hold || d.position || d.scene || d.detail);

  if (!aboutPicture && row.caption) {
    let caption = withHashtagsFromNote(row.caption, note);
    let how: "hashtags" | "rewritten" = "hashtags";
    const candidates = await loadCandidates();
    const cand = candidates.find((c) => c.handle === row.product_handle);
    if (caption === null && row.channel === "linkedin" && row.caption) {
      // LinkedIn: rewritten in its own voice, and a finished frame with no
      // catalogue design behind it can still be rewritten — the post's own
      // words are the brief.
      const li = await linkedInRevise(row.caption, note, cand);
      caption = li.text;
      how = "rewritten";
    }
    if (caption === null) {
      if (!cand) return { done: "waiting", why: "the design behind this post is not in the catalogue, so the writer cannot rewrite it" };
      const gen = await generateCaption(
        { slotKey: row.slot_key, pillar: (row.pillar ?? "reveal") as Selection["pillar"], candidate: cand, channel: row.channel as Selection["channel"] },
        undefined,
        3,
        { original: row.caption, note },
      );
      caption = gen.caption;
      how = "rewritten";
    }
    caption = autoCorrect(caption);
    const safety = checkCaption(caption, { fromPrice: cand?.fromPrice ?? undefined, channel: row.channel as string });
    if (!safety.ok) {
      return { done: "waiting", why: `the new caption failed the brand-safety check (${safety.issues.map((i) => i.detail).join("; ")}) — it will be rewritten on the next run` };
    }
    const { error: upErr } = await sb
      .from("marketing_posts")
      .update({
        caption,
        safety_passed: true,
        safety_issues: safety.issues,
        regenerate_requested_at: null,
        regenerate_requested_by: null,
        regenerate_reason: null,
      })
      .eq("id", row.id);
    if (upErr) throw new Error(`note: ${upErr.message}`);
    // The plan slot carries the copy a later recompose starts from, so the
    // edit is written there too, and the note is marked done so it does not
    // send the copy back to the writer again.
    if (row.plan_slot_id) {
      const { data: slot } = await sb.from("marketing_plan_slots").select("comments").eq("id", row.plan_slot_id).maybeSingle();
      const comments = ((slot?.comments as { text?: string; resolved?: boolean }[] | null) ?? []).map((cm) =>
        cm.text === note ? { ...cm, resolved: true } : cm,
      );
      await sb
        .from("marketing_plan_slots")
        .update({ caption, comments, updated_at: new Date().toISOString() })
        .eq("id", row.plan_slot_id);
    }
    return { done: "caption", caption, how };
  }

  if (row.plan_slot_id) {
    return { done: "composed", outcome: await composePlanSlot(row.plan_slot_id) };
  }
  return { done: "waiting", why: "a picture change on a rotation post is composed on the next run" };
}

/**
 * Draw a sent-back Story again NOW, in the current frame, with her note as a
 * composition directive ("show it in the living room", "closer").
 *
 * A plan Story rebuilds from its plan slot; a daily-cadence Story (no plan
 * slot) rebuilds from the same deterministic day plan that composed it. Either
 * way it goes through runSlot, which supersedes the row she sent back and
 * queues the new frame unsigned, so it returns to the review queue for her to
 * see. If the day's plan no longer holds this slot, the regenerate mark stays
 * and the next compose run draws it.
 */
async function recomposeStory(
  row: { plan_slot_id: string | null; slot_key: string | null },
  note: string,
): Promise<NoteOutcome> {
  const withNote = (sel: Selection): Selection =>
    sel.campaign ? { ...sel, campaign: { ...sel.campaign, notes: [...(sel.campaign.notes ?? []), note] } } : sel;

  if (row.plan_slot_id) {
    const ps = await planSlotById(row.plan_slot_id);
    if (!ps || ps.status === "removed") return { done: "waiting", why: "the plan slot behind this Story is gone" };
    const candidates = await loadCandidates();
    const sel = selectionFromPlanSlot(ps, new Map(candidates.map((c) => [c.handle, c])));
    if (!sel) return { done: "waiting", why: `"${ps.handle}" is not in the postable catalogue` };
    return { done: "composed", outcome: await runSlot(withNote(sel)) };
  }

  const day = (row.slot_key ?? "").split("#")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { done: "waiting", why: "it is drawn again on the next compose run" };
  // Midday IST sits inside the logical day (which starts at 05:00 IST).
  const plan = await planSlots(1, { startDate: new Date(`${day}T12:00:00+05:30`) });
  const sel = plan.find((p) => p.slotKey === row.slot_key);
  if (!sel) return { done: "waiting", why: "it is drawn again on the next compose run" };
  return { done: "composed", outcome: await runSlot(withNote(sel)) };
}
