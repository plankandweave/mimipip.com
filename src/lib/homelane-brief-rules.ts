/**
 * HomeLane portal — how the morning brief reads designer logins.
 *
 * WHY THIS EXISTS
 * On 30 September 2026 HomeLane trained its interior designers to specify
 * walls through zyvorah.com/partners/homelane. Whether that training took is
 * the question of the following weeks, and it is answered one morning at a
 * time: how many designers signed in yesterday, how many used the portal,
 * what they did, and how much of the roster has turned up at all.
 *
 * Pure on purpose, like briefing-rules.ts: the counting (lib/homelane-brief.ts)
 * talks to the database, this file only turns counts into a status, a headline
 * and a body, so every sentence the brief can print is pinned by a test.
 *
 * WHAT "SIGNED IN" AND "ACTIVE" MEAN
 * A portal session stays open while it is used. A designer who signed in on the training
 * day and works in the portal all week never types another code, so logins
 * alone would read as silence while the team was busy. The brief therefore
 * carries both: `signedIn` (a code or an SMS verified that day) and `active`
 * (signed in, OR seen on an open session, OR did something the audit log
 * records). Our own staff sign in to the same portal with their own inboxes;
 * they are excluded before the numbers reach this file.
 */

import { formatIstDate, istMidnight, istWeekday } from "@/lib/ist";
import type { BriefStatus } from "@/lib/briefing-rules";

export const HOMELANE_SLUG = "homelane";

/** The day HomeLane trained its designers on the portal. The roster line
 *  ("N of M have signed in since the training") counts from here. */
export const HOMELANE_TRAINING_DAY = "2026-09-30";

export type HomelaneMember = { email: string; name: string | null };

/** The plain numbers the counter hands over. Every list holds distinct,
 *  lower-cased designer addresses with staff already removed. */
export type HomelaneActivity = {
  /** False when there is no active `homelane` corporate account to count. */
  accountFound: boolean;
  /** Set when the count could not be made; the brief says so rather than
   *  printing zeros that would read as "nobody came". */
  error?: string | null;
  /** Verified a code (email or SMS) on the day. */
  signedIn: string[];
  /** Of `signedIn`, never seen on the portal before the day. */
  firstTime: string[];
  /** Used the portal on the day, by any evidence. A superset of `signedIn`. */
  active: string[];
  projectsCreated: number;
  designsUploaded: number;
  ordersPlaced: number;
  /** Everything else the audit log recorded that day, logins excluded. */
  otherActions: number;
  /** The account's active member list; empty when it runs domain-open. */
  members: HomelaneMember[];
  /** Signed in at least once from the training day up to and including the
   *  day being reported. */
  signedInSinceTraining: string[];
};

export const EMPTY_HOMELANE_ACTIVITY: HomelaneActivity = {
  accountFound: false,
  error: null,
  signedIn: [],
  firstTime: [],
  active: [],
  projectsCreated: 0,
  designsUploaded: 0,
  ordersPlaced: 0,
  otherActions: 0,
  members: [],
  signedInSinceTraining: [],
};

/** Members who have not signed in since the training — the list to hand
 *  HomeLane when the number is low. Longest-standing members first, as the
 *  roster came. */
export function neverSignedInSinceTraining(a: HomelaneActivity): HomelaneMember[] {
  const seen = new Set(a.signedInSinceTraining);
  return a.members.filter((m) => !seen.has(m.email));
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Names cap at this many in any list; the brief is read on a phone. */
const MAX_NAMES = 12;

function displayName(email: string, members: HomelaneMember[]): string {
  const m = members.find((x) => x.email === email);
  return m?.name?.trim() || email;
}

function nameList(emails: string[], members: HomelaneMember[]): string {
  const shown = emails.slice(0, MAX_NAMES).map((e) => esc(displayName(e, members)));
  const more = emails.length - shown.length;
  return shown.join(", ") + (more > 0 ? ` and ${more} more` : "");
}

export function homelaneSection(
  a: HomelaneActivity,
  dateKey: string,
): { status: BriefStatus; headline: string; bodyHtml: string } {
  const trainingDay = formatIstDate(HOMELANE_TRAINING_DAY, { day: "numeric", month: "long" });

  if (!a.accountFound) {
    return {
      status: "amber",
      headline: "HomeLane portal: no active 'homelane' account found, so logins could not be counted",
      bodyHtml:
        "<p>The brief looked for an active corporate account with the slug <code>homelane</code> and found none. " +
        "Until it exists (or is re-activated) there is nothing to count.</p>",
    };
  }
  if (a.error) {
    return {
      status: "amber",
      headline: `HomeLane portal: logins could not be counted this morning (${a.error})`,
      bodyHtml: `<p>The count failed rather than came back empty — nobody should read this as "no designers came". ${esc(a.error)}.</p>`,
    };
  }

  const signedIn = a.signedIn.length;
  const active = a.active.length;
  const firstTime = a.firstTime.length;
  const since = a.signedInSinceTraining.length;
  const roster = a.members.length;
  const quiet = signedIn === 0 && active === 0;
  const sunday = istWeekday(istMidnight(dateKey)) === 0;

  // Silence the week after a training is the thing to notice, so it is amber
  // on a working day. A quiet Sunday is only a Sunday.
  const status: BriefStatus = quiet ? (sunday ? "info" : "amber") : "green";

  const rosterPhrase = roster
    ? `${since} of ${plural(roster, "listed member")} have signed in since the ${trainingDay} training`
    : `${plural(since, "designer")} ${since === 1 ? "has" : "have"} signed in since the ${trainingDay} training (the account keeps no member list, so there is no roster to measure against)`;

  const headline = quiet
    ? `No HomeLane designer signed in or used the portal ${sunday ? "on Sunday" : "yesterday"} · ${rosterPhrase}`
    : `${plural(signedIn, "designer")} signed in${firstTime ? ` (${firstTime} for the first time)` : ""}, ` +
      `${active} active, ${plural(a.projectsCreated, "project")} started · ${rosterPhrase}`;

  const yesterday =
    `<p><strong>Yesterday (${esc(formatIstDate(dateKey, { day: "numeric", month: "long" }))}):</strong> ` +
    `${signedIn} signed in · ${active} active in the portal · ${plural(a.projectsCreated, "project")} started · ` +
    `${plural(a.designsUploaded, "design")} uploaded · ${plural(a.ordersPlaced, "order")} placed · ${plural(a.otherActions, "other action")}.` +
    (signedIn ? ` Signed in: ${nameList(a.signedIn, a.members)}.` : "") +
    (active > signedIn
      ? ` Also active on an earlier login: ${nameList(a.active.filter((e) => !a.signedIn.includes(e)), a.members)}.`
      : "") +
    `</p>`;

  const notYet = neverSignedInSinceTraining(a);
  const rosterLine =
    `<p><strong>Since the training on ${esc(trainingDay)}:</strong> ${esc(rosterPhrase)}.` +
    (roster && notYet.length
      ? ` Not yet signed in: ${nameList(notYet.map((m) => m.email), a.members)}.`
      : roster
        ? " Every listed member has signed in at least once."
        : "") +
    `</p>`;

  const note =
    `<p style="font-size:12px;">"Active" counts anyone who used the portal that day on a login from an earlier day too — ` +
    `a sign-in stays open while it is used, so logins alone undercount a busy team. Our own staff sign-ins on the account are excluded.</p>`;

  return { status, headline, bodyHtml: yesterday + rosterLine + note };
}
