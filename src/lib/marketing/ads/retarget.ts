// The Meta (Facebook + Instagram) sales launcher: retargeting, and optionally
// prospecting, in the three approved cities. Deterministic — no model plans
// anything here — and it only ever runs because a signed-in staff member pressed
// a button on the marketing desk (/api/admin/marketing/meta-retarget).
//
// WHY THIS EXISTS. The engine's first launcher (meta.launchCampaign, now
// retired) built campaigns from an LLM-written plan and could never run an ad:
// it created ad sets with `geo_locations: { cities: [] }` — which Meta reads as
// ALL OF INDIA, not "no cities" — with no pixel event to optimise for, no
// creative and no ad. This file builds the whole chain, and every link of it is
// checked before a rupee can move:
//
//   cities   → resolved to Meta geo keys by exact name AND region, or the launch
//              refuses. There is no fallback to empty geo, anywhere, ever.
//   audience → "site visitors 30d" minus "purchasers 180d", both pixel-backed
//              website custom audiences, found by name or created (free).
//   creative → 1–3 designs shown ON A WALL (a room render, never the flat
//              swatch — the homepage's rule 9, for the same reason: a bare
//              pattern does not read as a wall covering), uploaded as ad images.
//   ad set   → per-variant daily budget in paise, optimising for Purchase.
//   ad       → one per creative per ad set.
//
// VARIANTS. One campaign ("zyvorah-sales-3city-v1", OUTCOME_SALES) carries the
// variants as separate ad sets, each with its OWN daily budget — no campaign
// budget optimisation, so ₹500 for retargeting stays ₹500 however Meta rates
// the other ad set. Each variant is enabled independently from the desk, and a
// variant added later becomes a new ad set in the existing campaign, not a new
// campaign:
//   retarget — visitors 30d minus purchasers, ₹500/day. The approved plan
//              (docs/ads-relaunch-checklist.md). Gated on the visitor audience
//              clearing MIN_AUDIENCE: below that Meta cannot deliver it, and a
//              small pool at full budget is the same ten people seeing the same
//              ad all week.
//   prospect — no custom audience (purchasers still excluded), Advantage+
//              audience, ₹2,000/day. Historically the channel that actually
//              produced sample orders. Not gated on audience size — there is no
//              pool to wait for.
//
// SPENDING NEEDS THREE THINGS, all at once (see launchMetaSales):
//   1. an explicit `activate: true` from a signed-in staff member — the desk's
//      "Launch live" button, behind a confirm() that states the ₹/day;
//   2. every selected variant's own gate (retarget: the audience size);
//   3. budget headroom for the week, committed to the cap-enforced ledger
//      BEFORE anything is switched on — if the ledger refuses, nothing flips.
// Everything is CREATED paused and flipped to ACTIVE only at the very end, so a
// failure halfway leaves paused objects, never a half-built live campaign.
//
// META_LAUNCH_ACTIVE is deliberately NOT consulted. That flag was the
// autonomous engine's "may a machine switch spend on by itself" switch. Here a
// person is pressing a button labelled with the daily spend; requiring an env
// flag as well would only mean the button silently does the paused thing, which
// is the class of failure (a switch that reads as set and is not) this codebase
// keeps writing post-mortems about.
//
// LEDGER. marketing_record_spend is a weekly cap, so what is committed is ONE
// WEEK of the variants being switched on (daily × 7 — ₹3,500 for retargeting),
// not a lifetime figure. Creating paused commits nothing: nothing can spend.
// The ledger does not learn about week two on its own — the monitoring loop
// (orchestrator.monitorCampaigns) records results, and the weekly review decides
// whether the campaign keeps running.
//
// IDEMPOTENCY. One marketing_campaigns row, name = CAMPAIGN_KEY, holds every id
// this file has created (plan.meta). It is written BEFORE the first Graph POST
// and after every one, so a launch that fails at step 5 resumes at step 5 on the
// next click instead of creating a second campaign. A second "Launch" for a
// variant that already exists returns its ids and, if asked to activate a
// paused one, only flips it.

/* eslint-disable @typescript-eslint/no-explicit-any -- Graph API responses are untyped JSON, read defensively field by field (as meta.ts does). */
import { supabase } from "@/lib/supabase";
import { metaAdsToken, metaIgAccountId, metaAdAccountId } from "@/lib/meta-env";
import { metaCapiPixelId } from "@/lib/meta-capi";
import { SAMPLE_UNIT_PRICE } from "@/lib/sample-print";
import { sortImages } from "@/lib/queries";
import type { ProductImage } from "@/lib/types";
import { serviceClient, hasServiceRole } from "../db";
import { canSpend, recordSpend, budgetStatus, type BudgetStatus } from "../budget";
import { checkCaption } from "../safety";
import { graphGet, graphPost, metaConfigured, resolveMetaPageId } from "./meta";

// ---- The plan (constants, not a model's opinion) -----------------------------

/** Retargeting ceiling, ₹/day — the approved figure (30 Sep 2026). */
export const DAILY_BUDGET_INR = 500;
/** Prospecting default, ₹/day. Only runs if ticked on the desk. */
export const PROSPECT_DAILY_BUDGET_INR = 2000;
/** What the ledger is asked for when a variant goes live: one week of it. */
export const LEDGER_DAYS = 7;

/**
 * Mumbai (MMR), Delhi NCR, Bengaluru. NCR is not one Meta city, so it is
 * Delhi + Gurgaon + Noida. `names` are the spellings Meta's geo index may carry
 * (it has used both Bangalore and Bengaluru, Gurgaon and Gurugram); `region`
 * pins the match so "Delhi" cannot resolve to a Delhi somewhere else.
 */
export const CITY_QUERIES: { q: string; names: string[]; region: string }[] = [
  { q: "Mumbai", names: ["Mumbai"], region: "Maharashtra" },
  { q: "Delhi", names: ["Delhi", "New Delhi"], region: "Delhi" },
  { q: "Gurgaon", names: ["Gurgaon", "Gurugram"], region: "Haryana" },
  { q: "Noida", names: ["Noida"], region: "Uttar Pradesh" },
  { q: "Bengaluru", names: ["Bengaluru", "Bangalore"], region: "Karnataka" },
];
export const COUNTRY = "IN";

export const RETENTION_DAYS = 30;
export const PURCHASER_RETENTION_DAYS = 180; // Meta's maximum for website audiences
/** Below this the visitor pool cannot carry retargeting (Meta's own floor is ~1,000). */
export const MIN_AUDIENCE = 1000;

export const OBJECTIVE = "OUTCOME_SALES";
/**
 * PURCHASE, not LEAD: the ₹200 design sample is a paid order, and it fires
 * Purchase on both paths — the browser pixel in OrderSample.tsx
 * (metaPurchase, after /api/razorpay/verify succeeds) and the server CAPI
 * event from that same verify route (sendMetaPurchaseForOrder, which reads any
 * paid order, samples included). So the bidder gets a Purchase for the small,
 * frequent conversion as well as the rare full order — enough signal to learn
 * from, and the conversion that actually matters.
 */
export const OPTIMIZATION_EVENT = "PURCHASE";

import { SITE, URL_TAGS } from "./tracking";
export { SITE, URL_TAGS };

/** Stable names: the idempotency key and what {{campaign.name}} puts in GA. */
export const CAMPAIGN_KEY = "zyvorah-sales-3city-v1";
export const VISITORS_AUDIENCE = "Zyvorah · site visitors 30d";
export const PURCHASERS_AUDIENCE = "Zyvorah · purchasers 180d";

export const MAX_IMAGES = 3;
/** Room renders are large masters; anything past this is skipped, not uploaded. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Advantage+ audience on prospecting. With it ON, Meta treats age as a
 * suggestion and only accepts a hard minimum age up to 25 (and no hard maximum
 * below 65), so the 28–55 intent cannot be sent as a control — it is the
 * audience Meta is expected to find, not a fence. Set false to send 28–55 as
 * hard limits on a broad (non-Advantage) ad set instead.
 */
export const PROSPECT_ADVANTAGE_AUDIENCE = true;

export type VariantKey = "retarget" | "prospect";

export type VariantSpec = {
  key: VariantKey;
  label: string;
  /** Stable ad-set name — {{adset.name}} in utm_content. */
  adSetName: string;
  dailyBudgetInr: number;
  /** True → needs the visitor pool to clear MIN_AUDIENCE before it can go live. */
  gatedOnAudience: boolean;
  summary: string;
};

export const VARIANTS: Record<VariantKey, VariantSpec> = {
  retarget: {
    key: "retarget",
    label: "Retargeting",
    adSetName: "retarget-visitors30d",
    dailyBudgetInr: DAILY_BUDGET_INR,
    gatedOnAudience: true,
    summary: `Site visitors (last ${RETENTION_DAYS} days), excluding purchasers · age 25+`,
  },
  prospect: {
    key: "prospect",
    label: "Prospecting",
    adSetName: "prospect-advantage",
    dailyBudgetInr: PROSPECT_DAILY_BUDGET_INR,
    gatedOnAudience: false,
    summary: PROSPECT_ADVANTAGE_AUDIENCE
      ? "Advantage+ audience (aimed at 28–55, hard floor 25), excluding purchasers"
      : "Broad, age 28–55, excluding purchasers",
  },
};
export const VARIANT_KEYS = Object.keys(VARIANTS) as VariantKey[];
/** The approved plan is retargeting only; prospecting is opt-in. */
export const DEFAULT_VARIANTS: VariantKey[] = ["retarget"];

// ---- Types -----------------------------------------------------------------

/** One Graph request, as it would be sent (minus the token). */
export type GraphCall = { method: "GET" | "POST"; node: string; params: Record<string, unknown>; note?: string };

export type CityKey = { query: string; key?: string; name?: string; region?: string; error?: string };
export type AudienceInfo = {
  name: string;
  id?: string;
  lowerBound?: number | null;
  upperBound?: number | null;
  deliveryCode?: number | null;
  deliveryText?: string | null;
  exists: boolean;
  error?: string;
};
export type CreativePick = { handle: string; title: string; link: string; imageUrl: string; message: string };

/** What the marketing_campaigns row keeps in plan.meta — every id created so far. */
type VariantRecord = { adSetId?: string; ads: Record<string, string>; status: "PAUSED" | "ACTIVE"; activatedAt?: string; committedInr?: number };
type LaunchRecord = {
  kind: "meta-sales-v1";
  campaignId?: string;
  campaignStatus?: "PAUSED" | "ACTIVE";
  audiences: { visitors?: string; purchasers?: string };
  cityKeys?: { key: string; name: string }[];
  /** The designs the ads were built from. Pinned on first launch so a later
   *  click (e.g. adding prospecting) reuses them rather than following this
   *  week's popularity into a fresh set of images, creatives and ads. */
  picks?: CreativePick[];
  images: Record<string, string>; // handle → image_hash
  creatives: Record<string, string>; // handle → creative id
  variants: Partial<Record<VariantKey, VariantRecord>>;
  lastError?: string;
};

export type Preview = {
  campaignKey: string;
  objective: string;
  optimizationEvent: string;
  cities: CityKey[];
  audiences: { visitors: AudienceInfo; purchasers: AudienceInfo };
  creatives: CreativePick[];
  variants: (VariantSpec & { weeklyInr: number; liveBlockers: string[]; existing: VariantRecord | null })[];
  /** Block ANY launch, paused included. */
  blockers: string[];
  /** Block going live for every variant (budget); per-variant ones sit on the variant. */
  liveBlockers: string[];
  budget: Pick<BudgetStatus, "weekly_cap" | "per_campaign_cap" | "active" | "spent_this_week" | "remaining_this_week"> | null;
  existing: { rowId: string; campaignId?: string; campaignStatus?: string; status: string } | null;
  payloads: GraphCall[];
  unresolved: string[];
  urlTags: string;
};

// ---- Small helpers ----------------------------------------------------------

/** Graph params travel as form fields: objects and arrays as JSON strings. */
function enc(params: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

/**
 * Error text is shown on the desk and stored on the row. A fetch failure can in
 * principle echo the URL it was fetching — and a GET carries the token in its
 * query string — so every message leaving this file is scrubbed first.
 */
export function scrub(msg: string): string {
  const token = metaAdsToken();
  let out = msg.replace(/access_token=[^&\s"']+/g, "access_token=***");
  if (token) out = out.split(token).join("***");
  return out;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

// ---- Cities -----------------------------------------------------------------

/**
 * Resolve every city to its Meta geo key, or throw. Empty geo is not a
 * degraded launch, it is a nationwide one — that is the bug this file exists to
 * end — so there is no path from here that returns fewer keys than cities.
 */
export async function resolveCityKeys(): Promise<{ key: string; name: string; region: string }[]> {
  const found = await resolveCitiesSoft();
  const missing = found.filter((c) => !c.key);
  if (missing.length) {
    throw new Error(`could not resolve city keys for ${missing.map((m) => `${m.query} (${m.error})`).join(", ")} — refusing to launch without geo`);
  }
  return found.map((c) => ({ key: c.key!, name: c.name!, region: c.region! }));
}

/** Same lookups, but each failure is reported rather than thrown (the preview). */
async function resolveCitiesSoft(): Promise<CityKey[]> {
  const out: CityKey[] = [];
  for (const city of CITY_QUERIES) {
    try {
      let hit: any = null;
      // Try each spelling; stop at the first exact name match IN the region.
      for (const q of [city.q, ...city.names.filter((n) => n !== city.q)]) {
        const res = await graphGet("search", {
          type: "adgeolocation",
          location_types: JSON.stringify(["city"]),
          country_code: COUNTRY,
          q,
          limit: "25",
        });
        const rows: any[] = res?.data ?? [];
        hit = rows.find(
          (r) =>
            r?.type === "city" &&
            String(r?.country_code ?? COUNTRY) === COUNTRY &&
            city.names.some((n) => n.toLowerCase() === String(r?.name ?? "").toLowerCase()) &&
            String(r?.region ?? "").toLowerCase() === city.region.toLowerCase(),
        );
        if (hit) break;
      }
      out.push(
        hit
          ? { query: city.q, key: String(hit.key), name: String(hit.name), region: String(hit.region) }
          : { query: city.q, error: `no exact match in ${city.region}` },
      );
    } catch (e) {
      out.push({ query: city.q, error: scrub((e as Error).message) });
    }
  }
  return out;
}

// ---- Audiences --------------------------------------------------------------

function visitorsRule(pixelId: string) {
  return {
    inclusions: {
      operator: "or",
      rules: [
        {
          event_sources: [{ id: pixelId, type: "pixel" }],
          retention_seconds: RETENTION_DAYS * 86400,
          filter: { operator: "and", filters: [{ field: "url", operator: "i_contains", value: "zyvorah.com" }] },
        },
      ],
    },
  };
}

function purchasersRule(pixelId: string) {
  return {
    inclusions: {
      operator: "or",
      rules: [
        {
          event_sources: [{ id: pixelId, type: "pixel" }],
          retention_seconds: PURCHASER_RETENTION_DAYS * 86400,
          filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: "Purchase" }] },
        },
      ],
    },
  };
}

// Retention lives INSIDE the rule (retention_seconds), as in Meta's website
// custom audience reference; no top-level retention_days alongside it.
function audienceCreateParams(name: string, rule: unknown): Record<string, unknown> {
  return {
    name,
    rule,
    // Backfill from the pixel's history rather than starting empty today.
    prefill: true,
    description: "Created by the Zyvorah marketing desk (ads/retarget.ts). Name is the lookup key — do not rename.",
  };
}

const AUDIENCE_FIELDS = "id,name,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status";

async function listAudiences(): Promise<any[]> {
  const account = metaAdAccountId()!;
  const res = await graphGet(`${account}/customaudiences`, { fields: AUDIENCE_FIELDS, limit: "500" });
  return res?.data ?? [];
}

function toInfo(name: string, row: any | undefined): AudienceInfo {
  if (!row) return { name, exists: false };
  const lb = row.approximate_count_lower_bound;
  const ub = row.approximate_count_upper_bound;
  return {
    name,
    id: String(row.id),
    exists: true,
    lowerBound: typeof lb === "number" ? lb : lb != null ? Number(lb) : null,
    upperBound: typeof ub === "number" ? ub : ub != null ? Number(ub) : null,
    deliveryCode: row.delivery_status?.code ?? null,
    deliveryText: row.delivery_status?.description ?? null,
  };
}

/** Find a website audience by exact name, else create it. Creating costs nothing. */
export async function ensureWebsiteAudience(name: string, rule: unknown): Promise<AudienceInfo> {
  const existing = (await listAudiences()).find((a) => a?.name === name);
  if (existing) return toInfo(name, existing);
  const account = metaAdAccountId()!;
  const created = await graphPost(`${account}/customaudiences`, enc(audienceCreateParams(name, rule)));
  // A fresh audience reports no size for a while; read it back once for what there is.
  try {
    const row = await graphGet(String(created.id), { fields: AUDIENCE_FIELDS });
    return toInfo(name, row);
  } catch {
    return { name, id: String(created.id), exists: true, lowerBound: null, upperBound: null };
  }
}

/**
 * Can the visitor pool carry retargeting? Meta reports the size as a range and
 * a delivery status; 300 is its own "audience too small". An unknown size is
 * NOT big enough — this gate fails closed.
 */
export function audienceClears(a: AudienceInfo): { ok: boolean; reason?: string } {
  if (!a.exists) return { ok: false, reason: `"${a.name}" does not exist yet (it is created on the first launch)` };
  if (a.deliveryCode === 300) return { ok: false, reason: `"${a.name}": Meta says the audience is too small to deliver` };
  if (a.lowerBound == null || !Number.isFinite(a.lowerBound) || a.lowerBound < 0)
    return { ok: false, reason: `"${a.name}": size not reported yet` };
  if (a.lowerBound < MIN_AUDIENCE)
    return { ok: false, reason: `"${a.name}" is about ${a.lowerBound.toLocaleString("en-IN")} people — needs ${MIN_AUDIENCE.toLocaleString("en-IN")}` };
  return { ok: true };
}

// ---- Creatives --------------------------------------------------------------

/**
 * The ad copy. Leads with the free on-wall preview (the conversion pass's
 * headline, live since 27 Sep). The named design leads; the
 * sample price comes from SAMPLE_UNIT_PRICE — the constant the sample checkout
 * charges — and the safety gate is handed the same number, so the ad cannot
 * quote a price the checkout does not charge.
 */
export function adMessage(title: string): string {
  return [
    `${title} — see it on your own wall, free, before you buy.`,
    `See the colours and texture at home. A design sample is ₹${SAMPLE_UNIT_PRICE}.`,
  ].join("\n\n");
}

type ImageRow = ProductImage;
type ProductRow = { handle: string; title: string; status: string; is_service: boolean; category: string | null; product_images: ImageRow[] | null };

/** The picture an ad uses: a room render (never the flat), landscape or square, big enough to survive a feed. */
function adRender(images: ImageRow[] | null): ImageRow | null {
  const renders = sortImages(images ?? []).filter((i) => !i.is_flat && !!i.url);
  const sized = renders.filter((i) => (i.width ?? 0) >= 1000 && (i.height ?? 0) > 0 && (i.width ?? 0) >= (i.height ?? 0));
  // Measured-and-suitable first; an unmeasured render is still a render, and still better than nothing.
  return sized[0] ?? renders.find((i) => i.width == null) ?? null;
}

/**
 * Up to MAX_IMAGES designs: what shoppers are responding to (popular_designs —
 * orders, then intent, then views, 30 days), topped up from the aesthetic
 * ranking. Each must be an active wallpaper with a room render.
 */
export async function pickCreatives(limit = MAX_IMAGES): Promise<CreativePick[]> {
  const handles: string[] = [];
  try {
    const { data } = await supabase.rpc("popular_designs", { p_days: 30, p_limit: 12 });
    for (const r of (data ?? []) as { handle: string }[]) if (r.handle) handles.push(r.handle);
  } catch {
    // Ranking alone is fine.
  }
  const select = "handle, title, status, is_service, category, product_images ( url, alt, position, is_featured, is_flat, scene_key, width, height )";
  const rows: ProductRow[] = [];
  if (handles.length) {
    const { data } = await supabase.from("products").select(select).in("handle", handles);
    const order = new Map(handles.map((h, i) => [h, i]));
    rows.push(...((data ?? []) as unknown as ProductRow[]).sort((a, b) => (order.get(a.handle) ?? 0) - (order.get(b.handle) ?? 0)));
  }
  const { data: ranked } = await supabase
    .from("products")
    .select(select)
    .eq("status", "active")
    .eq("is_service", false)
    .eq("category", "wallpaper")
    .order("aesthetic_rank", { ascending: true, nullsFirst: false })
    .limit(24);
  rows.push(...((ranked ?? []) as unknown as ProductRow[]));

  const out: CreativePick[] = [];
  const seen = new Set<string>();
  for (const p of rows) {
    if (out.length >= limit) break;
    if (seen.has(p.handle)) continue;
    seen.add(p.handle);
    if (p.status !== "active" || p.is_service || (p.category && p.category !== "wallpaper")) continue;
    const img = adRender(p.product_images);
    if (!img) continue;
    out.push({
      handle: p.handle,
      title: p.title,
      // The product page, not a sample deep link: the page leads with the free
      // preview and carries the sample button itself.
      link: `${SITE}/products/${encodeURIComponent(p.handle)}`,
      imageUrl: img.url,
      message: adMessage(p.title),
    });
  }
  return out;
}

async function uploadImage(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image fetch ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!/^image\/(jpeg|png)/i.test(type)) throw new Error(`image is ${type || "untyped"}, not JPEG/PNG`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES) throw new Error(`image is ${declared} bytes (limit ${MAX_IMAGE_BYTES})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_IMAGE_BYTES) throw new Error(`image is ${buf.byteLength} bytes (limit ${MAX_IMAGE_BYTES})`);
  const account = metaAdAccountId()!;
  const json = await graphPost(`${account}/adimages`, { bytes: buf.toString("base64") });
  // { images: { bytes: { hash, url } } } — keyed by the upload's field name.
  const first = Object.values((json?.images ?? {}) as Record<string, { hash?: string }>)[0];
  if (!first?.hash) throw new Error("adimages returned no hash");
  return first.hash;
}

// ---- Payload builders (shared by the preview and the launch) ----------------

function campaignParams(): Record<string, unknown> {
  return {
    name: CAMPAIGN_KEY,
    objective: OBJECTIVE,
    status: "PAUSED", // always created paused; flipped last, and only on "Launch live"
    special_ad_categories: [],
    buying_type: "AUCTION",
  };
}

function targeting(v: VariantKey, cityKeys: string[], visitorsId: string, purchasersId: string): Record<string, unknown> {
  if (!cityKeys.length) throw new Error("no city keys — refusing to build targeting (empty geo is all of India)");
  const geo = { cities: cityKeys.map((key) => ({ key })), location_types: ["home", "recent"] };
  const platforms = ["facebook", "instagram"];
  if (v === "retarget") {
    return {
      geo_locations: geo,
      custom_audiences: [{ id: visitorsId }],
      excluded_custom_audiences: [{ id: purchasersId }],
      age_min: 25,
      publisher_platforms: platforms,
      // Explicitly OFF: with Advantage+ audience on, the visitor audience
      // becomes a suggestion and Meta may spend outside it — which would make
      // this prospecting at retargeting's budget. Meta also refuses ad sets
      // that leave this flag unset.
      targeting_automation: { advantage_audience: 0 },
    };
  }
  return PROSPECT_ADVANTAGE_AUDIENCE
    ? {
        geo_locations: geo,
        excluded_custom_audiences: [{ id: purchasersId }],
        age_min: 25, // the highest hard minimum Advantage+ audience accepts
        publisher_platforms: platforms,
        targeting_automation: { advantage_audience: 1 },
      }
    : {
        geo_locations: geo,
        excluded_custom_audiences: [{ id: purchasersId }],
        age_min: 28,
        age_max: 55,
        publisher_platforms: platforms,
        targeting_automation: { advantage_audience: 0 },
      };
}

function adSetParams(v: VariantKey, campaignId: string, pixelId: string, t: Record<string, unknown>): Record<string, unknown> {
  const spec = VARIANTS[v];
  return {
    name: spec.adSetName,
    campaign_id: campaignId,
    status: "PAUSED",
    // Ad-account currency is INR; Graph budgets are in the currency's minor unit.
    daily_budget: String(Math.round(spec.dailyBudgetInr * 100)), // paise
    billing_event: "IMPRESSIONS",
    optimization_goal: "OFFSITE_CONVERSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    destination_type: "WEBSITE",
    promoted_object: { pixel_id: pixelId, custom_event_type: OPTIMIZATION_EVENT },
    targeting: t,
  };
}

function creativeParams(c: CreativePick, imageHash: string, pageId: string, igId: string | undefined): Record<string, unknown> {
  return {
    name: `zyvorah-${c.handle}-v1`,
    object_story_spec: {
      page_id: pageId,
      ...(igId ? { instagram_user_id: igId } : {}),
      link_data: {
        link: c.link,
        message: c.message,
        name: c.title,
        image_hash: imageHash,
        call_to_action: { type: "SHOP_NOW", value: { link: c.link } },
      },
    },
    url_tags: URL_TAGS,
  };
}

function adParams(v: VariantKey, handle: string, adSetId: string, creativeId: string): Record<string, unknown> {
  return {
    name: adName(v, handle),
    adset_id: adSetId,
    creative: { creative_id: creativeId },
    status: "PAUSED",
  };
}

// The design handle alone: utm_content is already "{{adset.name}}--{{ad.name}}",
// so prefixing the variant here would print it twice in GA.
const adName = (_v: VariantKey, handle: string) => handle;

// ---- The stored record -------------------------------------------------------

type Row = { id: string; status: string; external_id: string | null; plan: any };

async function loadRow(): Promise<Row | null> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from("marketing_campaigns")
    .select("id, status, external_id, plan")
    .eq("channel", "meta")
    .eq("name", CAMPAIGN_KEY)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`marketing_campaigns read: ${error.message}`);
  return (data?.[0] as Row) ?? null;
}

function recordOf(row: Row | null): LaunchRecord {
  const m = row?.plan?.meta;
  return m?.kind === "meta-sales-v1"
    ? { images: {}, creatives: {}, audiences: {}, variants: {}, ...m }
    : { kind: "meta-sales-v1", audiences: {}, images: {}, creatives: {}, variants: {} };
}

function planSnapshot(rec: LaunchRecord) {
  return {
    source: "ads/retarget.ts",
    objective: OBJECTIVE,
    optimization_event: OPTIMIZATION_EVENT,
    cities: CITY_QUERIES.map((c) => c.q),
    variants: Object.fromEntries(VARIANT_KEYS.map((k) => [k, { adSetName: VARIANTS[k].adSetName, dailyBudgetInr: VARIANTS[k].dailyBudgetInr }])),
    meta: rec,
  };
}

// ---- Preview (dry run) -------------------------------------------------------

/**
 * Everything a launch would do, without a single POST. GETs (city keys,
 * audience lookup) run only when Meta is configured, and each failure is
 * reported in `unresolved` rather than thrown — so this answers even with Meta
 * unreachable, and says what it could not find out.
 */
export async function previewMetaSales(): Promise<Preview> {
  const blockers: string[] = [];
  const liveBlockers: string[] = [];
  const unresolved: string[] = [];

  const configured = metaConfigured();
  const page = await resolveMetaPageId();
  const pageId = page.id;
  const igId = metaIgAccountId();
  const pixelId = metaCapiPixelId();
  if (!configured) blockers.push("META_ADS_TOKEN / META_AD_ACCOUNT_ID not set");
  if (!pageId) blockers.push(page.error ?? "META_PAGE_ID not set (the Page the ads run as)");
  if (!igId) unresolved.push("META_IG_ACCOUNT_ID not set — ads would run on Instagram as the Facebook Page, not @zyvorah");
  if (!pixelId) blockers.push("pixel id not set (NEXT_PUBLIC_META_PIXEL_ID / META_PIXEL_ID)");
  if (!hasServiceRole()) blockers.push("no service role — the launch cannot be recorded, so it will not run");

  // Cities
  let cities: CityKey[] = CITY_QUERIES.map((c) => ({ query: c.q, error: "not looked up (Meta not configured)" }));
  if (configured) cities = await resolveCitiesSoft();
  const cityMissing = cities.filter((c) => !c.key);
  if (cityMissing.length) {
    const msg = `city keys unresolved: ${cityMissing.map((c) => `${c.query} (${c.error})`).join(", ")}`;
    (configured ? blockers : unresolved).push(msg);
  }

  // Audiences
  let visitors: AudienceInfo = { name: VISITORS_AUDIENCE, exists: false };
  let purchasers: AudienceInfo = { name: PURCHASERS_AUDIENCE, exists: false };
  if (configured) {
    try {
      const all = await listAudiences();
      visitors = toInfo(VISITORS_AUDIENCE, all.find((a) => a?.name === VISITORS_AUDIENCE));
      purchasers = toInfo(PURCHASERS_AUDIENCE, all.find((a) => a?.name === PURCHASERS_AUDIENCE));
    } catch (e) {
      const err = scrub((e as Error).message);
      visitors = { ...visitors, error: err };
      purchasers = { ...purchasers, error: err };
      unresolved.push(`audience lookup failed: ${err}`);
    }
  } else {
    unresolved.push("audiences not looked up (Meta not configured)");
  }

  // What is already there
  let row: Row | null = null;
  try {
    row = hasServiceRole() ? await loadRow() : null;
  } catch (e) {
    unresolved.push((e as Error).message);
  }
  const rec = recordOf(row);

  // Creatives — the pinned set once a launch has happened, else today's pick.
  let creatives: CreativePick[] = rec.picks ?? [];
  if (!creatives.length) {
    try {
      creatives = await pickCreatives();
    } catch (e) {
      unresolved.push(`design pick failed: ${(e as Error).message}`);
    }
  }
  if (!creatives.length) blockers.push("no active wallpaper with a room render to advertise");
  for (const c of creatives) {
    const safety = checkCaption(`${c.message}\n\n${c.title}`, { fromPrice: SAMPLE_UNIT_PRICE });
    if (!safety.ok) blockers.push(`copy for ${c.handle} failed the brand-safety gate: ${safety.issues.filter((i) => i.severity === "block").map((i) => i.detail).join("; ")}`);
  }

  // Budget
  const status = await budgetStatus().catch(() => null);
  if (!status) liveBlockers.push("budget status unavailable (key/service role)");
  else if (!status.active) liveBlockers.push("engine ad budget is paused");

  const variants = VARIANT_KEYS.map((k) => {
    const spec = VARIANTS[k];
    const vb: string[] = [];
    if (spec.gatedOnAudience) {
      const gate = audienceClears(visitors);
      if (!gate.ok) vb.push(gate.reason!);
    }
    return { ...spec, weeklyInr: spec.dailyBudgetInr * LEDGER_DAYS, liveBlockers: vb, existing: rec.variants[k] ?? null };
  });

  // Payloads, with placeholders for ids a launch would create.
  const account = metaAdAccountId() ?? "act_<META_AD_ACCOUNT_ID>";
  const px = pixelId ?? "<PIXEL_ID>";
  const cityKeys = cities.map((c) => c.key ?? `<city:${c.query}>`);
  const visitorsId = visitors.id ?? "{{audience:visitors}}";
  const purchasersId = purchasers.id ?? "{{audience:purchasers}}";
  const campaignId = rec.campaignId ?? "{{campaign_id}}";
  const payloads: GraphCall[] = [];
  for (const c of CITY_QUERIES)
    payloads.push({ method: "GET", node: "search", params: { type: "adgeolocation", location_types: ["city"], country_code: COUNTRY, q: c.q }, note: `must match ${c.names.join("/")} in ${c.region}` });
  payloads.push({ method: "GET", node: `${account}/customaudiences`, params: { fields: AUDIENCE_FIELDS, limit: 500 } });
  if (!visitors.id) payloads.push({ method: "POST", node: `${account}/customaudiences`, params: audienceCreateParams(VISITORS_AUDIENCE, visitorsRule(px)) });
  if (!purchasers.id) payloads.push({ method: "POST", node: `${account}/customaudiences`, params: audienceCreateParams(PURCHASERS_AUDIENCE, purchasersRule(px)) });
  if (!rec.campaignId) payloads.push({ method: "POST", node: `${account}/campaigns`, params: campaignParams() });
  for (const c of creatives) {
    if (!rec.images[c.handle]) payloads.push({ method: "POST", node: `${account}/adimages`, params: { bytes: `<base64 of ${c.imageUrl}>` } });
    if (!rec.creatives[c.handle])
      payloads.push({ method: "POST", node: `${account}/adcreatives`, params: creativeParams(c, rec.images[c.handle] ?? `{{image_hash:${c.handle}}}`, pageId ?? "<META_PAGE_ID>", igId) });
  }
  for (const k of VARIANT_KEYS) {
    const existing = rec.variants[k];
    const adSetId = existing?.adSetId ?? `{{adset_id:${k}}}`;
    if (!existing?.adSetId)
      payloads.push({ method: "POST", node: `${account}/adsets`, params: adSetParams(k, campaignId, px, targeting(k, cityKeys, visitorsId, purchasersId)), note: `variant ${k} — only if selected` });
    for (const c of creatives)
      if (!existing?.ads?.[c.handle])
        payloads.push({ method: "POST", node: `${account}/ads`, params: adParams(k, c.handle, adSetId, rec.creatives[c.handle] ?? `{{creative_id:${c.handle}}}`), note: `variant ${k} — only if selected` });
  }
  payloads.push({ method: "POST", node: "<ad / ad set / campaign id>", params: { status: "ACTIVE" }, note: "Launch live only — after the ledger accepts the week's spend; ads, then ad set, then campaign" });

  return {
    campaignKey: CAMPAIGN_KEY,
    objective: OBJECTIVE,
    optimizationEvent: OPTIMIZATION_EVENT,
    cities,
    audiences: { visitors, purchasers },
    creatives,
    variants,
    blockers,
    liveBlockers,
    budget: status
      ? {
          weekly_cap: status.weekly_cap,
          per_campaign_cap: status.per_campaign_cap,
          active: status.active,
          spent_this_week: status.spent_this_week,
          remaining_this_week: status.remaining_this_week,
        }
      : null,
    existing: row ? { rowId: row.id, campaignId: rec.campaignId, campaignStatus: rec.campaignStatus, status: row.status } : null,
    payloads,
    unresolved,
    urlTags: URL_TAGS,
  };
}

// ---- Launch -----------------------------------------------------------------

export type LaunchOutcome = {
  ok: boolean;
  /** "paused": everything exists, nothing spends. "live": the selected variants are ACTIVE. */
  state: "paused" | "live" | "refused" | "failed";
  campaignId?: string;
  variants: Partial<Record<VariantKey, { adSetId?: string; adIds: string[]; status: string }>>;
  committedInr: number;
  /** Which step failed, and what rollback did. */
  failedStep?: string;
  error?: string;
  rolledBack?: string[];
  notes: string[];
};

/**
 * Create (paused) or launch the selected variants. See the header for the
 * three conditions `activate` needs; any one missing and this returns
 * "refused" BEFORE a single Graph POST.
 */
export async function launchMetaSales(opts: { variants: VariantKey[]; activate: boolean; staff?: string | null }): Promise<LaunchOutcome> {
  const selected = [...new Set(opts.variants)].filter((v): v is VariantKey => (VARIANT_KEYS as string[]).includes(v)); // not `in`: "constructor" is in every object
  const notes: string[] = [];
  const empty = { variants: {}, committedInr: 0, notes };
  if (!selected.length) return { ok: false, state: "refused", error: "no variant selected", ...empty };
  if (!metaConfigured()) return { ok: false, state: "refused", error: "META_ADS_TOKEN / META_AD_ACCOUNT_ID not set", ...empty };
  const page = await resolveMetaPageId();
  const pageId = page.id;
  if (!pageId) return { ok: false, state: "refused", error: page.error ?? "META_PAGE_ID not set", ...empty };
  if (page.name) notes.push(`ads run as the Page "${page.name}" (${pageId}), found on the ad account`);
  const pixelId = metaCapiPixelId();
  if (!pixelId) return { ok: false, state: "refused", error: "pixel id not set", ...empty };
  if (!hasServiceRole()) return { ok: false, state: "refused", error: "no service role — cannot record the launch", ...empty };
  const igId = metaIgAccountId();
  if (!igId) notes.push("META_IG_ACCOUNT_ID not set — Instagram placements run as the Facebook Page");
  const account = metaAdAccountId()!;

  // ---- Everything that can refuse, before anything is written ---------------
  let row: Row | null;
  try {
    row = await loadRow();
  } catch (e) {
    return { ok: false, state: "refused", failedStep: "record", error: (e as Error).message, ...empty };
  }
  const rec = recordOf(row);

  let cityKeys: { key: string; name: string }[];
  let creatives: CreativePick[];
  let visitors: AudienceInfo;
  let purchasers: AudienceInfo;
  try {
    cityKeys = await resolveCityKeys();
    creatives = rec.picks?.length ? rec.picks : await pickCreatives();
    if (!creatives.length) throw new Error("no active wallpaper with a room render to advertise");
    for (const c of creatives) {
      const safety = checkCaption(`${c.message}\n\n${c.title}`, { fromPrice: SAMPLE_UNIT_PRICE });
      if (!safety.ok) throw new Error(`copy for ${c.handle} failed the brand-safety gate`);
    }
    // Audiences are created here even on a paused launch: they cost nothing and
    // every day they exist is a day of pool.
    visitors = await ensureWebsiteAudience(VISITORS_AUDIENCE, visitorsRule(pixelId));
    purchasers = await ensureWebsiteAudience(PURCHASERS_AUDIENCE, purchasersRule(pixelId));
    if (!visitors.id || !purchasers.id) throw new Error("audience ids missing after create");
  } catch (e) {
    return { ok: false, state: "refused", failedStep: "prepare", error: scrub((e as Error).message), ...empty };
  }

  const sb = serviceClient();
  rec.picks = creatives;
  rec.audiences = { visitors: visitors.id, purchasers: purchasers.id };
  rec.cityKeys = cityKeys;

  // Which selected variants would newly go live, and what that commits.
  const toActivate = opts.activate ? selected.filter((v) => rec.variants[v]?.status !== "ACTIVE") : [];
  const commitInr = toActivate.reduce((s, v) => s + VARIANTS[v].dailyBudgetInr * LEDGER_DAYS, 0);
  if (opts.activate) {
    for (const v of selected) {
      if (VARIANTS[v].gatedOnAudience) {
        const gate = audienceClears(visitors);
        if (!gate.ok) return { ok: false, state: "refused", failedStep: "audience gate", error: gate.reason, ...empty };
      }
    }
    if (commitInr > 0) {
      const spend = await canSpend(commitInr);
      if (!spend.ok) return { ok: false, state: "refused", failedStep: "budget", error: `${spend.reason} (needs ${inr(commitInr)} for the week)`, ...empty };
    }
  }

  // ---- Persist first, then build, persisting after every POST ---------------
  const save = async (status?: string) => {
    const patch: Record<string, unknown> = {
      plan: planSnapshot(rec),
      external_id: rec.campaignId ?? null,
      daily_budget: VARIANT_KEYS.filter((k) => rec.variants[k]).reduce((s, k) => s + VARIANTS[k].dailyBudgetInr, 0),
      lifetime_cap: VARIANT_KEYS.reduce((s, k) => s + (rec.variants[k]?.committedInr ?? 0), 0),
      error: rec.lastError ?? null,
    };
    if (status) patch.status = status;
    if (!row) {
      const { data, error } = await sb
        .from("marketing_campaigns")
        .insert({ channel: "meta", objective: OBJECTIVE, name: CAMPAIGN_KEY, status: status ?? "prepared", ...patch })
        .select("id, status, external_id, plan")
        .single();
      if (error || !data) throw new Error(`marketing_campaigns insert: ${error?.message ?? "no row"}`);
      row = data as Row;
    } else {
      const { error } = await sb.from("marketing_campaigns").update(patch).eq("id", row.id);
      // An id Meta created but we failed to write down is how duplicates are
      // born — stop here rather than create more of them.
      if (error) throw new Error(`marketing_campaigns update: ${error.message}`);
    }
  };

  const createdThisRun: { kind: "campaign" | "adset"; id: string }[] = [];
  let step = "record";
  try {
    rec.lastError = undefined;
    await save();

    if (!rec.campaignId) {
      step = "campaign";
      const c = await graphPost(`${account}/campaigns`, enc(campaignParams()));
      rec.campaignId = String(c.id);
      rec.campaignStatus = "PAUSED";
      createdThisRun.push({ kind: "campaign", id: rec.campaignId });
      await save("paused");
    }

    for (const c of creatives) {
      if (!rec.images[c.handle]) {
        step = `image ${c.handle}`;
        rec.images[c.handle] = await uploadImage(c.imageUrl);
        await save();
      }
      if (!rec.creatives[c.handle]) {
        step = `creative ${c.handle}`;
        const cr = await graphPost(`${account}/adcreatives`, enc(creativeParams(c, rec.images[c.handle], pageId, igId)));
        rec.creatives[c.handle] = String(cr.id);
        await save();
      }
    }

    for (const v of selected) {
      const vr: VariantRecord = rec.variants[v] ?? { ads: {}, status: "PAUSED" };
      rec.variants[v] = vr;
      if (!vr.adSetId) {
        step = `ad set ${v}`;
        const t = targeting(v, cityKeys.map((c) => c.key), visitors.id!, purchasers.id!);
        const s = await graphPost(`${account}/adsets`, enc(adSetParams(v, rec.campaignId!, pixelId, t)));
        vr.adSetId = String(s.id);
        createdThisRun.push({ kind: "adset", id: vr.adSetId });
        await save();
      }
      for (const c of creatives) {
        if (vr.ads[c.handle]) continue;
        step = `ad ${v}/${c.handle}`;
        const ad = await graphPost(`${account}/ads`, enc(adParams(v, c.handle, vr.adSetId!, rec.creatives[c.handle])));
        vr.ads[c.handle] = String(ad.id);
        await save();
      }
    }
  } catch (e) {
    const error = scrub((e as Error).message);
    // Everything above was created PAUSED, so nothing here can be spending.
    // Rollback re-asserts PAUSED on what THIS run created (a campaign that was
    // already running another variant is left alone — pausing it would stop
    // the working ad set to tidy up after the broken one) and keeps the ids,
    // so the next click resumes rather than duplicating.
    const rolledBack: string[] = [];
    for (const o of createdThisRun.reverse()) {
      try {
        await graphPost(o.id, { status: "PAUSED" });
        rolledBack.push(`${o.kind} ${o.id} paused`);
      } catch {
        rolledBack.push(`${o.kind} ${o.id} could NOT be re-paused — check Ads Manager`);
      }
    }
    rec.lastError = `${step}: ${error}`;
    const anyLive = VARIANT_KEYS.some((k) => rec.variants[k]?.status === "ACTIVE");
    await save(anyLive ? "live" : rec.campaignId ? "paused" : "failed").catch(() => {});
    return { ok: false, state: "failed", campaignId: rec.campaignId, failedStep: step, error, rolledBack, variants: summary(rec), committedInr: 0, notes };
  }

  if (!toActivate.length) {
    const anyLive = VARIANT_KEYS.some((k) => rec.variants[k]?.status === "ACTIVE");
    await save(anyLive ? "live" : "paused").catch(() => {});
    if (opts.activate) notes.push("selected variants were already live — nothing new committed");
    else notes.push("created PAUSED — review in Ads Manager; nothing spends until “Launch live”");
    return { ok: true, state: anyLive ? "live" : "paused", campaignId: rec.campaignId, variants: summary(rec), committedInr: 0, notes };
  }

  // ---- Go live: ledger first, then flip, ads → ad set → campaign ------------
  step = "ledger";
  const ledger = await recordSpend({
    channel: "meta",
    campaign: `${CAMPAIGN_KEY}:${toActivate.join("+")}`,
    amount: commitInr,
    results: { stage: "committed", days: LEDGER_DAYS, variants: toActivate, by: opts.staff ?? "staff", campaign_id: rec.campaignId },
  });
  if (!ledger.ok) {
    const anyLive = VARIANT_KEYS.some((k) => rec.variants[k]?.status === "ACTIVE");
    await save(anyLive ? "live" : "paused").catch(() => {});
    return { ok: false, state: "refused", campaignId: rec.campaignId, failedStep: "ledger", error: `ledger refused ${inr(commitInr)}: ${ledger.error}`, variants: summary(rec), committedInr: 0, notes: [...notes, "everything is created and PAUSED"] };
  }

  const flipped: string[] = [];
  try {
    for (const v of toActivate) {
      const vr = rec.variants[v]!;
      for (const c of creatives) {
        step = `activate ad ${v}/${c.handle}`;
        await graphPost(vr.ads[c.handle], { status: "ACTIVE" });
        flipped.push(vr.ads[c.handle]);
      }
      step = `activate ad set ${v}`;
      await graphPost(vr.adSetId!, { status: "ACTIVE" });
      flipped.push(vr.adSetId!);
      vr.status = "ACTIVE";
      vr.activatedAt = new Date().toISOString();
      vr.committedInr = (vr.committedInr ?? 0) + VARIANTS[v].dailyBudgetInr * LEDGER_DAYS;
    }
    if (rec.campaignStatus !== "ACTIVE") {
      step = "activate campaign";
      await graphPost(rec.campaignId!, { status: "ACTIVE" });
      rec.campaignStatus = "ACTIVE";
    }
    const { error } = await sb
      .from("marketing_campaigns")
      .update({ launched_at: new Date().toISOString() })
      .eq("id", row!.id);
    if (error) notes.push(`launched_at not written: ${error.message}`);
    await save("live");
  } catch (e) {
    const error = scrub((e as Error).message);
    // Re-pause only the ad sets this activation touched; the ledger row stays
    // (it is append-only) and is reported so the week's figure can be read
    // for what it is.
    const rolledBack: string[] = [];
    for (const v of toActivate) {
      const id = rec.variants[v]?.adSetId;
      if (!id) continue;
      try {
        await graphPost(id, { status: "PAUSED" });
        rolledBack.push(`ad set ${v} paused`);
        rec.variants[v]!.status = "PAUSED";
      } catch {
        rolledBack.push(`ad set ${v} could NOT be re-paused — check Ads Manager`);
      }
    }
    rec.lastError = `${step}: ${error}`;
    const anyLive = VARIANT_KEYS.some((k) => rec.variants[k]?.status === "ACTIVE");
    await save(anyLive ? "live" : "paused").catch(() => {});
    return {
      ok: false,
      state: "failed",
      campaignId: rec.campaignId,
      failedStep: step,
      error,
      rolledBack,
      variants: summary(rec),
      committedInr: commitInr,
      notes: [...notes, `${inr(commitInr)} was already committed to the ledger for this week`],
    };
  }

  notes.push(`live: ${toActivate.map((v) => `${VARIANTS[v].label} ${inr(VARIANTS[v].dailyBudgetInr)}/day`).join(", ")} — ${inr(commitInr)} committed for the week`);
  return { ok: true, state: "live", campaignId: rec.campaignId, variants: summary(rec), committedInr: commitInr, notes };
}

function summary(rec: LaunchRecord): LaunchOutcome["variants"] {
  const out: LaunchOutcome["variants"] = {};
  for (const k of VARIANT_KEYS) {
    const v = rec.variants[k];
    if (v) out[k] = { adSetId: v.adSetId, adIds: Object.values(v.ads), status: v.status };
  }
  return out;
}
