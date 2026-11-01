import { serviceAvailable, requireService } from "../../../brand/services";
// Meta (Instagram/Facebook) Marketing API client — the paid-campaign launcher.
//
// SAFETY DEFAULTS (money is involved, and an AI is driving):
//  - Credential-gated: without META_AD_ACCOUNT_ID + META_ADS_TOKEN,
//    `configured` is false and nothing can launch. The engine still PREPARES the
//    full brief and records it as a 'prepared' campaign for review.
//  - Campaigns are created PAUSED unless META_LAUNCH_ACTIVE === 'true'. The
//    default is therefore: the engine builds the campaign and leaves it sitting
//    paused in Ads Manager for a glance before spend begins. Full hands-off
//    autonomy is one env flag away, but it is a conscious choice, not the default.
//  - The caller records the intended spend in the cap-enforced ledger BEFORE
//    activating, so the budget cap gates activation (see ads/orchestrator.ts).
//  - SUPERSEDED for launching (30 Sep 2026): launchCampaign() below is retired
//    and refuses. The only thing that creates Meta objects now is
//    ads/retarget.ts, driven by a signed-in staff click on the marketing desk —
//    and it does NOT read META_LAUNCH_ACTIVE (see its header for why). This
//    file keeps the Graph plumbing and the monitoring reads.
//
// Credentials (Vercel env, when the Meta app + ad account exist):
//   META_AD_ACCOUNT_ID     e.g. "act_1234567890"
//   META_ADS_TOKEN         system-user token with ads_management
//                          (META_SYSTEM_USER_TOKEN is accepted as the old name)
//   META_PAGE_ID           the Facebook Page id backing the ads
//   META_IG_ACCOUNT_ID     the Instagram account id (for IG placement creative)
//   META_GRAPH_VERSION     optional, defaults to a known-good version
//   META_LAUNCH_ACTIVE     "true" to create campaigns active; else paused

import { metaAdAccountId, metaAdsToken } from "@/lib/meta-env";
import { envFlag } from "@/lib/env-flag";

const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}`;

function creds() {
  return {
    account: metaAdAccountId(),
    token: metaAdsToken(),
    pageId: process.env.META_PAGE_ID,
    igId: process.env.META_IG_ACCOUNT_ID,
  };
}

export function metaConfigured(): boolean {
  const { account, token } = creds();
  return !!account && !!token;
}

export function launchActive(): boolean {
  return envFlag(process.env.META_LAUNCH_ACTIVE);
}

// Exported for the retargeting launcher (ads/retarget.ts), which builds its own
// objects rather than going through launchCampaign(). Meta's `error_user_msg`
// is preferred when present: `message` is often the generic "Invalid
// parameter", and the user message is the one that names WHICH parameter.
export async function graphPost(node: string, params: Record<string, string>): Promise<any> {
  if (!serviceAvailable("publishing")) requireService("publishing");
  const { token } = creds();
  const body = new URLSearchParams({ ...params, access_token: token! });
  const res = await fetch(`${GRAPH()}/${node}`, { method: "POST", body });
  const json = await res.json();
  if (!res.ok || json?.error) throw new Error(`Meta ${node}: ${graphError(json, res.status)}`);
  return json;
}

export async function graphGet(node: string, params: Record<string, string>): Promise<any> {
  if (!serviceAvailable("publishing")) requireService("publishing");
  const { token } = creds();
  const qs = new URLSearchParams({ ...params, access_token: token! });
  const res = await fetch(`${GRAPH()}/${node}?${qs}`);
  const json = await res.json();
  if (!res.ok || json?.error) throw new Error(`Meta ${node}: ${graphError(json, res.status)}`);
  return json;
}

type GraphErrorBody = { error?: { message?: string; error_user_title?: string; error_user_msg?: string } } | null;

function graphError(json: GraphErrorBody, status: number): string {
  const e = json?.error;
  if (!e) return String(status);
  const detail = [e.error_user_title, e.error_user_msg].filter(Boolean).join(": ");
  return detail ? `${e.message} — ${detail}` : e.message || String(status);
}

/** The Page and Instagram account the ads run as. Ids, not secrets — they are
 *  visible on every ad — but they are Worker secrets all the same. */
export function metaPageId(): string | undefined {
  return process.env.META_PAGE_ID?.trim() || undefined;
}

/**
 * The Page the ads run as: META_PAGE_ID when it is set, otherwise asked of
 * Meta — the Pages this ad account may promote (`promote_pages`). A Page id
 * is public (it is on every ad), so looking it up costs nothing and spares a
 * founder hunting for a number in Business Settings (6 October 2026: the
 * first launch stopped on "META_PAGE_ID not set").
 *
 * One promotable Page is used as is. Several are narrowed to the one named
 * Zyvorah; anything still ambiguous is refused with the candidates named,
 * never guessed — an ad running as the wrong brand's Page is worse than none.
 */
export async function resolveMetaPageId(): Promise<{ id?: string; name?: string; error?: string }> {
  const fromEnv = metaPageId();
  if (fromEnv) return { id: fromEnv };
  if (!metaConfigured()) return { error: "META_PAGE_ID not set, and Meta is not configured to look it up" };
  let pages: { id: string; name?: string }[];
  try {
    const res = await graphGet(`${creds().account}/promote_pages`, { fields: "id,name", limit: "25" });
    pages = ((res?.data ?? []) as { id?: unknown; name?: unknown }[])
      .filter((p) => typeof p.id === "string")
      .map((p) => ({ id: p.id as string, name: typeof p.name === "string" ? p.name : undefined }));
  } catch (e) {
    return { error: `META_PAGE_ID not set, and looking it up failed: ${(e as Error).message}` };
  }
  return pickPromotablePage(pages);
}

/** The choice itself, apart from the network: one Page, or the one named
 *  Zyvorah, or a refusal that names the candidates. */
export function pickPromotablePage(pages: { id: string; name?: string }[]): { id?: string; name?: string; error?: string } {
  if (pages.length === 1) return pages[0];
  const named = pages.filter((p) => /zyvorah/i.test(p.name ?? ""));
  if (named.length === 1) return named[0];
  if (!pages.length) return { error: "META_PAGE_ID not set, and the ad account has no Page it may promote — assign the Zyvorah Page to the ad account in Business Settings" };
  return { error: `META_PAGE_ID not set, and the ad account may promote several Pages (${pages.map((p) => p.name ?? p.id).join(", ")}) — set META_PAGE_ID to choose` };
}

// ---- Typed campaign plan -----------------------------------------------------

export type AdSetPlan = {
  name: string;
  dailyBudgetInr: number;
  cities: string[]; // metro names → mapped to Meta geo keys by the caller/targeting
  interests?: string[];
  ageMin?: number;
  ageMax?: number;
  landingUrl: string; // where the ad drives (a real product/collection URL)
};

export type CampaignPlan = {
  name: string;
  objective: "OUTCOME_TRAFFIC" | "OUTCOME_ENGAGEMENT" | "OUTCOME_SALES";
  lifetimeCapInr: number;
  adSets: AdSetPlan[];
  creative: {
    // The creative uses an existing Instagram media (our organic post) or an
    // image URL we composed. Kept simple: primary text + link + image.
    message: string;
    imageUrl?: string;
    instagramMediaId?: string;
  };
};

// ---- Launch flow -------------------------------------------------------------

export type LaunchResult = {
  ok: boolean;
  campaignId?: string;
  status: "live" | "paused" | "failed";
  error?: string;
};

/**
 * RETIRED — refuses without touching Meta.
 *
 * This used to create a campaign + ad sets from an LLM-planned CampaignPlan.
 * It could never run a real ad: the ad sets were created with
 * `geo_locations: { cities: [] }` (which is not "no cities", it is ALL OF
 * INDIA), no promoted_object, no creative and no ad — an empty, budgeted shell.
 * Two such plans (₹20k and ₹10k caps) were prepared on 5 September and sat
 * waiting to be retried the moment credentials lined up, which would have
 * committed ₹20k to the ledger for campaigns that could not deliver.
 *
 * Meta launches now go through ads/retarget.ts — a deterministic plan with
 * resolved city keys, pixel-backed audiences, a real creative and a staff
 * click. The body is gone rather than guarded so nothing can revive it by
 * flipping a flag; the types above stay because stored `marketing_campaigns.plan`
 * rows and the orchestrator still carry them.
 */
export async function launchCampaign(plan: CampaignPlan): Promise<LaunchResult> {
  return {
    ok: false,
    status: "failed",
    error: `LLM-planned Meta launches are retired ("${plan.name}" not created) — use the retargeting launcher (ads/retarget.ts, Desk → Ads).`,
  };
}

/** Pull spend + performance for a campaign (for the monitoring loop). */
export async function campaignInsights(campaignId: string): Promise<Record<string, number>> {
  const data = await graphGet(`${campaignId}/insights`, {
    fields: "impressions,clicks,spend,actions,cpc,ctr,reach",
  });
  const row = data?.data?.[0] ?? {};
  const actions: Record<string, number> = {};
  for (const a of row.actions ?? []) actions[a.action_type] = Number(a.value);
  return {
    impressions: Number(row.impressions || 0),
    clicks: Number(row.clicks || 0),
    spend: Number(row.spend || 0),
    reach: Number(row.reach || 0),
    ctr: Number(row.ctr || 0),
    cpc: Number(row.cpc || 0),
    carts: actions["add_to_cart"] ?? 0,
    purchases: actions["purchase"] ?? actions["offsite_conversion.fb_pixel_purchase"] ?? 0,
  };
}

export async function pauseCampaign(campaignId: string): Promise<boolean> {
  try {
    await graphPost(campaignId, { status: "PAUSED" });
    return true;
  } catch {
    return false;
  }
}
