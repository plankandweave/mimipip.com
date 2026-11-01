import { serviceAvailable } from "@/brand/services";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { hasServiceRole, serviceClient } from "@/lib/marketing/db";
import { configuredChannels, publisherFor, type PublishHealth } from "@/lib/marketing/publish";
import { metaConfigured, launchActive } from "@/lib/marketing/ads/meta";
import { metaCapiConfigured } from "@/lib/meta-capi";
import { sendsArmed } from "@/lib/marketing/sends";
import { intelReady } from "@/lib/marketing/intel";
import { budgetStatus } from "@/lib/marketing/budget";
import { SITE_URL } from "@/lib/seo";
import { staffKey } from "@/lib/staff-key";
import { GOOGLE_ADS_ID } from "@/lib/google-ads";
import { gaReportingConfigured } from "@/lib/ga-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function keyOk(key: string): Promise<boolean> {
  const { data } = await supabase.rpc("intel_key_ok", { p_key: key });
  return !!data;
}

async function emailWebhookReady(): Promise<boolean> {
  if (process.env.RESEND_WEBHOOK_SECRET) return true;
  if (!hasServiceRole()) return false;
  const sb = serviceClient();
  const { data } = await sb.from("admin_config").select("k").eq("k", "resend_webhook_secret").limit(1);
  return !!data?.length;
}

/** The domain we actually send from, e.g. "mail.zyvorah.com" from
 *  EMAIL_FROM="Zyvorah <hello@mail.zyvorah.com>". Mirrors the default in lib/email. */
function sendingDomain(): string {
  const from = process.env.EMAIL_FROM || "Zyvorah <hello@mail.zyvorah.com>";
  return (from.match(/@([^>\s]+)/)?.[1] ?? "mail.zyvorah.com").toLowerCase();
}

type DomainRecord = { record?: string; name?: string; type?: string; value?: string; status?: string };
type DomainTracking = {
  id: string;
  name: string;
  open: boolean;
  click: boolean;
  status?: string;
  /** Open/click tracking is served from this subdomain, and it carries its own
   *  DNS records — the usual reason tracking will not switch on. */
  trackingSubdomain?: string | null;
  /** Per-record verification state — the only way to see WHICH record is failing. */
  records?: DomainRecord[];
};

/** Read the sending domain's tracking flags from Resend. Null when we can't ask
 *  (no key) or the domain isn't registered on the account. */
async function domainTracking(resendKey: string): Promise<DomainTracking | null> {
  const want = sendingDomain();
  const list = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${resendKey}` },
  });
  if (!list.ok) return null;
  const json = await list.json().catch(() => null);
  const rows: { id?: string; name?: string }[] = json?.data ?? [];
  const match = rows.find((d) => (d.name ?? "").toLowerCase() === want);
  if (!match?.id) return null;

  // The list response omits the tracking flags; the single-domain read has them.
  const one = await fetch(`https://api.resend.com/domains/${match.id}`, {
    headers: { Authorization: `Bearer ${resendKey}` },
  });
  const d = one.ok ? await one.json().catch(() => null) : null;
  return {
    id: match.id,
    name: match.name ?? want,
    open: !!d?.open_tracking,
    click: !!d?.click_tracking,
    status: d?.status,
    trackingSubdomain: d?.tracking_subdomain ?? null,
    records: Array.isArray(d?.records)
      ? (d.records as DomainRecord[]).map((r) => ({
          record: r.record,
          name: r.name,
          type: r.type,
          value: r.value,
          status: r.status,
        }))
      : undefined,
  };
}

// Capability + setup status for the /admin/marketing dashboard. Env lives
// server-side, so the client reads it here. Key-gated with the same admin key
// as the rest of the admin surface (validated via intel_key_ok).
/**
 * Which events our webhook is actually subscribed to. Domain tracking being on
 * is only half of engagement: Resend still has to be forwarding email.opened
 * and email.clicked to us. Both halves can look fine while opens land nowhere,
 * so report the subscription rather than assume the one-click setup created it.
 */
async function webhookEvents(resendKey: string): Promise<string[] | null> {
  const res = await fetch("https://api.resend.com/webhooks", {
    headers: { Authorization: `Bearer ${resendKey}` },
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const rows: { endpoint?: string; events?: string[] }[] = json?.data ?? [];
  const ours = rows.find((w) => (w.endpoint ?? "").includes("/api/webhooks/resend"));
  return ours?.events ?? null;
}


/** A rupee figure for a sentence she reads, not a raw number. */
const rs = (n: number | null | undefined) =>
  n == null ? "the cap" : `₹${Math.round(n).toLocaleString("en-IN")}`;

export async function GET(req: Request) {
  if (!serviceAvailable("email")) return NextResponse.json({ error: "Brand service not configured", code: "BRAND_SERVICE_NOT_CONFIGURED" }, { status: 503 });
  const key = await staffKey(req);
  if (!(await keyOk(key))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const budget = await budgetStatus().catch(() => null);
  // A LIVE check, not a presence check: ask Meta whether the token actually
  // works, so a valid-looking-but-expired or wrong-scope token shows red here
  // rather than as a post that quietly fails on its day.
  const igPub = publisherFor("instagram");
  const igHealth: PublishHealth | null = igPub.health
    ? await igPub.health().catch((e) => ({ configured: igPub.configured, ok: false, detail: (e as Error).message }))
    : null;
  // LinkedIn, the same way: a live read, so "connected" means a post would go.
  const liPub = publisherFor("linkedin");
  const liHealth: PublishHealth | null = liPub.health
    ? await liPub.health().catch((e) => ({ configured: liPub.configured, ok: false, detail: (e as Error).message }))
    : null;
  const ytPub = publisherFor("youtube");
  const ytHealth: PublishHealth | null = ytPub.health
    ? await ytPub.health().catch((e) => ({ configured: ytPub.configured, ok: false, detail: (e as Error).message }))
    : null;
  const webhookReady = await emailWebhookReady().catch(() => false);
  const resendKey = process.env.RESEND_API_KEY;
  const tracking = resendKey ? await domainTracking(resendKey).catch(() => null) : null;
  const subscribed = resendKey ? await webhookEvents(resendKey).catch(() => null) : null;
  const forwardsEngagement =
    !!subscribed?.includes("email.opened") && !!subscribed?.includes("email.clicked");

  const setup = [
    { key: "SUPABASE_SERVICE_ROLE_KEY", ready: hasServiceRole(), note: "Persist media + ledger + campaigns. Without it the engine dry-runs." },
    { key: "INTEL_RPC_KEY", ready: intelReady(), note: "Consume approved decisions + write spend to the governance ledger." },
    { key: "Instagram publish", ready: !!igHealth?.ok, note: igHealth ? `${igHealth.detail}. One Meta system-user token (META_ADS_TOKEN) + META_IG_ACCOUNT_ID, with the instagram_content_publish scope, serves ads and organic.` : "Instagram publisher unavailable." },
    { key: "LinkedIn publish", ready: !!liHealth?.ok, note: liHealth ? `${liHealth.detail}. Connect or renew it with \`node scripts/linkedin-connect.mjs\` — one LinkedIn sign-in, and it writes the token, the refresh token and the page to the zyvorah-store Worker itself. A LinkedIn token lasts 60 days; the date above is when this one lapses.` : "LinkedIn publisher unavailable." },
    { key: "YouTube Shorts", ready: !!ytHealth?.ok, note: ytHealth ? `${ytHealth.detail}. Every Reel that goes out on Instagram follows to YouTube as a Short on the next hourly run — your Reel approval covers it, and its caption is the approved one with "link in bio" swapped for the real link.` : "YouTube publisher unavailable." },
    // Google Ads has no API feed here: its spend reaches us through the GA4 link
    // (account 905-946-7956 ⇄ property 445995352). The tag itself ships in
    // code, so its row is about the one thing code cannot see — whether Ads
    // has actually recorded a purchase. Check Goals → Conversions in Ads.
    { key: "Google Ads tag", ready: true, note: `${GOOGLE_ADS_ID} on every page; purchase, enquiry and sign-up conversions fire from code with enhanced conversions. If Ads still shows Purchase as "Inactive", place a test order — until one is recorded, Smart Bidding is chasing a goal it cannot see.` },
    { key: "Google Ads spend (via GA4)", ready: gaReportingConfigured(), note: "GA4 service account — Google Ads clicks and cost reach the paid-channel panel and the 08:00 mail through the Ads ⇄ GA4 link." },
    { key: "Meta ads", ready: metaConfigured(), note: "META_AD_ACCOUNT_ID + META_ADS_TOKEN — launch paid campaigns, and report real spend in the daily mail." },
    { key: "Meta Pixel", ready: Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID), note: "NEXT_PUBLIC_META_PIXEL_ID — browser events. Build-time, set in deploy.yml." },
    { key: "Meta Conversions API", ready: metaCapiConfigured(), note: "META_CAPI_TOKEN — server-side Purchase, the one that survives iOS and ad blockers." },
    { key: "Meta domain verification", ready: Boolean(process.env.META_DOMAIN_VERIFICATION), note: "META_DOMAIN_VERIFICATION — the Business Manager code. Until it is set, Aggregated Event Measurement cannot be configured and iOS attribution stays capped." },
    // TWO SWITCHES, NOT TWO GAPS. Everything else in this list is "a credential
    // is missing and nothing works". These two are decisions — each has a safe
    // setting and a faster one, and OFF is a working state, not an unfinished
    // one. They carry kind:"choice" so the desk can stop drawing a deliberate
    // choice with the same "waiting" mark as a broken connection: that is what
    // made "campaigns go live immediately" read as a chore to tick off.
    //
    // The money is stated where the decision is made. A switch that commits
    // spend should never be flipped from a line that does not say how much.
    {
      key: "Ads go live when approved",
      ready: launchActive(),
      kind: "choice" as const,
      note: launchActive()
        ? `ON — a campaign you approve starts spending straight away, up to ${rs(budget?.per_campaign_cap)} per campaign and ${rs(budget?.weekly_cap)} a week. The database refuses anything over those caps, so this cannot run away. Turn it off and approved campaigns are created paused in Ads Manager instead.`
        : `OFF — a campaign you approve is created PAUSED in Ads Manager, for a look before any money moves. Turn it on and an approved campaign goes live immediately, up to ${rs(budget?.per_campaign_cap)} per campaign and ${rs(budget?.weekly_cap)} a week.`,
    },
    {
      key: "Outreach email actually sends",
      ready: sendsArmed(),
      kind: "choice" as const,
      note: sendsArmed()
        ? "ON — approved outreach email goes to the customer. Turn it off and it is drafted and held instead."
        : "OFF — outreach email is drafted and held, never sent. This is the safe setting. Turn it on (MARKETING_SENDS_ARMED) only when you want the engine writing to customers directly.",
    },
    { key: "Email engagement webhook", ready: webhookReady, note: "Resend webhook → delivery/bounce/open/click events per issue. Use the one-click setup below." },
    {
      key: "Webhook forwards opens & clicks",
      ready: forwardsEngagement,
      note: subscribed
        ? `Subscribed to: ${subscribed.join(", ")}.`
        : "Could not read the webhook subscription from Resend.",
    },
    // The webhook can be perfectly wired and still record nothing but deliveries:
    // opens and clicks only exist if Resend is rewriting links and injecting the
    // pixel, which is a per-domain switch. Surface it as its own line so a green
    // webhook never implies engagement is being measured.
    {
      key: "Open & click tracking",
      // Green only when a number will actually exist, never on the flags alone.
      ready: !!tracking && trackingState(tracking).active,
      note: tracking
        ? (() => {
            const t = trackingState(tracking);
            if (t.active) return `${tracking.name}: opens on, clicks on. Engagement is measured from each send onward.`;
            const rec = recordToAdd(tracking);
            if (t.flagsOn && rec) {
              return `${tracking.name}: both switched on, but NOT YET MEASURING — Resend serves the open pixel and the click redirect from ${rec.name}, and will not until that record exists. Add in Cloudflare DNS for zyvorah.com: ${rec.type} · name "${rec.name}" · target "${rec.value}" · DNS only (grey cloud, not proxied). Sending is unaffected meanwhile, and links are not rewritten until it verifies.`;
            }
            return `${tracking.name}: opens ${tracking.open ? "on" : "OFF"}, clicks ${tracking.click ? "on" : "OFF"}${
              tracking.trackingSubdomain ? "" : " — no tracking subdomain is configured, and Resend cannot switch either on without one"
            }. Without both, every send reports 0% engagement.`;
          })()
        : "Could not read the sending domain from Resend (needs RESEND_API_KEY and the domain registered on the account).",
    },
  ];

  return NextResponse.json({
    ok: true,
    channels: configuredChannels(),
    metaAds: metaConfigured(),
    instagram: igHealth,
    linkedin: liHealth,
    youtube: ytHealth,
    budget,
    setup,
    tracking,
  });
}

// POST { key, action: "setup-email-webhook" } — one-click engagement tracking:
// registers /api/webhooks/resend with Resend using the server's API key and
// stores the returned signing secret in admin_config, where the webhook route
// reads it. No manual secret copying, no redeploy.
export async function POST(req: Request) {
  if (!serviceAvailable("email")) return NextResponse.json({ error: "Brand service not configured", code: "BRAND_SERVICE_NOT_CONFIGURED" }, { status: 503 });
  const body = await req.json().catch(() => null);
  const key = String(body?.key ?? "");
  if (!(await keyOk(key))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const action = body?.action;
  if (action !== "setup-email-webhook" && action !== "enable-open-click-tracking") {
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return NextResponse.json({ error: "RESEND_API_KEY not set on the server" }, { status: 503 });

  if (action === "enable-open-click-tracking") {
    const sub = typeof body?.trackingSubdomain === "string" && /^[a-z0-9-]{1,40}$/.test(body.trackingSubdomain)
      ? body.trackingSubdomain
      : undefined;
    return NextResponse.json(await enableTracking(resendKey, sub));
  }

  if (!hasServiceRole()) return NextResponse.json({ error: "service role not configured" }, { status: 503 });

  const endpoint = `${SITE_URL}/api/webhooks/resend`;
  const res = await fetch("https://api.resend.com/webhooks", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint,
      events: [
        "email.sent",
        "email.delivered",
        "email.delivery_delayed",
        "email.opened",
        "email.clicked",
        "email.bounced",
        "email.complained",
      ],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Resend's webhook API may not be enabled for every account — fall back to
    // precise manual instructions rather than failing opaquely.
    return NextResponse.json({
      ok: false,
      manual: true,
      instructions: `Automatic setup unavailable (${res.status}). In the Resend dashboard: Webhooks → Add endpoint → URL ${endpoint} → select all email events → copy the signing secret → add it as RESEND_WEBHOOK_SECRET on Vercel. Also enable open & click tracking on the sending domain.`,
      detail: json?.message ?? json?.error ?? null,
    });
  }

  const secret = json?.secret ?? json?.signing_secret ?? null;
  if (secret) {
    const sb = serviceClient();
    await sb.from("admin_config").upsert({ k: "resend_webhook_secret", v: secret }, { onConflict: "k" });
  }
  // Subscribing to email.opened / email.clicked is only half the job — Resend
  // emits neither unless tracking is switched on for the sending domain. Do it
  // here so one click leaves engagement genuinely measured, not just plumbed.
  const tracking = await enableTracking(resendKey);

  return NextResponse.json({
    ok: true,
    webhookId: json?.id ?? null,
    secretStored: !!secret,
    tracking,
    note: secret
      ? "Webhook registered and signing secret stored — engagement events will start flowing."
      : "Webhook registered, but Resend didn't return the signing secret — copy it from the Resend dashboard into RESEND_WEBHOOK_SECRET.",
  });
}

/** Switch on open + click tracking for the sending domain and read the result
 *  back, so the caller learns the real state rather than that a request was made. */
/**
 * Is tracking actually working?
 *
 * The two flags are not the answer. Resend serves the open pixel from the
 * tracking subdomain and redirects clicks through it, and it does neither
 * until that subdomain's CNAME is verified — so a domain can report
 * open_tracking and click_tracking true and still record nothing. Reporting
 * the flags alone is exactly how a desk shows green while every send comes
 * back 0%. This reports the state that decides whether a number will exist.
 */
function trackingState(d: DomainTracking) {
  const cname = (d.records ?? []).find((r) => (r.type ?? "").toUpperCase() === "CNAME") ?? null;
  const cnameVerified = !!cname && (cname.status ?? "").toLowerCase() === "verified";
  return {
    flagsOn: !!d.open && !!d.click,
    cname,
    cnameVerified,
    /** Flags set AND the subdomain live. Only this means engagement is measured. */
    active: !!d.open && !!d.click && cnameVerified,
  };
}

/** The record still to add, shaped for pasting into Cloudflare DNS. */
function recordToAdd(d: DomainTracking | null) {
  if (!d) return null;
  const { cname, cnameVerified } = trackingState(d);
  if (!cname || cnameVerified) return null;
  return { type: cname.type, name: cname.name, value: cname.value, proxied: false };
}

/** The label for the tracking subdomain, e.g. "links" → links.mail.zyvorah.com.
 *  Resend redirects tracked clicks through it, so it is customer-visible in
 *  every link we send; "links" is the convention and reads as what it is. */
const TRACKING_SUBDOMAIN = "links";

async function enableTracking(resendKey: string, subdomain = TRACKING_SUBDOMAIN) {
  const before = await domainTracking(resendKey).catch(() => null);
  if (!before) {
    return {
      ok: false,
      note: `Sending domain ${sendingDomain()} is not registered on this Resend account — add and verify it first, then re-run.`,
    };
  }
  const beforeState = trackingState(before);
  if (beforeState.active) {
    return { ok: true, domain: before.name, open: true, click: true, note: "Already on — no change." };
  }
  if (beforeState.flagsOn && beforeState.cname) {
    // Flags already set, subdomain not live yet: nothing to PATCH, everything
    // to verify. Nudge Resend and report honestly.
    await fetch(`https://api.resend.com/domains/${before.id}/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}` },
    }).catch(() => null);
    const now = await domainTracking(resendKey).catch(() => null);
    const nowState = now ? trackingState(now) : null;
    if (nowState?.active) {
      return {
        ok: true, domain: before.name, open: true, click: true, status: now?.status,
        note: "Open & click tracking is on. Engagement lands from the next send onward — it is not backfilled.",
      };
    }
    const rec = recordToAdd(now ?? before);
    return {
      ok: false,
      domain: before.name,
      open: true,
      click: true,
      trackingActive: false,
      status: now?.status ?? before.status,
      addThisRecord: rec,
      note: rec
        ? `Both flags are set, and tracking still records nothing until one DNS record exists. In Cloudflare DNS for zyvorah.com add: ${rec.type} · name "${rec.name}" · target "${rec.value}" · DNS only (grey cloud, NOT proxied). Then press this again.`
        : "Both flags are set but Resend reports no verified tracking subdomain, and returned no record to add — open it in Resend → Domains.",
    };
  }

  // THE BUG THIS FIXES. We used to PATCH the two booleans alone. Resend answers
  // 200 and nothing happens, because tracking is active only when BOTH the flag
  // is set AND a tracking subdomain is configured and verified — open tracking
  // serves its pixel from that subdomain and click tracking redirects through
  // it. With no subdomain the flags cannot latch, so the read-back kept
  // returning false and the desk kept saying "check the domain is verified"
  // about a domain that was already verified. Send the subdomain too.
  const res = await fetch(`https://api.resend.com/domains/${before.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      open_tracking: true,
      click_tracking: true,
      ...(before.trackingSubdomain ? {} : { tracking_subdomain: subdomain }),
    }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    return {
      ok: false,
      domain: before.name,
      note: `Resend refused the change (${res.status}). Enable open & click tracking manually: Resend → Domains → ${before.name} → Settings.`,
      detail: detail?.message ?? detail?.error ?? null,
    };
  }

  // Ask Resend to check DNS now. Harmless when the records are not there yet,
  // and it is what turns the subdomain verified the moment they are — so
  // pressing this again after adding the CNAME finishes the job.
  await fetch(`https://api.resend.com/domains/${before.id}/verify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}` },
  }).catch(() => null);

  const after = await domainTracking(resendKey).catch(() => null);
  if (after && trackingState(after).active) {
    return {
      ok: true,
      domain: before.name,
      open: true,
      click: true,
      status: after.status,
      note: "Open & click tracking is on. Engagement lands from the next send onward — it is not backfilled.",
    };
  }

  // Resend took the PATCH (200) and still reports the flags off. "Check the
  // domain is verified" was the old answer and it is a dead end: it names no
  // record and no next step. Open and click tracking are served from a
  // TRACKING SUBDOMAIN, which needs its own DNS records, so the usual cause is
  // a record that is missing or not yet verified — and Resend tells us exactly
  // which one. Hand that back instead of a shrug.
  const pending = (after?.records ?? []).filter(
    (r) => (r.status ?? "").toLowerCase() !== "verified",
  );
  // The CNAME that serves the tracking subdomain: the one record that is new
  // here, and the only thing standing between this and working. Named on its
  // own so the answer is "add this record", not "read this array".
  const cname = pending.find((r) => (r.type ?? "").toUpperCase() === "CNAME") ?? null;
  return {
    ok: false,
    domain: before.name,
    open: !!after?.open,
    click: !!after?.click,
    status: after?.status ?? null,
    trackingSubdomain: after?.trackingSubdomain ?? null,
    /** Every record Resend wants, with its state — the caller can see which
     *  one is unverified, and add exactly that. */
    records: after?.records ?? [],
    pendingRecords: pending,
    /** The one record to add, ready to paste into Cloudflare DNS. */
    addThisRecord: cname
      ? { type: cname.type, name: cname.name, value: cname.value, proxied: false }
      : null,
    note: cname
      ? `Tracking is configured and waiting on one DNS record. In Cloudflare DNS for zyvorah.com add: ${cname.type} · name "${cname.name}" · target "${cname.value}" · DNS only (grey cloud, NOT proxied). Then press this again — it verifies and switches tracking on.`
      : pending.length
      ? `Resend accepted the change but keeps tracking off until its DNS is in place: ${pending.length} record${pending.length > 1 ? "s" : ""} not verified (${pending
          .map((r) => `${r.type ?? "?"} ${r.name ?? "?"}`)
          .join(", ")}). Add them at the DNS host for ${before.name}, then re-run this.`
      : `Resend accepted the change, reports every DNS record verified (domain status: ${after?.status ?? "unknown"}), and still returns tracking off. That is a Resend-side state, not a DNS gap — open it in Resend → Domains → ${before.name} → Settings.`,
  };
}
