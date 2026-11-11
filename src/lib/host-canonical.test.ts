import assert from "node:assert/strict";
import test from "node:test";
import { canonicalApexUrl } from "./host-canonical";

test("www storefront requests permanently target the apex path and query", () => {
  const url = canonicalApexUrl(
    "https://www.zyvorah.com/collections/wall-art?tag=Kids",
    "www.zyvorah.com",
  );
  assert.equal(url?.toString(), "https://zyvorah.com/collections/wall-art?tag=Kids");
});

test("apex and outreach hosts retain their own routing", () => {
  assert.equal(canonicalApexUrl("https://zyvorah.com/collections", "zyvorah.com"), null);
  assert.equal(canonicalApexUrl("https://casestudy.zyvorah.com/projects", "casestudy.zyvorah.com"), null);
});

test("www.wraps permanently targets the wraps host, path and query kept", () => {
  const url = canonicalApexUrl(
    "https://www.wraps.zyvorah.com/fridge-wraps?format=B",
    "www.wraps.zyvorah.com",
  );
  assert.equal(url?.toString(), "https://wraps.zyvorah.com/fridge-wraps?format=B");
  assert.equal(canonicalApexUrl("https://www.wraps.zyvorah.com/", "WWW.WRAPS.ZYVORAH.COM:443")?.toString(), "https://wraps.zyvorah.com/");
});

test("the wraps host itself is not redirected", () => {
  assert.equal(canonicalApexUrl("https://wraps.zyvorah.com/", "wraps.zyvorah.com"), null);
});
