// The daily paid-channel review — the block in the founder's 08:00 IST mail
// that answers "which channel and which campaign is buying clicks fastest and
// cheapest: Meta, Google Ads, or ChatGPT?"
//
// Two eyes on the same day, deliberately:
//   - GA4 (fetchGaPaidTraffic): sessions that actually LANDED, per
//     source/medium/campaign, plus Google Ads clicks and spend once the
//     Ads ↔ GA4 link is live. This is the ground truth for "did the money
//     turn into visitors".
//   - Meta Marketing API (optional): spend/impressions/clicks per campaign
//     straight from the ad account — Meta's in-app browser and iOS privacy
//     hide a slice of its traffic from GA, so Meta's own ledger is the only
//     honest spend and CPC figure for that channel.
//
// ChatGPT ads expose no reporting API today, so that channel is read purely
// from GA landings (source chatgpt.com / openai) and the mail says so rather
// than inventing a spend figure. LinkedIn is the same until LinkedIn grants
// the app ad-reporting access: the page token posts organically and cannot
// read a campaign. YouTube is Google Ads' video inventory, so its spend comes
// through the same GA ↔ Ads link and is split out by campaign type.
//
// Env (all optional — every absence degrades to a named note in the email):
//   META_ADS_TOKEN       long-lived Marketing API system-user token
//                        (META_SYSTEM_USER_TOKEN is accepted as the old name)
//   META_AD_ACCOUNT_ID   act_XXXXXXXX (the act_ prefix optional); several
//                        accounts comma-separated, read and summed

import { fetchGaAdsCampaignTypes, fetchGaPaidTraffic, type GaPaidRow } from "@/lib/ga-data";
import { metaAdAccountIds, metaAdsToken } from "@/lib/meta-env";
import { metaPages } from "@/lib/meta-ads-inventory";
import { addIstDays, istDateKey } from "@/lib/ist";

export type ChannelKey = "google-ads" | "youtube" | "meta" | "linkedin" | "chatgpt" | "other-paid";

export type CampaignStat = {
  name: string;
  spend: number; // INR; 0 when the platform gave us no spend figure
  clicks: number; // platform clicks where known, else GA sessions
  impressions: number;
  sessions: number; // GA sessions that landed
  purchases: number;
  revenue: number;
  cpc: number | null; // spend / clicks, null when either side is unknown
};

export type ChannelStat = {
  key: ChannelKey;
  label: string;
  /** where the numbers came from — printed in the mail so a figure is never
   *  mistaken for something it is not */
  /** Where this channel's spend numbers came from.
   *  - platform+ga   the platform's own ledger, overlaid on GA landings
   *  - platform-mute the platform IS connected and answered, with no rows —
   *                  the account genuinely ran nothing, OR we are pointed at
   *                  the wrong ad account while a campaign spends elsewhere
   *  - platform-down the platform is connected but the call failed
   *  - ga-only       no platform feed exists for this channel (ChatGPT)
   *  Distinguishing mute from ga-only matters: "no spend feed" and "a spend
   *  feed reporting nothing" call for opposite actions. */
  basis: "platform+ga" | "platform-mute" | "platform-down" | "ga-only" | "unconfigured";
  spend: number;
  clicks: number;
  impressions: number;
  sessions: number;
  purchases: number;
  revenue: number;
  cpc: number | null;
  costPerPurchase: number | null;
  /** ISO code the PLATFORM reported spend in. null = no platform feed (GA
   *  cost is always INR here). Anything but INR makes this channel's cost
   *  incomparable with the others until it is converted. */
  currency: string | null;
  campaigns: CampaignStat[];
  /** One line for the reader when the numbers need saying what they are not. */
  note?: string;
};

export type ChannelDay = {
  date: string;
  /** Response-receipt times, NOT the provider's underlying observation time. */
  gaRetrievedAt?: { day: string | null; week: string | null };
  channels: ChannelStat[];
  /** same shape over the trailing 7 days ending on `date` (campaigns trimmed) */
  week: ChannelStat[];
  /** Today so far on the shop's clock — incomplete by definition, and only
   *  when asked for (the desk asks; the morning mail does not). A campaign
   *  that started this morning is otherwise invisible until tomorrow. */
  today?: { date: string; channels: ChannelStat[] };
  verdicts: string[];
  flags: string[];
  gaConfigured: boolean;
  metaConfigured: boolean;
};

/* ── classification ────────────────────────────────────────────────────── */

const PAID_MEDIA = new Set(["cpc", "ppc", "paid", "paidsocial", "paid_social", "paid-social", "cpm", "cpv", "display", "retargeting"]);

/** Google Ads campaign types that run on YouTube. Demand Gen also serves
 *  Discover and Gmail, but its video placements are why it is bought here. */
const YOUTUBE_ADS_TYPES = /^(video|demand ?gen|discovery)$/i;

export function classifyChannel(
  source: string,
  medium: string,
  campaign = "",
  adsCampaignType = "",
): ChannelKey | null {
  const s = source.toLowerCase();
  const m = medium.toLowerCase();
  const paid = PAID_MEDIA.has(m);
  // ChatGPT only counts as PAID when the medium says so. Zyvorah earns a real
  // stream of organic ChatGPT referrals (people asking it and clicking
  // through), which arrive as source chatgpt.com with medium referral —
  // counting those as paid clicks would credit the ad budget with traffic it
  // never bought and drag the channel's apparent CPC toward zero. Verified
  // 23 Sep 2026: all 24 rows of the India catalogue feed carry
  // utm_medium=paid, so the paid side is fully tagged and nothing real is lost
  // by requiring it.
  if (/chatgpt|openai/.test(s)) return paid ? "chatgpt" : null;
  if (/facebook|instagram|^fb$|^ig$|meta|fbclid/.test(s)) return paid ? "meta" : null;
  if (/linkedin|^lnkd(\.in)?$|^li$/.test(s)) return paid ? "linkedin" : null;
  if (/youtube|^yt$/.test(s)) return paid ? "youtube" : null;
  if (/^google$|googleads|^adwords$/.test(s)) {
    if (!paid) return null;
    // A YouTube campaign bought through Google Ads lands as google / cpc like
    // every other Ads click. The campaign type says which it was; the name is
    // the fallback for when GA cannot answer the type query.
    return YOUTUBE_ADS_TYPES.test(adsCampaignType) || /youtube|\byt\b/i.test(campaign) ? "youtube" : "google-ads";
  }
  return paid ? "other-paid" : null;
}

const LABELS: Record<ChannelKey, string> = {
  "google-ads": "Google Ads",
  youtube: "YouTube",
  meta: "Meta",
  linkedin: "LinkedIn",
  chatgpt: "ChatGPT",
  "other-paid": "Other paid",
};

function emptyChannel(key: ChannelKey): ChannelStat {
  return {
    key,
    label: LABELS[key],
    basis: "ga-only",
    spend: 0,
    clicks: 0,
    impressions: 0,
    sessions: 0,
    purchases: 0,
    revenue: 0,
    cpc: null,
    costPerPurchase: null,
    currency: null,
    campaigns: [],
  };
}

function finishChannel(c: ChannelStat): ChannelStat {
  c.cpc = c.spend > 0 && c.clicks > 0 ? c.spend / c.clicks : null;
  c.costPerPurchase = c.spend > 0 && c.purchases > 0 ? c.spend / c.purchases : null;
  c.campaigns.sort((a, b) => b.spend - a.spend || b.clicks - a.clicks || b.sessions - a.sessions);
  for (const cam of c.campaigns) {
    cam.cpc = cam.spend > 0 && cam.clicks > 0 ? cam.spend / cam.clicks : null;
  }
  return c;
}

/** Fold GA rows into per-channel, per-campaign stats. Exported for tests.
 *  `adsTypes` maps a Google Ads campaign name to its type, to split YouTube
 *  out of Google Ads. */
export function foldGaRows(
  rows: GaPaidRow[],
  adsTypes: Map<string, string> | null = null,
): Map<ChannelKey, ChannelStat> {
  const out = new Map<ChannelKey, ChannelStat>();
  for (const r of rows) {
    const key = classifyChannel(r.source, r.medium, r.campaign, adsTypes?.get(r.campaign) ?? "");
    if (!key) continue;
    const ch = out.get(key) ?? emptyChannel(key);
    ch.sessions += r.sessions;
    ch.purchases += r.purchases;
    ch.revenue += r.revenue;
    // GA carries platform clicks/cost only for the linked Google Ads account.
    ch.clicks += r.adClicks;
    ch.spend += r.adCost;
    if ((key === "google-ads" || key === "youtube") && r.adClicks > 0) ch.basis = "platform+ga";
    const cam = ch.campaigns.find((x) => x.name === r.campaign);
    if (cam) {
      cam.sessions += r.sessions;
      cam.purchases += r.purchases;
      cam.revenue += r.revenue;
      cam.clicks += r.adClicks;
      cam.spend += r.adCost;
    } else {
      ch.campaigns.push({
        name: r.campaign,
        spend: r.adCost,
        clicks: r.adClicks,
        impressions: 0,
        sessions: r.sessions,
        purchases: r.purchases,
        revenue: r.revenue,
        cpc: null,
      });
    }
    out.set(key, ch);
  }
  return out;
}

/* ── Meta Marketing API ────────────────────────────────────────────────── */

export function metaAdsConfigured(): boolean {
  return Boolean(metaAdsToken() && metaAdAccountIds().length);
}

type MetaInsightRow = {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  account_currency?: string;
};

export type MetaCampaignRow = {
  name: string;
  /** Meta's campaign id. Ads whose link says utm_campaign={{campaign.id}}
   *  land in GA under this number rather than the name. */
  id?: string;
  spend: number;
  impressions: number;
  clicks: number;
};

export type MetaPull = { rows: MetaCampaignRow[]; currency: string | null };

/** Meta's `clicks` counts every tap on the ad — likes, comments, profile
 *  visits, "see more". A boosted post collects plenty of those and none of
 *  them can become a visit, so comparing them with GA landings raised a
 *  false "slow landing page" alarm (8 Oct 2026: 236 clicks, 30 landings).
 *  Link clicks are the ones that leave Instagram; fall back to all clicks
 *  only when Meta gives no link figure. Exported for tests. */
export function metaRowClicks(r: Pick<MetaInsightRow, "clicks" | "inline_link_clicks">): number {
  return r.inline_link_clicks != null ? Number(r.inline_link_clicks) : Number(r.clicks ?? 0);
}

/** Per-campaign spend/impressions/link clicks from every configured Meta ad
 *  account for an inclusive range. Returns null when unconfigured or every
 *  call failed — the caller then falls back to GA landings and says so. */
async function fetchMetaCampaigns(since: string, until: string): Promise<MetaPull | null> {
  const token = metaAdsToken();
  const accounts = metaAdAccountIds();
  if (!token || !accounts.length) return null;
  const pulls = await Promise.all(accounts.map((a) => fetchMetaAccount(token, a, since, until)));
  const ok = pulls.filter((p): p is MetaPull => p !== null);
  if (!ok.length) return null;
  const currencies = [...new Set(ok.map((p) => p.currency).filter((c): c is string => !!c))];
  return {
    rows: ok.flatMap((p) => p.rows),
    // Two accounts billing in different currencies cannot be summed honestly;
    // the currency flag then names the problem instead of the report hiding it.
    currency: currencies.length > 1 ? currencies.join("+") : (currencies[0] ?? null),
  };
}

async function fetchMetaAccount(token: string, account: string, since: string, until: string): Promise<MetaPull | null> {
  try {
    const data = await metaPages<MetaInsightRow>(
      `${account}/insights`,
      "campaign_id,campaign_name,spend,impressions,clicks,inline_link_clicks,account_currency",
      token,
      fetch,
      { level: "campaign", time_range: JSON.stringify({ since, until }) },
    );
    return {
      rows: data.map((r) => ({
        name: r.campaign_name || "(unnamed)",
        id: r.campaign_id || undefined,
        spend: Number(r.spend ?? 0),
        impressions: Number(r.impressions ?? 0),
        clicks: metaRowClicks(r),
      })),
      currency: data.find((r) => r.account_currency)?.account_currency ?? null,
    };
  } catch (e) {
    console.error("[ad-channels] meta insights error:", e);
    return null;
  }
}

/** Overlay Meta's own ledger onto the GA-derived Meta channel. Exported for
 *  tests. GA sessions/purchases stay (that is what landed); spend, clicks and
 *  impressions become Meta's — the only side that can see them. */
export function overlayMeta(
  ch: ChannelStat,
  metaRows: MetaCampaignRow[],
  currency: string | null = null,
): ChannelStat {
  ch.basis = "platform+ga";
  ch.currency = currency;
  ch.spend = 0;
  ch.clicks = 0;
  ch.impressions = 0;
  for (const m of metaRows) {
    ch.spend += m.spend;
    ch.clicks += m.clicks;
    ch.impressions += m.impressions;
    // Landings meet spend on the campaign NAME — or on Meta's campaign id,
    // which is what an ad's link carries when its URL parameters say
    // utm_campaign={{campaign.id}} (9 Oct 2026: "120249323651740250" landed
    // 45 visits while its campaign showed spend and none). A row found by id
    // takes the campaign's name, and a name row already there absorbs it.
    let cam = ch.campaigns.find((x) => x.name === m.name);
    const byId = m.id ? ch.campaigns.find((x) => x.name === m.id) : undefined;
    if (byId && cam && byId !== cam) {
      cam.sessions += byId.sessions;
      cam.purchases += byId.purchases;
      cam.revenue += byId.revenue;
      ch.campaigns.splice(ch.campaigns.indexOf(byId), 1);
    } else if (byId && !cam) {
      byId.name = m.name;
      cam = byId;
    }
    if (cam) {
      // += : GA never carries Meta cost, and two ad accounts may each run a
      // campaign of the same name.
      cam.spend += m.spend;
      cam.clicks += m.clicks;
      cam.impressions += m.impressions;
    } else {
      // spending campaign with zero GA landings — the review's favourite flag
      ch.campaigns.push({
        name: m.name,
        spend: m.spend,
        clicks: m.clicks,
        impressions: m.impressions,
        sessions: 0,
        purchases: 0,
        revenue: 0,
        cpc: null,
      });
    }
  }
  return ch;
}

/* ── verdicts & review flags ───────────────────────────────────────────── */

const rupees = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: n < 100 ? 2 : 0 })}`;

/** The two headline answers plus movement. Exported for tests. */
export function buildVerdicts(day: ChannelStat[], week: ChannelStat[]): string[] {
  const out: string[] = [];
  const active = day.filter((c) => c.clicks > 0 || c.sessions > 0);
  if (!active.length) return ["No paid clicks or paid landings recorded yesterday."];

  const byVolume = [...active].sort(
    (a, b) => (b.clicks || b.sessions) - (a.clicks || a.sessions),
  )[0];
  out.push(
    `Most clicks: ${byVolume.label} — ${byVolume.clicks || byVolume.sessions} ${byVolume.clicks ? "clicks" : "landings (GA)"}${byVolume.campaigns[0] ? `, led by “${byVolume.campaigns[0].name}”` : ""}.`,
  );

  // Cost rankings compare only channels billed in INR. Ranking a GBP CPC
  // against a rupee one would name a "cheapest" channel on an arithmetic
  // accident — roughly a 100x error, and in the flattering direction.
  const comparable = active.filter((c) => !c.currency || c.currency === "INR");
  const priced = comparable.filter((c) => c.cpc != null);
  if (priced.length) {
    const cheapest = [...priced].sort((a, b) => a.cpc! - b.cpc!)[0];
    out.push(`Cheapest clicks: ${cheapest.label} at ${rupees(cheapest.cpc!)} per click.`);
  }

  const converting = comparable.filter((c) => c.costPerPurchase != null);
  if (converting.length) {
    const best = [...converting].sort((a, b) => a.costPerPurchase! - b.costPerPurchase!)[0];
    out.push(`Cheapest purchase: ${best.label} at ${rupees(best.costPerPurchase!)} per order.`);
  }

  // movement vs the 7-day run-rate
  for (const c of active) {
    const w = week.find((x) => x.key === c.key);
    if (!w || w.cpc == null || c.cpc == null) continue;
    const drift = (c.cpc - w.cpc) / w.cpc;
    if (Math.abs(drift) >= 0.25) {
      out.push(
        `${c.label} CPC ${drift > 0 ? "up" : "down"} ${Math.round(Math.abs(drift) * 100)}% vs its 7-day average (${rupees(c.cpc)} vs ${rupees(w.cpc)}).`,
      );
    }
  }
  return out;
}

/** Things worth acting on, written as recommendations. Exported for tests. */
export function buildFlags(day: ChannelStat[], week: ChannelStat[]): string[] {
  const flags: string[] = [];
  for (const c of day) {
    // spend with nothing landing — a broken link, a disapproved page, or a
    // tracking break; either way money is leaving without visitors arriving
    if (c.spend > 0 && c.sessions === 0) {
      flags.push(
        `${c.label} spent ${rupees(c.spend)} yesterday but GA saw no landings from it — check the ad's landing URL and UTM tags before spending more.`,
      );
    } else if (c.clicks > 0 && c.sessions > 0 && c.sessions < c.clicks * 0.4) {
      flags.push(
        `${c.label}: only ${c.sessions} of ${c.clicks} clicks became sessions (${Math.round((c.sessions / c.clicks) * 100)}%). Some loss is normal (in-app browsers, blockers); under 40% usually means a slow or broken landing page.`,
      );
    }
    for (const cam of c.campaigns) {
      const wc = week
        .find((x) => x.key === c.key)
        ?.campaigns.find((x) => x.name === cam.name);
      if (cam.spend > 0 && cam.purchases === 0 && (wc?.spend ?? 0) > 0 && (wc?.purchases ?? 0) === 0) {
        flags.push(
          `“${cam.name}” (${c.label}) has spent ${rupees(wc!.spend)} within the reported 7-day window with zero purchases recorded by GA4 — review purchase tracking, landing-page performance and sample size before changing bids, creative or delivery. Current campaign status is unverified by this report.`,
        );
      }
    }
  }
  // Spend reported in a currency that is not INR. Every other figure in the
  // mail is rupees, so a foreign-currency channel cannot be ranked on cost
  // against the others — and silently printing it behind a ₹ sign would be
  // worse than saying nothing. Flag it rather than convert: an FX rate the
  // report invents is a number nobody can audit.
  for (const c of day) {
    if (c.currency && c.currency !== "INR" && c.spend > 0) {
      flags.push(
        `${c.label} reports spend in ${c.currency}, not INR — its cost figures are shown in ${c.currency} and are NOT comparable with the other channels. Either bill that ad account in INR or expect to convert by hand.`,
      );
    }
  }
  // A connected platform that reports nothing. Two very different cases, and
  // the loud one is the second: GA can SEE paid landings from this channel
  // while the ad account we query knows nothing about them — which means the
  // account id is wrong and every cost figure for the channel is missing.
  for (const w of week) {
    if (w.basis === "platform-down") {
      flags.push(
        `${w.label} is connected but its API call failed — check the token's scope and that the ad account is not restricted. No spend figures this run.`,
      );
    } else if (w.basis === "platform-mute") {
      flags.push(
        w.sessions > 0
          ? `${w.label} reports no spend for the last 7 days, yet GA recorded ${w.sessions} paid landings from it${w.campaigns[0] ? ` (“${w.campaigns[0].name}”)` : ""}. A campaign is running in an ad account we are NOT querying — check META_AD_ACCOUNT_ID points at the account actually being billed.`
          : `${w.label} is connected and ran nothing in the last 7 days.`,
      );
    }
  }
  return flags;
}

/* ── channels that must be seen to be empty ─────────────────────────── */

/** Channels the business runs ads on. In the 7-day table each one gets a row
 *  even with nothing recorded — a channel that is absent reads as "not
 *  running" when the truth may be "running, and none of it reaches us". */
export const RUN_CHANNELS: ChannelKey[] = ["google-ads", "youtube", "meta", "linkedin"];

const CHANNEL_ORDER: ChannelKey[] = ["google-ads", "youtube", "meta", "linkedin", "chatgpt", "other-paid"];

/** What a channel's numbers are NOT, said once beside them. Exported for tests. */
export function channelNote(c: ChannelStat): string | undefined {
  if (c.key === "linkedin") {
    return c.sessions > 0
      ? "Landings from tagged LinkedIn ads, read in GA. LinkedIn spend and clicks are not connected: the page connection can post but not read ad reporting."
      : "Nothing from LinkedIn ads has landed on zyvorah.com. Spend and clicks are not connected (the page connection can post but not read ad reporting), so only tagged landings can show here.";
  }
  if (c.key === "youtube" && c.spend === 0 && c.sessions === 0) {
    return "No YouTube campaign in the Google Ads account linked to GA has spent or sent a visit in this window.";
  }
  return undefined;
}

/** Ads that link without UTM tags arrive as an ordinary referral and are
 *  counted nowhere above. Platform referrals are also organic posts, so this
 *  is a prompt to check the tags, never a number credited to an ad.
 *  Exported for tests. */
export function untaggedReferralFlags(rows: GaPaidRow[]): string[] {
  const sums: Record<"LinkedIn" | "YouTube", number> = { LinkedIn: 0, YouTube: 0 };
  for (const r of rows) {
    if (PAID_MEDIA.has(r.medium.toLowerCase())) continue;
    const s = r.source.toLowerCase();
    if (/linkedin|^lnkd(\.in)?$/.test(s)) sums.LinkedIn += r.sessions;
    else if (/youtube/.test(s)) sums.YouTube += r.sessions;
  }
  return (Object.entries(sums) as [keyof typeof sums, number][])
    .filter(([, n]) => n > 0)
    .map(([label, n]) =>
      `${label} sent ${n} visit${n === 1 ? "" : "s"} in the last 7 days with no paid tag (referral, organic or untagged ad links). If a ${label} ad links here, add utm_source=${label.toLowerCase()}&utm_medium=paid_social&utm_campaign=<campaign name> to its URL so its visits count against the campaign.`,
    );
}

/** Meta spend and GA landings meet on the campaign NAME. A boosted post is
 *  named after its caption while its link carries a utm_campaign like
 *  aangan_20261007, so one ad shows twice: spend with no landings, landings
 *  with no spend. Exported for tests. */
export function metaNameMismatchFlag(week: ChannelStat[]): string | null {
  const meta = week.find((c) => c.key === "meta");
  if (!meta || meta.basis !== "platform+ga") return null;
  const spendOnly = meta.campaigns.filter((c) => c.spend > 0 && c.sessions === 0);
  const landOnly = meta.campaigns.filter((c) => c.spend === 0 && c.sessions > 0);
  if (!spendOnly.length || !landOnly.length) return null;
  return `Meta: ${spendOnly.length} campaign${spendOnly.length === 1 ? "" : "s"} with spend and no landings (${spendOnly.slice(0, 2).map((c) => `“${c.name}”`).join(", ")}) and ${landOnly.length} with landings and no spend (${landOnly.slice(0, 2).map((c) => `“${c.name}”`).join(", ")}) — usually the same ads, split because the link's utm_campaign is not the Meta campaign name. Set each ad's URL parameters to utm_campaign={{campaign.name}} so they join up.`;
}

/* ── the day, assembled ────────────────────────────────────────────────── */

export async function fetchChannelDay(
  dateKey: string,
  gaConfigured: boolean,
  opts: { withToday?: boolean } = {},
): Promise<ChannelDay> {
  const weekStart = addIstDays(dateKey, -6);
  const todayKey = istDateKey();
  const readGa = async (from: string, to: string) => {
    const [rows, types] = gaConfigured
      ? await Promise.all([fetchGaPaidTraffic(from, to), fetchGaAdsCampaignTypes(from, to)])
      : [null, null];
    return { rows, types, retrievedAt: rows === null ? null : new Date().toISOString() };
  };
  const none = Promise.resolve(null);
  const [gaDay, gaWeek, metaDay, metaWeek, gaToday, metaToday] = await Promise.all([
    readGa(dateKey, dateKey),
    readGa(weekStart, dateKey),
    fetchMetaCampaigns(dateKey, dateKey),
    fetchMetaCampaigns(weekStart, dateKey),
    opts.withToday ? readGa(todayKey, todayKey) : none,
    opts.withToday ? fetchMetaCampaigns(todayKey, todayKey) : none,
  ]);

  const assemble = (
    ga: { rows: GaPaidRow[] | null; types: Map<string, string> | null } | null,
    meta: MetaPull | null,
    always: ChannelKey[] = [],
  ): ChannelStat[] => {
    const map = foldGaRows(ga?.rows ?? [], ga?.types ?? null);
    // Overlay Meta's own ledger even when GA saw no Meta landings that day —
    // spend with zero landings is exactly what the review must not miss.
    if (metaAdsConfigured()) {
      const ch = map.get("meta") ?? emptyChannel("meta");
      if (meta && meta.rows.length) {
        map.set("meta", overlayMeta(ch, meta.rows, meta.currency));
      } else {
        // Connected but silent. Keep whatever GA saw and say which kind of
        // silence it is — a configured account reporting nothing while GA
        // records paid Meta landings means we are querying the wrong account.
        ch.basis = meta ? "platform-mute" : "platform-down";
        map.set("meta", ch);
      }
    }
    for (const k of always) if (!map.has(k)) map.set(k, emptyChannel(k));
    return CHANNEL_ORDER
      .map((k) => map.get(k))
      .filter((c): c is ChannelStat => !!c)
      .map(finishChannel)
      .map((c) => ({ ...c, note: channelNote(c) }));
  };

  const channels = assemble(gaDay, metaDay);
  const week = assemble(gaWeek, metaWeek, RUN_CHANNELS);
  const mismatch = metaNameMismatchFlag(week);

  return {
    date: dateKey,
    gaRetrievedAt: { day: gaDay.retrievedAt, week: gaWeek.retrievedAt },
    channels,
    week,
    today: opts.withToday ? { date: todayKey, channels: assemble(gaToday, metaToday, RUN_CHANNELS) } : undefined,
    verdicts: buildVerdicts(channels, week),
    flags: [
      ...buildFlags(channels, week),
      ...(mismatch ? [mismatch] : []),
      ...untaggedReferralFlags(gaWeek.rows ?? []),
    ],
    gaConfigured,
    metaConfigured: metaAdsConfigured(),
  };
}

/** Plain text, shared by email and tests so source labels cannot drift. */
export function paidChannelProvenance(a: Pick<ChannelDay, "date" | "gaRetrievedAt">): string {
  const stamp = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value))
    ? value : "not available";
  return `Google Ads spend/clicks and paid landings are sourced from the GA4 Data API (linked Ads data). ` +
    `Report day: ${a.date}; comparison window: ${addIstDays(a.date, -6)} to ${a.date}, inclusive, in the GA4 property's time zone. ` +
    `GA4 responses retrieved: day ${stamp(a.gaRetrievedAt?.day)}; week ${stamp(a.gaRetrievedAt?.week)}. ` +
    `Retrieval time is not the provider's underlying observation time; GA4 data may settle later. ` +
    `Current campaign status is unverified; these figures do not establish whether any campaign is enabled or paused now.`;
}
