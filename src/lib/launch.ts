/**
 * THE LAUNCH RESOLVER.
 *
 * One question, asked everywhere: given the clock, is a collection teasing,
 * live, or finished? The homepage hero, the teaser band, the nav, the "New"
 * badges, the newsletter and the Studio launch panel all read this — and they
 * must all agree, on the second, without talking to each other.
 *
 * So this is a PURE FUNCTION OF `now`. Nothing is stored, nothing is written
 * by a cron. That is the same discipline heroRotation.ts keeps and for the same
 * reason: a stored `status` column is a lie waiting to happen. It drifts the
 * instant a midnight job fails, and the failure is silent — the homepage
 * simply goes on teasing a collection that went live yesterday, and nobody
 * finds out until a customer does. A function of the clock cannot drift, and
 * it makes the whole launch reproducible for ANY instant, which is what lets
 * `?launch_preview=` show you the 24th before the 24th.
 *
 * The launch WINDOW is the fortnight a collection fronts the homepage. It is
 * not the same thing as the collection's life: at the end of the window the
 * collection is still in the nav and still shoppable, it has simply stopped
 * being the thing the shop window is about.
 */

/** A launch row, as `collection_launches` stores it. */
export type CollectionLaunch = {
  collectionHandle: string;
  /** The instant the collection becomes public. */
  launchAt: Date;
  /** How many days it fronts the homepage after that. */
  windowDays: number;
  /** How many days it teases before that. 0 = no teaser. */
  teaserDays: number;
  /** The designs the hero slider leads with, in order. Empty = choose for me. */
  heroHandles: string[];
  /** The designs the teaser shows. Empty = reuse heroHandles. */
  teaserHandles: string[];
  activatedAt: Date | null;
  cancelledAt: Date | null;
  notes: string | null;
};

/**
 * Where a launch sits on the calendar.
 *
 * `upcoming` is deliberately distinct from `teaser`: a launch scheduled for
 * March is real, and Studio must be able to show it, but it has no business on
 * the homepage yet. Only `teaser` and `live` are public.
 */
export type LaunchPhase = "upcoming" | "teaser" | "live" | "over" | "cancelled";

/** Milliseconds in a day. Launch windows are counted in whole days. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** When the teaser starts. */
export function teaserStart(launch: CollectionLaunch): Date {
  return new Date(launch.launchAt.getTime() - launch.teaserDays * DAY_MS);
}

/** When the collection stops fronting the homepage. */
export function windowEnd(launch: CollectionLaunch): Date {
  return new Date(launch.launchAt.getTime() + launch.windowDays * DAY_MS);
}

/**
 * The phase, from the clock alone.
 *
 * A cancelled launch reports `cancelled` at every instant, past or future —
 * pulling a launch has to be absolute, or a cancelled collection reappears on
 * the homepage the moment someone's clock crosses a boundary.
 */
export function phaseOf(launch: CollectionLaunch, now: Date): LaunchPhase {
  if (launch.cancelledAt) return "cancelled";
  const t = now.getTime();
  if (t >= windowEnd(launch).getTime()) return "over";
  if (t >= launch.launchAt.getTime()) return "live";
  if (launch.teaserDays > 0 && t >= teaserStart(launch).getTime()) return "teaser";
  return "upcoming";
}

/** True once the collection's products should be public. */
export function isPublic(launch: CollectionLaunch, now: Date): boolean {
  const phase = phaseOf(launch, now);
  return phase === "live" || phase === "over";
}

/**
 * What the homepage should do right now.
 *
 * At most one of each, because the homepage has one hero and one teaser band.
 * When two launches overlap — which happens the moment a January launch is
 * scheduled while a September one is still inside its fortnight — the LATER
 * launch_at wins. A newer collection displacing an older one is what a shop
 * window is for; the older one keeps its nav place and its badges, it simply
 * stops leading.
 *
 * A teaser never displaces a live launch: the collection you can buy today
 * outranks the one arriving next week, or the last days of every launch would
 * be eaten by the next one's teaser.
 */
export function resolveHomepageLaunch(
  launches: CollectionLaunch[],
  now: Date,
): { live: CollectionLaunch | null; teaser: CollectionLaunch | null } {
  const byRecency = [...launches].sort((a, b) => b.launchAt.getTime() - a.launchAt.getTime());
  const live = byRecency.find((l) => phaseOf(l, now) === "live") ?? null;
  const teaser = byRecency.find((l) => phaseOf(l, now) === "teaser") ?? null;
  return { live, teaser };
}

/** Every launch whose collection should be publicly visible by now. */
export function publicLaunches(launches: CollectionLaunch[], now: Date): CollectionLaunch[] {
  return launches.filter((l) => isPublic(l, now));
}

/** The IST calendar day an instant falls on, as a day number. */
function istDayNumber(d: Date): number {
  return Math.floor((d.getTime() + IST_OFFSET_MS) / DAY_MS);
}

/**
 * Whole days from `now` until the collection lands — CALENDAR days in IST, not
 * 24-hour blocks.
 *
 * This number is spoken aloud, and people count sleeps, not elapsed hours. On
 * Saturday morning, a Monday-evening launch is "in two days" to every reader;
 * measuring elapsed time called it three, because 2 days and 7 hours rounds up.
 * The old ceil-of-milliseconds agreed with the calendar only when a collection
 * happened to land at midnight — which the first one did, so the tests passed
 * and the arithmetic was wrong the moment a launch had a time of day.
 *
 * Still effectively rounding up, and for the original reason: any moment on the
 * 23rd is "tomorrow" for a launch on the 24th, never "today". 0 means it is here.
 */
export function daysUntilLaunch(launch: CollectionLaunch, now: Date): number {
  const days = istDayNumber(launch.launchAt) - istDayNumber(now);
  return days <= 0 ? 0 : days;
}

/**
 * The teaser's countdown line. Words, not a ticking clock: a clock counting
 * down in seconds belongs to a flash sale, and this collection is neither
 * scarce nor in a hurry.
 */
export function countdownLabel(launch: CollectionLaunch, now: Date): string {
  const days = daysUntilLaunch(launch, now);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

/**
 * The date as the teaser prints it — "24 September", in IST regardless of
 * where the reader is. A launch date is a fact about the shop, not about the
 * customer's timezone: a reader in London must not be told the 23rd.
 */
export function launchDateLabel(launch: CollectionLaunch): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
  }).format(launch.launchAt);
}

/**
 * The designs the slider should show, in order.
 *
 * `chosen` is the editorial pick from Studio. When it is short or empty the
 * rest comes from the collection itself, because a hero with two images in a
 * three-image slider is a bug the customer can see, and "nobody picked yet" is
 * not a reason to show a broken homepage on launch morning.
 *
 * `count` is the number of panes. Deduped, so a design named twice in the pick
 * cannot occupy two panes of three.
 */
export function sliderHandles(chosen: string[], fallback: string[], count: number): string[] {
  const out: string[] = [];
  for (const h of [...chosen, ...fallback]) {
    if (out.length >= count) break;
    if (h && !out.includes(h)) out.push(h);
  }
  return out;
}

/**
 * The line above the collection's name in the teaser.
 *
 * A collaboration is announced by its houses, not by the fact that something is
 * coming: "Arriving" is a shop's word, and it is already said twice over by the
 * date and the countdown sitting under the name. Where two houses made the
 * collection, the eyebrow names them in the order the printed object does.
 *
 * Handles are listed here rather than stored on the launch row because this is
 * a fact about the collaboration, not about the launch — it stays true long
 * after the launch window has closed, and a launch re-run must not be able to
 * lose it. Anything not listed falls back to "Arriving", which is the honest
 * eyebrow for a collection Zyvorah made alone.
 */
const TEASER_KICKERS: Record<string, string> = {
  taash: "Mati × Zyvorah",
};

export function teaserKicker(launch: CollectionLaunch): string {
  return TEASER_KICKERS[launch.collectionHandle] ?? "Arriving";
}
