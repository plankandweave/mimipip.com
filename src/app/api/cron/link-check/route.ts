import { NextResponse } from "next/server";
import { withCronRun } from "@/lib/cron-run";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { checkLinks } from "@/lib/link-status";
import { checkAmazonLinks, describeReport, type LinkHealthReport } from "@/lib/amazon-link-health";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Daily automated link check (scheduled by vercel.json crons).
// It verifies that every collection URL, and a rotating sample of product
// URLs, still resolve to HTTP 200 — so a renamed/deleted product handle or a
// broken homepage link is caught quickly instead of by a customer.
// Broken URLs are logged as errors (visible in Vercel runtime logs / alerts).
//
// It also checks our outbound "Buy on Amazon" links, which rot on Amazon's
// side where nothing we own can see them: every ASIN went 404 for eight days in
// Aug 2026 after Amazon relisted the catalogue, and only a customer would ever
// have found out. That is why this runs daily rather than weekly, and why the
// Amazon result EMAILS — the failure being fixed here is precisely that a log
// nobody reads is the same as no alarm at all.
//
// It watches availability as well as existence. The product page carries an
// "Also on Amazon … Buy on Amazon" block, so a listing that merely goes
// unavailable makes that button lead somewhere nobody can buy without any link
// breaking. There are no SP-API credentials, so the only way to know is to
// read the page.

/** Who hears about a dead marketplace link. */
const ALERT_TO = process.env.LINK_ALERT_EMAIL || "roheena@plankandweave.com";

/** Repeat-suppression for the one alert that can persist for weeks and carries
 *  no action anyone can take from a screen: "Amazon would not answer us".
 *  See reportAmazon. */
const INCONCLUSIVE_KEY = "amazon-link-check-inconclusive";
const INCONCLUSIVE_REMINDER_H = 24 * 7;

// Amazon costs a full page request each (it rejects HEAD and ignores Range), so
// it gets a bounded slice of the run and stops at the deadline rather than
// risking the whole cron timing out and reporting nothing.
const AMAZON_BUDGET_MS = 25_000;
const RUN_CEILING_MS = 50_000;

// How many of each run's Amazon checks also read availability. Deliberately
// equal to the rotation stride below, so the stock window tiles across the
// catalogue day by day — no listing is skipped and none is re-read early.
// Liveness still covers everything the budget allows; only stock is sliced.
const AMAZON_STOCK_SLICE = 40;
const AMAZON_ROTATION_STRIDE = 40;

const SAMPLE = 60; // products checked per run — rotates, full catalogue over ~2 weeks

function dayIndex(): number {
  // Advances every run, so a run truncated by the deadline starts somewhere new
  // next time instead of re-checking the same head of the list for a week.
  return Math.floor(Date.now() / (24 * 60 * 60 * 1000));
}

// Our own pages: each request gives up on its own clock, a few at a time, and
// the batch stops starting new ones at the deadline (src/lib/link-status.ts).
// A bare Promise.all of fetches let one hung same-zone page hold the run open
// until the runtime killed it, so it reported nothing (504 DIED, Oct 2026).
const OWN_LINK_TIMEOUT_MS = 15_000;
const OWN_LINK_CONCURRENCY = 24; // healthy runs cleared ~213 pages in ~25 s
const OWN_LINK_DEADLINE_MS = 35_000; // leaves Amazon >= 15 s of the 50 s ceiling

async function tick(req: Request) {
  const startedAt = Date.now();
  // If a CRON_SECRET is configured, require it (Vercel sends it automatically).
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const origin = new URL(req.url).origin.replace("http://localhost", "https://zyvorah.com");
  const base = process.env.NEXT_PUBLIC_SITE_URL || (origin.includes("localhost") ? "https://zyvorah.com" : origin);

  const [{ data: collections }, { data: products }] = await Promise.all([
    supabase.from("collections").select("handle"),
    supabase.from("products").select("handle").eq("status", "active"),
  ]);

  const colHandles = (collections ?? []).map((c: { handle: string }) => c.handle);
  const prodHandles = (products ?? []).map((p: { handle: string }) => p.handle);

  // Rotating window over the product catalogue so every product is checked
  // within a couple of weeks without hammering the whole catalogue every run.
  const offset = (dayIndex() * SAMPLE) % Math.max(prodHandles.length, 1);
  const rotated = [...prodHandles.slice(offset), ...prodHandles.slice(0, offset)].slice(0, SAMPLE);

  const urls = [
    ...colHandles.map((h) => `${base}/collections/${h}`),
    ...rotated.map((h) => `${base}/products/${h}`),
  ];

  const { results, skipped } = await checkLinks(urls, {
    timeoutMs: OWN_LINK_TIMEOUT_MS,
    concurrency: OWN_LINK_CONCURRENCY,
    deadlineMs: OWN_LINK_DEADLINE_MS,
  });
  const broken = results.filter((r) => r.status !== 200 && !(r.status >= 300 && r.status < 400));

  // Whatever is left of the run, capped — our own links matter more than the
  // marketplace ones, so Amazon gets the remainder rather than the first call.
  const remaining = RUN_CEILING_MS - (Date.now() - startedAt);
  const amazon = remaining > 5_000
    ? await checkAmazonLinks({
        budgetMs: Math.min(AMAZON_BUDGET_MS, remaining),
        rotation: dayIndex() * AMAZON_ROTATION_STRIDE,
        stockSlice: AMAZON_STOCK_SLICE,
      })
    : null;

  const summary = {
    checkedAt: new Date().toISOString(),
    base,
    collectionsChecked: colHandles.length,
    productsChecked: rotated.length,
    broken,
    skipped: skipped.length,
    amazon,
  };

  if (broken.length) {
    console.error("[link-check] BROKEN LINKS:", JSON.stringify(summary));
  } else {
    console.log("[link-check] all", results.length, "links OK", skipped.length ? `(${skipped.length} not reached before the deadline)` : "");
  }

  if (amazon) await reportAmazon(amazon);

  return NextResponse.json({
    ok: broken.length === 0 && !amazon?.dead.length && !amazon?.outOfStock.length,
    ...summary,
  });
}

/**
 * Raise the alarm on marketplace links.
 *
 * An inconclusive run is emailed too. That looks like noise, but a monitor that
 * quietly stops being able to check is indistinguishable from one that finds
 * nothing wrong — which is the exact failure this whole check exists to end.
 *
 * ONCE, though. Amazon rate-limits our egress IP for days at a stretch, and
 * while it does, this said the same non-finding every morning to someone with
 * no screen anywhere that could act on it — re-harvesting ASINs is only worth
 * doing once the check can judge them again. The thirtieth identical mail is
 * how an alert stops being read, which costs us the alarm we built this for.
 */
async function reportAmazon(r: LinkHealthReport): Promise<void> {
  const headline = describeReport(r);

  if (!r.dead.length && !r.outOfStock.length && !r.inconclusive) {
    console.log(`[link-check] amazon: ${r.alive}/${r.checked} live of ${r.linked} linked, all in stock`);
    // The blockage, if there was one, is over — let the next one alert at once.
    await clearAlert(INCONCLUSIVE_KEY);
    return;
  }

  // Say it, then stay quiet while it stays true, with a reminder every
  // INCONCLUSIVE_REMINDER_H so a permanent blackout can't go unnoticed either.
  if (r.inconclusive && !r.dead.length && !r.outOfStock.length) {
    if (!(await shouldAlert(INCONCLUSIVE_KEY, INCONCLUSIVE_REMINDER_H))) {
      console.warn(`[link-check] amazon inconclusive again (${r.unknown}/${r.checked}) — muted, already reported`);
      return;
    }
  } else {
    // A run that DID judge something is news on its own terms; a stale mute
    // from a past blackout must not suppress the next real finding.
    await clearAlert(INCONCLUSIVE_KEY);
  }

  console.error("[link-check] AMAZON:", headline, JSON.stringify(r.dead.slice(0, 20)));

  const subject = r.massFailure
    ? `Zyvorah: every Amazon link checked is dead (${r.dead.length}/${r.checked})`
    : r.inconclusive
      ? "Zyvorah: Amazon link check could not run"
      : r.dead.length
        ? `Zyvorah: ${r.dead.length} dead Amazon link${r.dead.length === 1 ? "" : "s"}`
        : `Zyvorah: ${r.outOfStock.length} Amazon listing${r.outOfStock.length === 1 ? "" : "s"} unavailable`;

  const table = (items: typeof r.dead) =>
    `<table style="border-collapse:collapse;font-size:14px"><tbody>${items
      .map((d) => `<tr><td style="padding:4px 12px 4px 0">${d.handle}</td><td style="padding:4px 0"><code>${d.asin}</code></td></tr>`)
      .join("")}</tbody></table>`;

  await sendEmail({
    to: ALERT_TO,
    subject,
    html: `
      <p>${headline}</p>
      ${r.dead.length ? `<p style="font-size:13px;font-weight:600;margin-bottom:4px">Dead links</p>${table(r.dead)}` : ""}
      ${r.outOfStock.length ? `
        <p style="font-size:13px;font-weight:600;margin:16px 0 4px">Unavailable (link works, nothing can be bought)</p>
        ${table(r.outOfStock)}
        <p style="font-size:13px;color:#555">
          These product pages carry a &ldquo;Buy on Amazon&rdquo; button that
          currently lands on a listing nobody can buy. Reactivate the SKU in Seller
          Central or clear the ASIN to hide the block until it is back.
        </p>` : ""}
      ${r.dead.length || r.outOfStock.length ? `
      <p style="font-size:13px;color:#555">
        Nothing has been changed automatically — a blocked request can look like a dead
        listing, and clearing a working link is worse than leaving it. Re-harvest the
        ASINs and update <code>marketplace_listing_exports.asin</code>. Match on the
        ARTWORK, not the title and not the Model Number: Amazon lists
        &ldquo;Abstract Leopard Print&rdquo; as &ldquo;Floral Tulip Pattern&rdquo;, and the
        listing we store as <code>GEHRAAI-SAV</code> carries <code>AA-0032-SAV</code>.
      </p>` : `
      <p style="font-size:13px;color:#555">
        <strong>There is nothing to do about this one.</strong> No link was judged, so
        nothing has been changed, and re-harvesting ASINs is pointless until the check
        can read Amazon again. It retries every day by itself; you will hear nothing
        further unless it is still blocked in a week, or it finds a genuinely dead or
        sold-out listing before then.
      </p>`}
      <p style="font-size:13px;color:#555">
        Checked ${r.checked} of ${r.linked} linked designs at ${r.checkedAt}${
          r.stockUnknown ? ` · availability unreadable on ${r.stockUnknown}` : ""
        }.
      </p>
    `,
  });
}

/**
 * True the first time a condition appears, and once every `everyHours` after
 * that while it persists. Best-effort: if the ledger is unreachable we alert,
 * because a missed alarm is worse than a duplicate one.
 */
async function shouldAlert(k: string, everyHours: number): Promise<boolean> {
  const db = supabaseAdmin();
  if (!db) return true;
  try {
    const { data } = await db.from("alert_state").select("last_sent_at").eq("k", k).maybeSingle();
    const last = data?.last_sent_at ? Date.parse(data.last_sent_at) : NaN;
    if (Number.isFinite(last) && Date.now() - last < everyHours * 3_600_000) return false;
    const nowIso = new Date().toISOString();
    await db.from("alert_state").upsert({ k, last_sent_at: nowIso, updated_at: nowIso });
    return true;
  } catch {
    return true;
  }
}

/** Forget a condition, so its return alerts immediately rather than waiting out
 *  the reminder window of the previous episode. */
async function clearAlert(k: string): Promise<void> {
  const db = supabaseAdmin();
  if (!db) return;
  try {
    await db.from("alert_state").delete().eq("k", k);
  } catch {
    /* best-effort */
  }
}

export const GET = withCronRun("link-check", tick);
