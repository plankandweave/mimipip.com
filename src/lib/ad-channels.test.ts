// The daily paid-channel review's judgement calls, pinned.
//
// The email's verdicts and flags are read at 08:00 and acted on with money —
// a misclassified source or a flag that fires on healthy numbers erodes trust
// in the whole mail. These tests hold the classifier and the two judgement
// functions to their written rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyChannel,
  foldGaRows,
  overlayMeta,
  buildVerdicts,
  buildFlags,
  paidChannelProvenance,
  metaRowClicks,
  channelNote,
  untaggedReferralFlags,
  metaNameMismatchFlag,
  type ChannelStat,
} from "./ad-channels";

test("classifier: paid media split by platform, organic left alone", () => {
  assert.equal(classifyChannel("google", "cpc"), "google-ads");
  assert.equal(classifyChannel("google", "organic"), null); // organic Google is not a paid channel
  assert.equal(classifyChannel("facebook", "paid_social"), "meta");
  assert.equal(classifyChannel("ig", "cpc"), "meta");
  assert.equal(classifyChannel("instagram", "referral"), null); // organic IG shares stay organic
  // Paid GPT traffic is tagged utm_medium=paid by the India catalogue feed;
  // organic ChatGPT referrals must NOT be billed to the ad budget.
  assert.equal(classifyChannel("chatgpt", "paid"), "chatgpt");
  assert.equal(classifyChannel("chatgpt.com", "referral"), null);
  assert.equal(classifyChannel("bing", "cpc"), "other-paid");
});

const gaRow = (over: Partial<Parameters<typeof foldGaRows>[0][number]>) => ({
  source: "google",
  medium: "cpc",
  campaign: "Wallpaper - Mumbai",
  sessions: 10,
  purchases: 0,
  revenue: 0,
  adClicks: 12,
  adCost: 240,
  ...over,
});

test("fold: Google Ads rows aggregate per campaign and carry GA-linked spend", () => {
  const map = foldGaRows([
    gaRow({}),
    gaRow({ sessions: 5, adClicks: 6, adCost: 150 }),
    gaRow({ campaign: "Brand", sessions: 3, adClicks: 3, adCost: 30, purchases: 1, revenue: 8000 }),
  ]);
  const g = map.get("google-ads")!;
  assert.equal(g.basis, "platform+ga");
  assert.equal(g.spend, 420);
  assert.equal(g.clicks, 21);
  assert.equal(g.sessions, 18);
  assert.equal(g.campaigns.length, 2);
});

test("overlay: Meta ledger replaces GA's blind spend, keeps GA landings", () => {
  const map = foldGaRows([
    gaRow({ source: "facebook", medium: "paid_social", campaign: "Diwali", adClicks: 0, adCost: 0, sessions: 8 }),
  ]);
  const meta = overlayMeta(map.get("meta")!, [
    { name: "Diwali", spend: 500, impressions: 9000, clicks: 20 },
    { name: "Ghost", spend: 300, impressions: 4000, clicks: 9 }, // spent, nothing landed
  ]);
  assert.equal(meta.spend, 800);
  assert.equal(meta.clicks, 29);
  assert.equal(meta.sessions, 8);
  const ghost = meta.campaigns.find((c) => c.name === "Ghost")!;
  assert.equal(ghost.sessions, 0); // preserved so the flag below can fire
});

function ch(over: Partial<ChannelStat>): ChannelStat {
  return {
    key: "meta",
    label: "Meta",
    basis: "platform+ga",
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
    ...over,
  };
}

test("verdicts name the volume leader and the cheapest click", () => {
  const day = [
    ch({ key: "google-ads", label: "Google Ads", clicks: 30, sessions: 25, spend: 600, cpc: 20 }),
    ch({ clicks: 50, sessions: 40, spend: 400, cpc: 8 }),
  ];
  const v = buildVerdicts(day, day);
  assert.match(v[0], /Most clicks: Meta — 50/);
  assert.match(v[1], /Cheapest clicks: Meta at ₹8/);
});

test("a channel spending with zero landings is flagged", () => {
  const day = [ch({ spend: 300, clicks: 9, sessions: 0 })];
  const flags = buildFlags(day, day);
  assert.equal(flags.length >= 1, true);
  assert.match(flags[0], /no landings/);
});

test("a healthy channel raises no flags", () => {
  const day = [
    ch({ spend: 400, clicks: 50, sessions: 41, purchases: 2, cpc: 8, costPerPurchase: 200,
         campaigns: [{ name: "Diwali", spend: 400, clicks: 50, impressions: 9000, sessions: 41, purchases: 2, revenue: 16000, cpc: 8 }] }),
  ];
  assert.deepEqual(buildFlags(day, day), []);
});

test("seven days of spend with zero purchases flags the campaign by name", () => {
  const cam = { name: "Ghost", spend: 2100, clicks: 90, impressions: 40000, sessions: 70, purchases: 0, revenue: 0, cpc: 23.3 };
  const day = [ch({ spend: 300, clicks: 12, sessions: 10, campaigns: [{ ...cam, spend: 300 }] })];
  const week = [ch({ spend: 2100, clicks: 90, sessions: 70, campaigns: [cam] })];
  const flags = buildFlags(day, week);
  assert.equal(flags.some((f) => f.includes("Ghost") && f.includes("zero purchases")), true);
});

test("a foreign-currency channel is never ranked on cost, and is flagged", () => {
  // Meta billed in GBP beside an INR Google account: 8 GBP/click is ~100x
  // dearer than 20 INR/click, so a naive comparison crowns exactly the wrong
  // channel. The cheap-click verdict must ignore it, and a flag must say why.
  const day = [
    ch({ key: "google-ads", label: "Google Ads", clicks: 30, sessions: 25, spend: 600, cpc: 20, currency: "INR" }),
    ch({ clicks: 50, sessions: 40, spend: 400, cpc: 8, currency: "GBP" }),
  ];
  const v = buildVerdicts(day, day);
  assert.equal(v.some((x) => /Cheapest clicks: Meta/.test(x)), false);
  assert.match(v.find((x) => x.startsWith("Cheapest clicks"))!, /Google Ads/);
  assert.equal(buildFlags(day, day).some((f) => f.includes("GBP")), true);
});

test("an INR Meta account still ranks normally", () => {
  const day = [
    ch({ key: "google-ads", label: "Google Ads", clicks: 30, sessions: 25, spend: 600, cpc: 20, currency: "INR" }),
    ch({ clicks: 50, sessions: 40, spend: 400, cpc: 8, currency: "INR" }),
  ];
  assert.match(buildVerdicts(day, day).find((x) => x.startsWith("Cheapest clicks"))!, /Meta/);
});

test("a connected Meta account reporting nothing while GA sees landings names the wrong-account cause", () => {
  // The live case, 23 Sep 2026: META_ADS_TOKEN set, the API answers, the
  // account has no rows — yet GA recorded 1,434 paid Meta landings that week.
  // The money is being spent in an account we are not querying, and the mail
  // must say so rather than shrug "no platform spend feed".
  const week = [ch({ basis: "platform-mute", sessions: 1434, campaigns: [
    { name: "sep14_revenue_sprint", spend: 0, clicks: 0, impressions: 0, sessions: 1434, purchases: 0, revenue: 0, cpc: null },
  ] })];
  const f = buildFlags([], week);
  assert.equal(f.some((x) => /1434 paid landings/.test(x) && /META_AD_ACCOUNT_ID/.test(x)), true);
});

test("a connected account that genuinely ran nothing says so quietly", () => {
  const f = buildFlags([], [ch({ basis: "platform-mute", sessions: 0 })]);
  assert.equal(f.some((x) => /ran nothing/.test(x)), true);
  assert.equal(f.some((x) => /META_AD_ACCOUNT_ID/.test(x)), false);
});

test("a failed platform call is reported as a failure, not as absence", () => {
  const f = buildFlags([], [ch({ basis: "platform-down", sessions: 12 })]);
  assert.equal(f.some((x) => /API call failed/.test(x)), true);
});

test("Oct 4 brief labels GA4 source, exact reporting windows and retrieval-only timestamp", () => {
  const text = paidChannelProvenance({ date: "2026-10-03", gaRetrievedAt: {
    day: "2026-10-04T02:31:02.000Z", week: "2026-10-04T02:31:03.000Z",
  } });
  assert.match(text, /GA4 Data API \(linked Ads data\)/);
  assert.match(text, /Report day: 2026-10-03; comparison window: 2026-09-27 to 2026-10-03/);
  assert.match(text, /day 2026-10-04T02:31:02.000Z; week 2026-10-04T02:31:03.000Z/);
  assert.match(text, /Retrieval time is not the provider's underlying observation time/);
  assert.match(text, /Current campaign status is unverified/);
  assert.match(paidChannelProvenance({ date: "2026-10-03" }), /day not available; week not available/);
});

test("five-click new campaign is reviewable without claiming seven days active or directing a pause", () => {
  const cam = { name: "Search | Competitor Brands | India | Oct 3-9 2026", spend: 988.96,
    clicks: 5, impressions: 0, sessions: 4, purchases: 0, revenue: 0, cpc: 197.792 };
  const day = [ch({ key: "google-ads", label: "Google Ads", spend: cam.spend, clicks: 5,
    sessions: 11, campaigns: [cam] })];
  const text = buildFlags(day, day).join(" ");
  assert.match(text, /₹989 within the reported 7-day window/);
  assert.match(text, /zero purchases recorded by GA4/);
  assert.match(text, /review purchase tracking, landing-page performance and sample size/);
  assert.match(text, /Current campaign status is unverified/);
  assert.doesNotMatch(text, /pause it|over 7 days|is live|is enabled/);
});

test("LinkedIn and YouTube are their own channels, and organic stays organic", () => {
  assert.equal(classifyChannel("linkedin", "paid_social"), "linkedin");
  assert.equal(classifyChannel("lnkd.in", "cpc"), "linkedin");
  assert.equal(classifyChannel("linkedin.com", "referral"), null);
  assert.equal(classifyChannel("youtube", "cpv"), "youtube");
  assert.equal(classifyChannel("youtube.com", "referral"), null);
  // A YouTube campaign bought through Google Ads lands as google / cpc.
  assert.equal(classifyChannel("google", "cpc", "Aangan | Mumbai", "Video"), "youtube");
  assert.equal(classifyChannel("google", "cpc", "Lives Within | Gurgaon", "Demand Gen"), "youtube");
  assert.equal(classifyChannel("google", "cpc", "YouTube | Gurgaon | Oct 2026"), "youtube");
  assert.equal(classifyChannel("google", "cpc", "Zyvorah Wallpaper & Murals | India | PMax", "Performance Max"), "google-ads");
  assert.equal(classifyChannel("google", "organic", "x", "Video"), null);
});

test("fold: a Google Ads video campaign moves out of Google Ads into YouTube, spend and all", () => {
  const map = foldGaRows(
    [gaRow({}), gaRow({ campaign: "Aangan | Mumbai | Video", adCost: 900, adClicks: 30, sessions: 22 })],
    new Map([["Aangan | Mumbai | Video", "Video"], ["Wallpaper - Mumbai", "Search"]]),
  );
  assert.equal(map.get("google-ads")!.spend, 240);
  const yt = map.get("youtube")!;
  assert.equal(yt.spend, 900);
  assert.equal(yt.basis, "platform+ga");
  assert.equal(yt.campaigns[0].name, "Aangan | Mumbai | Video");
});

test("Meta clicks are link clicks — a boosted post's likes are not visits", () => {
  // 8 Oct 2026: 236 Meta 'clicks' beside 30 landings raised a slow-page alarm.
  assert.equal(metaRowClicks({ clicks: "236", inline_link_clicks: "31" }), 31);
  assert.equal(metaRowClicks({ clicks: "12" }), 12);
  assert.equal(metaRowClicks({ clicks: "12", inline_link_clicks: "0" }), 0);
});

test("overlay: landings tagged with Meta's campaign id join the campaign by name", () => {
  // 9 Oct 2026: utm_campaign=120249323651740250 landed visits that never met
  // the campaign's spend, so the review showed one ad as two.
  const map = foldGaRows([
    gaRow({ source: "ig", medium: "paid", campaign: "120249323651740250", adClicks: 0, adCost: 0, sessions: 12 }),
    gaRow({ source: "ig", medium: "paid", campaign: "Aangan reel", adClicks: 0, adCost: 0, sessions: 3 }),
  ]);
  const meta = overlayMeta(map.get("meta")!, [
    { name: "Aangan reel", id: "120249323651740250", spend: 900, impressions: 20000, clicks: 40 },
  ]);
  assert.equal(meta.campaigns.length, 1);
  assert.equal(meta.campaigns[0].name, "Aangan reel");
  assert.equal(meta.campaigns[0].sessions, 15);
  assert.equal(meta.campaigns[0].spend, 900);
  assert.equal(metaNameMismatchFlag([meta]), null);

  const solo = overlayMeta(foldGaRows([
    gaRow({ source: "ig", medium: "paid", campaign: "120249323651740250", adClicks: 0, adCost: 0, sessions: 7 }),
  ]).get("meta")!, [{ name: "Aangan reel", id: "120249323651740250", spend: 100, impressions: 10, clicks: 2 }]);
  assert.deepEqual(solo.campaigns.map((c) => [c.name, c.sessions, c.spend]), [["Aangan reel", 7, 100]]);
});

test("overlay: the same campaign name in two ad accounts adds up", () => {
  const meta = overlayMeta(ch({ basis: "ga-only", campaigns: [] }), [
    { name: "Lives Within", spend: 200, impressions: 1000, clicks: 10 },
    { name: "Lives Within", spend: 300, impressions: 2000, clicks: 15 },
  ]);
  assert.equal(meta.campaigns.length, 1);
  assert.equal(meta.campaigns[0].spend, 500);
  assert.equal(meta.campaigns[0].clicks, 25);
});

test("LinkedIn always explains that spend is not connected; an idle YouTube says so", () => {
  assert.match(channelNote(ch({ key: "linkedin", label: "LinkedIn", basis: "ga-only" }))!, /not connected/);
  assert.match(channelNote(ch({ key: "linkedin", label: "LinkedIn", basis: "ga-only", sessions: 4 }))!, /tagged LinkedIn ads/);
  assert.match(channelNote(ch({ key: "youtube", label: "YouTube", basis: "ga-only" }))!, /No YouTube campaign/);
  assert.equal(channelNote(ch({ key: "youtube", label: "YouTube", spend: 50, sessions: 3 })), undefined);
  assert.equal(channelNote(ch({})), undefined);
});

test("untagged LinkedIn and YouTube visits prompt a tag check, never a paid credit", () => {
  const rows = [
    gaRow({ source: "linkedin.com", medium: "referral", sessions: 7 }),
    gaRow({ source: "lnkd.in", medium: "referral", sessions: 2 }),
    gaRow({ source: "linkedin", medium: "paid_social", sessions: 50 }), // tagged: already counted
    gaRow({ source: "m.youtube.com", medium: "referral", sessions: 1 }),
  ];
  const f = untaggedReferralFlags(rows);
  assert.equal(f.length, 2);
  assert.match(f[0], /LinkedIn sent 9 visits/);
  assert.match(f[0], /utm_source=linkedin/);
  assert.match(f[1], /YouTube sent 1 visit /);
  assert.deepEqual(untaggedReferralFlags([gaRow({})]), []);
});

test("Meta spend and landings split across names are called out as one ad", () => {
  // The live desk, 8 Oct 2026: the boosted post spent under its caption while
  // its visits arrived under utm_campaign aangan_20261007.
  const cam = (name: string, spend: number, sessions: number) =>
    ({ name, spend, clicks: 0, impressions: 0, sessions, purchases: 0, revenue: 0, cpc: null });
  const week = [ch({ campaigns: [cam("Instagram post: Aangan by the Sea", 119, 0), cam("aangan_20261007", 0, 29)] })];
  const f = metaNameMismatchFlag(week)!;
  assert.match(f, /Aangan by the Sea/);
  assert.match(f, /aangan_20261007/);
  assert.match(f, /utm_campaign=\{\{campaign\.name\}\}/);
  assert.equal(metaNameMismatchFlag([ch({ campaigns: [cam("A", 100, 10)] })]), null);
});
