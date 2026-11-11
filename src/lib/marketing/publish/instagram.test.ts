// health() is the difference between "a token is set" and "a post will go out".
// It must call red for the two failures a presence check misses — an expired
// token and a token without the publish scope — and green only when Meta itself
// confirms the account is reachable. Meta is mocked; no network, no real token.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { InstagramPublisher, instagramPermalink } from "./instagram";

const ENV = ["META_IG_ACCOUNT_ID", "META_ADS_TOKEN", "IG_BUSINESS_ACCOUNT_ID", "IG_ACCESS_TOKEN"];
const savedEnv = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const realFetch = globalThis.fetch;

afterEach(() => {
  for (const k of ENV) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  globalThis.fetch = realFetch;
});

/** Route a mocked Graph response by URL. `debug` is the debug_token payload (or
 *  "throw" to make that call fail); `account` is the {igId} read payload. */
function mockGraph(debug: unknown | "throw", account: unknown | "throw") {
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    const pick = url.includes("/debug_token") ? debug : account;
    if (pick === "throw") return { ok: false, status: 400, json: async () => ({ error: { message: "boom" } }) } as Response;
    return { ok: true, status: 200, json: async () => pick } as Response;
  }) as typeof fetch;
}

function connect() {
  process.env.META_IG_ACCOUNT_ID = "17841400000000000";
  process.env.META_ADS_TOKEN = "a-token";
}

test("numeric media IDs resolve to the platform's canonical shortcode link", async () => {
  connect();
  mockGraph({}, { permalink: "https://www.instagram.com/p/Dd8OFHTlnTG/" });
  assert.equal(await instagramPermalink("17914890636462781"), "https://www.instagram.com/p/Dd8OFHTlnTG/");
  mockGraph({}, { permalink: "https://www.instagram.com.evil.example/p/x/" });
  assert.equal(await instagramPermalink("17914890636462781"), null);
});

test("a permalink read failure after publication never fails or repeats the publish", async () => {
  connect();
  let publishes = 0;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/media_publish")) { publishes++; return Response.json({ id: "17914890636462781" }); }
    if (init?.method === "POST") return Response.json({ id: "container" });
    if (url.includes("fields=status_code")) return Response.json({ status_code: "FINISHED" });
    return Response.json({ error: { message: "permalink unavailable" } }, { status: 403 });
  }) as typeof fetch;
  const result = await new InstagramPublisher().publish({ kind: "feed", caption: "Approved caption", mediaUrls: ["https://example.com/frame.jpg"] });
  assert.equal(result.ok, true);
  assert.equal(result.externalId, "17914890636462781");
  assert.equal(result.url, undefined);
  assert.equal(publishes, 1);
});

const FUTURE = 1795000000; // ~2026-11
const PAST = 1600000000; // 2020

test("unconfigured: no token is a clear not-connected, never a false green", async () => {
  for (const k of ENV) delete process.env[k];
  const h = await new InstagramPublisher().health();
  assert.equal(h.configured, false);
  assert.equal(h.ok, false);
  assert.match(h.detail, /not connected/i);
});

test("a valid token with the publish scope is green, with the expiry surfaced", async () => {
  connect();
  mockGraph(
    { data: { is_valid: true, scopes: ["ads_management", "instagram_content_publish"], expires_at: FUTURE } },
    { username: "zyvorah_wallpapers" },
  );
  const h = await new InstagramPublisher().health();
  assert.equal(h.ok, true);
  assert.equal(h.username, "zyvorah_wallpapers");
  assert.equal(h.expiresOn, "2026-11-18");
  assert.match(h.detail, /@zyvorah_wallpapers/);
});

test("an expired token is caught before a post ever tries", async () => {
  connect();
  mockGraph({ data: { is_valid: false, expires_at: PAST } }, { username: "zyvorah_wallpapers" });
  const h = await new InstagramPublisher().health();
  assert.equal(h.ok, false);
  assert.match(h.detail, /no longer valid|expired/i);
});

test("a token missing instagram_content_publish is caught before a post is refused", async () => {
  connect();
  mockGraph(
    { data: { is_valid: true, scopes: ["ads_management", "pages_read_engagement"], expires_at: FUTURE } },
    { username: "zyvorah_wallpapers" },
  );
  const h = await new InstagramPublisher().health();
  assert.equal(h.ok, false);
  assert.match(h.detail, /instagram_content_publish/);
});

test("when the token can't be introspected, reachability still gives a green (scope unverified)", async () => {
  connect();
  mockGraph("throw", { username: "zyvorah_wallpapers" });
  const h = await new InstagramPublisher().health();
  assert.equal(h.ok, true);
  assert.match(h.detail, /unverified/i);
});

for (const media of ["https://example.com/frame.jpg", "https://example.com/film.mp4"]) {
  test(`Story publishes ${media} through the Graph API without requiring a Link sticker`, async () => {
    connect();
    const bodies: Record<string, string>[] = [];
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.body) bodies.push(Object.fromEntries(new URLSearchParams(String(init.body))));
      if (url.includes("/media_publish")) return Response.json({ id: "17914890636462781" });
      if (init?.method === "POST") return Response.json({ id: "story-container" });
      if (url.includes("fields=status_code")) return Response.json({ status_code: "FINISHED" });
      return Response.json({});
    }) as typeof fetch;
    const result = await new InstagramPublisher().publish({ kind: "story", caption: "", mediaUrls: [media], collaborators: ["partner"] });
    assert.equal(result.ok, true);
    const request = bodies.find((body) => body.media_type === "STORIES")!;
    assert.ok(request);
    if (media.endsWith(".mp4")) assert.equal(request.video_url, media);
    else assert.equal(request.image_url, media);
    assert.equal(request.collaborators, undefined);
  });
}

test("Reel publication sends the exact reviewed custom cover, never first-frame fallback",async()=>{
 connect(); const bodies:Record<string,string>[]=[];
 globalThis.fetch=(async (_input:unknown,init?:RequestInit)=>{
   if(init?.body) bodies.push(Object.fromEntries(new URLSearchParams(String(init.body))));
   return new Response(JSON.stringify(init?.method==="POST"?{id:"123"}:{status_code:"FINISHED"}),{status:200});
 }) as typeof fetch;
 const result=await new InstagramPublisher().publish({kind:"reel",caption:"Make room",mediaUrls:["https://media.zyvorah.com/a.mp4"],thumbnailUrl:"https://media.zyvorah.com/measured-cover.jpg",shareToFeed:false});
 assert.equal(result.ok,true);
 const request=bodies.find(b=>b.media_type==="REELS")!;
 assert.equal(request.cover_url,"https://media.zyvorah.com/measured-cover.jpg");
 assert.equal(request.thumb_offset,undefined);
});
