// LinkedIn: the rules of the channel, in one place.
//
// The LinkedIn writer (a cloud routine since 5 October 2026; before that
// Astra on the founder's desktop — see scripts/linkedin-agent.ts) keeps a
// rolling plan; the founder approves on the desk's LinkedIn tab a week at a
// time; the approved post goes out on its day. The strategy behind every post
// is docs/linkedin-strategy.md. The rules, set by the founder on
// 26 September and 5 October 2026:
//
//   - Zyvorah, the brand, only, on the company page. Not a personal page.
//   - Hotels, hospitality and workplaces; homes only occasionally.
//   - One post every working day, Monday to Friday, and every post shows
//     leadership in wall design. Never festival or seasonal retail content.
//   - Written four weeks ahead; approved a week at a time.
//   - Talk about the spaces. Never label a picture a "concept study", and
//     never claim a client, a commission or an installation.
//
// Pure — no database, no network — so the desk, the runner and the tests all
// read the same rules.

/** The one rolling plan Astra keeps extending. Re-importing the same key
 *  updates copy and keeps every decision made on the desk. */
export const LINKEDIN_PLAN_KEY = "linkedin-zyvorah";

/** Monday to Friday (0 = Monday): one post every working day (founder,
 *  5 October 2026 — it was Tue/Wed/Thu). The page speaks to people at work,
 *  so it stays quiet at the weekend. */
export const LINKEDIN_WEEKDAYS = [0, 1, 2, 3, 4] as const;

/** 09:30 IST: the working day has started in India (and it is 08:00 in the
 *  Gulf), people are at a desk, and the first coffee scroll is the most
 *  engaged read a company page gets. The cron worker fires /api/cron/linkedin
 *  at this time ("0 4 * * *" UTC). */
export const LINKEDIN_POST_TIME_IST = "09:30";

/** How far ahead the plan must be written and approved. */
export const LINKEDIN_RUNWAY_WEEKS = 4;

/** LinkedIn cuts the post after roughly this many characters with "…see more"
 *  — the hook has to land before it. */
export const LINKEDIN_FOLD_CHARS = 210;

/** LinkedIn's own hard limit for a post's text. */
export const LINKEDIN_MAX_CHARS = 3000;

/** Phrases a LinkedIn post may not carry. The founder's call: the posts talk
 *  about spaces, and a picture is never labelled or passed off. Each pattern
 *  is matched case-insensitively against the caption. */
export const LINKEDIN_BLOCKED: { code: string; pattern: RegExp; detail: string }[] = [
  { code: "concept_label", pattern: /\bconcept\s+(stud(y|ies)|project|design|render|visual)s?\b/i, detail: "labels the picture as a concept — talk about the space instead" },
  { code: "client_claim", pattern: /\b(our|a|the|for|with)\s+clients?\b|\bclient['’]s\b/i, detail: "mentions a client — posts never claim or name clients" },
  { code: "client_claim", pattern: /\bcommissioned\b|\bcase\s+stud(y|ies)\b/i, detail: "implies a commissioned or real project" },
  { code: "install_claim", pattern: /\b(we|recently|just)\s+(installed|delivered|completed|fitted)\b|\binstalled\s+(at|in|for)\b/i, detail: "claims an installation — describe what the wall does for the space instead" },
  { code: "real_claim", pattern: /\breal\s+(client|project|install(ation)?)s?\b/i, detail: "claims a real project" },
];

export type WeekdayKey = string; // YYYY-MM-DD

function addDays(dayKey: string, n: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** 0 = Monday. */
export function weekday(dayKey: string): number {
  return (new Date(`${dayKey}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function isLinkedInDay(dayKey: string): boolean {
  return (LINKEDIN_WEEKDAYS as readonly number[]).includes(weekday(dayKey));
}

/** The Monday on or before a day. */
export function mondayOf(dayKey: string): string {
  return addDays(dayKey, -weekday(dayKey));
}

/**
 * The posting days the runway must cover: every weekday from tomorrow
 * through the end of the week that is `weeks` weeks out. Starting tomorrow,
 * not today — today's post is already decided, one way or the other.
 */
export function runwayDays(today: string, weeks = LINKEDIN_RUNWAY_WEEKS): string[] {
  const end = addDays(mondayOf(today), weeks * 7 + 6);
  const out: string[] = [];
  for (let d = addDays(today, 1); d <= end; d = addDays(d, 1)) if (isLinkedInDay(d)) out.push(d);
  return out;
}

/** Just what the runway needs to know about a slot. */
export type RunwaySlot = {
  day_key: string;
  status: string; // plan slot status: idea | planned | removed
  post: { status: string; approved_at: string | null; safety_passed: boolean; regenerate_requested_at: string | null } | null;
};

/** Past approvals remain held even after the API connection is granted.
 *  Never offer a claimed/in-flight or invalidated approval for manual posting. */
export function manualLinkedInSlots<T extends RunwaySlot>(slots: T[], today: string, connected: boolean): T[] {
  return slots.filter((s) => s.status !== "removed" && s.post?.status === "queued"
    && s.post.approved_at && s.post.safety_passed && !s.post.regenerate_requested_at
    && (s.day_key < today || (!connected && s.day_key === today)));
}

export type RunwayDayState = "empty" | "idea" | "to-compose" | "to-review" | "approved" | "posted" | "needs-work";

export function runwayState(s: RunwaySlot | undefined): RunwayDayState {
  if (!s || s.status === "removed") return "empty";
  if (s.status === "idea") return "idea";
  const p = s.post;
  if (!p) return "to-compose";
  if (p.status === "published") return "posted";
  if (p.regenerate_requested_at || p.status === "failed" || (p.status === "queued" && !p.safety_passed)) return "needs-work";
  if (p.approved_at) return "approved";
  if (p.status === "skipped") return "empty";
  return "to-review";
}

export type Runway = {
  days: { day: string; state: RunwayDayState }[];
  /** Posting days nothing is written for. Astra owes these. */
  empty: number;
  /** Written but not yet finished (an idea, not composed, or sent back). */
  unfinished: number;
  toReview: number;
  approved: number;
  /** True when every posting day in the window is approved (or posted). */
  complete: boolean;
};

export function runway(slots: RunwaySlot[], today: string, weeks = LINKEDIN_RUNWAY_WEEKS): Runway {
  const byDay = new Map<string, RunwaySlot>();
  for (const s of slots) {
    if (s.status === "removed") continue;
    // One LinkedIn post a day; if two ever share a day, the one furthest
    // along wins — the runway asks "is this day covered?".
    const prev = byDay.get(s.day_key);
    if (!prev || rank(runwayState(s)) > rank(runwayState(prev))) byDay.set(s.day_key, s);
  }
  const days = runwayDays(today, weeks).map((day) => ({ day, state: runwayState(byDay.get(day)) }));
  const count = (...st: RunwayDayState[]) => days.filter((d) => st.includes(d.state)).length;
  return {
    days,
    empty: count("empty"),
    unfinished: count("idea", "to-compose", "needs-work"),
    toReview: count("to-review"),
    approved: count("approved", "posted"),
    complete: days.length > 0 && days.every((d) => d.state === "approved" || d.state === "posted"),
  };
}

function rank(s: RunwayDayState): number {
  return ["empty", "idea", "to-compose", "needs-work", "to-review", "approved", "posted"].indexOf(s);
}

/** Split a caption where LinkedIn folds it: at the last line or word break
 *  before the fold, so the preview shows exactly what a reader sees before
 *  pressing "see more". */
export function foldCaption(caption: string, limit = LINKEDIN_FOLD_CHARS): { head: string; rest: string } {
  const text = caption.trim();
  // LinkedIn also folds after three lines, whatever their length.
  const lines = text.split("\n");
  const threeLines = lines.slice(0, 3).join("\n");
  const cap = Math.min(limit, threeLines.length);
  if (text.length <= cap) return { head: text, rest: "" };
  const window = text.slice(0, cap);
  const cut = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(" "));
  const at = cut > cap * 0.5 ? cut : cap;
  return { head: text.slice(0, at).trimEnd(), rest: text.slice(at).trimStart() };
}

/** LinkedIn-only caption rules — the founder's wording rules plus the
 *  platform's length. Returned as issues in the safety gate's own shape. */
export function linkedInIssues(caption: string): { severity: "block"; code: string; detail: string }[] {
  const out: { severity: "block"; code: string; detail: string }[] = [];
  for (const r of LINKEDIN_BLOCKED) {
    const m = caption.match(r.pattern);
    if (m) out.push({ severity: "block", code: r.code, detail: `"${m[0]}" ${r.detail}.` });
  }
  if (caption.length > LINKEDIN_MAX_CHARS) {
    out.push({ severity: "block", code: "too_long", detail: `Exceeds LinkedIn's ${LINKEDIN_MAX_CHARS}-character limit.` });
  }
  return out;
}

/** The activity id in a LinkedIn post link, as the URN the API speaks.
 *  Accepts both link shapes LinkedIn hands out:
 *    https://www.linkedin.com/feed/update/urn:li:activity:7240000000000000000/
 *    https://www.linkedin.com/posts/zyvorah_walls-activity-7240000000000000000-AbCd */
export function activityUrnFromUrl(url: string): string | null {
  const m = url.match(/urn:li:(activity|share|ugcPost):(\d{10,})/) ?? url.match(/-(activity)-(\d{10,})/);
  return m ? `urn:li:${m[1]}:${m[2]}` : null;
}
