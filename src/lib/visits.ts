// Counts a shopper's VISITS to the site, in their own browser.
//
// A visit is what analytics means by a session: it ends after VISIT_GAP_MS
// without a page view. Not sessionStorage, which is per-tab — a shopper who
// opens three designs in new tabs would otherwise be on their fourth "visit"
// inside a minute.
//
// Used by AppInstall (founder, 6 October 2026): the app card is never shown
// on a first visit, and from the second visit on it is shown once every visit.

export const VISIT_GAP_MS = 30 * 60 * 1000;

const COUNT_KEY = "zyv_visits";
const LAST_SEEN_KEY = "zyv_last_seen";

/** The slice of Storage this needs, so tests can pass a plain object. */
export type VisitStore = Pick<Storage, "getItem" | "setItem">;

/**
 * Record a page view and return which visit it belongs to (1 = first visit).
 * Call on every page view; only a gap of VISIT_GAP_MS or more starts a new visit.
 */
export function recordPageView(store: VisitStore, now: number): number {
  const count = Number(store.getItem(COUNT_KEY)) || 0;
  const lastSeen = Number(store.getItem(LAST_SEEN_KEY)) || 0;
  const newVisit = count === 0 || now - lastSeen >= VISIT_GAP_MS;
  const visit = newVisit ? count + 1 : count;
  store.setItem(COUNT_KEY, String(visit));
  store.setItem(LAST_SEEN_KEY, String(now));
  return visit;
}
