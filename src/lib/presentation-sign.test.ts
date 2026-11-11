import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";

const {
  presSign, presVerify, presSignedUrlFor, rewriteLegacySignedUrls, parseRange,
} = await import("./presentation-sign");

const PATH = "studio/11111111-2222-3333-4444-555555555555/options/o1/abc-render.jpg";

test("a signature opens exactly one path until exactly one expiry", () => {
  const sig = presSign(PATH, 2_000_000_000);
  assert.equal(presVerify(PATH, 2_000_000_000, sig), true);
  assert.equal(presVerify(PATH + "x", 2_000_000_000, sig), false);
  assert.equal(presVerify(PATH, 2_000_000_001, sig), false);
  assert.equal(presVerify(PATH, 2_000_000_000, sig.slice(0, -1) + "A"), false);
  assert.equal(presVerify(PATH, 2_000_000_000, ""), false);
});

test("a staff-review path signed for studio cannot be read by editing the URL", () => {
  const sig = presSign(PATH, 2_000_000_000);
  assert.equal(presVerify("staff-reviews/c/d/deck.html", 2_000_000_000, sig), false);
});

test("signed URL points at our own route, never at storage", () => {
  const url = new URL(presSignedUrlFor(PATH, 3600, 1_700_000_000_000));
  assert.equal(url.origin, "https://zyvorah.com");
  assert.equal(url.pathname, `/api/files/presentations/${PATH}`);
  const exp = Number(url.searchParams.get("exp"));
  assert.equal(exp, 1_700_003_600);
  assert.equal(presVerify(PATH, exp, url.searchParams.get("sig")!), true);
});

test("a deck's legacy storage URLs are re-pointed at R2, everything else untouched", () => {
  const legacy = `https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/sign/presentations/${PATH}?token=eyJhbGciOi.J9fQ.s-_g`;
  const html = `<img src="${legacy}" alt="a"><a href="https://zyvorah.com/trade">t</a>` +
    `<img src="https://qrtznwnhuzkpynjetygg.supabase.co/storage/v1/object/public/product-images/x.png">`;
  const out = rewriteLegacySignedUrls(html, 1_700_000_000_000);
  assert.equal(out.includes("/object/sign/presentations/"), false);
  assert.equal(out.includes("token=eyJ"), false);
  assert.ok(out.includes('<a href="https://zyvorah.com/trade">t</a>'));
  assert.ok(out.includes("/object/public/product-images/x.png"));
  const m = /src="(https:\/\/zyvorah\.com\/api\/files\/presentations\/[^"]+)"/.exec(out);
  assert.ok(m);
  const url = new URL(m![1]);
  assert.equal(decodeURIComponent(url.pathname), `/api/files/presentations/${PATH}`);
  assert.equal(presVerify(PATH, Number(url.searchParams.get("exp")), url.searchParams.get("sig")!), true);
});

test("a traversal smuggled into a legacy URL is left alone, not signed", () => {
  const bad = "https://x.supabase.co/storage/v1/object/sign/presentations/studio/%2E%2E/secret?token=abc";
  assert.equal(rewriteLegacySignedUrls(`<img src="${bad}">`), `<img src="${bad}">`);
});

test("a deck with no legacy URL is returned byte-identical", () => {
  const html = "<html><body><p>₹300 — नमस्ते</p></body></html>";
  assert.equal(rewriteLegacySignedUrls(html), html);
});

test("Range: what a video player sends", () => {
  assert.deepEqual(parseRange("bytes=0-", 1000), { offset: 0, length: 1000 });
  assert.deepEqual(parseRange("bytes=0-1", 1000), { offset: 0, length: 2 });
  assert.deepEqual(parseRange("bytes=500-9999", 1000), { offset: 500, length: 500 });
  assert.deepEqual(parseRange("bytes=-100", 1000), { offset: 900, length: 100 });
  assert.deepEqual(parseRange("bytes=-5000", 1000), { offset: 0, length: 1000 });
  assert.equal(parseRange("bytes=1000-", 1000), "unsatisfiable");
  assert.equal(parseRange("bytes=-0", 1000), "unsatisfiable");
  assert.equal(parseRange(null, 1000), null);
  assert.equal(parseRange("bytes=0-1,5-6", 1000), null);
  assert.equal(parseRange("bytes=9-3", 1000), null);
  assert.equal(parseRange("items=0-1", 1000), null);
});

// The Supabase `presentations` bucket is metered egress: 134 MB in one day
// from a review route that downloaded its assets on every view (2 Oct 2026).
// Everything goes through lib/presentation-store.ts, which reads R2 first.
test("nothing reads the Supabase presentations bucket except the store itself", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts")) {
        if (/\.from\(\s*["'`]presentations["'`]\s*\)/.test(readFileSync(p, "utf8"))) offenders.push(p);
      }
    }
  };
  walk("src");
  assert.deepEqual(offenders, []);
});
