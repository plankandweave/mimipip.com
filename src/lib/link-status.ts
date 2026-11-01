// Bounded URL status checks for the daily link-check cron.
//
// The cron fetches our own collection and product pages. On Cloudflare a
// same-zone subrequest can hang instead of failing (see no-self-fetch.test.ts),
// and a bare `fetch` has no timeout — so one stuck page held the whole run open
// until the runtime killed it, and the reaper closed it as 504 "DIED" with no
// report at all (18, 20 and 23 Oct 2026). Every request here gives up on its own
// clock, the number in flight is capped, and the batch stops starting new
// requests at a deadline. A run therefore always finishes
// and says what it could not check, instead of dying silently.

/** Status of one URL; 0 = network error or timed out. */
export async function linkStatus(url: string, timeoutMs: number): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
    // Status is known once headers arrive; don't hold the connection for the body.
    res.body?.cancel().catch(() => {});
    return res.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

export type LinkResult = { url: string; status: number };

/**
 * Check `urls` with at most `concurrency` in flight. URLs not started before
 * `deadlineMs` (from the call) are returned in `skipped`, never as broken.
 */
export async function checkLinks(
  urls: string[],
  opts: { timeoutMs: number; concurrency: number; deadlineMs: number },
): Promise<{ results: LinkResult[]; skipped: string[] }> {
  const deadline = Date.now() + opts.deadlineMs;
  const results: LinkResult[] = [];
  const skipped: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++];
      if (Date.now() >= deadline) {
        skipped.push(url);
        continue;
      }
      results.push({ url, status: await linkStatus(url, opts.timeoutMs) });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency) }, worker));
  return { results, skipped };
}
