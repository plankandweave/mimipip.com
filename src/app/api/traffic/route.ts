import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { TASTE_COOKIE } from "@/lib/taste";
import { isCrawler, uaFamily, VISITOR_TOKEN_RE } from "@/lib/ua";
// One classifier, shared with the server-side capture in proxy.ts, so the beacon
// and the server path cannot drift into classifying the same visit differently.
import { classify } from "@/lib/server-events";
import { CORP_COOKIE, currentCorporateSession, sha256 } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requestGeo } from "@/lib/request-geo";
import {
  isPartnerMedium,
  measureTokenFromLanding,
  partnerAttribution,
  PARTNER_LINK_MEDIUM,
} from "@/lib/partner-traffic-rules";

/** The partner whose measurement link this visit opened, or null. Only runs
 *  for a /measure/<token> landing; never throws. Expired or revoked links
 *  still name their account — the visit was still that partner's. */
async function measureLinkPartner(landing: string): Promise<{ source: string; medium: string } | null> {
  const token = measureTokenFromLanding(landing);
  if (!token) return null;
  try {
    const sb = supabaseAdmin();
    if (!sb) return null;
    const { data: link } = await sb.from("corporate_measure_links")
      .select("account_id").eq("token_hash", sha256(token)).maybeSingle();
    const accountId = (link as { account_id?: string } | null)?.account_id;
    if (!accountId) return null;
    const { data: acc } = await sb.from("corporate_accounts")
      .select("slug").eq("id", accountId).maybeSingle();
    const slug = (acc as { slug?: string } | null)?.slug;
    return slug ? { source: slug, medium: PARTNER_LINK_MEDIUM } : null;
  } catch {
    return null;
  }
}

export const runtime = "nodejs";

// Records one 'session' event per visit with the traffic source, derived
// server-side from the referrer + UTM params the client beacon reports.
// Reuses the same anonymous cookie token as the taste engine, so sources join
// to behaviour (views/saves/carts) in the intelligence layer.

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const referrer = String(body?.referrer ?? "").slice(0, 500);
  const landing = String(body?.landing ?? "/").slice(0, 300);
  const utmSource = body?.utm_source ? String(body.utm_source) : undefined;
  const utmMedium = body?.utm_medium ? String(body.utm_medium) : undefined;
  const utmCampaign = body?.utm_campaign ? String(body.utm_campaign).slice(0, 80) : undefined;
  const requestId = body?.requestId;
  if (requestId !== undefined && (typeof requestId !== "string" || !VISITOR_TOKEN_RE.test(requestId)))
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  // The token is minted in proxy.ts, before any client beacon can run, so the
  // session and the visitor's later view/save/cart events share one token.
  const store = await cookies();
  const cookieToken = store.get(TASTE_COOKIE)?.value;
  const token =
    cookieToken && VISITOR_TOKEN_RE.test(cookieToken) ? cookieToken : randomUUID();
  const ua = req.headers.get("user-agent");
  const isBot = isCrawler(ua);
  const family = uaFamily(ua);

  const classified = classify(referrer, utmSource, utmMedium, body?.google_ads_click === true);
  // A partner's own designer (signed in to their portal) is that partner's
  // traffic, whatever the referrer says — see lib/partner-traffic-rules.ts.
  // Only looked up when the portal cookie is present, so an ordinary visit
  // pays nothing for it.
  // Strip query params from the landing path — no personal data in the log.
  const landingPath = landing.split("?")[0] || "/";
  const partner =
    (store.get(CORP_COOKIE)?.value
      ? partnerAttribution(await currentCorporateSession().catch(() => null))
      : null) ?? (await measureLinkPartner(landingPath));
  const { source, medium } = partner ?? classified;

  // Where the visit came from, coarsely: country, state, town (Cloudflare's
  // reading, never an address or an IP). It is what lets a collaboration's
  // traffic be read by geography on its desk, and any campaign's besides.
  const geo = requestGeo(req);
  const meta = {
    source, medium,
    ...(geo.country ? { country: geo.country } : {}),
    ...(geo.region ? { region: geo.region } : {}),
    ...(geo.city ? { city: geo.city } : {}),
    ...(isPartnerMedium(medium) ? { via: `${classified.source} / ${classified.medium}` } : {}),
    ...(utmCampaign ? { campaign: utmCampaign } : {}),
    ...(referrer ? { referrer: referrer.slice(0, 300) } : {}),
    landing: landingPath,
  };
  if (requestId) {
    const db = supabaseAdmin();
    if (!db) return NextResponse.json({ error: "measurement_unavailable" }, { status: 503 });
    const { error } = await db.from("site_events").insert({
      token, event: "session", event_key: sha256(`traffic:${requestId}`),
      is_bot: isBot, ua_family: family, emitted_by: "client", token_presented: !!cookieToken,
      schema_version: 1, meta,
    });
    if (error && error.code !== "23505") return NextResponse.json({ error: "measurement_unavailable" }, { status: 503 });
  } else {
    // Older tabs still send the original payload during rollout.
    const { error } = await supabase.rpc("log_site_event", {
      p_token: token,
      p_event: "session",
      p_handle: null,
      p_is_bot: isBot,
      p_ua_family: family,
      p_meta: meta,
    });
    if (error) return NextResponse.json({ error: "measurement_unavailable" }, { status: 503 });
  }

  // The cookie is set by middleware (httpOnly + secure). This route no longer
  // sets it: two routes writing the same cookie with different attributes was
  // half of why sessions and views drifted onto separate tokens.
  return NextResponse.json({ ok: true });
}
