import { supabaseAdmin } from "./supabase-admin";
import { amazonUrl, AMAZON_MARKETPLACE } from "./marketplace-availability";

/**
 * Are our "Buy it on Amazon" deep links still alive?
 *
 * They rot without warning. Every ASIN stored on 5 Aug 2026 was a hard 404 by
 * 13 Aug: Amazon had relisted the whole catalogue under fresh ASINs, so every
 * link on the site led to "Page Not Found" for eight days and nothing noticed —
 * the 404 happens on Amazon's side, where none of our own link checking can see
 * it. There are no SP-API credentials, so the only way to know is to ask Amazon.
 *
 * This deliberately only REPORTS. It never clears an ASIN, because the failure
 * we are most likely to hit is Amazon blocking a datacentre IP, and a blocked
 * request must never be allowed to delete a working link. Deciding a link is
 * dead is cheap to get wrong and expensive to undo, so a human sees it first.
 */

/** A verdict per ASIN. "unknown" means Amazon would not give us a straight
 *  answer — it is NOT evidence of a dead listing and never counts as one. */
export type LinkVerdict = "alive" | "dead" | "unknown";

/**
 * Whether the listing can actually be bought right now.
 *
 * A live link to an unavailable listing is not a broken link, but it IS a
 * broken promise: the product page carries a "Buy on Amazon" button, so an
 * unavailable SKU sends the customer somewhere nobody can buy. There are no
 * SP-API credentials to ask properly, so we read it off the page like a
 * customer would.
 */
export type StockVerdict = "in" | "out" | "unknown";

export type LinkCheck = {
  handle: string;
  asin: string;
  verdict: LinkVerdict;
  status: number;
  /** Only meaningful when `verdict` is "alive". */
  stock?: StockVerdict;
  /** Why it was inconclusive, when it was. */
  note?: string;
};

export type LinkHealthReport = {
  checkedAt: string;
  /** How many designs carry an Amazon link at all. */
  linked: number;
  checked: number;
  alive: number;
  dead: LinkCheck[];
  unknown: number;
  /** Live links whose listing cannot currently be bought. Not broken, but the
   *  product page offers the buy button, so it misleads until reactivated. */
  outOfStock: LinkCheck[];
  /** Reachable listings we could not read an availability line from. */
  stockUnknown: number;
  /** True when too much of the run was inconclusive to trust ANY verdict —
   *  the signature of being rate-limited or served a CAPTCHA rather than of
   *  listings actually disappearing. */
  inconclusive: boolean;
  /** True when everything we could reach was dead — the relist signature. */
  massFailure: boolean;
};

// A real product page is ~900KB; Amazon's block and CAPTCHA interstitials are a
// few KB. Deciding alive-vs-blocked needs only the first slice.
const PREFIX_BYTES = 6_000;
const BLOCK_MARKERS = /Enter the characters you see|api-services-support@amazon\.com|Robot Check|automated access/i;

// Availability sits ~213KB into the page and the fulfilment line ~243KB, so
// reading stock costs a much deeper slice of a body Amazon is sending anyway
// (it rejects HEAD and ignores Range). We stop just past the fulfilment line
// rather than pulling the remaining ~650KB of reviews and recommendations.
// Fewer listings fit in the time budget as a result; the rotation absorbs that.
const AVAILABILITY_BYTES = 300_000;

// Amazon ignores both HEAD (405) and Range on /dp/, so a check costs a full
// request. These bound the damage: stop at the deadline rather than risk the
// serverless function timing out mid-run and reporting nothing at all.
//
// Six-at-a-time got the whole catalogue thrown back at us: a run in Sep 2026
// fired all 357 links in the budget and had 341 blocked, because at that rate
// Amazon simply rate-limits the Vercel egress IP and every verdict is
// "unknown". A blocked run judges NOTHING, so a slower run that reaches forty
// listings is worth more than a fast one that reaches none. The rotation
// already spreads the catalogue across days, so covering less per run costs
// coverage time, not coverage.
const CONCURRENCY = 2;
/** Minimum gap between one worker's requests. With CONCURRENCY that is roughly
 *  2.7 requests/sec sustained — slow enough to stay under the limiter. */
const PACE_MS = 750;
const REQUEST_TIMEOUT_MS = 12_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reads at most `limit` bytes then abandons the rest of the body.
 *
 * Keeps pulling chunks until the limit: a single read() returns only whatever
 * one chunk happens to hold, which was enough for the 6KB block-marker check
 * but silently truncates anything deeper.
 */
async function readPrefix(res: Response, limit: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      parts.push(value);
      total += value.length;
    }
    const buf = new Uint8Array(total);
    let at = 0;
    for (const p of parts) { buf.set(p, at); at += p.length; }
    return new TextDecoder().decode(buf.slice(0, limit));
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/**
 * Read availability off the page the way a customer reads it.
 *
 * Deliberately conservative: anything we do not positively recognise is
 * "unknown", never "out". Amazon words scarcity many ways ("Only 2 left in
 * stock", "In stock soon") and a false out-of-stock would send someone chasing
 * a restock that never needed chasing.
 */
export function readStock(html: string): StockVerdict {
  // Narrow to the buybox availability block when we can find it — the phrase
  // "currently unavailable" also appears in unrelated recommendation strips.
  const at = html.indexOf("availability");
  const slice = at >= 0 ? html.slice(at, at + 4_000) : html;

  if (/Currently unavailable|We don't know when or if this item will be back|Temporarily out of stock|Out of stock/i.test(slice)) {
    return "out";
  }
  if (/In stock|Only \d+ left in stock|Usually dispatched|In stock soon/i.test(slice)) {
    return "in";
  }
  return "unknown";
}

/**
 * @param withStock read deep enough to see the availability line. Costs ~50x
 *   the bytes, so only a slice of each run asks for it — see checkAmazonLinks.
 */
export async function checkAsin(
  asin: string,
  withStock = false,
): Promise<{ verdict: LinkVerdict; status: number; stock?: StockVerdict; note?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(amazonUrl(asin), {
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        // Identify ourselves honestly. We are checking our own listings.
        "user-agent": "ZyvorahLinkCheck/1.0 (+https://zyvorah.com; checking our own listings)",
        accept: "text/html",
      },
    });

    // The one verdict we treat as conclusive. Amazon returns a small, explicit
    // 404 for an ASIN that no longer exists.
    if (res.status === 404) {
      await res.body?.cancel().catch(() => {});
      return { verdict: "dead", status: 404 };
    }

    if (res.status === 200) {
      const body = await readPrefix(res, withStock ? AVAILABILITY_BYTES : PREFIX_BYTES);
      // The interstitial check still only trusts the first slice — a block page
      // is small, so anything matching further in is page content, not a block.
      if (BLOCK_MARKERS.test(body.slice(0, PREFIX_BYTES))) {
        return { verdict: "unknown", status: 200, note: "bot check" };
      }
      return withStock
        ? { verdict: "alive", status: 200, stock: readStock(body) }
        : { verdict: "alive", status: 200 };
    }

    await res.body?.cancel().catch(() => {});
    // 429/503 are throttling, 3xx here would be a redirect we did not resolve.
    return { verdict: "unknown", status: res.status, note: `http ${res.status}` };
  } catch (e) {
    const note = e instanceof Error && e.name === "AbortError" ? "timeout" : "network";
    return { verdict: "unknown", status: 0, note };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check the live Amazon links, newest-unchecked-first via a rotating offset, for
 * as long as `budgetMs` allows. A weekly slice covers the whole set over a few
 * runs, and a mass relist shows up on the very next run because it kills every
 * ASIN at once, not one at a time.
 *
 * Two tiers, because the two questions cost wildly different amounts. Liveness
 * is answered by the first 6KB, so every listing in the budget gets it and the
 * relist alarm keeps its same-day reach. Availability sits ~213KB in, so only
 * the first `stockSlice` of the rotation pays for it; the rotation walks that
 * window across the catalogue on subsequent days.
 */
export async function checkAmazonLinks(opts: { budgetMs: number; rotation: number; stockSlice?: number }): Promise<LinkHealthReport> {
  const db = supabaseAdmin();
  const checkedAt = new Date().toISOString();
  const empty: LinkHealthReport = {
    checkedAt, linked: 0, checked: 0, alive: 0, dead: [], unknown: 0,
    outOfStock: [], stockUnknown: 0, inconclusive: false, massFailure: false,
  };
  if (!db) return empty;

  const { data, error } = await db
    .from("marketplace_listing_exports")
    .select("product_handle, asin")
    .eq("marketplace", AMAZON_MARKETPLACE)
    .not("asin", "is", null);
  if (error || !data?.length) return empty;

  const rows = (data as { product_handle: string; asin: string }[])
    .map((r) => ({ handle: r.product_handle, asin: r.asin }))
    .sort((a, b) => a.handle.localeCompare(b.handle));

  const offset = rows.length ? ((opts.rotation % rows.length) + rows.length) % rows.length : 0;
  const queue = [...rows.slice(offset), ...rows.slice(0, offset)];

  const deadline = Date.now() + opts.budgetMs;
  const stockSlice = opts.stockSlice ?? 0;
  const results: LinkCheck[] = [];
  let next = 0;

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < queue.length && Date.now() < deadline) {
        const i = next++;
        const item = queue[i];
        const startedAt = Date.now();
        const r = await checkAsin(item.asin, i < stockSlice);
        results.push({ handle: item.handle, asin: item.asin, ...r });
        // Pace from the START of the request, so a slow page (which already
        // spent the gap) isn't punished twice — only fast replies wait.
        const gap = PACE_MS - (Date.now() - startedAt);
        if (gap > 0 && Date.now() + gap < deadline) await sleep(gap);
      }
    }),
  );

  return summarise(results, rows.length, checkedAt);
}

/**
 * Turn per-ASIN verdicts into a report, applying the two rules that keep this
 * safe to act on. Pure, so the guards can be tested without touching Amazon.
 */
export function summarise(results: LinkCheck[], linked: number, checkedAt: string): LinkHealthReport {
  const dead = results.filter((r) => r.verdict === "dead");
  const alive = results.filter((r) => r.verdict === "alive").length;
  const unknown = results.filter((r) => r.verdict === "unknown").length;

  // If a third of the run could not be answered, assume Amazon is pushing back
  // and distrust the whole run — including its "dead" verdicts. Being blocked
  // and being delisted look alike from here, and only one of them is our problem.
  const inconclusive = results.length > 0 && unknown / results.length > 1 / 3;
  // Everything we reached is gone: the relist signature, worth shouting about.
  // The floor of 5 stops a tiny truncated run from crying relist.
  const massFailure = !inconclusive && alive === 0 && dead.length >= 5;

  // Stock rides on the same guard as deadness. If the run could not be trusted
  // to say a link is dead, it cannot be trusted to say a listing sold out
  // either — a truncated read looks exactly like a missing availability line.
  const outOfStock = results.filter((r) => r.verdict === "alive" && r.stock === "out");
  const stockUnknown = results.filter((r) => r.verdict === "alive" && r.stock === "unknown").length;

  return {
    checkedAt,
    linked,
    checked: results.length,
    alive,
    dead: inconclusive ? [] : dead,
    unknown,
    outOfStock: inconclusive ? [] : outOfStock,
    stockUnknown,
    inconclusive,
    massFailure,
  };
}

/** Plain-text summary for the alert email. */
export function describeReport(r: LinkHealthReport): string {
  if (r.inconclusive) {
    return `Amazon link check could not complete: ${r.unknown} of ${r.checked} requests were blocked or timed out, so no link was judged and nothing has been changed. Amazon is rate-limiting the requests, which it does for days at a time; the check keeps retrying daily on its own and goes quiet until it either recovers or is still blocked a week from now.`;
  }
  if (r.massFailure) {
    return `EVERY Amazon link checked is dead (${r.dead.length} of ${r.checked}). This is what a full relist looks like — Amazon has almost certainly reissued the catalogue under new ASINs, and every "Buy on Amazon" button on the site is now a 404. All ${r.linked} links need re-harvesting.`;
  }
  const parts = [`${r.dead.length} of ${r.checked} Amazon links checked are dead (${r.linked} designs carry a link).`];
  if (r.outOfStock.length) {
    parts.push(
      `${r.outOfStock.length} more link${r.outOfStock.length === 1 ? " is" : "s are"} alive but UNAVAILABLE — those product pages currently offer "Buy on Amazon" for something nobody can buy.`,
    );
  }
  return parts.join(" ");
}
