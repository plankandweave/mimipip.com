// What stops someone walking into /admin without signing in.
//
// The admin key is gone: staff pages now authorise from a Google sign-in via
// Cloudflare Access. Two claims hold that up, neither of them visible in a diff,
// and both of them are the kind of thing a later "tidy-up" removes by accident.
//
//  1. `cf-access-authenticated-user-email` is proof ONLY on a path Cloudflare
//     Access actually fronts. Everywhere else it is a header any caller can
//     type. Widen that rule — or drop the path check "because Cloudflare sets
//     this header" — and every /api/admin route opens to a one-line curl.
//
//  2. The staff session cookie must be rejected when tampered with or expired.
//     It is the thing /api/* trusts, so a cookie that verifies loosely is the
//     same as no gate at all.
//
// These tests are written so that each one fails if its protection is removed.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptableAccessClaims,
  accessHeaderTrustedFor,
  readCookie,
  signStaffSession,
  verifyStaffSession,
} from "./staff-access-claims";

const AUD = "fe80bc262bc516b89d4ce64a11e23d0ae8b4727231b2142e1ea75840d445b0c3";
const NOW = 1_800_000_000;
const SECRET = "test-signing-secret";
const HER = "roheena@plankandweave.com";

test("the Access header counts on the pages Access fronts", () => {
  for (const path of ["/admin", "/admin/marketing", "/studio", "/studio/drafts"]) {
    assert.equal(accessHeaderTrustedFor(path), true, path);
  }
});

test("the Access header counts for NOTHING on paths Access does not front", () => {
  // The API routes are the whole point: Access is scoped to the /admin and
  // /studio pages, so a forged header here must buy nothing. If this test ever
  // fails, `curl -H "cf-access-authenticated-user-email: ..."` is an admin.
  for (const path of [
    "/api/admin/rpc",
    "/api/admin/marketing",
    "/api/studio/drafts",
    "/decide",
    "/",
    "/administrator",
    "/adminsomething",
  ]) {
    assert.equal(accessHeaderTrustedFor(path), false, path);
  }
});

test("a token for another Access application is refused", () => {
  const claims = { email: HER, aud: ["some-other-app-aud"], exp: NOW + 600 };
  assert.equal(acceptableAccessClaims(claims, AUD, NOW), null);
});

test("an expired token is refused", () => {
  assert.equal(acceptableAccessClaims({ email: HER, aud: [AUD], exp: NOW - 1 }, AUD, NOW), null);
});

test("a token with no identity is refused", () => {
  assert.equal(acceptableAccessClaims({ aud: [AUD], exp: NOW + 600 }, AUD, NOW), null);
  assert.equal(acceptableAccessClaims({ email: "  ", aud: [AUD], exp: NOW + 600 }, AUD, NOW), null);
});

test("a good token yields the signed-in address, lower-cased", () => {
  const ok = acceptableAccessClaims(
    { email: "Roheena@PlankAndWeave.com", aud: [AUD], exp: NOW + 600 },
    AUD,
    NOW,
  );
  assert.deepEqual(ok, { email: HER });
});

test("a staff session round-trips", async () => {
  const token = await signStaffSession(SECRET, HER, NOW + 600);
  assert.deepEqual(await verifyStaffSession(SECRET, token, NOW), { email: HER });
});

test("a staff session signed with a different secret is refused", async () => {
  const token = await signStaffSession("some-other-secret", HER, NOW + 600);
  assert.equal(await verifyStaffSession(SECRET, token, NOW), null);
});

test("an edited staff session is refused", async () => {
  // Swap the payload for one that claims a different address, keeping the
  // original signature — the forgery this cookie exists to stop.
  const token = await signStaffSession(SECRET, "someone@else.com", NOW + 600);
  const forgedPayload = Buffer.from(
    JSON.stringify({ email: HER, exp: NOW + 600 }),
  ).toString("base64url");
  const forged = `${forgedPayload}.${token.split(".")[1]}`;
  assert.equal(await verifyStaffSession(SECRET, forged, NOW), null);
});

test("an expired staff session is refused", async () => {
  const token = await signStaffSession(SECRET, HER, NOW - 1);
  assert.equal(await verifyStaffSession(SECRET, token, NOW), null);
});

test("junk in the cookie is refused rather than throwing", async () => {
  for (const junk of ["", "nonsense", "a.b.c", "....", "%%%.%%%"]) {
    assert.equal(await verifyStaffSession(SECRET, junk, NOW), null, junk);
  }
});

test("the staff cookie is picked out of a crowded cookie header", () => {
  const header = "taste=abc; zyvorah_staff=the-token; CF_Authorization=jwt-here";
  assert.equal(readCookie(header, "zyvorah_staff"), "the-token");
  assert.equal(readCookie(header, "CF_Authorization"), "jwt-here");
  assert.equal(readCookie(header, "missing"), undefined);
  assert.equal(readCookie(null, "zyvorah_staff"), undefined);
});
