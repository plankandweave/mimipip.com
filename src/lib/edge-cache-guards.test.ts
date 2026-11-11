// The public catalogue is held at the Cloudflare edge for an hour; private pages
// never are. Each rule below is one line that, if it drifts, fails silently:
// nothing throws, the page looks right, and either every visit is paid for
// again in Supabase egress or a per-person page is served from a shared cache.
//
// 30 Sep 2026: a `connection()` in the Header (via hiddenConceptSlugs) had
// marked every render on the site dynamic, so `revalidate = 3600` never took
// effect anywhere and the storefront re-read the catalogue on every visit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("hiddenConceptSlugs only calls connection() during next build", () => {
  const src = read("./concept-availability.ts");
  const body = src.slice(src.indexOf("export const hiddenConceptSlugs"));
  assert.doesNotMatch(
    body.slice(0, body.indexOf("});")),
    /await connection\(\)/,
    "an unconditional connection() in the Header's read makes every page on the site uncacheable",
  );
  assert.match(src, /NEXT_PHASE === PHASE_PRODUCTION_BUILD\) await connection\(\)/);
});

test("a header rendered with a failed menu read is never cached", () => {
  const src = read("../components/Header.tsx");
  const menuRead = src.slice(src.indexOf("function menuRead"), src.indexOf("export async function Header"));
  assert.match(menuRead, /unstable_rethrow\(err\);[\s\S]*unstable_noStore\(\);/);
});

test("the root layout defaults every page to an hour of ISR", () => {
  assert.match(read("../app/layout.tsx"), /export const revalidate = 3600;/);
});

for (const section of ["cart", "checkout", "wishlist", "account", "order", "studio", "admin"]) {
  test(`/${section} is never held at the edge`, () => {
    assert.match(read(`../app/${section}/layout.tsx`), /export const dynamic = "force-dynamic";/);
  });
}

test("an exclusive sale purges the nav on every payment path", () => {
  for (const path of [
    "../app/api/razorpay/verify/route.ts",
    "../app/api/webhooks/razorpay/route.ts",
    "./concept-payment-recovery.ts",
  ]) {
    assert.match(read(path), /releaseSoldExclusiveFromNav\(/, `${path} must release a sold exclusive from the nav`);
  }
});

// A page response that sets a cookie is never held at the edge, so the visitor
// token is minted on the first beacon instead — and the taste beacons wait for
// it, so a first visit cannot mint two tokens (see visitor-ready.ts).
test("the visitor token is minted on a beacon, never on a page", () => {
  const proxy = read("../proxy.ts");
  assert.match(proxy, /MINT_PATH_RE = \/\^\\\/api\\\/\(\?:traffic\|taste\\\/event\)\$\//);
  assert.match(proxy, /needsToken && MINT_PATH_RE\.test\(request\.nextUrl\.pathname\)/);
  assert.match(read("../components/TrafficSource.tsx"), /\.finally\(markVisitorReady\)/);
  const taste = read("../components/TasteSignal.tsx");
  assert.equal(taste.match(/visitorReady\(\)\.then/g)?.length, 2, "both taste beacons must wait for the token");
});
