/**
 * Indian Standard Time — the one clock this shop runs on.
 *
 * Everything Zyvorah releases, dispatches, invoices and emails happens on an
 * Indian calendar. The code, however, runs on Cloudflare Workers, where the
 * process clock is UTC, and in browsers, where it is whatever the reader's
 * laptop says. Both are wrong for us in the same direction: between 18:30 UTC
 * and midnight UTC it is already tomorrow in India, and a bare
 * `toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })` or `new Date().getDate()` prints yesterday.
 *
 * So: no date that means "a day in the life of the shop" may be derived from
 * the ambient zone. Take the instant, then ask this module what day it was in
 * India.
 *
 * `src/lib/launch.ts` already did this for the launch clock and keeps its own
 * offset arithmetic; this module is the same idea for the rest of the site.
 */

export const IST_TZ = "Asia/Kolkata";

/** IST is UTC+5:30 and has no daylight saving, so a fixed offset is exact. */
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const DAY_MS = 86_400_000;

/**
 * The IST calendar date of an instant, as YYYY-MM-DD.
 *
 * This is the "what day is it in India" primitive — use it anywhere a date key,
 * a batch title, a due date or a day bucket is being cut out of an instant.
 * `new Date().toISOString().slice(0, 10)` is the bug it replaces.
 */
export function istDateKey(d: Date = new Date()): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The IST calendar day as a day number — for differences in whole days. */
export function istDayNumber(d: Date = new Date()): number {
  return Math.floor((d.getTime() + IST_OFFSET_MS) / DAY_MS);
}

/** The parts of the IST calendar date, for month/year arithmetic. */
export function istParts(d: Date = new Date()): { year: number; month: number; day: number } {
  const shifted = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(), // 0-based, like Date
    day: shifted.getUTCDate(),
  };
}

/** Day of the week in IST: 0 = Sunday, matching `Date.prototype.getDay`. */
export function istWeekday(d: Date = new Date()): number {
  return new Date(d.getTime() + IST_OFFSET_MS).getUTCDay();
}

/**
 * The instant a date-only value starts in India.
 *
 * `new Date("2026-09-24")` is midnight UTC — 05:30 IST — so a launch, a preview
 * or a due date entered as a plain date silently begins five and a half hours
 * into the day. Parse it here instead.
 */
export function istMidnight(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00+05:30`);
}

/** Shift an IST calendar date by whole days, staying on the IST calendar. */
export function addIstDays(dateKey: string, days: number): string {
  return istDateKey(new Date(istMidnight(dateKey).getTime() + days * DAY_MS));
}

/**
 * A date as an Indian reader should see it. Always IST, never the viewer's zone
 * — a customer in London must be told the shop's day, not their own.
 */
export function formatIstDate(
  d: Date | string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" },
): string {
  if (d == null) return "";
  const date = typeof d === "string" ? parseMaybeDateOnly(d) : d;
  if (!date || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", { ...opts, timeZone: IST_TZ }).format(date);
}

/** A timestamp as an Indian reader should see it — date and time, in IST. */
export function formatIstDateTime(
  d: Date | string | null | undefined,
  opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
): string {
  return formatIstDate(d, opts);
}

/**
 * A string that may be a full timestamp or a bare YYYY-MM-DD.
 *
 * A bare date is a statement about the Indian calendar (a due date, a launch
 * day), so it is anchored at IST midnight rather than UTC midnight.
 */
function parseMaybeDateOnly(s: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? istMidnight(s) : new Date(s);
}
