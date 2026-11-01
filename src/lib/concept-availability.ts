import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { revalidatePath } from "next/cache";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { supabase } from "./supabase";
import { cachedCatalogue, bumpCatalogueVersion } from "./catalogue-cache";
import { supabaseAdmin } from "./supabase-admin";

// The slugs themselves, held for sixty seconds (KV's floor).
//
// This check runs in the Header, so it fired on EVERY page render — about
// 69,000 times a day, the single most frequent question the storefront asks
// Supabase, and part of the egress overage that put the org on a fair-use
// grace period.
//
// It used to be uncached because a purchased exclusive must disappear at once.
// That reasoning mistook where the guarantee lives. Selling the same
// one-of-a-kind twice is prevented in the DATABASE, at order time:
// private.reserve_design_exclusivity() takes a row lock over the design family
// and raises "This design is reserved or purchased exclusively", and
// private.protect_exclusive_product() refuses to relist it. Page freshness was
// never the safeguard — a shopper who opened the page five minutes before the
// sale is holding a stale page regardless, and no server-side TTL changes that.
//
// So the worst a minute of staleness can do is show a sold concept a little
// longer, and that shopper is stopped at checkout by the lock, which is the
// behaviour the database is written to produce. Sixty seconds, not the
// catalogue hour, because that is still the smallest window worth having.
const hiddenConceptList = cachedCatalogue("hidden-concepts", async (): Promise<string[]> => {
  const { data, error } = await supabase.rpc("exclusive_hidden_concepts");
  if (error)
    throw new Error(
      "We could not check which concepts are available. Please try again.",
    );
  return (data || []) as string[];
}, 60);

// Only during `next build` (CI's checks run it; production builds with vinext,
// which renders on demand). There, connection() keeps the Header's pages out of
// the build-time prerender, which needs a live database and failed CI when it
// was swallowed. At request time it must NOT run: it marked every render on the
// site dynamic, so no page was ever held at the Cloudflare edge and every visit
// re-asked Supabase for the catalogue (213k REST calls on 29 Sep 2026).
async function skipBuildTimePrerender(): Promise<void> {
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) await connection();
}

// A Set does not survive the cache's JSON round-trip, so it is rebuilt here.
export const hiddenConceptSlugs = cache(async (): Promise<Set<string>> => {
  await skipBuildTimePrerender();
  return new Set(await hiddenConceptList());
});

// How long an isolate may still hold the catalogue version it read before a
// bump (VERSION_TTL_MS in catalogue-cache.ts), plus margin.
const VERSION_SETTLE_MS = 12_000;

/**
 * After an order is paid: if it bought an exclusive, take the concept out of the
 * nav now rather than when the page's hour runs out. The DB row lock is still
 * what stops a second sale; this is the showroom catching up.
 *
 * Order matters. The hidden-concepts read is cached per catalogue version, so
 * the version is bumped FIRST; the edge is purged, then purged again once every
 * isolate has seen the new version — a render in between could otherwise put
 * the old nav back at the edge for another hour. Never throws: the payment is
 * already recorded, and this must not fail it.
 */
export async function releaseSoldExclusiveFromNav(orderId: string): Promise<void> {
  try {
    const admin = supabaseAdmin();
    if (!admin) return;
    const { data, error } = await admin.from("design_exclusivity").select("order_id").eq("order_id", orderId).limit(1);
    if (error) throw new Error(error.message);
    if (!data?.length) return;
    await bumpCatalogueVersion();
    revalidatePath("/", "layout");
    await new Promise((resolve) => setTimeout(resolve, VERSION_SETTLE_MS));
    revalidatePath("/", "layout");
  } catch (err) {
    console.error("[concept-availability] could not release a sold exclusive from the nav:", orderId, err);
  }
}
