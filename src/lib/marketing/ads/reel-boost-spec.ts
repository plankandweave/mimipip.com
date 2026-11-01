// The promotion's rules as data and pure functions — which postcodes, what
// Meta is sent — kept apart from the launcher (reel-boost.ts) so they can be
// tested without a database. See reel-boost.ts for why each piece is so.

/* eslint-disable @typescript-eslint/no-explicit-any -- Graph search rows are untyped JSON. */
import { SITE, URL_TAGS } from "./tracking";

export type Pin = { code: string; area: string };

export type BoostSpec = {
  /** Stable: the Meta campaign name, the ledger key and {{campaign.name}} in GA. */
  key: string;
  label: string;
  /** The Library film whose published reel is promoted. */
  libraryId: string;
  /** Where "Learn more" goes. */
  path: string;
  /** Stable ad set and ad names — {{adset.name}}--{{ad.name}} in utm_content. */
  adSetName: string;
  adName: string;
  dailyBudgetInr: number;
  region: string;
  pins: Pin[];
  /** Below this many resolved postcodes the boost refuses rather than run thin. */
  minPins: number;
  ageMin: number;
};

export const BOOSTS: Record<string, BoostSpec> = {
  "lives-within-gurgaon": {
    key: "zyvorah-lives-within-gurgaon-v1",
    label: "The Lives Within · Gurgaon luxury homes",
    libraryId: "80f6eaec-f700-4f13-82fb-ab5bb5e2ed58",
    path: "/concepts/the-lives-within",
    adSetName: "gurgaon-luxury-pins",
    adName: "the-lives-within-reel",
    dailyBudgetInr: 1000,
    region: "Haryana",
    pins: [
      { code: "122002", area: "DLF Phases 1–3 and Golf Course Road, Sectors 42–43 (Magnolias, Aralias, Camellias)" },
      { code: "122009", area: "DLF Phases 4–5 and Sushant Lok, Sector 43" },
      { code: "122011", area: "Golf Course Road, Sectors 53–57 (The Crest, Park Place)" },
      { code: "122018", area: "Nirvana Country and Sohna Road, Sectors 47–50" },
      { code: "122101", area: "Golf Course Extension Road" },
      { code: "122102", area: "Golf Course Extension Road, Sectors 58–65" },
    ],
    minPins: 4,
    ageMin: 28,
  },
};

export type BoostKey = keyof typeof BOOSTS;
export const isBoostKey = (k: unknown): k is BoostKey => typeof k === "string" && Object.prototype.hasOwnProperty.call(BOOSTS, k);

/** Reach: as many different people in those homes as the budget allows, each
 *  seeing the film at most twice a week rather than the same few daily. */
export const OBJECTIVE = "OUTCOME_AWARENESS";
export const OPTIMIZATION_GOAL = "REACH";
export const FREQUENCY = { event: "IMPRESSIONS", interval_days: 7, max_frequency: 2 };

/* ── geography ─────────────────────────────────────────────────────────── */

export type PinKey = Pin & { key?: string; error?: string };

/** Pick Meta's row for one postcode: the exact code, in the expected state.
 *  Exported for tests. */
export function matchPin(rows: any[], code: string, region: string): { key: string } | null {
  const hit = rows.find(
    (r) =>
      r?.type === "zip" &&
      String(r?.name ?? "").replace(/\s/g, "") === code &&
      String(r?.region ?? "").toLowerCase() === region.toLowerCase(),
  );
  return hit?.key ? { key: String(hit.key) } : null;
}

/** The geography a boost may run on, or why it may not. Exported for tests. */
export function geoFor(spec: BoostSpec, pins: PinKey[]): { keys: string[] } | { error: string } {
  const keys = pins.filter((p) => p.key).map((p) => p.key!);
  if (keys.length < spec.minPins) {
    const missing = pins.filter((p) => !p.key).map((p) => `${p.code} (${p.error})`).join(", ");
    return { error: `only ${keys.length} of ${spec.pins.length} postcodes resolved — needs ${spec.minPins}. Missing: ${missing}` };
  }
  return { keys };
}

/* ── payloads ──────────────────────────────────────────────────────────── */

export function targeting(spec: BoostSpec, zipKeys: string[]): Record<string, unknown> {
  if (!zipKeys.length) throw new Error("no postcodes — refusing to build targeting (empty geo is all of India)");
  return {
    geo_locations: { zips: zipKeys.map((key) => ({ key })), location_types: ["home"] },
    age_min: spec.ageMin,
    publisher_platforms: ["instagram", "facebook"],
    // Off: the postcodes are the brief. With Advantage+ audience on, Meta may
    // treat targeting other than location as a suggestion and widen it.
    targeting_automation: { advantage_audience: 0 },
  };
}

export function adSetParams(spec: BoostSpec, campaignId: string, zipKeys: string[]): Record<string, unknown> {
  return {
    name: spec.adSetName,
    campaign_id: campaignId,
    status: "PAUSED",
    daily_budget: String(Math.round(spec.dailyBudgetInr * 100)), // paise
    billing_event: "IMPRESSIONS",
    optimization_goal: OPTIMIZATION_GOAL,
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    frequency_control_specs: [FREQUENCY],
    targeting: targeting(spec, zipKeys),
  };
}

export function creativeParams(spec: BoostSpec, mediaId: string, pageId: string, igId: string): Record<string, unknown> {
  const link = `${SITE}${spec.path}`;
  return {
    name: `${spec.key}-reel`,
    object_id: pageId,
    instagram_user_id: igId,
    source_instagram_media_id: mediaId,
    call_to_action: { type: "LEARN_MORE", value: { link } },
    url_tags: URL_TAGS,
  };
}

