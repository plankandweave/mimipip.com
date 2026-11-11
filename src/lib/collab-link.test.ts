import { test } from "node:test";
import assert from "node:assert/strict";
import { collabLandingUrl, safePath } from "./collab-link";

test("the link lands on the collaboration's page, tagged with its campaign", () => {
  assert.equal(
    collabLandingUrl("https://zyvorah.com", "priya-sharma", "/collections/kids-room"),
    "https://zyvorah.com/collections/kids-room?utm_source=priya-sharma&utm_medium=influencer&utm_campaign=collab-priya-sharma",
  );
});

test("?to= deep-links one design, and only on this site", () => {
  assert.match(collabLandingUrl("https://zyvorah.com", "p", "/", "/products/wildflower-reverie"), /^https:\/\/zyvorah\.com\/products\/wildflower-reverie\?utm_source=p&/);
  for (const bad of ["//evil.com/x", "https://evil.com", "/\\evil.com", "javascript:alert(1)"]) {
    assert.match(collabLandingUrl("https://zyvorah.com", "p", "/", bad), /^https:\/\/zyvorah\.com\/\?utm_source=p&/, bad);
  }
});

test("utm tags already on a path are replaced, other parameters kept", () => {
  const u = new URL(collabLandingUrl("https://zyvorah.com", "p", "/products/x?utm_source=old&material=linen-touch"));
  assert.equal(u.searchParams.get("utm_source"), "p");
  assert.equal(u.searchParams.get("material"), "linen-touch");
});

test("safePath refuses anything off-site", () => {
  assert.equal(safePath("/a?b=1"), "/a?b=1");
  assert.equal(safePath("https://zyvorah.com/a"), null);
  assert.equal(safePath(""), null);
});
