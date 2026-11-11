// Connect LinkedIn from the desk (5 October 2026: the founder moved off her
// desktop, and the laptop script was the only way in). The parts that decide
// what she is told and which page is posted to are pinned here; LinkedIn
// itself is never called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCOPE_SETS, authorizationUrl, pageUrn, problemText, readPreflight, LINKEDIN_REDIRECT } from "./linkedin-connect";

test("the sign-in asks LinkedIn for posting rights and returns to the site, not a laptop", () => {
  const u = new URL(authorizationUrl("abc123", SCOPE_SETS[0], "s1"));
  assert.equal(u.origin + u.pathname, "https://www.linkedin.com/oauth/v2/authorization");
  assert.equal(u.searchParams.get("redirect_uri"), LINKEDIN_REDIRECT);
  assert.equal(LINKEDIN_REDIRECT, "https://zyvorah.com/admin/linkedin/callback");
  assert.ok(u.searchParams.get("scope")!.split(" ").includes("w_organization_social"));
  // Every fallback still asks for the one scope that posts.
  for (const set of SCOPE_SETS) assert.ok(set.includes("w_organization_social"));
});

test("LinkedIn's refusals are told apart, because each has a different owner", () => {
  assert.equal(readPreflight("The scope w_organization_social is not authorized for your application"), "scope");
  assert.equal(readPreflight("error=unauthorized_scope_error"), "scope");
  assert.equal(readPreflight("The redirect_uri does not match the registered value"), "redirect");
  assert.equal(readPreflight("invalid client_id"), "client");
  assert.equal(readPreflight("<html>Sign in to LinkedIn</html>"), "ok");
  assert.match(problemText("scope"), /LinkedIn has not yet approved/);
  assert.match(problemText("redirect"), /admin\/linkedin\/callback/);
});

test("the company page can be given as a number, a URN or its admin address", () => {
  assert.equal(pageUrn("98765432"), "urn:li:organization:98765432");
  assert.equal(pageUrn("urn:li:organization:98765432"), "urn:li:organization:98765432");
  assert.equal(pageUrn("https://www.linkedin.com/company/98765432/admin/dashboard/"), "urn:li:organization:98765432");
  assert.equal(pageUrn("zyvorah"), null);
});
