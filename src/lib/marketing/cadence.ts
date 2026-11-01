// The daily cadence's own rules, database-free so they can be tested.
//
// THE DAILY CADENCE (founder, 26 Sep 2026): one grid post, one reel and four
// Stories every day. On 8 October 2026 the review gate began refusing any
// Instagram post without a measured plan item, and the cadence made none — so
// for a day and a half it rendered posts nothing could ever approve, and then
// (9 October) stopped composing at all. The founder's answer the same day:
// "ensure that the daily schedule … is not paused and keeps going forward".
//
// So a cadence post now carries a plan item of its own, in a plan of its own
// (`daily-cadence`, live). The plan is the off-switch: archive it and every
// cadence post is held at review ("The source campaign is not active"), with
// no deploy. Nothing here relaxes a check — the plan item, the measured
// export, the one-design-per-format rule and the founder's approval all still
// apply to every cadence post.

import { designHandles, type DesignSlot } from "./design-sequence";
import { layoutHold } from "./layout-check";

export const CADENCE_KEY = "daily-cadence";

/** The cadence plan row, created once if it is missing and never overwritten:
 *  if the founder archives it, it stays archived. */
export const CADENCE_PLAN = {
  key: CADENCE_KEY,
  name: "Daily cadence",
  big_idea: "One grid post, one reel and four Stories every day (founder, 26 Sep 2026).",
  window_start: "2026-10-09",
  window_end: "2100-12-31",
  status: "live",
  source: "cadenceTopUp (src/lib/marketing/select.ts)",
  created_by: "engine",
} as const;

export type CadenceKind = "feed" | "reel" | "story" | "carousel" | "ad";
/** Which cadence kinds the engine renders for review: the grid post, the
 *  reel and the Stories (a Story is posted with or without a Link sticker —
 *  founder, 9 October 2026; see story-link.ts). */
export const cadenceComposes = (kind: CadenceKind | undefined): boolean => kind === "feed" || kind === "reel" || kind === "story";

/** The format a design is counted under — the design-sequence rule's own
 *  mapping (a carousel is a grid post). */
export const sequenceFormat = (kind: string): string => (kind === "carousel" ? "feed" : kind);

/** Every design already given a format, and the slots (day#seq) holding it.
 *  Built from the same rows the design-sequence rule judges. */
export function designsUsedByFormat(rows: DesignSlot[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const s of rows) {
    if (s.channel !== "instagram" || !["feed", "carousel", "story", "reel"].includes(s.kind)) continue;
    if (!(s.published || (s.status !== "removed" && s.art?.selected !== false))) continue;
    for (const design of designHandles(s)) {
      const key = `${sequenceFormat(s.kind)}:${design}`;
      const set = out.get(key) ?? new Set<string>();
      set.add(`${s.day_key}#${s.seq}`);
      out.set(key, set);
    }
  }
  return out;
}

/** Has this design already been given this format by some OTHER slot? A
 *  cadence slot re-picking its own design is not a repeat. */
export function takenElsewhere(used: Map<string, Set<string>>, kind: string, handle: string, slotKey: string): boolean {
  const holders = used.get(`${sequenceFormat(kind)}:${handle.toLowerCase()}`);
  if (!holders) return false;
  for (const k of holders) if (k !== slotKey) return true;
  return false;
}

/** The plan item a cadence selection is composed from. */
export function cadenceSlotRow(input: {
  slotKey: string; kind: CadenceKind; beat?: string | null; handle: string; title: string;
}) {
  const [day_key, seq] = input.slotKey.split("#");
  return {
    plan_key: CADENCE_KEY,
    day_key,
    seq: Number(seq),
    channel: "instagram",
    kind: input.kind,
    beat: input.beat ?? null,
    handle: input.handle,
    title: input.title,
    status: "planned",
    art: { selected: true, source: CADENCE_KEY },
  };
}

/** The cadence's seq numbers (select.ts CADENCE_SEQ): the grid post, the reel
 *  and the four Stories. */
const CADENCE_SEQS = new Set([30, 40, 50, 51, 52, 53]);

export type CadenceLedgerRow = {
  slot_key: string | null;
  plan_key?: string | null;
  status: string;
  product_handle?: string | null;
  format?: string | null;
  channel?: string | null;
  approved_at?: string | null;
  /** From qualifyReviewPosts: whether the founder can approve this row today. */
  review_ready?: boolean;
  review_hold?: string | null;
  /** The row's recorded error — a publisher hold is written here as "held: …". */
  error?: string | null;
};

/** A REJECTED CADENCE POST MEANS "NOT THIS DESIGN", NEVER "NO POST TODAY".
 *
 *  On 10–15 October 2026 every daily post was set `skipped` by hand ("all
 *  upcoming TAASH held"), and the engine read each stored 'skipped' the way
 *  it reads a founder's rejection on the desk: this slot does not run. Six
 *  days went out with nothing on them while every cron reported ok. The
 *  founder's doctrine is a post every day, so for the daily cadence a
 *  skipped or failed row is a design NOT to pick again on that day — the
 *  day is composed again with another design (cadenceTopUp takes this set).
 *  An authored plan's rejection is untouched: "remove" on the desk still
 *  retires a cadence slot (ensureCadencePlanSlot holds a removed slot). */
export function cadenceRejections(rows: CadenceLedgerRow[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.slot_key || !r.product_handle) continue;
    if (!["skipped", "failed"].includes(r.status)) continue;
    const [day, seq] = r.slot_key.split("#");
    if (r.plan_key !== CADENCE_KEY && !CADENCE_SEQS.has(Number(seq))) continue;
    const set = out.get(day) ?? new Set<string>();
    set.add(r.product_handle.toLowerCase());
    out.set(day, set);
  }
  return out;
}

/** What a day is missing against the cadence (one grid post, four Stories),
 *  counted over EVERY live Instagram post of the day, authored or cadence —
 *  so a day an authored plan fills is not reported short. Empty when the
 *  day is whole. The cron reports this so a silent day is a failed run,
 *  never a green one. */
export function cadenceShortfall(dayKey: string, rows: CadenceLedgerRow[]): string[] {
  const live = rows.filter((r) => (r.channel ?? "instagram") === "instagram" && r.slot_key?.startsWith(`${dayKey}#`) &&
    ["queued", "published"].includes(r.status));
  const out: string[] = [];
  if (!live.some((r) => ["feed", "carousel", "reel"].includes(r.format ?? ""))) out.push("no grid post");
  // Named by what is MISSING, so "missing …" and "today is short: …" read
  // true: the 14:00 IST brief of 13 October 2026 said "missing 3 of 4
  // Stories" of a day that had three and lacked one.
  const stories = live.filter((r) => r.format === "story").length;
  const short = 4 - stories;
  if (short > 0) out.push(`${short} ${short === 1 ? "Story" : "Stories"} (only ${stories} of 4)`);
  return out;
}

/** A cadence post rendered before it had a plan item can never pass review.
 *  It is not "done": the cadence redraws it in place (same row, same day), the
 *  way a Story in a retired frame is redrawn. Approved rows are never touched. */
export function isPlanlessCadenceRow(row: {
  status?: string | null; channel?: string | null; plan_key?: string | null;
  plan_slot_id?: string | null; approved_at?: string | null;
}): boolean {
  return row.status === "queued" && !row.approved_at && (row.channel ?? "instagram") === "instagram" &&
    row.plan_key === CADENCE_KEY && !row.plan_slot_id;
}

export type CadenceDaySummary = {
  day: string;
  published: number;
  approved: number;
  /** Waiting on the founder: on the review page right now. */
  awaiting: number;
  /** Composed but refused by review or held at publish, with the reason —
   *  as good as missing until someone acts, and invisible until now. */
  held: { slot: string; format: string; reason: string }[];
  /** What the day still lacks, counting ONLY posts that are out, approved,
   *  or approvable. */
  missing: string[];
};

/** A DAY IS COUNTED BY WHAT CAN ACTUALLY GO OUT. On 7–8 October 2026 every
 *  composed post was refused by the review gate, so the review page said
 *  "nothing to approve", the crons said ok, and two days went out empty. A
 *  composed post that review refuses, or that the publisher holds, counts for
 *  nothing here; it is listed with its reason so the brief and the review
 *  page can say exactly what stands between the day and its posts. */
export function cadenceDaySummary(dayKey: string, rows: CadenceLedgerRow[]): CadenceDaySummary {
  const live = rows.filter((r) => (r.channel ?? "instagram") === "instagram" && r.slot_key?.startsWith(`${dayKey}#`) &&
    ["queued", "published"].includes(r.status));
  const held: CadenceDaySummary["held"] = [];
  const counts = { published: 0, approved: 0, awaiting: 0 };
  const countable: CadenceLedgerRow[] = [];
  for (const r of live) {
    const slot = r.slot_key ?? "";
    const format = r.format ?? "post";
    if (r.status === "published") { counts.published++; countable.push(r); continue; }
    if (r.approved_at) {
      if (r.error && /^held: /.test(r.error)) { held.push({ slot, format, reason: r.error.slice(6) }); continue; }
      counts.approved++; countable.push(r); continue;
    }
    if (r.review_ready === false) { held.push({ slot, format, reason: r.review_hold ?? "not ready for review" }); continue; }
    counts.awaiting++; countable.push(r);
  }
  return { day: dayKey, ...counts, held, missing: cadenceShortfall(dayKey, countable) };
}

/** Compose order for a cadence run: every grid post and Story first, reels
 *  last. On 12 October 2026 the composer worked day by day in slot order and
 *  hung on a reel, so four Stories behind it were never drawn. A reel is the
 *  slowest and the only format that can wedge; the cheap pictures land first. */
export function cadenceComposeOrder<T extends { campaign?: { kind?: string } | null }>(sels: T[]): T[] {
  const reel = (s: T) => s.campaign?.kind === "reel";
  return [...sels.filter((s) => !reel(s)), ...sels.filter(reel)];
}

/** The first `count` Story keys (#50 onward) a day has NOT already taken.
 *  The top-up used to number its Stories #50 + i: on 16 October 2026 Stories
 *  #50–#52 were drawn and #53 had failed, so the one missing Story was given
 *  key #50, found it taken, and was skipped — the day stayed a Story short on
 *  every run while the brief said so each morning. */
export function freeStorySeqs(takenSlotKeys: string[], count: number, base = 50): number[] {
  const taken = new Set(takenSlotKeys.map((k) => Number(k.split("#")[1])).filter((n) => Number.isFinite(n)));
  const out: number[] = [];
  for (let seq = base; out.length < count && seq < base + 50; seq++) if (!taken.has(seq)) out.push(seq);
  return out;
}

/** A queued, unapproved cadence post whose plan item's layout receipt does
 *  not vouch for ITS pictures is not done. The review gate holds such a post
 *  for ever ("Layout receipt does not cover every exact media file"), so it is
 *  drawn again in place, picture and receipt together. On 15 October 2026 the
 *  Bar lounge Story carried a receipt measured for another design — two
 *  compose loops had raced on one slot — and sat held while the brief
 *  counted the day short. An approved post is never touched. */
export function cadenceRowNeedsRedraw(
  row: { status?: string | null; approved_at?: string | null; plan_key?: string | null; channel?: string | null; media_urls?: string[] | null; thumbnail_url?: string | null },
  planArt: Record<string, unknown> | null | undefined,
): boolean {
  if (row.status !== "queued" || row.approved_at || row.plan_key !== CADENCE_KEY) return false;
  if ((row.channel ?? "instagram") !== "instagram" || !row.media_urls?.length) return false;
  return layoutHold(planArt ?? null, row.media_urls, row.thumbnail_url ?? null, true) !== null;
}
