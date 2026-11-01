// The anon client, not the service-role one: the launch calendar is public
// information the moment a teaser mentions it, and the homepage must not
// depend on a secret to know what day it is. `supabase-admin` returns null
// without SUPABASE_SERVICE_ROLE_KEY, which would silently blank the hero in
// any environment missing that key.
import { supabase } from "@/lib/supabase";
// The teaser reads DRAFT products, which RLS hides from the anon key.
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { CollectionLaunch } from "@/lib/launch";
import { cachedCatalogue } from "@/lib/catalogue-cache";

// Five minutes, not the catalogue hour: a launch must go live on the minute it
// is scheduled for, and the calendar is a handful of rows.
const LAUNCH_REVALIDATE = 300;

/**
 * Reading the launch calendar.
 *
 * Deliberately thin: everything that DECIDES anything lives in launch.ts as a
 * pure function, and this file only turns rows into those values. The split is
 * what lets the whole launch be tested against a clock without a database, and
 * what lets `?launch_preview=` render a future date honestly.
 */

type Row = {
  collection_handle: string;
  launch_at: string;
  window_days: number;
  teaser_days: number;
  hero_handles: string[] | null;
  teaser_handles: string[] | null;
  activated_at: string | null;
  cancelled_at: string | null;
  notes: string | null;
};

function toLaunch(r: Row): CollectionLaunch {
  return {
    collectionHandle: r.collection_handle,
    launchAt: new Date(r.launch_at),
    windowDays: r.window_days,
    teaserDays: r.teaser_days,
    heroHandles: r.hero_handles ?? [],
    teaserHandles: r.teaser_handles ?? [],
    activatedAt: r.activated_at ? new Date(r.activated_at) : null,
    cancelledAt: r.cancelled_at ? new Date(r.cancelled_at) : null,
    notes: r.notes,
  };
}

/**
 * Every launch on the calendar, past and future.
 *
 * All of them, not just the interesting ones: the homepage needs the finished
 * launches too (their collections are still public), and the caller decides
 * what "now" means. Filtering by date HERE would make the preview impossible,
 * because a query that only ever returns today's launches cannot show you the
 * 24th on the 17th.
 *
 * The table holds one row per launch — a handful, forever — so there is
 * nothing to paginate and nothing to index around.
 */
// The rows, not the launches: toLaunch makes Dates, and a Date does not
// survive the cache's JSON round-trip (it came back a string — `getTime is
// not a function` on the homepage). Rows are plain; map after the read.
const getLaunchRows = cachedCatalogue("launches", async (): Promise<Row[]> => {
  const { data, error } = await supabase
    .from("collection_launches")
    .select("*")
    .order("launch_at", { ascending: false });

  // A launch calendar that throws takes the whole homepage down with it. An
  // empty calendar just means no collection is being launched today, which is
  // true on all but a few days a year and renders perfectly.
  if (error) {
    console.error("[launch] could not read the launch calendar:", error.message);
    return [];
  }
  return data as Row[];
}, LAUNCH_REVALIDATE);

export async function getLaunches(): Promise<CollectionLaunch[]> {
  return (await getLaunchRows()).map(toLaunch);
}

/** The collection a launch fronts — its title and the tag that finds its
 *  designs. Null when the row was deleted out from under the launch. */
export const getLaunchCollection = cachedCatalogue("launch-collection", async (
  handle: string,
): Promise<{ handle: string; title: string; ruleTag: string; description: string | null } | null> => {
  const { data, error } = await supabase
    .from("collections")
    .select("handle,title,rule_tag,description")
    .eq("handle", handle)
    .maybeSingle();
  if (error || !data?.rule_tag) return null;
  return { handle: data.handle, title: data.title, ruleTag: data.rule_tag, description: data.description };
}, LAUNCH_REVALIDATE);

/** The story blocks above a collection's grid — film, stills, quotes. A row
 *  with no asset is a slot, and `CollectionStories` declines to render it. */
export const getCollectionStories = cachedCatalogue("collection-stories", async (handle: string) => {
  const { data, error } = await supabase
    .from("collection_stories")
    .select("id,kind,title,body,asset_url,poster_url,credit,ambient")
    .eq("collection_handle", handle)
    .order("position", { ascending: true });
  // A story that cannot be read must never take the collection down with it.
  if (error) {
    console.error("[launch] could not read collection stories:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as "video" | "image" | "quote",
    title: r.title as string | null,
    body: r.body as string | null,
    assetUrl: r.asset_url as string | null,
    posterUrl: r.poster_url as string | null,
    credit: r.credit as string | null,
    ambient: Boolean(r.ambient),
  }));
}, LAUNCH_REVALIDATE);

/**
 * Images for the TEASER, from a collection that is not published yet.
 *
 * The teaser exists precisely BEFORE the collection is public, so it cannot
 * use the ordinary catalogue queries — those return active products only, and
 * RLS hides drafts from the anon key entirely. Without this the teaser mail
 * and the teaser band would both go out with no pictures at all, which is the
 * one thing a teaser cannot do.
 *
 * Only ever returns public URLs: an image still sitting on somebody's laptop is
 * useless in an email, and a teaser is not worth showing a broken picture for.
 *
 * Prefers the CLOSE CROP over the whole flat. A teaser should withhold, and a
 * full repeat tile hands the design over in one look; the crop is the same
 * artwork at reading distance — material, not motif. The flat remains the
 * fallback for anything that has no crop yet, so this can never leave a teaser
 * imageless. Crops are written beside the flats by scripts/seed-taash.ts.
 */
export async function getTeaserImages(tag: string, limit = 3) {
  const admin = supabaseAdmin();
  if (!admin) {
    // Loud, not silent. Without the service role this returns nothing, the
    // teaser band renders nothing, and the page looks merely quiet — a launch
    // that has silently lost its teaser is indistinguishable from one that has
    // not started. supabaseAdmin() only warns, so say it plainly here.
    console.error(
      "[launch] TEASER HAS NO IMAGES: SUPABASE_SERVICE_ROLE_KEY is missing from this runtime, " +
      "so drafts cannot be read. The teaser band and teaser mail will be empty.",
    );
    return [];
  }
  const { data, error } = await admin
    .from("products")
    .select("handle,title,product_tags!inner(tag),product_images(url,is_flat)")
    .eq("product_tags.tag", tag)
    .limit(24);
  if (error) {
    console.error("[launch] could not read teaser images:", error.message);
    return [];
  }
  type Row = { handle: string; title: string; product_images: { url: string; is_flat: boolean }[] };
  return (data as unknown as Row[])
    .map((p) => {
      const flat =
        (p.product_images ?? []).find((i) => i.is_flat && i.url?.startsWith("http"))?.url ?? null;
      // The crop sits beside the flat in Storage under the same handle. It is
      // derived rather than registered — a close-up of the pattern has no place
      // in a product gallery — so the URL is built, not looked up.
      const crop = flat?.endsWith("/flat.png")
        ? flat.replace(/\/flat\.png$/, "/crop.jpg")
        : null;
      return { handle: p.handle, title: p.title, image: crop ?? flat };
    })
    .filter((p): p is { handle: string; title: string; image: string } => Boolean(p.image))
    .slice(0, limit);
}
