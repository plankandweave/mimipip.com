// The agentic loop's "learn" half. Two jobs:
//
//   1. backfillMetrics() — for published posts, pull each platform's insights
//      (reach, saves, plays, …) and store them on the ledger row. Run on a cadence
//      (e.g. daily, a day+ after posting so numbers have matured).
//
//   2. learnedSignals() — turn two evidence streams into a per-design bias score
//      the selector uses to decide what to post NEXT:
//        a) how our own posts performed (ledger metrics) — content signal
//        b) what people actually view/save on zyvorah.com (site_events) — demand signal
//      A design that both posts well AND is wanted on-site gets surfaced sooner.
//
// Reads run through the service-role client (server-only) so they see the ledger
// and site_events regardless of RLS.

import { serviceClient, hasServiceRole } from "./db";
import { publisherFor } from "./publish";

/** Backfill metrics for published posts that are >~1 day old and stale. */
export async function backfillMetrics(maxPosts = 50): Promise<number> {
  if (!hasServiceRole()) return 0;
  const sb = serviceClient();
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
  const staleCutoff = new Date(Date.now() - 12 * 3600_000).toISOString();

  const { data: rows } = await sb
    .from("marketing_posts")
    .select("id, channel, external_id, metrics_at")
    .eq("status", "published")
    .not("external_id", "is", null)
    .lte("published_at", dayAgo)
    .or(`metrics_at.is.null,metrics_at.lte.${staleCutoff}`)
    .limit(maxPosts);

  let updated = 0;
  for (const r of rows ?? []) {
    const pub = publisherFor(r.channel as "instagram" | "youtube" | "linkedin");
    if (!pub.configured || !pub.fetchMetrics) continue;
    try {
      const metrics = await pub.fetchMetrics(r.external_id as string);
      await sb
        .from("marketing_posts")
        // An empty result means the post is gone; its counts go with it.
        .update({ metrics: Object.keys(metrics).length ? metrics : null, metrics_at: new Date().toISOString() })
        .eq("id", r.id);
      updated++;
    } catch {
      // Metric fetch is best-effort; skip on error.
    }
  }

  // YouTube API policy (and our privacy policy): stored YouTube stats are
  // kept for at most 36 months.
  const retention = new Date();
  retention.setMonth(retention.getMonth() - 36);
  await sb
    .from("marketing_posts")
    .update({ metrics: null })
    .eq("channel", "youtube")
    .not("metrics", "is", null)
    .lt("published_at", retention.toISOString());

  return updated;
}

export type Signals = {
  /** handle -> bias score in ~[0, 2]; 1 is neutral. Higher = surface sooner. */
  byHandle: Map<string, number>;
  /** pillar -> multiplier from how that pillar's posts performed. */
  byPillar: Map<string, number>;
};

function normalise(map: Map<string, number>): Map<string, number> {
  const vals = [...map.values()];
  if (!vals.length) return map;
  const max = Math.max(...vals);
  if (max <= 0) return map;
  const out = new Map<string, number>();
  // Map raw score to a gentle 1.0–2.0 boost so cold items (no data) stay at 1.0.
  for (const [k, v] of map) out.set(k, 1 + v / max);
  return out;
}

/**
 * Blend post-performance and on-site demand into selection bias. Cheap enough to
 * run each planning tick. Degrades to empty (neutral) maps without data.
 */
export async function learnedSignals(windowDays = 30): Promise<Signals> {
  const byHandle = new Map<string, number>();
  const byPillar = new Map<string, number>();
  if (!hasServiceRole()) return { byHandle, byPillar };

  const sb = serviceClient();
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();

  // a) Content signal — our posts' saves + reach per handle & pillar.
  const { data: posts } = await sb
    .from("marketing_posts")
    .select("product_handle, pillar, metrics")
    .eq("status", "published")
    .gte("created_at", since)
    .not("metrics", "is", null);

  const pillarAgg = new Map<string, { sum: number; n: number }>();
  for (const p of posts ?? []) {
    const m = (p.metrics ?? {}) as Record<string, number>;
    // Saves are the strongest intent signal on IG; reach scales it.
    const score = (m.saved ?? 0) * 3 + (m.shares ?? 0) * 2 + (m.likes ?? 0) * 0.2 + (m.reach ?? 0) * 0.001 + (m.views ?? 0) * 0.001;
    if (p.product_handle) byHandle.set(p.product_handle, (byHandle.get(p.product_handle) ?? 0) + score);
    if (p.pillar) {
      const a = pillarAgg.get(p.pillar) ?? { sum: 0, n: 0 };
      a.sum += score;
      a.n += 1;
      pillarAgg.set(p.pillar, a);
    }
  }

  // b) Demand signal — on-site views/saves per handle from site_events.
  const { data: events } = await sb
    .from("site_events")
    .select("product_handle, event")
    .eq("is_bot", false)
    .in("event", ["view", "visualize", "save", "cart_add"])
    .gte("created_at", since)
    .not("product_handle", "is", null)
    .order("created_at", { ascending: false })
    .limit(20_000);

  for (const e of events ?? []) {
    // Use the native vocabulary. Counting both cart and cart_add doubles one
    // action; page views and declared bots are not buying intent.
    const w = e.event === "cart_add" ? 8 : e.event === "save" ? 4 : e.event === "visualize" ? 3 : 1;
    byHandle.set(e.product_handle, (byHandle.get(e.product_handle) ?? 0) + w);
  }

  // Pillar multipliers: how a pillar performed vs the average pillar.
  const avg =
    [...pillarAgg.values()].reduce((s, a) => s + (a.n ? a.sum / a.n : 0), 0) /
    Math.max(1, pillarAgg.size);
  for (const [pillar, a] of pillarAgg) {
    const mean = a.n ? a.sum / a.n : 0;
    byPillar.set(pillar, avg > 0 ? Math.max(0.6, Math.min(1.6, mean / avg)) : 1);
  }

  return { byHandle: normalise(byHandle), byPillar };
}
