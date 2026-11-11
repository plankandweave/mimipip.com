// A LinkedIn access token lasts 60 days, and the way this estate has failed
// before is a credential going stale while every job answers 401 in silence
// (lib/elevated-key.ts: four jobs, eleven days, no alarm). So the two things
// worth pinning are: the desk must call red BEFORE a dead token is used, and
// "connected" must never be inferred from a variable being set.
//
// LinkedIn is mocked throughout; no network, no real token.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { LinkedInPublisher, candidateVersions, resetLinkedInVersion } from "./linkedin";

const ENV = [
  "LINKEDIN_ACCESS_TOKEN",
  "LINKEDIN_ORG_URN",
  "LINKEDIN_REFRESH_TOKEN",
  "LINKEDIN_CLIENT_ID",
  "LINKEDIN_CLIENT_SECRET",
  "LINKEDIN_API_VERSION",
];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const realFetch = globalThis.fetch;

afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  globalThis.fetch = realFetch;
  resetLinkedInVersion();
});

/** Route a mocked response by URL: token introspection vs the organisation read. */
function mockLinkedIn(introspection: unknown | "throw", organisation: unknown | "throw") {
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    const pick = url.includes("/introspectToken") ? introspection : organisation;
    if (pick === "throw") return { ok: false, status: 401, json: async () => ({ message: "invalid token" }) } as Response;
    return { ok: true, status: 200, json: async () => pick } as Response;
  }) as typeof fetch;
}

function connect() {
  process.env.LINKEDIN_ACCESS_TOKEN = "a-token";
  process.env.LINKEDIN_ORG_URN = "urn:li:organization:12345678";
  process.env.LINKEDIN_CLIENT_ID = "client-id";
  process.env.LINKEDIN_CLIENT_SECRET = "WPL_AP1.secret==";
}

const DAY = 86_400;
const soon = () => Math.floor(Date.now() / 1000) + 40 * DAY;
const gone = () => Math.floor(Date.now() / 1000) - DAY;

test("unconfigured: nothing set is a clear not-connected, never a false green", async () => {
  for (const k of ENV) delete process.env[k];
  const h = await new LinkedInPublisher().health();
  assert.equal(h.configured, false);
  assert.equal(h.ok, false);
  assert.match(h.detail, /not connected/i);
  // It must name what to do, not merely what is absent.
  assert.match(h.detail, /Connect LinkedIn/);
});

test("a page with no token, and a token with no page, are both refused", async () => {
  for (const k of ENV) delete process.env[k];
  process.env.LINKEDIN_ORG_URN = "urn:li:organization:12345678";
  assert.equal((await new LinkedInPublisher().health()).ok, false);

  for (const k of ENV) delete process.env[k];
  process.env.LINKEDIN_ACCESS_TOKEN = "a-token";
  const h = await new LinkedInPublisher().health();
  assert.equal(h.ok, false);
  assert.match(h.detail, /page/i);
});

test("a live token reports green AND says when it expires", async () => {
  connect();
  mockLinkedIn({ active: true, status: "active", scope: "w_organization_social,r_organization_social", expires_at: soon() }, { localizedName: "Zyvorah" });
  const h = await new LinkedInPublisher().health();
  assert.equal(h.ok, true);
  assert.match(h.detail, /connected to Zyvorah/);
  // The expiry date is the whole point: a connection about to lapse must say
  // so while there is still time to renew it.
  assert.ok(h.expiresOn, "no expiry date surfaced");
  assert.match(h.detail, /token expires \d{4}-\d{2}-\d{2}/);
});

test("an expired token is caught before a post is ever attempted", async () => {
  connect();
  mockLinkedIn({ active: false, status: "expired", expires_at: gone() }, { localizedName: "Zyvorah" });
  const h = await new LinkedInPublisher().health();
  assert.equal(h.ok, false);
  assert.match(h.detail, /no longer valid/);
  assert.match(h.detail, /Connect LinkedIn/);
});

test("a valid token without w_organization_social cannot post, and says why", async () => {
  connect();
  mockLinkedIn({ active: true, status: "active", scope: "r_organization_social", expires_at: soon() }, { localizedName: "Zyvorah" });
  const h = await new LinkedInPublisher().health();
  assert.equal(h.ok, false);
  assert.match(h.detail, /w_organization_social/);
  assert.match(h.detail, /Community Management/);
});

test("LinkedIn refusing the organisation read is red, not a silent green", async () => {
  connect();
  mockLinkedIn({ active: true, status: "active", scope: "w_organization_social", expires_at: soon() }, "throw");
  const h = await new LinkedInPublisher().health();
  assert.equal(h.ok, false);
  assert.match(h.detail, /refused \(401/);
});

test("configured counts a refresh token + the app as a connection", () => {
  for (const k of ENV) delete process.env[k];
  process.env.LINKEDIN_ORG_URN = "urn:li:organization:12345678";
  process.env.LINKEDIN_REFRESH_TOKEN = "r";
  process.env.LINKEDIN_CLIENT_ID = "c";
  process.env.LINKEDIN_CLIENT_SECRET = "s";
  // No access token at all: resolveToken() will mint one from the refresh
  // token, so refusing to publish here would strand a working connection.
  assert.equal(new LinkedInPublisher().configured, true);

  delete process.env.LINKEDIN_REFRESH_TOKEN;
  assert.equal(new LinkedInPublisher().configured, false);
});

test("a pending LinkedIn review is reported as a wait, not as a broken connection", async () => {
  for (const k of ENV) delete process.env[k];
  process.env.LINKEDIN_CLIENT_ID = "client-id";
  process.env.LINKEDIN_CLIENT_SECRET = "fake-app-secret";
  // LinkedIn's authorisation endpoint refusing the scope means the product has
  // not been granted yet. That is THEIR review queue, not our missing click,
  // and the desk must not present the two the same way.
  globalThis.fetch = (async () =>
    ({ ok: true, status: 200, text: async () => "Scope &quot;w_organization_social&quot; is not authorized for your application" }) as Response) as typeof fetch;
  const h = await new LinkedInPublisher().health();
  assert.equal(h.ok, false);
  assert.match(h.detail, /waiting on LinkedIn/);
  assert.match(h.detail, /Community Management/);
  // And it must not send her to a tool that cannot possibly succeed yet.
  assert.doesNotMatch(h.detail, /run scripts/i);
});

test("once approved but unconnected, it says the connection needs finishing", async () => {
  for (const k of ENV) delete process.env[k];
  process.env.LINKEDIN_CLIENT_ID = "client-id";
  process.env.LINKEDIN_CLIENT_SECRET = "fake-app-secret";
  globalThis.fetch = (async () =>
    ({ ok: true, status: 200, text: async () => "<html>LinkedIn sign-in page</html>" }) as Response) as typeof fetch;
  const h = await new LinkedInPublisher().health();
  assert.equal(h.ok, false);
  assert.match(h.detail, /approved posting/);
  assert.match(h.detail, /Connect LinkedIn/);
});

test("without the app credentials, expiry is reported as unverified rather than assumed fine", async () => {
  for (const k of ENV) delete process.env[k];
  process.env.LINKEDIN_ACCESS_TOKEN = "a-token";
  process.env.LINKEDIN_ORG_URN = "urn:li:organization:12345678";
  mockLinkedIn("throw", { localizedName: "Zyvorah" });
  const h = await new LinkedInPublisher().health();
  assert.equal(h.ok, true); // the page read succeeded, so a post would go
  assert.equal(h.expiresOn, undefined);
  assert.match(h.detail, /unverified/);
});

// 1 October 2026: an approved post did not go out. The publisher sent
// "LinkedIn-Version: 202410", which LinkedIn retired on 15 October 2025 and
// answers with 426 before reading the request — so the page read, the upload
// and the post all failed. The mock below refuses retired versions the same way.
const RETIRED_BEFORE = "202510";

function mockVersionedLinkedIn(seen: { url: string; version?: string; method?: string }[]) {
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const version = (init?.headers as Record<string, string> | undefined)?.["LinkedIn-Version"];
    seen.push({ url, version, method: init?.method });
    if (url.startsWith("https://api.linkedin.com/rest/")) {
      if (!version || version < RETIRED_BEFORE) {
        return { ok: false, status: 426, headers: new Headers(), json: async () => ({ status: 426, code: "NONEXISTENT_VERSION", message: `Requested version ${version}00 is not active` }) } as unknown as Response;
      }
      if (url.includes("/images?action=initializeUpload")) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ value: { uploadUrl: "https://upload.example/put", image: "urn:li:image:1" } }) } as unknown as Response;
      }
      if (url.endsWith("/rest/posts")) {
        return { ok: true, status: 201, headers: new Headers({ "x-restli-id": "urn:li:share:7380000000000000000" }), json: async () => ({}) } as unknown as Response;
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ localizedName: "Zyvorah" }) } as unknown as Response;
    }
    // The picture itself, and the upload PUT.
    return { ok: true, status: 200, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(8), json: async () => ({}) } as unknown as Response;
  }) as typeof fetch;
}

test("API versions: never a retired month, an explicit pin first", () => {
  const v = candidateVersions(new Date("2026-10-01T04:00:00Z"), undefined);
  assert.equal(v[0], "202609");
  assert.equal(v.length, 12);
  assert.ok(!v.includes("202410"), "202410 was retired on 15 Oct 2025");
  assert.ok(v.every((x) => x >= "202510" && x <= "202609"));
  assert.equal(candidateVersions(new Date("2026-10-01T04:00:00Z"), "202607")[0], "202607");
  // January rolls back into the previous year.
  assert.equal(candidateVersions(new Date("2027-01-10T00:00:00Z"), undefined)[0], "202612");
});

test("an approved post goes out even when LinkedIn has retired a version", async () => {
  connect();
  const seen: { url: string; version?: string; method?: string }[] = [];
  mockVersionedLinkedIn(seen);
  const r = await new LinkedInPublisher().publish({
    kind: "feed",
    caption: "A hotel lobby has about eight seconds to tell a guest where they are.",
    mediaUrls: ["https://media.zyvorah.com/a.jpg"],
    shareToFeed: true,
  });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.externalId, "urn:li:share:7380000000000000000");
  const posts = seen.filter((s) => s.url.endsWith("/rest/posts"));
  assert.equal(posts.length, 1, "exactly one post created");
  assert.ok(posts[0].version! >= RETIRED_BEFORE);
});

test("a stale LINKEDIN_API_VERSION pin cannot stop posting", async () => {
  connect();
  process.env.LINKEDIN_API_VERSION = "202410";
  const seen: { url: string; version?: string; method?: string }[] = [];
  mockVersionedLinkedIn(seen);
  const r = await new LinkedInPublisher().publish({ kind: "feed", caption: "Text only.", mediaUrls: [], shareToFeed: true });
  assert.equal(r.ok, true, r.error);
});

test("health reads the page through an active version, so the desk shows connected", async () => {
  connect();
  delete process.env.LINKEDIN_CLIENT_SECRET; // skip introspection
  const seen: { url: string; version?: string; method?: string }[] = [];
  mockVersionedLinkedIn(seen);
  const h = await new LinkedInPublisher().health();
  assert.equal(h.ok, true, h.detail);
  assert.match(h.detail, /connected to Zyvorah/);
});
