import { NextResponse } from "next/server";
import { geoCountry, MARKET_COUNTRY_COOKIE, marketFor, normalizeCountryCode } from "@/lib/markets";
import { isCrawler } from "@/lib/ua";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${MARKET_COUNTRY_COOKIE}=([^;]+)`))?.[1];
  // A country the visitor has named (the shipping address at checkout, or a
  // market landing link) wins; then where they actually are; then the home
  // market. There is no currency selector anywhere on the site: India is
  // rupees, everywhere else is US dollars, decided from the connection. The browser's
  // language is deliberately NOT consulted: it says which English someone
  // reads, not where a parcel goes, and it is what showed an Indian visitor
  // the United Kingdom's USD prices. A visitor whose location cannot be read
  // at all gets the home market, and names their country at checkout.
  // A crawler is answered with the home market unless it carries a cookie of
  // its own. Googlebot crawls from US addresses, so reading its location would
  // render the clean URL — the one hreflang publishes as India's and
  // x-default — in dollars, and the /products/...?market=US variant would have
  // nothing left to distinguish it. See src/lib/market-seo.ts.
  const crawler = isCrawler(req.headers.get("user-agent"));
  const named = normalizeCountryCode(cookie);
  const detected = named || crawler ? null : geoCountry(req);
  const countryCode = named ?? detected ?? "IN";
  const res = NextResponse.json(marketFor(countryCode), {
    headers: { "Cache-Control": "private, no-store" },
  });
  // The first visit learns its market HERE, not from the page: a page that sets
  // a cookie cannot be held at the edge. Only a detected country, only when
  // none is set — a country named at checkout is never overwritten — and never
  // for a crawler (see above). Same attributes as POST.
  if (detected) setCountryCookie(res, detected);
  return res;
}

function setCountryCookie(res: NextResponse, countryCode: string) {
  res.cookies.set(MARKET_COUNTRY_COOKIE, countryCode, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const countryCode = normalizeCountryCode(body?.countryCode);
  if (!countryCode) return NextResponse.json({ error: "invalid_country" }, { status: 400 });
  const res = NextResponse.json(marketFor(countryCode));
  setCountryCookie(res, countryCode);
  return res;
}
