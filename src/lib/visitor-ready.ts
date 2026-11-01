// The anonymous visitor token (zyv_taste) is minted by proxy.ts on the FIRST
// beacon — /api/traffic — not on the page itself: a page response that sets a
// cookie can never be held at the Cloudflare edge, and every public page is.
//
// So the order of the beacons matters. If a taste event raced the traffic
// beacon on a first visit, each request would arrive without a token, the
// proxy would mint two, and the visit's source and its views would land on
// different visitors — the drift the single mint point was built to end. Every
// taste beacon therefore waits for the traffic beacon to have answered (or for
// a short ceiling, so a blocked beacon never silences the rest).
//
// Browser-only module state: one page load, one promise.
const CEILING_MS = 4_000;

let settle: (() => void) | null = null;
const answered = new Promise<void>((resolve) => {
  settle = resolve;
});

/** Called by TrafficSource once /api/traffic has answered, or when it does not need to fire. */
export function markVisitorReady(): void {
  settle?.();
}

/** Resolves once the visitor token exists (or after CEILING_MS, whichever is first). */
export function visitorReady(): Promise<void> {
  return Promise.race([answered, new Promise<void>((resolve) => setTimeout(resolve, CEILING_MS))]);
}
