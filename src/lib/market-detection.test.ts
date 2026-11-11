import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { geoCountry } from "@/lib/markets";

function req(init: { cf?: unknown; headers?: Record<string, string> }) {
  const headers = new Headers(init.headers ?? {});
  return { cf: init.cf, headers: { get: (n: string) => headers.get(n) } };
}

test("the country comes off the Cloudflare connection, not the browser's language", () => {
  assert.equal(geoCountry(req({ cf: { country: "US" } })), "US");
  // The 14 Sep 2026 incident: a Mac in Mumbai set to English (UK) was priced
  // in dollars because the lookup fell through to Accept-Language.
  assert.equal(
    geoCountry(req({ cf: { country: "IN" }, headers: { "accept-language": "en-GB" } })),
    "IN",
  );
  assert.equal(geoCountry(req({ headers: { "accept-language": "en-GB,en;q=0.9" } })), null);
});

test("the cf-ipcountry header is only a fallback, and junk is refused", () => {
  assert.equal(geoCountry(req({ headers: { "cf-ipcountry": "AE" } })), "AE");
  assert.equal(geoCountry(req({ cf: { country: "US" }, headers: { "cf-ipcountry": "AE" } })), "US");
  assert.equal(geoCountry(req({ cf: { country: "XX" } })), null);
  assert.equal(geoCountry(req({ cf: { country: 91 } })), null);
});

/**
 * The first paint must never show rupees that flip. Public pages are shared and
 * held at the Cloudflare edge, so the page response cannot carry the visitor's
 * country cookie (a Set-Cookie vetoes the cache). Instead: /api/market hands
 * the cookie over on the first visit, and until it answers the first-time
 * visitor's prices are hidden before paint. Both halves are pinned here.
 */
test("the market is resolved by /api/market, never on a page response", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/market/route.ts"), "utf8");
  assert.match(route, /geoCountry\(req\)/, "the country is resolved from the connection");
  assert.match(route, /named \|\| crawler \? null/, "a named country is never overwritten by geo, and a crawler gets none");
  assert.match(route, /if \(detected\) setCountryCookie\(res, detected\)/);
  const proxy = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");
  assert.doesNotMatch(proxy, /MARKET_COUNTRY_COOKIE/, "a page response must not set the country cookie");
});

test("a first-time visitor's prices are hidden before paint, not flipped", () => {
  const pending = readFileSync(join(process.cwd(), "src/lib/market-pending.ts"), "utf8");
  assert.match(pending, /classList\.add/);
  const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
  assert.match(layout, /<head>\s*<script dangerouslySetInnerHTML=\{\{ __html: MARKET_PENDING_SCRIPT \}\} \/>/);
  assert.match(readFileSync(join(process.cwd(), "src/components/MarketMoney.tsx"), "utf8"), /data-mkt-price/);
  assert.match(readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8"), /\.mkt-pending \[data-mkt-price\]/);
  assert.match(
    readFileSync(join(process.cwd(), "src/components/MarketProvider.tsx"), "utf8"),
    /if \(ready\) document\.documentElement\.classList\.remove\(MARKET_PENDING_CLASS\)/,
  );
});

test("the provider applies the cookie before paint, and skips the round trip", () => {
  const provider = readFileSync(join(process.cwd(), "src/components/MarketProvider.tsx"), "utf8");
  assert.match(provider, /useLayoutEffect/, "a plain effect paints the rupees first");
  assert.match(provider, /useBeforePaint\(\(\) => \{/);
  assert.match(
    provider,
    /if \(cookieCountry\(\)\) return;/,
    "a visitor whose market is already known must not wait on /api/market",
  );
});

/**
 * Both entries into the India-only sample flow — the pill on the image and the
 * button under the configurator — must be gated on the market, or a shopper
 * priced in dollars is walked into a rupee checkout that cannot ship to them.
 */
test("the sample invitation is offered only where samples ship", () => {
  for (const rel of ["src/components/ProductGallery.tsx", "src/components/ProductConfigurator.tsx"]) {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    assert.match(
      src,
      /sampleOffered\s*=\s*.*market\.countryCode === "IN"/,
      `${rel} must gate its sample CTA on the market`,
    );
    assert.doesNotMatch(
      src,
      /\{sampleable && \(/,
      `${rel} still renders a sample CTA on sampleable alone`,
    );
  }
});

test("price visibility recovers even when the React bundle never hydrates", async () => {
  const { runInNewContext } = await import("node:vm");
  const { MARKET_PENDING_SCRIPT } = await import("./market-pending");
  const classes=new Set<string>();let release:(()=>void)|undefined;let delay=0;
  runInNewContext(MARKET_PENDING_SCRIPT,{
    document:{cookie:"",documentElement:{classList:{add:(v:string)=>classes.add(v),remove:(v:string)=>classes.delete(v)}}},
    setTimeout:(callback:()=>void,ms:number)=>{release=callback;delay=ms;},
  });
  assert.equal(classes.has("mkt-pending"),true);
  assert.equal(delay,8000);
  release?.();
  assert.equal(classes.has("mkt-pending"),false);
});
