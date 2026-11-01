import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/lib/auth-server";
import { isCrawler, VISITOR_TOKEN_RE } from "@/lib/ua";
import { TASTE_COOKIE } from "@/lib/taste";
import { BT_SESSION_COOKIE, verifyBtSession } from "@/lib/bt-access";
import { APEX_HOST } from "@/lib/host-canonical";

// Next 16 renamed Middleware to Proxy — same functionality, new file convention.
//
// This does ONE thing: keep the Supabase auth cookies fresh so route handlers
// and Server Components see a valid session. It deliberately does NOT authorize
// anything — the Next docs are explicit that proxy is not a session-management
// or authorization solution, and browsing the catalogue must stay open to
// everyone anyway. The real gate lives in each expensive route handler via
// requireGatedUser().
//
// It runs ONLY on the private and API paths listed in `config.matcher` below.
// vinext never lets the Cloudflare edge hold a path the matcher covers, so the
// public catalogue is deliberately outside it. The rules every path needs — the
// www→apex redirect, the case-study host, the Meta facet crawler, refused
// crawlers — run before vinext in the Worker entry: src/edge/gate.ts.
export async function proxy(request: NextRequest) {
  // Bhitti is a private owner proof. A visitor first passes through the existing
  // Cloudflare Access wall on /admin, where Google supplies the verified email.
  // The bridge then issues this short-lived, path-scoped session. Gate every
  // reader request here, including page images, before the static-asset skip.
  if (BT_PATH_RE.test(request.nextUrl.pathname)) {
    const host = request.headers.get("host")?.split(":")[0].toLowerCase();
    if (host && host !== APEX_HOST) {
      const url = new URL(request.url);
      url.hostname = APEX_HOST;
      url.port = "";
      return NextResponse.redirect(url, 308);
    }
    const session = request.cookies.get(BT_SESSION_COOKIE)?.value;
    if (!(await verifyBtSession(session, process.env.BT_SESSION_SECRET))) {
      const login = new URL("/admin/bt-access", request.url);
      login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
      return NextResponse.redirect(login, 307);
    }
  }

  // Static-asset requests skip the proxy entirely — no session, no analytics.
  // This lived in the matcher regex until the Cloudflare build: vinext's
  // matcher parser rejects the `.*\.(ext)$` lookahead form, so the extension
  // test moved here. Same requests skipped, same work avoided.
  if (STATIC_ASSET_RE.test(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // The staff surfaces (/admin, /studio) are gated by Cloudflare Access — but
  // Access is scoped to the apex hostname (zyvorah.com) only. This same Worker
  // also answers on www.zyvorah.com, casestudy.zyvorah.com and wraps.zyvorah.com (see `routes` in
  // wrangler.jsonc), where Access does NOT apply, so those hostnames would serve
  // the admin/studio pages with no login at all (verified: www.zyvorah.com/admin
  // returned 200 while zyvorah.com/admin 302'd to the Access wall). Funnel every
  // staff path to the apex so Access always fronts it — on every hostname now and
  // any added later, without having to enumerate each one in the Access app.
  // The Host header, not nextUrl.hostname (unreliable behind Cloudflare), same as
  // src/edge/gate.ts. NOT /decide: its /decide/[token] pages are public
  // capability links and the apex /decide index is not itself Access-gated yet.
  //
  // Exempt in development only, so a staff page can be opened on localhost at
  // all — otherwise every /admin and /studio route 308s to production and the
  // one thing you cannot test locally is the surface with the most privilege.
  // Gated on NODE_ENV, which is fixed at build time: a request cannot claim it,
  // and the production bundle keeps the funnel unconditional.
  if (STAFF_PATH_RE.test(request.nextUrl.pathname) && process.env.NODE_ENV === "production") {
    const host = request.headers.get("host")?.split(":")[0].toLowerCase();
    if (host && host !== APEX_HOST) {
      const url = new URL(request.url);
      url.hostname = APEX_HOST;
      url.port = "";
      return NextResponse.redirect(url, 308);
    }
  }

  // Mint the anonymous visitor token ONCE, on the visit's first beacon.
  //
  // /api/traffic (session + traffic source) and /api/taste/event (view/save/cart)
  // each used to mint it when the cookie was absent, and set the same cookie with
  // different attributes. 398 of 1,013 tokens carrying a `view` had no `session`
  // row, so their traffic source was unrecoverable. Minting in one place fixes that.
  //
  // Only on the beacon routes, never on a page: a page response that sets a
  // cookie cannot be held at the Cloudflare edge, and a public page must be.
  // The client sends /api/traffic first and holds every taste beacon until it
  // has answered (src/lib/visitor-ready.ts), so two concurrent first requests
  // cannot mint two tokens.
  const existing = request.cookies.get(TASTE_COOKIE)?.value;
  const needsToken = !existing || !VISITOR_TOKEN_RE.test(existing);
  // Don't hand a year-long identity to a crawler; it only inflates visitor counts.
  const minted =
    needsToken && MINT_PATH_RE.test(request.nextUrl.pathname) && !isCrawler(request.headers.get("user-agent"))
      ? crypto.randomUUID()
      : null;

  // Set it on the REQUEST too, so the handler on this very request already
  // sees the token rather than waiting for the browser to send it back.
  if (minted) request.cookies.set(TASTE_COOKIE, minted);

  // The visitor's market is no longer resolved here. /api/market hands the
  // browser its country cookie on the first visit (MarketProvider asks when it
  // has none), and until it answers a first-time visitor's prices are hidden
  // rather than painted in rupees and flipped (the mkt-pending class, set in
  // the root layout's head). Content-Signal and the api-catalog Link header
  // moved to next.config.ts headers(), which applies to cached pages too.

  const response = await refreshSession(request);

  if (minted) {
    response.cookies.set(TASTE_COOKIE, minted, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  // A catalogue view must never require a database write just to return HTML.
  // The previous best-effort page-event writer still opened a Supabase request
  // for every crawler and anonymous visit. On the Free-tier database that
  // exhausted the connection pool, turning otherwise public product pages into
  // 5xx responses. Keep the visitor token for explicit client actions (save,
  // cart, checkout), but leave aggregate page traffic to Cloudflare's edge
  // analytics rather than making the storefront depend on Supabase writes.

  return response;
}

// The beacons that may mint the visitor token (see above).
const MINT_PATH_RE = /^\/api\/(?:traffic|taste\/event)$/;

const STATIC_ASSET_RE = /\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|ttf)$/;

// Staff page surfaces to funnel to the apex. Matches /admin and /studio and
// their subpaths, but not /administrator, /api/admin, etc. Deliberately excludes
// /decide (public token subpaths; apex index not Access-gated yet).
const STAFF_PATH_RE = /^\/(?:admin|studio)(?:\/|$)/;
const BT_PATH_RE = /^\/bt(?:\/|$)/;

export const config = {
  // An ALLOW-list: only paths that need the session refresh, the visitor-token
  // mint, the staff funnel or the Bhitti gate. vinext refuses to cache any path
  // listed here ("middleware matched this request" → no-store), and the public
  // catalogue must be cacheable, so nothing public belongs in this list.
  // Adding a page that reads cookies or the session server-side? Add its
  // section here — src/proxy-matcher.test.ts fails until you do.
  //
  // /api/brand and /api/webhooks stay out, as before: brand assets keep their
  // own cache header, and webhooks need no session.
  matcher: [
    "/api/((?!brand|webhooks).*)",
    "/admin/:path*",
    "/studio/:path*",
    "/bt/:path*",
    "/account/:path*",
    "/cart/:path*",
    "/checkout/:path*",
    "/wishlist/:path*",
    "/order/:path*",
    "/partners/:path*",
    "/vendors/:path*",
    "/projects/:path*",
    "/presentations/:path*",
    "/decide/:path*",
    "/measure/:path*",
    "/trace/:path*",
    "/walk/:path*",
    "/sonar/:path*",
    "/p/:path*",
    "/q/:path*",
    "/quote/:path*",
    "/o/:path*",
    "/r/:path*",
  ],
};
