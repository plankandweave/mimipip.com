import { fileCustomerServiceSection } from "@/lib/customer-service-brief";
import {
  briefDecisions,
  briefGoingWellHtml,
  briefOverallStatus,
  briefTopHtml,
  withoutLifted,
  BRIEF_LABELS,
  briefSalesHeadline,
} from "@/lib/brief-decisions";
import { briefOrders } from "@/lib/brief-orders";
import { NextResponse } from "next/server";
import { cartSignalCounts } from "@/lib/conversion-diagnostics";
import { withCronRun } from "@/lib/cron-run";
import { elevatedKey, intelKeyOk } from "@/lib/elevated-key";
import { supabase } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import { inr } from "@/lib/intel";
import { fetchGaDay, gaReportingConfigured, type GaDaySnapshot } from "@/lib/ga-data";
import { fetchChannelDay, paidChannelProvenance, type ChannelDay, type ChannelStat } from "@/lib/ad-channels";
import { istDateKey, istMidnight, addIstDays, formatIstDate } from "@/lib/ist";
import {
  readSections,
  alreadySent,
  markSent,
  BRIEF_SECTIONS,
  type BriefKey,
  type BriefSection,
  type MissingSection,
  type BriefStatus,
} from "@/lib/briefing";
import { fetchOrganic, fetchSocial, type OrganicBlock, type SocialBlock } from "@/lib/brief-blocks";
import { safely } from "@/lib/degrade";
import { readBriefSnapshot } from "@/lib/brief-snapshot";
import { emailWordmark } from "@/lib/email-wordmark";
import { fileHomelaneSection } from "@/lib/homelane-brief";
import {
  isPartnerMedium,
  partnerLabel,
  reportSources,
  summarisePartnerTraffic,
  PARTNER_LINK_MEDIUM,
  PARTNER_MEDIUMS,
  type PartnerAccount,
  type PartnerTrafficSummary,
} from "@/lib/partner-traffic-rules";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

// THE MORNING BRIEF — the one mail that starts the founder's day.
// (The route keeps its original `daily-report` path because the cron worker
// maps the 08:00 IST schedule to it; the mail it sends is now the brief.)
//
// It has two halves.
//
// The half this route COMPUTES: yesterday's numbers — Google Analytics traffic
// (sessions, users, channel and page breakdowns, GA-measured purchases) side by
// side with what the store itself recorded (orders, revenue, funnel, samples,
// abandoned carts), plus the paid channels. GA and first-party are deliberately
// both shown — the tag can be blocked by the browser, the beacon cannot see
// campaigns the way GA does; the truth is the pair.
//
// The half this route COLLECTS: sections filed by the agents that run on their
// own schedules — the overnight patrol, the afternoon watch, the ads review,
// the CRM sweep. Each used to send its own email. Five separate mails a day
// left the founder assembling the picture herself every morning, so each agent
// now files a section (see lib/briefing.ts) and this brief prints them in the
// order a founder needs to read them: what broke, then what it cost, then what
// the market did.
//
// A section that was never filed, or is stale, or describes an older day is
// printed as MISSING with the reason. It is never silently dropped: a brief
// that reads calm because an agent died is worse than no brief.
//
// Sends even while GA is unconfigured (first-party numbers only, with a note),
// so the report starts the day the cron lands and gets richer the day the GA
// credentials do.
//
// Auth: Authorization: Bearer <CRON_SECRET> (the cron worker), or
// x-intel-key: <key> for a manual run, compared against the key the database
// accepts. ?email=0 = dry run (JSON only); ?email=0&format=html = the mail
// itself, sent to nobody;
// ?date=YYYY-MM-DD re-runs a specific IST day.
/** The route has 120 seconds in total. These bound the parts of the brief that
 *  were added on top of an already-working report, so the new work can never be
 *  what stops the old work arriving. Organic gets more room because it is two
 *  Google Analytics round-trips. */
const ORGANIC_BUDGET_MS = 25_000;
const BLOCK_BUDGET_MS = 12_000;
/** The store's own numbers. Generous, because they are the heart of the brief,
 *  but bounded so a stuck query still leaves time to send everything else. */
const SNAPSHOT_BUDGET_MS = 40_000;

const EMPTY_ORGANIC: OrganicBlock = {
  configured: gaReportingConfigured(),
  window: null,
  organicSessions: 0,
  priorOrganicSessions: null,
  topLanding: [],
  search: null,
  searchConfigured: false,
  error: "took too long to answer and was dropped so the brief could go out",
};

const EMPTY_SOCIAL: SocialBlock = {
  available: false,
  publishedYesterday: 0,
  awaitingReview: 0,
  approvedWaiting: 0,
  blocked: 0,
  missedDays: 0,
  failed: 0,
  oldestWaitingDays: null,
  declined: 0,
  declinedAhead: 0,
  horizonFullyDeclined: false,
  everPublished: false,
  collabsWaiting: 0,
  error: "took too long to answer and was dropped so the brief could go out",
};

/** Every agent reported as absent rather than silently omitted — the same rule
 *  the section store applies, held to even when the store itself is the thing
 *  that failed. */
const EMPTY_SECTIONS: { sections: BriefSection[]; missing: MissingSection[] } = {
  sections: [],
  missing: (Object.entries(BRIEF_SECTIONS) as [BriefKey, { title: string; rank: number }][]).map(
    ([key, m]) => ({
      key,
      title: m.title,
      rank: m.rank,
      reason: "the brief could not read the section store this morning",
    }),
  ),
};

async function tick(req: Request) {
  const url = new URL(req.url);
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const viaCron = !!cronSecret && auth === `Bearer ${cronSecret}`;
  const manualKey = req.headers.get("x-intel-key");
  if (!viaCron && !(await intelKeyOk(manualKey))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Narrows to string, and covers the one case the gate above cannot: a cron
  // run on a deployment where no elevated key is configured at all.
  const rpcKey = viaCron ? await elevatedKey() : manualKey;
  if (!rpcKey) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // "Yesterday" on the shop's clock, never the server's.
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("date") ?? "")
    ? url.searchParams.get("date")!
    : addIstDays(istDateKey(), -1);
  const from = istMidnight(dateKey);
  const to = istMidnight(addIstDays(dateKey, 1));
  // A rolling 7-day window ending with yesterday, for the conversion watch. A
  // single day is too thin for a new brand (tens of sessions) to read a rate
  // from; the week is the denominator that actually moves meaningfully.
  const from7 = istMidnight(addIstDays(dateKey, -6));

  // The brief is dated the day it is SENT; the numbers in it are yesterday's.
  const briefFor = istDateKey();

  // The HomeLane designer-login section is the brief's own count, so it is
  // filed here, BEFORE the section store is read below, and fenced like every
  // other addition: past its budget the store simply reports it as not filed.
  await fileCustomerServiceSection();
  await safely("homelane", BLOCK_BUDGET_MS, fileHomelaneSection(dateKey), {
    ok: false,
    error: "took too long to answer and was dropped so the brief could go out",
  });

  // GA: the day itself + the same weekday last week, for "vs last Tuesday".
  // Alongside it, the two channels the paid review cannot see (organic search,
  // Instagram) and the sections the other agents filed overnight. All of it is
  // independent, so it goes in one flight; none of it may fail the brief.
  const [ga, gaWeekAgo, adChannels, organic, social, filed] = await Promise.all([
    fetchGaDay(dateKey),
    fetchGaDay(addIstDays(dateKey, -7)),
    fetchChannelDay(dateKey, gaReportingConfigured()),
    // Each block degrades on its own. A brief missing its organic section is a
    // small loss; a brief that never sends because one Google call hung is a
    // silent morning, which is the failure this whole change exists to end.
    safely("organic", ORGANIC_BUDGET_MS, fetchOrganic(), EMPTY_ORGANIC),
    safely("instagram", BLOCK_BUDGET_MS, fetchSocial(dateKey), EMPTY_SOCIAL),
    safely("sections", BLOCK_BUDGET_MS, readSections(briefFor), EMPTY_SECTIONS),
  ]);

  // First-party: the same snapshot the weekly intelligence reads, one day wide.
  // A failed read (14 Oct 2026: a statement timeout) costs the brief its store
  // numbers, which the mail says it could not read — never the whole mail.
  const snapshot = await readBriefSnapshot(
    () =>
      supabase.rpc("intel_snapshot", {
        p_key: rpcKey,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      }),
    SNAPSHOT_BUDGET_MS,
  );
  if (snapshot.unauthorized) {
    return NextResponse.json({ error: snapshot.error }, { status: 401 });
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const s = snapshot.snap as Record<string, any>;
  const orders: any[] = s.orders ?? [];
  const orderSummary = briefOrders(orders);
  const paid = orderSummary.customer;
  const revenue = orderSummary.customerRevenue;
  const ev = s.event_counts ?? {};
  const counts = s.counts ?? {};

  // First-party traffic sources for the same 24h (the RPC window is "now - N
  // days", so this drifts a few hours from the IST day — near enough for a
  // morning read, and clearly labelled in the email).
  // A failure here is CARRIED into the mail (fp_error), never dropped: for the
  // days up to 2 October 2026 this call timed out every morning, its error was
  // ignored, and the block read "No sessions in the last 24 hours" — a failed
  // read dressed as a quiet day.
  const fp = await safely<{ data: unknown; error: string | null }>(
    "fp-traffic",
    BLOCK_BUDGET_MS,
    (async () => {
      const { data, error } = await supabase.rpc("admin_traffic_sources", { p_key: rpcKey, p_days: 1 });
      if (error) return { data: null, error: error.message || "the database returned an error" };
      if (!data) return { data: null, error: "the database returned nothing" };
      return { data, error: null };
    })(),
    { data: null, error: "took too long to answer and was dropped so the brief could go out" },
  );
  if (fp.error) console.error(`[brief] admin_traffic_sources failed: ${fp.error}`);
  const fpTraffic = fp.data;

  // Conversion watch: the same first-party snapshot over the last 7 days, turned
  // into a sessions→paid rate. Wrapped so a slow or failed call shows the block
  // blank rather than delaying the whole brief (the rest of the mail never waits
  // on it). Reuses intel_snapshot — same shape, wider window.
  const conv7 = await safely<ConversionWatch | null>(
    "conversion7",
    BLOCK_BUDGET_MS,
    (async (): Promise<ConversionWatch | null> => {
      const { data, error } = await supabase.rpc("intel_snapshot", {
        p_key: rpcKey,
        p_from: from7.toISOString(),
        p_to: to.toISOString(),
      });
      if (error || !data) return null;
      const w = data as Record<string, any>;
      const wOrders: any[] = w.orders ?? [];
      const summary = briefOrders(wOrders);
      const wEv = w.event_counts ?? {};
      return {
        sessions: Number(wEv.session ?? 0),
        views: Number(wEv.view ?? 0),
        carts: cartSignalCounts(wEv).serverConfirmed,
        ordersPaid: summary.retail.length,
        revenue: summary.retailRevenue,
        samples: summary.samples.length,
        ownerValidations: summary.owner.length,
        unidentified: summary.unidentified.length,
      };
    })(),
    null,
  );

  // Case-study PDF downloads over the same 7 days — a commercial intent signal
  // (a prospect forwarding/printing a study). Service-role count because RLS on
  // site_events blocks the anon client; wrapped so a slow/failed read leaves the
  // line blank rather than delaying the brief.
  const downloads7 = await safely<number | null>(
    "downloads7",
    BLOCK_BUDGET_MS,
    (async (): Promise<number | null> => {
      const { supabaseAdmin } = await import("@/lib/supabase-admin");
      const admin = supabaseAdmin();
      if (!admin) return null;
      const { count, error } = await admin
        .from("site_events")
        .select("id", { count: "exact", head: true })
        .eq("event", "case_study_download")
        .eq("is_bot", false)
        .gte("created_at", from7.toISOString());
      if (error) return null;
      return count ?? 0;
    })(),
    null,
  );

  // Partner traffic: every partner's portal and measurement-link visits over
  // the same last-24h window as "Sources the store saw", named from
  // corporate_accounts, with how much of it the referrer alone would have
  // filed as direct. Read through brief_partner_visits, which applies the
  // site_events_human bot rules to the day's partner sessions only: the view
  // itself shapes every visitor ever recorded and took 6–7 seconds against an
  // 8-second statement limit, so "could not be read" was most mornings'
  // answer (to 9 October 2026). A failure now carries its reason into the mail.
  const partnerRead = await safely<{
    data: { accounts: PartnerAccount[]; summary: PartnerTrafficSummary } | null;
    error: string | null;
  }>(
    "partners",
    BLOCK_BUDGET_MS,
    (async () => {
      const { supabaseAdmin } = await import("@/lib/supabase-admin");
      const admin = supabaseAdmin();
      if (!admin) return { data: null, error: "no service-role key is configured" };
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const [acc, visits] = await Promise.all([
        admin.from("corporate_accounts").select("slug, name, active"),
        admin.rpc("brief_partner_visits", { p_since: since }),
      ]);
      if (acc.error) return { data: null, error: `partner accounts: ${acc.error.message}` };
      if (visits.error) return { data: null, error: `partner visits: ${visits.error.message}` };
      const accounts = (acc.data ?? []) as PartnerAccount[];
      const rows = ((visits.data ?? []) as any[]).map((r) => ({
        token: r.token ? String(r.token) : null,
        source: String(r.meta?.source ?? ""),
        medium: String(r.meta?.medium ?? ""),
        via: r.meta?.via ? String(r.meta.via) : null,
      }));
      return { data: { accounts, summary: summarisePartnerTraffic(rows, accounts) }, error: null };
    })(),
    { data: null, error: "took too long to answer and was dropped so the brief could go out" },
  );
  if (partnerRead.error) console.error(`[brief] partner visits failed: ${partnerRead.error}`);
  const partners = partnerRead.data;

  const metrics = {
    date: dateKey,
    ga,
    gaWeekAgo,
    gaConfigured: gaReportingConfigured(),
    orders_total: orders.length,
    orders_paid: paid.length,
    revenue_paid: revenue,
    paid_samples: orderSummary.samples.length,
    owner_validations: orderSummary.owner.length,
    unidentified_paid: orderSummary.unidentified.length,
    funnel: {
      sessions: Number(ev.session ?? 0),
      views: Number(ev.view ?? 0),
      saves: Number(ev.save ?? 0),
      // Browser taste signals can be blocked. Count the server's confirmed
      // additions, never sum both channels (that double-counts one action).
      carts: cartSignalCounts(ev).serverConfirmed,
    },
    // The lead half of saving, kept separate from the funnel above because it
    // measures OUR ask, not the shopper's interest: how many times we invited
    // someone to keep their list, and how many gave an address for it. Before
    // 26 September 2026 saving required a verified email, so these two were
    // welded to `saves` and a refusal was invisible.
    save_asks: Number(ev.save_prompt ?? 0),
    save_emails: Number(ev.save_identify ?? 0),
    abandoned_carts: Number(s.abandoned_carts?.count ?? 0),
    sample_requests: Number(counts.sample_requests ?? 0),
    newsletter_signups: Number(counts.newsletter_signups ?? 0),
    contact_messages: Number(counts.contact_messages ?? 0),
    // Top six, plus any partner's designers below the cut (partner-traffic-rules).
    fp_sources: reportSources((fpTraffic as any)?.by_source ?? []),
    fp_total_sessions: Number((fpTraffic as any)?.total_sessions ?? 0),
    fp_error: fp.error,
    snapshot_error: snapshot.error,
    adChannels,
    briefFor,
    organic,
    social,
    sections: filed.sections,
    missing: filed.missing,
    conv7,
    downloads7,
    partners,
    partners_error: partnerRead.error,
  };

  const wantEmail = url.searchParams.get("email") !== "0";
  // ?email=0&format=html — the brief exactly as it would be mailed, sent to
  // nobody: how a change to the brief is looked at before it reaches the inbox.
  if (!wantEmail && url.searchParams.get("format") === "html") {
    return new NextResponse(buildEmail(metrics), { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  let emailed = false;
  let skipped: string | null = null;

  if (wantEmail) {
    // Cloudflare re-fires a scheduled invocation that failed, and a founder who
    // receives the same brief twice stops trusting all of them. `?force=1` is
    // the deliberate override for a re-send.
    if (url.searchParams.get("force") !== "1" && (await alreadySent(briefFor))) {
      skipped = "already sent today";
    } else {
      // Recipients split on commas, as the weekly intelligence mail does — the
      // daily one used to take the whole string as a single address, so a second
      // recipient would have silently bounced the lot.
      const to = (process.env.INTEL_REPORT_TO || "roheena@plankandweave.com")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const headlineTraffic = ga ? `${ga.sessions} sessions` : `${metrics.funnel.sessions} sessions`;
      const subject = buildSubject({
        briefFor,
        status: briefOverallStatus(briefDecisions(metrics)),
        sections: filed.sections,
        traffic: headlineTraffic,
        money: snapshot.error ? "sales unread" : paid.length ? inr(revenue) : "no sales",
      });

      emailed = await sendEmail({
        to,
        subject,
        html: buildEmail(metrics),
        tags: [{ name: "kind", value: "morning-brief" }],
      });

      if (emailed) {
        await markSent({
          briefFor,
          subject,
          sections: filed.sections.map((s) => s.key),
          missing: filed.missing.map((s) => s.key),
        });
      }
    }
  }

  return NextResponse.json({ ok: true, emailed, skipped, metrics });
}

/** The subject line is the brief in one glance: whether anything is on fire
 *  first, then the two numbers that describe the business. The status word only
 *  appears when it is not green — a subject that shouts every morning stops
 *  being read on the morning it matters. */
function buildSubject(a: {
  briefFor: string;
  status: BriefStatus | "unknown";
  sections: BriefSection[];
  traffic: string;
  money: string;
}): string {
  const date = formatIstDate(istMidnight(a.briefFor), { day: "numeric", month: "long" });
  const alarm =
    a.status === "red"
      ? "🔴 urgent problem"
      : a.status === "amber"
        ? "🟡 action / review needed"
        : a.status === "green" && a.sections.length
          ? "🟢 reported checks clear"
          : "🟡 checks incomplete — Claude Code to review";
  return `Zyvorah brief · ${date} · ${alarm} · ${a.traffic} · ${a.money}`;
}

type ConversionWatch = {
  sessions: number;
  views: number;
  carts: number;
  ordersPaid: number;
  revenue: number;
  samples: number;
  ownerValidations: number;
  unidentified: number;
};

type Metrics = {
  date: string;
  ga: GaDaySnapshot | null;
  gaWeekAgo: GaDaySnapshot | null;
  gaConfigured: boolean;
  orders_total: number;
  orders_paid: number;
  revenue_paid: number;
  paid_samples: number;
  owner_validations: number;
  unidentified_paid: number;
  funnel: { sessions: number; views: number; saves: number; carts: number };
  save_asks: number;
  save_emails: number;
  abandoned_carts: number;
  sample_requests: number;
  newsletter_signups: number;
  contact_messages: number;
  fp_sources: { source: string; medium: string; sessions: number; visitors: number }[];
  fp_total_sessions: number;
  /** Why the first-party traffic read failed, or null when it answered. */
  fp_error: string | null;
  /** Why the store snapshot (orders, revenue, funnel) failed, or null. */
  snapshot_error: string | null;
  adChannels: ChannelDay;
  briefFor: string;
  organic: OrganicBlock;
  social: SocialBlock;
  sections: BriefSection[];
  missing: MissingSection[];
  conv7: ConversionWatch | null;
  downloads7: number | null;
  partners: { accounts: PartnerAccount[]; summary: PartnerTrafficSummary } | null;
  /** Why the partner read failed, or null when it answered. */
  partners_error: string | null;
};

// Same visual language as the weekly intelligence mail (lib/intel.ts) — the
// two land in the same inbox and should read as one series.
const CLOUD = "#FAFAF7";
const CHARCOAL = "#0F0F0F";
const SLATE = "#3f3f3f";
const MIST = "#6b6b6b";

function esc(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function statCell(label: string, value: string, sub?: string): string {
  return `<td width="33%" style="padding:14px 10px;background:#f7f7f4;border-radius:14px;font-family:Arial,Helvetica,sans-serif;text-align:center;">
    <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${MIST};font-weight:700;">${esc(label)}</div>
    <div style="font-size:22px;font-weight:800;color:${CHARCOAL};margin-top:4px;">${esc(value)}</div>
    ${sub ? `<div style="font-size:11px;color:${MIST};margin-top:2px;">${esc(sub)}</div>` : ""}
  </td>`;
}

/** One block of the mail. Long unbroken text (a tracking link, a file path, a
 *  timestamp) wraps instead of widening the mail past a phone screen: on
 *  9 October 2026 two UTM strings in the paid-channel notes made the brief
 *  517px wide on a 390px phone. */
function section(title: string, inner: string): string {
  return `<tr><td class="zy-pad" style="padding:26px 40px 0;font-family:Arial,Helvetica,sans-serif;">
    <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MIST};font-weight:700;">${esc(title)}</div>
    <div style="font-size:14px;line-height:1.65;color:${SLATE};margin-top:10px;overflow-wrap:anywhere;word-break:break-word;">${inner}</div>
  </td></tr>`;
}

/* ── Partner traffic ─────────────────────────────────────────────────────── */

/** Every partner's visits in one place: who came, how (portal or measurement
 *  link), and how much of it would otherwise have been counted as direct. A
 *  partner with no visits is named, never silently left out. */
function partnerBlock(
  p: { accounts: PartnerAccount[]; summary: PartnerTrafficSummary } | null,
  totalSessions: number,
  error: string | null = null,
): string {
  if (!p) {
    return `<strong>Could not be read this morning</strong>${error ? ` — ${esc(error)}` : ""}. This is a failed read, not a quiet day.`;
  }
  const { lines, sessions, wouldBeDirect, quiet } = p.summary;
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const rows = lines.map((l) => {
    const how = [l.portal ? `portal ${l.portal}` : "", l.measureLinks ? `measurement links ${l.measureLinks}` : ""]
      .filter(Boolean)
      .join(", ");
    return (
      `<strong>${esc(l.name)}</strong> — ${plural(l.sessions, "session")}, ${plural(l.visitors, "visitor")} (${how})` +
      (l.wouldBeDirect ? ` · ${l.wouldBeDirect} would have read as direct` : "")
    );
  });
  const total = sessions
    ? `Partners were <strong>${sessions}</strong>${totalSessions ? ` of ${totalSessions}` : ""} sessions; ${wouldBeDirect} of them would have read as direct.`
    : "No partner visits in the last 24 hours.";
  const quietLine = quiet.length ? `No visits from: ${quiet.map(esc).join(", ")}.` : "";
  return [...rows, total, quietLine].filter(Boolean).join("<br>");
}

/* ── What the agents filed, and what they did not ────────────────────────── */

const DOT = BRIEF_LABELS;

/** Each agent's full section, in reading order. */
function agentSections(sections: BriefSection[]): string {
  return sections
    .filter((s) => s.bodyHtml)
    .map((s) => ({ s, body: withoutLifted(s.bodyHtml ?? "").trim() }))
    .map(({ s, body }) =>
      section(
        `${s.title} · ${DOT[s.status]}`,
        `${body || `<span style="color:${MIST};">Everything in this report is listed at the top.</span>`}<div style="margin-top:10px;font-size:12px;color:${MIST};">Filed ${esc(s.filedFor)} at ${esc(s.updatedAt)}${s.observedAt ? `; evidence checked ${esc(s.observedAt)}` : "; underlying observation time not supplied"}${s.source ? ` by ${esc(s.source)}` : ""}.</div>`,
      ),
    )
    .join("");
}

/* ── Organic search ──────────────────────────────────────────────────────── */

function organicBlock(o: OrganicBlock): string {
  if (!o.configured) {
    return section("Organic search (free traffic)", "Waiting on Google Analytics credentials.");
  }
  if (o.error || !o.window) {
    return section(
      "Organic search (free traffic)",
      `Not read this morning — ${esc(o.error ?? "Google Analytics returned nothing")}. Yesterday's figure is not shown rather than shown wrong.`,
    );
  }
  const prior = o.priorOrganicSessions;
  const dir =
    prior == null || prior === 0
      ? ""
      : (() => {
          const pct = Math.round(((o.organicSessions - prior) / prior) * 100);
          return pct === 0
            ? " · level with the week before"
            : ` · ${pct > 0 ? "+" : ""}${pct}% on the week before (${prior})`;
        })();

  const landing = o.topLanding.length
    ? o.topLanding
        .map(
          (p) =>
            `${esc(p.path)} — <strong>${p.sessions}</strong> arrivals, ${Math.round(p.bounceRate * 100)}% left straight away`,
        )
        .join("<br>")
    : "No landing pages recorded.";

  return section(
    "Organic search (free traffic, last 7 days)",
    `<strong>${o.organicSessions}</strong> visits came from search${dir}.<br><br>` +
      `${searchTerms(o)}` +
      `<strong>Where they arrived</strong><br>${landing}`,
  );
}

/** The words people typed, from Search Console.
 *
 *  Impressions sit beside clicks deliberately. A term shown often and clicked
 *  rarely is a listing problem — Google is already offering us and people are
 *  choosing someone else. A term ranked well with few impressions is just a
 *  rare search. Clicks alone cannot tell those apart, and they call for
 *  opposite work.
 *
 *  Rank is printed as "rank 4.2" rather than "position", because position
 *  invites the reading that higher is better. */
function searchTerms(o: OrganicBlock): string {
  if (!o.searchConfigured) return "";
  if (!o.search) {
    return `<div style="margin-bottom:16px;color:${MIST};">The search terms could not be read this morning, so they are left out rather than shown as zero.</div>`;
  }
  const w = o.search;
  if (!w.queries.length) {
    return `<div style="margin-bottom:16px;">Google recorded no searches that reached us between ${esc(w.from)} and ${esc(w.to)}.</div>`;
  }
  const rows = w.queries
    .map(
      (q) =>
        `“${esc(q.key)}” — <strong>${q.clicks}</strong> click${q.clicks === 1 ? "" : "s"} from ${q.impressions} appearance${q.impressions === 1 ? "" : "s"}, rank ${q.position.toFixed(1)}`,
    )
    .join("<br>");
  return (
    `<strong>What people typed</strong> <span style="color:${MIST};">(${esc(w.from)} to ${esc(w.to)}, the most recent settled week)</span><br>` +
    `${rows}<br>` +
    `<div style="margin:8px 0 16px;font-size:12px;color:${MIST};">` +
    `Across everything: <strong>${w.clicks}</strong> clicks from <strong>${w.impressions}</strong> appearances, average rank ${w.position.toFixed(1)} — lower is better, 1 is the top result. ` +
    `Search Console settles slowly, so this week ends ${esc(w.to)} rather than yesterday; a fresher window would under-report and read as a decline that did not happen.` +
    `</div>`
  );
}

/* ── Instagram ───────────────────────────────────────────────────────────── */

function socialBlock(s: SocialBlock): string {
  if (!s.available) {
    return section("Instagram", `Could not read the post queue — ${esc(s.error ?? "unknown reason")}.`);
  }
  const bits: string[] = [];
  bits.push(
    s.publishedYesterday
      ? `<strong>${s.publishedYesterday}</strong> post${s.publishedYesterday === 1 ? "" : "s"} went out yesterday.`
      : "Nothing went out yesterday.",
  );

  // The silence that has no error anywhere: every planned day already declined.
  // Without this the brief would read "nothing went out, nothing is waiting",
  // which is true and completely misleading.
  if (s.horizonFullyDeclined) {
    bits.push(
      `<strong>Instagram will stay quiet.</strong> ${s.declinedAhead} upcoming day${s.declinedAhead === 1 ? " has" : "s have"} been turned down, and a declined day keeps its place in the schedule — the engine cannot write a replacement for it. ` +
        `Nothing is queued, nothing is waiting on you, and nothing is coming. To restart the channel, ask for the declined days to be reopened.`,
    );
  }

  // What waits on her (posts to approve, creator pitches) is a "Needs you"
  // line at the top with its link; this block keeps only the age, which the
  // one-liner cannot carry.
  if (s.awaitingReview && s.oldestWaitingDays != null && s.oldestWaitingDays > 0) {
    bits.push(`The oldest post waiting for your yes has waited ${s.oldestWaitingDays} day${s.oldestWaitingDays === 1 ? "" : "s"}.`);
  }

  if (s.approvedWaiting) bits.push(`${s.approvedWaiting} approved and scheduled for their day.`);
  if (s.blocked) {
    bits.push(
      `${s.blocked} need production work before review. They are excluded from your approval queue; no approval action is needed from you.`,
    );
  }
  if (s.missedDays) bits.push(`${s.missedDays} unapproved post${s.missedDays === 1 ? "'s day has" : "s' days have"} passed; they will not publish and need no action.`);
  if (s.failed) bits.push(`${s.failed} failed to publish.`);
  if (!s.everPublished) {
    bits.push(
      `This channel has not yet recorded a published post. Publishing verification remains an operational task.`,
    );
  }

  return section("Instagram", bits.join("<br><br>"));
}

function delta(today: number, weekAgo: number | undefined): string {
  if (weekAgo == null || weekAgo === 0) return "";
  const pct = Math.round(((today - weekAgo) / weekAgo) * 100);
  if (pct === 0) return " · level with last week";
  return ` · ${pct > 0 ? "+" : ""}${pct}% vs same day last week`;
}

/** The conversion watch: a rolling 7-day sessions→paid rate. This is the number
 *  that tells whether the storefront is turning visitors into buyers — the thing
 *  ad spend can only ever feed, never fix. Shown weekly on purpose: a new brand's
 *  single day is too thin to read a rate from. */
function conversionWatchBlock(c: ConversionWatch | null, downloads: number | null): string {
  // Case-study downloads ride in this block because they are the same question —
  // is interest turning into intent. Only printed once there is a number to show;
  // null means the read failed and is left silent rather than shown as zero.
  const downloadLine =
    downloads == null
      ? ""
      : downloads > 0
        ? `<div style="margin-top:8px;"><strong>${downloads}</strong> case ${downloads === 1 ? "study" : "studies"} downloaded</div>`
        : `<div style="margin-top:8px;color:${MIST};">No case studies downloaded.</div>`;
  if (!c) {
    return section(
      "Conversion watch (last 7 days)",
      `Not read this morning — left blank rather than shown wrong.${downloadLine}`,
    );
  }
  const rate = c.sessions > 0 ? ((c.ordersPaid / c.sessions) * 100).toFixed(2) : "0.00";
  return section(
    "Conversion watch (last 7 days)",
    `${c.sessions} sessions → ${c.views} design views → ${c.carts} carts → ` +
      `<strong>${c.ordersPaid} external retail wall/art order${c.ordersPaid === 1 ? "" : "s"}</strong> · ` +
      `<strong>${rate}%</strong> of sessions bought${c.ordersPaid ? ` · ${inr(Math.round(c.revenue))}` : ""}` +
      `<div>External samples: ${c.samples}. Owner validations excluded: ${c.ownerValidations}. Unidentified paid records excluded: ${c.unidentified}.</div>` +
      downloadLine +
      `<div style="margin-top:8px;font-size:12px;color:${MIST};">` +
      `Orders created in the rolling week, currently marked paid; not a payment-date ledger or an attributed ad conversion rate. ` +
      `Samples and owner validations do not count as retail purchases. Ad delivery also requires verified tracking, billing and spend caps.</div>`,
  );
}

function buildEmail(m: Metrics): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://zyvorah.com";
  const rows = briefDecisions(m);
  const top = briefTopHtml(rows, siteUrl);
  const mobile =
    "@media only screen and (max-width:600px){.zy-pad{padding-left:22px!important;padding-right:22px!important}}";

  const gaBlock = m.ga
    ? `
      <tr><td class="zy-pad" style="padding:22px 40px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>
          ${statCell("Sessions", String(m.ga.sessions), `${m.ga.totalUsers} visitors${delta(m.ga.sessions, m.gaWeekAgo?.sessions)}`)}
          ${statCell("Page views", String(m.ga.pageViews), `${m.ga.newUsers} new visitors`)}
          ${statCell("Avg session", `${Math.floor(m.ga.avgSessionSeconds / 60)}m ${m.ga.avgSessionSeconds % 60}s`, m.ga.purchases ? `${m.ga.purchases} purchase${m.ga.purchases === 1 ? "" : "s"} in GA` : "engagement")}
        </tr></table>
      </td></tr>
      ${section(
        "Where visitors came from (GA)",
        m.ga.sources.length
          ? m.ga.sources.map((x) => `${esc(x.source)} — <strong>${x.sessions}</strong> sessions (${x.users} visitors)`).join("<br>")
          : "No sessions recorded.",
      )}
      ${section(
        "Most-viewed pages (GA)",
        m.ga.pages.length
          ? m.ga.pages.map((p) => `${esc(p.path)} — <strong>${p.views}</strong>`).join("<br>")
          : "No page views recorded.",
      )}`
    : section(
        "Google Analytics",
        m.gaConfigured
          ? "GA is configured but returned nothing for this day — worth a look at the property."
          : "Not connected yet. Once the GA4 property, service account and secrets are in place this section fills itself in — first-party numbers below cover the meantime.",
      );

  const funnel = m.snapshot_error
    ? `<strong>Could not be read this morning</strong> — ${esc(m.snapshot_error)}. This is a failed read, not a quiet day: yesterday's orders, revenue and funnel are not shown.`
    : `${m.funnel.sessions} sessions → ${m.funnel.views} design views → ${m.funnel.saves} saves → ${m.funnel.carts} carts → <strong>${m.orders_paid} paid customer order${m.orders_paid === 1 ? "" : "s"}</strong>`;

  // Only worth a line once the ask has actually been made — an empty row every
  // morning trains the reader to skip the block it sits in.
  const saveLine = m.save_asks
    ? `${m.funnel.saves} saves → ${m.save_asks} asked to keep the list → <strong>${m.save_emails} gave an email</strong>`
    : null;

  const fpSources = m.fp_error
    ? `<strong>Could not be read this morning</strong> — ${esc(m.fp_error)}. This is a failed read, not a quiet day: the store's visits are not shown here.`
    : m.fp_sources.length
    ? m.fp_sources
        .map((x) =>
          isPartnerMedium(x.medium)
            ? `${esc(partnerLabel(x.source, m.partners?.accounts ?? []))} (${x.medium === PARTNER_LINK_MEDIUM ? "measurement link" : "partner portal"}) — <strong>${x.sessions}</strong> sessions (${x.visitors} visitors)`
            : `${esc(x.source)}${x.medium && x.medium !== "unknown" ? ` / ${esc(x.medium)}` : ""} — <strong>${x.sessions}</strong> sessions (${x.visitors} visitors)`,
        )
        .join("<br>")
    : "No sessions in the last 24 hours.";

  // Zeros from an unread snapshot are not yesterday's numbers — say nothing.
  const alsoBits = m.snapshot_error ? [] : [
    `Paid customer samples: ${m.paid_samples}; owner validations excluded: ${m.owner_validations}; unidentified paid records excluded: ${m.unidentified_paid}`,
    m.abandoned_carts ? `Abandoned carts: ${m.abandoned_carts}` : null,
    m.sample_requests ? `Sample requests: ${m.sample_requests}` : null,
    m.newsletter_signups ? `Newsletter sign-ups: ${m.newsletter_signups}` : null,
    m.contact_messages ? `Contact messages: ${m.contact_messages}` : null,
  ].filter(Boolean);

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${mobile}</style></head><body style="margin:0;padding:0;background:${CLOUD};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CLOUD};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:820px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #ececec;">
        <tr><td style="height:6px;background:${CHARCOAL};"></td></tr>
        <tr><td class="zy-pad" style="padding:28px 40px 8px;">
          <div style="line-height:0;">${emailWordmark(30)}</div>
        </td></tr>
        <tr><td class="zy-pad" style="padding:10px 40px 0;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MIST};font-weight:700;">Morning brief · ${esc(m.briefFor)} · covering ${esc(m.date)}</div>
          <div style="font-size:24px;line-height:1.25;font-weight:800;color:${CHARCOAL};margin-top:8px;">${
            briefSalesHeadline(m.snapshot_error, m.orders_paid, inr(m.revenue_paid))
          }${m.ga ? ` · ${m.ga.sessions} sessions on the site` : ""}</div>
        </td></tr>
        ${section("Needs you", top.needsYou)}
        ${section("Claude Code is handling", top.handling)}
        <tr><td class="zy-pad" style="padding:34px 40px 0;font-family:Arial,Helvetica,sans-serif;"><div style="border-top:1px solid #E0E0E0;padding-top:18px;font-size:18px;font-weight:800;color:${CHARCOAL};">Detail</div></td></tr>
        ${section("Working and FYI", briefGoingWellHtml(rows))}
        ${gaBlock}
        ${adChannelsBlock(m.adChannels)}
        ${organicBlock(m.organic)}
        ${socialBlock(m.social)}
        ${conversionWatchBlock(m.conv7, m.downloads7)}
        ${section("Store funnel (first-party, yesterday)", funnel)}
        ${saveLine ? section("Saved designs → leads", saveLine) : ""}
        ${section("Sources the store saw (first-party, last 24h)", fpSources)}
        ${section("Partner traffic (first-party, last 24h)", partnerBlock(m.partners, m.fp_total_sessions, m.partners_error))}
        ${alsoBits.length ? section("Also yesterday", alsoBits.join(" · ")) : ""}
        ${section("Source reports", "What each agent filed, without the items already listed at the top. Filing time is not a fresh check; each report says when its evidence was checked.")}
        ${agentSections(m.sections)}
        <tr><td class="zy-pad" style="padding:28px 40px 32px;font-family:Arial,Helvetica,sans-serif;">
          <div style="border-top:1px solid #ececec;padding-top:18px;font-size:12px;color:${MIST};line-height:1.6;">
            <a href="${esc(siteUrl)}/admin/marketing/guide" style="color:${CHARCOAL};font-weight:700;">What these marketing numbers mean →</a><br><br>
            One brief, every morning at 08:00 IST. The overnight patrol, the afternoon watch, the ads review, the customer sweep, the follow-up calls and the HomeLane portal count all file into it instead of sending their own mail — an agent that goes quiet is listed above as not having reported, never left out.<br><br>
            GA and first-party numbers will differ — ad blockers hide from GA, bots hide from neither perfectly. Read trends, not decimals.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

/* ── Paid channels: verdicts, the per-channel table, the review flags ──── */

// Money in the paid-channel block is the PLATFORM's money, in the platform's
// own currency. Only INR gets the rupee formatter; anything else is printed
// with its ISO code so a GBP spend can never read as rupees.
const money = (n: number, cur: string | null) =>
  !cur || cur === "INR" ? inr(Math.round(n)) : `${cur} ${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const rate = (n: number | null, cur: string | null) =>
  n == null ? "—" : !cur || cur === "INR" ? `₹${n.toFixed(n < 100 ? 2 : 0)}` : `${cur} ${n.toFixed(2)}`;

function channelLine(c: ChannelStat, w?: ChannelStat): string {
  const bits = [
    c.spend > 0 ? `spend <strong>${money(c.spend, c.currency)}</strong>` : null,
    c.clicks > 0 ? `<strong>${c.clicks}</strong> clicks` : null,
    `<strong>${c.sessions}</strong> landings`,
    c.cpc != null ? `CPC ${rate(c.cpc, c.currency)}` : null,
    // revenue is always the store's own INR, whatever the ad account bills in
    c.purchases > 0 ? `${c.purchases} purchase${c.purchases === 1 ? "" : "s"} (${inr(Math.round(c.revenue))})` : null,
    c.costPerPurchase != null ? `${rate(c.costPerPurchase, c.currency)}/order` : null,
  ].filter(Boolean);
  const weekBit = w
    ? ` <span style="color:${MIST};">· 7d: ${w.spend > 0 ? `${money(w.spend, w.currency)} spend, ` : ""}${w.clicks || w.sessions} ${w.clicks ? "clicks" : "landings"}${w.cpc != null ? `, CPC ${rate(w.cpc, w.currency)}` : ""}</span>`
    : "";
  const basis =
    c.basis === "platform+ga"
      ? ""
      : c.basis === "platform-mute"
        ? ` <span style="color:${MIST};">(connected, but the ad account reported no spend — landings are GA's)</span>`
        : c.basis === "platform-down"
          ? ` <span style="color:${MIST};">(spend feed unreachable this run — landings are GA's)</span>`
          : ` <span style="color:${MIST};">(GA landings only — no platform spend feed)</span>`;
  const camps = c.campaigns
    .slice(0, 4)
    .map(
      (cam) =>
        `&nbsp;&nbsp;·&nbsp;${esc(cam.name)} — ${[
          cam.spend > 0 ? money(cam.spend, c.currency) : null,
          cam.clicks > 0 ? `${cam.clicks} clicks` : null,
          `${cam.sessions} landings`,
          cam.cpc != null ? `CPC ${rate(cam.cpc, c.currency)}` : null,
          cam.purchases > 0 ? `${cam.purchases} order${cam.purchases === 1 ? "" : "s"}` : null,
        ]
          .filter(Boolean)
          .join(", ")}`,
    )
    .join("<br>");
  return `<strong>${esc(c.label)}</strong> — ${bits.join(" · ")}${weekBit}${basis}${camps ? `<br>${camps}` : ""}`;
}

function adChannelsBlock(a: ChannelDay): string {
  if (!a.channels.length && !a.gaConfigured) {
    return section(
      "Paid channels",
      "Waiting on Google Analytics credentials — paid-channel tracking rides on the same connection.",
    );
  }
  const verdicts = a.verdicts.map((v) => `• ${esc(v)}`).join("<br>");
  const table = a.channels.length
    ? a.channels
        .map((c) => channelLine(c, a.week.find((w) => w.key === c.key)))
        .join("<br><br>")
    : "No paid traffic landed yesterday.";
  const flags = a.flags.length
    ? `<div style="margin-top:12px;padding:12px 14px;background:#fdf6ee;border-radius:12px;border:1px solid #f0e2cf;">
        <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#8a6d3b;font-weight:700;">Review</div>
        <div style="margin-top:6px;">${a.flags.map((f) => `• ${esc(f)}`).join("<br>")}</div>
      </div>`
    : "";
  const note = !a.metaConfigured
    ? `<div style="margin-top:10px;font-size:12px;color:${MIST};">Meta spend/CPC will appear once the Marketing API token is added; until then Meta shows GA landings only. ChatGPT ads have no reporting API — that channel is always read from landings.</div>`
    : "";
  const provenance = `<div style="margin-top:10px;font-size:12px;color:${MIST};">${esc(paidChannelProvenance(a))}</div>`;
  return section(`Paid channels (${a.date})`, `${verdicts}<br><br>${table}${flags}${provenance}${note}`);
}

export const GET = withCronRun("daily-report", tick);
