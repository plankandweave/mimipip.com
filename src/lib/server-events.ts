import { istDateKey } from "@/lib/ist";
import { createHash } from "node:crypto";
import { VISITOR_TOKEN_RE } from "@/lib/ua";

/**
 * Server-side event capture — package S1.0b.
 *
 * WHY THIS EXISTS
 *   `log_site_event` was called from exactly two places, `/api/traffic` and
 *   `/api/taste/event`, and both are client beacons fired by React components.
 *   A client that does not execute JavaScript wrote nothing. Proved by probe on
 *   23 Aug 2026: five ordinary page requests to the live site, all returning
 *   200, produced ZERO rows. Most crawlers do not run JavaScript, and neither do
 *   some privacy-hardened people.
 *
 *   Google Analytics would not have rescued it — a browser script shares the
 *   blind spot exactly.
 *
 *   Three packages across Sequences 2 and 3 (the customer-event funnel,
 *   performance analytics, product activation) were specified on top of that
 *   layer. This is the floor they stand on.
 *
 * THE DESIGN IN ONE LINE
 *   Emit the event where the request is SERVED, not where a script runs, and let
 *   the client beacon enrich a server event rather than be the only record.
 *
 * EVERYTHING BELOW THE IMPURE SECTION IS PURE
 *   `attributionFrom`, `eventKey` and `pageEventFor` take plain values and
 *   return plain values, so the private OS can test them through a harness
 *   without a browser, a database or a running server. That is deliberate: the
 *   parts most likely to be wrong are the parts easiest to test.
 */

export const EVENT_SCHEMA_VERSION = 1;

/** Where an event was emitted. A row's provenance must never be a guess. */
export type EmittedBy = "server" | "client";

export type Attribution = {
  source: string;
  medium: string;
  campaign?: string;
  referrer?: string;
  landing: string;
};

const HOST_MAP: [RegExp, { source: string; medium: string }][] = [
  [/(^|\.)chatgpt\.com$|^chat\.openai\.com$/i, { source: "chatgpt", medium: "ai-search" }],
  [/(^|\.)google\./i, { source: "google", medium: "organic" }],
  [/(^|\.)bing\./i, { source: "bing", medium: "organic" }],
  [/(^|\.)duckduckgo\./i, { source: "duckduckgo", medium: "organic" }],
  [/(^|\.)amazon\./i, { source: "amazon", medium: "marketplace" }],
  [/instagram\./i, { source: "instagram", medium: "social" }],
  [/(facebook|fb)\./i, { source: "facebook", medium: "social" }],
  [/pinterest\./i, { source: "pinterest", medium: "social" }],
  [/linkedin\./i, { source: "linkedin", medium: "social" }],
  [/(youtube|youtu\.be)/i, { source: "youtube", medium: "social" }],
  [/(^|\.)(twitter\.com|t\.co|x\.com)$/i, { source: "x", medium: "social" }],
  [/whatsapp/i, { source: "whatsapp", medium: "messaging" }],
];

/**
 * Source and medium from a referrer and UTM parameters.
 *
 * Moved here verbatim from /api/traffic so the beacon and the server path
 * cannot drift into classifying the same visit two different ways — which is
 * exactly how a funnel starts disagreeing with itself.
 */
export function classify(
  referrer: string,
  utmSource?: string,
  utmMedium?: string,
  googleAdsClick = false,
): { source: string; medium: string } {
  if (utmSource) {
    const source = utmSource.trim().toLowerCase();
    if (source === "chatgpt.com" || source === "chatgpt") {
      return { source: "chatgpt", medium: (utmMedium || "ai-search").toLowerCase().slice(0, 40) };
    }
    return {
      source: utmSource.toLowerCase().slice(0, 60),
      medium: (utmMedium || "campaign").toLowerCase().slice(0, 40),
    };
  }
  if (googleAdsClick) return { source: "google", medium: utmMedium?.toLowerCase().slice(0, 40) || "cpc" };
  if (!referrer) return { source: "direct", medium: "none" };
  try {
    const host = new URL(referrer).hostname;
    if (/(^|\.)zyvorah\.com$/i.test(host)) return { source: "internal", medium: "internal" };
    for (const [re, val] of HOST_MAP) if (re.test(host)) return val;
    return { source: host.replace(/^www\./, "").slice(0, 60), medium: "referral" };
  } catch {
    return { source: "direct", medium: "none" };
  }
}

/**
 * Attribution for a request, resolved from the URL and the Referer header.
 *
 * Available server-side even when no script ever runs — which is the whole
 * point. The landing path is stored WITHOUT its query string: a query can carry
 * an email address or a token, and none of that belongs in an event log.
 */
export function attributionFrom(input: { url: string; referrer?: string | null }): Attribution {
  let landing = "/";
  let utmSource: string | undefined;
  let utmMedium: string | undefined;
  let utmCampaign: string | undefined;
  let googleAdsClick = false;

  try {
    const parsed = new URL(input.url);
    landing = parsed.pathname || "/";
    utmSource = parsed.searchParams.get("utm_source") ?? undefined;
    utmMedium = parsed.searchParams.get("utm_medium") ?? undefined;
    utmCampaign = parsed.searchParams.get("utm_campaign") ?? undefined;
    googleAdsClick = ["gclid", "gbraid", "wbraid"].some(key => !!parsed.searchParams.get(key));
  } catch {
    // A malformed URL must not lose the event. Attribution degrades; the row survives.
  }

  const referrer = (input.referrer ?? "").slice(0, 500);
  const { source, medium } = classify(referrer, utmSource, utmMedium, googleAdsClick);

  return {
    source,
    medium,
    ...(utmCampaign ? { campaign: utmCampaign.slice(0, 80) } : {}),
    ...(referrer ? { referrer: referrer.slice(0, 300) } : {}),
    landing: landing.slice(0, 300),
  };
}

/**
 * A deterministic key for one real-world event, so the same event recorded
 * twice becomes one row.
 *
 * The second is the unit: two page views of the same page by the same visitor
 * inside one second are the same event (a retry, or a beacon layered over a
 * server emit); two seconds apart they are two views, and both are real.
 *
 * Commercial events pass their natural key as `subject` — an order id, a
 * payment id — so a webhook delivered three times still produces one row.
 */
export function eventKey(input: {
  token: string;
  event: string;
  subject?: string | null;
  at: Date;
  bucketSeconds?: number;
}): string {
  const bucket = input.bucketSeconds ?? 1;
  const slot = Math.floor(input.at.getTime() / 1000 / bucket);
  const material = [input.token, input.event, input.subject ?? "", String(slot)].join("|");
  return createHash("sha256").update(material).digest("hex").slice(0, 40);
}

/**
 * Which event a pathname represents, or null for paths not worth recording.
 *
 * ONE event name, not three. `site_events.event` carries a CHECK constraint
 * allowing seven values, and a rehearsal on a branch database caught the first
 * version of this trying to write `product_view` — which would have failed in
 * production. More importantly it would have been wrong even if it had worked:
 * a new vocabulary means every existing query (site_events_human,
 * admin_traffic_sources, the S1.7 orphan-view test) silently misses every
 * server-emitted row, and the stream fragments into the two-systems problem
 * this package exists to avoid.
 *
 * So server capture adds exactly one name, `page_view`, and sets
 * product_handle where the page is a product — which is how the beacon's `view`
 * rows already carry it, so the two are directly comparable. The path itself
 * lands in the attribution's `landing`, so a collection is still identifiable.
 *
 * Deliberately narrow. Recording every asset and API call would bury the events
 * that mean something under the ones that do not.
 */
export const SERVER_PAGE_EVENT = "page_view";

export function pageEventFor(pathname: string): { event: string; handle: string | null } | null {
  const path = pathname.split("?")[0];

  if (path === "/") return { event: SERVER_PAGE_EVENT, handle: null };

  const product = /^\/products\/([^/]+)\/?$/.exec(path);
  if (product) return { event: SERVER_PAGE_EVENT, handle: decodeURIComponent(product[1]).slice(0, 120) };

  const collection = /^\/collections\/([^/]+)\/?$/.exec(path);
  if (collection) return { event: SERVER_PAGE_EVENT, handle: null };

  // Everything else — cart, account, admin, api, assets — is not a commercially
  // interesting page view. Add to this list on purpose, never by accident.
  return null;
}

/**
 * A stable stand-in token for a visitor who carries no cookie.
 *
 * NOTE (R39, fixed in 0107): the proxy does NOT put this on the row for a
 * cookie-less client that is not a declared crawler. It mints a real token
 * instead and records `tokenPresented: false`, because a real browser's first
 * request is also cookie-less and it is the request carrying the landing page
 * and the utm parameters — putting a shared stand-in on it would orphan the
 * attribution from the visitor it belongs to. The collapsing happens at read
 * time in `site_events_cookieless`, at this same grain: one visitor per agent
 * family per day.
 *
 * Crawlers are deliberately not given a year-long identity (it only inflates
 * visitor counts), but a request with no token still has to produce a row —
 * seeing the cookie-less client is the entire reason this package exists.
 *
 * So: one synthetic token per user-agent family per day. All of Bingbot's
 * requests on one day share one token, which keeps `count(distinct token)`
 * meaning roughly "distinct visitors" instead of "distinct requests", and keeps
 * a crawler from looking like ten thousand people.
 *
 * Deterministic, derived only from the agent family and the date, so it carries
 * nothing personal and nothing that could identify a person.
 */
export function syntheticToken(uaFamily: string, at: Date): string {
  const day = istDateKey(at);
  const h = createHash("sha256").update(`zyvorah|cookieless|${uaFamily}|${day}`).digest("hex");
  // Shaped as a UUID because site_events.token is a uuid column. Version nibble
  // set to 8 (custom) so these are distinguishable from minted v4 tokens.
  return [h.slice(0, 8), h.slice(8, 12), "8" + h.slice(13, 16), "8" + h.slice(17, 20), h.slice(20, 32)].join("-");
}

// ---------------------------------------------------------------------------
// Impure from here down.
// ---------------------------------------------------------------------------

/**
 * Write one server-side event. Best-effort, and deliberately so.
 *
 * A failed event write MUST NOT fail a customer's request. Analytics is not
 * worth a checkout. Failures increment a counter and are logged; they are never
 * raised. That rule exists because of the Zyvorah engine, which failed on the
 * same error for 29 consecutive days with nothing noticing — silence is the
 * enemy, not failure.
 */
let failureCount = 0;

/** Failed server-event writes since this instance started. Exposed for the operational metric. */
export function serverEventFailures(): number {
  return failureCount;
}

export async function recordServerEvent(input: {
  token: string;
  event: string;
  handle?: string | null;
  attribution?: Attribution;
  isBot: boolean;
  uaFamily: string;
  at?: Date;
  subject?: string | null;
  /**
   * Did the visitor token arrive ON the request, or was it minted for it?
   *
   * `false` says only "nothing yet shows this client keeps cookies" — which is
   * true of every real browser's first request too. It is not a verdict, and
   * nothing here treats it as one; a token is judged by whether it was EVER
   * presented, which needs more than one row to answer.
   *
   * Undefined leaves the column NULL, meaning the fact was not recorded.
   */
  tokenPresented?: boolean | null;
}): Promise<void> {
  const at = input.at ?? new Date();
  try {
    // Imported here rather than at module scope. proxy.ts is evaluated on every
    // request path, and a module-scope import in that graph is what took every
    // product page down on 23 Aug when a native library failed to load.
    const { supabase } = await import("@/lib/supabase");
    const { error } = await supabase.rpc("log_server_event", {
      p_event_key: eventKey({ token: input.token, event: input.event, subject: input.subject ?? input.handle, at }),
      p_token: input.token,
      p_event: input.event,
      p_handle: input.handle ?? null,
      p_is_bot: input.isBot,
      p_ua_family: input.uaFamily,
      p_schema_version: EVENT_SCHEMA_VERSION,
      p_meta: input.attribution ?? {},
      p_token_presented: input.tokenPresented ?? null,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    failureCount += 1;
    console.error(
      `[server-events] write failed (${failureCount} since start):`,
      e instanceof Error ? e.message : e,
    );
  }
}

// ---------------------------------------------------------------------------
// The commercial half — package S1.0b, migration 0109.
// ---------------------------------------------------------------------------

/**
 * The events that carry money, or the intent to spend it.
 *
 * Kept separate from the interaction vocabulary on purpose. These go through a
 * different writer with a different permission, for one reason: `log_site_event`
 * and `log_server_event` are reachable with the publishable anon key, which is
 * fine for a page view and unacceptable for revenue. `log_commercial_event` is
 * granted to service_role alone, so a forged `order_placed` for a hundred
 * thousand rupees is not a thing a stranger with curl can write.
 */
export type CommercialEvent =
  | "cart_add"
  | "checkout_start"
  | "order_placed"
  | "payment_captured"
  | "refund"
  | "lead_captured";

/**
 * The anonymous visitor token, if this request carried a valid one.
 *
 * Never mints. proxy.ts already minted it on the first HTML request, so by the
 * time any route handler runs the cookie is either there or the client does not
 * keep cookies — and inventing one here would attach a commercial event to a
 * visitor who does not exist.
 */
export function visitorTokenOf(raw: string | undefined | null): string | null {
  return raw && VISITOR_TOKEN_RE.test(raw) ? raw : null;
}

/**
 * Record one commercial event. Best-effort, exactly like the page view.
 *
 * A failed event write MUST NOT fail a checkout. That rule is not negotiable
 * here — this code runs inside the request that takes a customer's money, and
 * analytics is not worth an order. Failures increment the same counter the page
 * view uses and are logged; they are never raised.
 *
 * Idempotency comes from the subject, not the clock: the database keys the row
 * on hash(event | subject). A Razorpay webhook redelivered an hour later, or a
 * webhook racing the browser's own confirmation of the same payment, produces
 * one row without either side knowing about the other.
 */
export async function recordCommercialEvent(input: {
  event: CommercialEvent;
  /** The natural key — order id, razorpay payment id, form name. Required. */
  subject: string;
  token?: string | null;
  customerId?: string | null;
  handle?: string | null;
  valueInr?: number | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    const admin = supabaseAdmin();
    // No service-role key configured (local dev without secrets). Skip rather
    // than fall back to the anon client — writing money events with a
    // publishable key is the hole this split exists to close.
    if (!admin) return;

    const { error } = await admin.rpc("log_commercial_event", {
      p_event: input.event,
      p_subject: input.subject,
      p_token: input.token ?? null,
      p_customer_id: input.customerId ?? null,
      p_handle: input.handle ?? null,
      p_value_inr: input.valueInr ?? null,
      p_meta: input.meta ?? {},
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    failureCount += 1;
    console.error(
      `[server-events] commercial write failed (${failureCount} since start):`,
      e instanceof Error ? e.message : e,
    );
  }
}

/**
 * Record that this anonymous visitor is this customer.
 *
 * One row, written the moment a signed-in customer does something we can see.
 * Their earlier anonymous events are NOT rewritten to carry the customer id —
 * the link is followed at read time through `site_events_identified`. Rewriting
 * history would make yesterday's report change overnight, which is a worse
 * fault than the join.
 *
 * Only ever call this where the session has already been proved
 * (requireGatedUser), because the underlying function trusts its caller: it has
 * no way to check that the customer id belongs to whoever is asking.
 */
export async function linkVisitorIdentity(
  token: string | null,
  customerId: string | null,
): Promise<void> {
  if (!token || !customerId) return;
  try {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    const admin = supabaseAdmin();
    if (!admin) return;
    const { error } = await admin.rpc("link_visitor_identity", {
      p_token: token,
      p_customer_id: customerId,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    failureCount += 1;
    console.error("[server-events] identity link failed:", e instanceof Error ? e.message : e);
  }
}
