import { test, before } from "node:test";
import assert from "node:assert/strict";

// The pure signing core of the corporate-art store (the R2 move's replacement
// for Supabase's createSignedUrl). These run under tsx --test — no workerd —
// so only the crypto/URL half is covered; the binding half is exercised by
// the deployed routes.

before(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret-for-corporate-art-signing";
});

test("sign/verify round-trips for the exact path, exp, dl and w", async () => {
  const { caSign, caVerify } = await import("./corporate-art-store");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const sig = caSign("proposals/acme/ZYV-0042.pdf", exp, "", "");
  assert.ok(caVerify("proposals/acme/ZYV-0042.pdf", exp, "", "", sig));
});

test("a signature is bound to every field — path, exp, dl, w", async () => {
  const { caSign, caVerify } = await import("./corporate-art-store");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const sig = caSign("a/b.jpg", exp, "", "");
  assert.equal(caVerify("a/c.jpg", exp, "", "", sig), false, "another path");
  assert.equal(caVerify("a/b.jpg", exp + 1, "", "", sig), false, "another expiry");
  assert.equal(caVerify("a/b.jpg", exp, "1", "", sig), false, "download flipped on");
  assert.equal(caVerify("a/b.jpg", exp, "", "640", sig), false, "resize added");
  assert.equal(caVerify("a/b.jpg", exp, "", "", "not-a-signature"), false, "garbage");
  assert.equal(caVerify("a/b.jpg", exp, "", "", ""), false, "empty");
});

test("caSignedUrl produces a verifiable absolute URL and floors expiry at 60s", async () => {
  const { caSignedUrl, caVerify } = await import("./corporate-art-store");
  const url = await caSignedUrl("site/batch-1/w01.jpg", 5, { maxEdge: 1400 });
  assert.ok(url);
  const u = new URL(url!);
  assert.equal(u.origin, "https://zyvorah.com");
  assert.equal(u.pathname, "/api/files/corporate-art/site/batch-1/w01.jpg");
  const exp = Number(u.searchParams.get("exp"));
  assert.ok(exp >= Math.floor(Date.now() / 1000) + 59, "min expiry is 60s");
  assert.equal(u.searchParams.get("w"), "1400");
  assert.equal(u.searchParams.get("dl"), null);
  assert.ok(
    caVerify("site/batch-1/w01.jpg", exp, "", "1400", u.searchParams.get("sig")!),
    "the route's verify accepts what caSignedUrl minted",
  );
});

test("a download URL carries dl and signs it in", async () => {
  const { caSignedUrl, caVerify } = await import("./corporate-art-store");
  const url = await caSignedUrl("purchase-orders/acme/ZYV-1.pdf", 3600, { download: "PO ZYV-1.pdf" });
  const u = new URL(url!);
  assert.equal(u.searchParams.get("dl"), "PO ZYV-1.pdf");
  const exp = Number(u.searchParams.get("exp"));
  const sig = u.searchParams.get("sig")!;
  assert.ok(caVerify("purchase-orders/acme/ZYV-1.pdf", exp, "PO ZYV-1.pdf", "", sig));
  assert.equal(caVerify("purchase-orders/acme/ZYV-1.pdf", exp, "", "", sig), false,
    "stripping dl breaks the signature");
});

test("upload token carries the corporate-art bucket claim through verify", async () => {
  const { mintUploadToken, verifyUploadToken } = await import("./upload-token");
  const t = mintUploadToken("site/b/w01.jpg", { upsert: true, ttlSeconds: 900, bucket: "corporate-art" });
  const claims = verifyUploadToken(t);
  assert.ok(claims);
  assert.equal(claims!.path, "site/b/w01.jpg");
  assert.equal(claims!.upsert, true);
  assert.equal(claims!.bucket, "corporate-art");
  // No claim means product-images — the default target stays the default.
  const plain = verifyUploadToken(mintUploadToken("p.png", { upsert: false, ttlSeconds: 60 }));
  assert.equal(plain!.bucket, undefined);
});
