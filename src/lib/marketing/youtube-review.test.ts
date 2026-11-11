import test from "node:test";
import assert from "node:assert/strict";
import type { R2Bucket } from "../r2-media";
import { runYouTubeReview, REVIEW_CHANNEL, reviewOwner, sameReviewOrigin, reviewReceipt } from "./youtube-review";
import { youtubeReviewPlan, type YouTubeReviewPlan } from "./youtube-review-plan";
import { startYouTubeUpload, finishYouTubeUpload } from "./publish/youtube-upload";

// Synthetic fixtures for tests only; never used in the review screen or evidence.
const bytes = new Uint8Array([0, 0, 0, 16, 102, 116, 121, 112, 109, 112, 52, 50]);
const id = "testvideo01";
const session = "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=synthetic-private-session";
async function fixture(options: { wrongChannel?: boolean; lostReply?: boolean; privateResult?: boolean; failSessionSave?: boolean; incomplete?: boolean; startFails?: boolean; wrongVideoChannel?: boolean; foreignSession?: boolean } = {}) {
  const rows = new Map<string, string>();
  const bucket = {
    get: async (key: string) => rows.has(key) ? { arrayBuffer: async () => new TextEncoder().encode(rows.get(key)!).buffer } : null,
    put: async (key: string, value: string, opts: { onlyIf?: { etagDoesNotMatch: string } }) => {
      assert.deepEqual(opts.onlyIf, { etagDoesNotMatch: "*" });
      if (options.failSessionSave && key.endsWith("/session.json")) throw new Error("storage unavailable");
      if (rows.has(key)) return null;
      rows.set(key, value); return { etag: "synthetic" };
    },
  } as unknown as R2Bucket;
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
  const plan: YouTubeReviewPlan = { id: "fixture-review", caseId: "fixture", cloudProjectId: "fixture-project", oauthClientId: "fixture-client", sha256, title: "Test only", description: "Synthetic unit-test fixture", selfDeclaredMadeForKids: false };
  let starts = 0, uploads = 0, polls = 0;
  const requests: { url: string; init?: RequestInit }[] = [];
  const mockFetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); requests.push({ url, init });
    if (url.includes("/channels?")) return Response.json({ items: [{ id: options.wrongChannel ? "wrong" : REVIEW_CHANNEL }] });
    if (url.includes("uploadType=resumable")) {
      starts++;
      if (options.startFails) throw new Error("Ambiguous start failure");
      return new Response(null, { headers: { location: options.foreignSession ? "https://evil.test/upload" : session } });
    }
    if (url === session) {
      if (new Headers(init?.headers).has("Content-Range")) { polls++; return options.incomplete ? new Response(null, { status: 308 }) : Response.json({ id }); }
      uploads++;
      if (options.lostReply) throw new Error("network failed with secret URL " + session);
      return Response.json({ id, status: { privacyStatus: "private" } });
    }
    if (url.includes("/videos?")) return Response.json({ items: [{ id, snippet: { channelId: options.wrongVideoChannel ? "wrong" : REVIEW_CHANNEL }, status: { privacyStatus: options.privateResult === false ? "public" : "private", uploadStatus: "processed" } }] });
    throw new Error("Unexpected network call: " + url);
  };
  return { rows, bucket, plan, mockFetch, requests, counts: () => ({ starts, uploads, polls }), deps: { bucket, clientId: "fixture-client", token: async () => "synthetic-token" } };
}

test("private review safety, concurrency and recovery", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  await t.test("disabled until mapped and approved; narrow owner and exact origin", () => {
    assert.equal(youtubeReviewPlan(), null);
    assert.equal(reviewOwner(undefined), false);
    assert.equal(reviewOwner("staff@example.com"), false);
    assert.equal(reviewOwner("roheena@plankandweave.com"), true);
    assert.equal(sameReviewOrigin(new Request("https://zyvorah.com/admin/youtube-review", { headers: { origin: "https://evil.test" } })), false);
    assert.equal(sameReviewOrigin(new Request("https://zyvorah.com/admin/youtube-review", { headers: { origin: "https://zyvorah.com" } })), true);
  });
  await t.test("private/no-notification request and verified receipt; repeat has no API writes", async () => {
    const f = await fixture(); globalThis.fetch = f.mockFetch;
    const receipt = await runYouTubeReview(f.plan, bytes, f.deps);
    assert.equal(receipt.state, "verified");
    const start = f.requests.find(r => r.url.includes("uploadType=resumable"))!;
    assert.equal(new URL(start.url).searchParams.get("notifySubscribers"), "false");
    assert.equal(JSON.parse(String(start.init?.body)).status.privacyStatus, "private");
    assert.ok([...f.rows.keys()].every(k => k.startsWith("youtube-review/fixture-review/")));
    assert.ok(!JSON.stringify(receipt).includes("synthetic-private-session"));
    await runYouTubeReview(f.plan, bytes, f.deps);
    assert.deepEqual(f.counts(), { starts: 1, uploads: 1, polls: 0 });
  });
  await t.test("wrong channel, altered asset and wrong client fail before upload", async () => {
    const f = await fixture({ wrongChannel: true }); globalThis.fetch = f.mockFetch;
    await assert.rejects(runYouTubeReview(f.plan, bytes, f.deps), /channel/);
    await assert.rejects(runYouTubeReview({ ...f.plan, sha256: "wrong" }, bytes, f.deps), /SHA-256/);
    await assert.rejects(runYouTubeReview(f.plan, bytes, { ...f.deps, clientId: "different" }), /mapping/);
    assert.deepEqual(f.counts(), { starts: 0, uploads: 0, polls: 0 });
  });
  await t.test("lost upload response recovers existing session without uploading twice", async () => {
    const f = await fixture({ lostReply: true }); globalThis.fetch = f.mockFetch;
    assert.deepEqual(await runYouTubeReview(f.plan, bytes, f.deps), { state: "needs-reconciliation" });
    assert.equal((await runYouTubeReview(f.plan, bytes, f.deps)).state, "verified");
    assert.deepEqual(f.counts(), { starts: 1, uploads: 1, polls: 1 });
  });
  await t.test("concurrent submits create only one session and one byte transfer", async () => {
    const f = await fixture(); globalThis.fetch = f.mockFetch;
    await Promise.all([runYouTubeReview(f.plan, bytes, f.deps), runYouTubeReview(f.plan, bytes, f.deps)]);
    assert.equal(f.counts().starts, 1); assert.equal(f.counts().uploads, 1);
  });
  await t.test("failure to persist session prevents bytes and permanently prevents another session", async () => {
    const f = await fixture({ failSessionSave: true }); globalThis.fetch = f.mockFetch;
    await runYouTubeReview(f.plan, bytes, f.deps);
    await runYouTubeReview(f.plan, bytes, f.deps);
    assert.deepEqual(f.counts(), { starts: 1, uploads: 0, polls: 0 });
  });
  await t.test("public read-back cannot be reported verified or trigger release/update", async () => {
    const f = await fixture({ privateResult: false }); globalThis.fetch = f.mockFetch;
    assert.equal((await runYouTubeReview(f.plan, bytes, f.deps)).state, "needs-reconciliation");
    assert.equal(f.requests.filter(r => r.init?.method === "PUT").length, 1);
  });
  await t.test("changing metadata after claim is rejected", async () => {
    const f = await fixture(); globalThis.fetch = f.mockFetch;
    await runYouTubeReview(f.plan, bytes, f.deps);
    await assert.rejects(runYouTubeReview({ ...f.plan, title: "Changed" }, bytes, f.deps), /Plan changed/);
    assert.equal(f.counts().starts, 1);
  });
  await t.test("interrupted incomplete session never resends bytes or starts again", async () => {
    const f = await fixture({ lostReply: true, incomplete: true }); globalThis.fetch = f.mockFetch;
    await runYouTubeReview(f.plan, bytes, f.deps);
    assert.equal((await runYouTubeReview(f.plan, bytes, f.deps)).state, "needs-reconciliation");
    assert.equal((await runYouTubeReview(f.plan, bytes, f.deps)).state, "needs-reconciliation");
    assert.deepEqual(f.counts(), { starts: 1, uploads: 1, polls: 2 });
  });
  await t.test("ambiguous start failure never starts another session", async () => {
    const f = await fixture({ startFails: true }); globalThis.fetch = f.mockFetch;
    await runYouTubeReview(f.plan, bytes, f.deps);
    await runYouTubeReview(f.plan, bytes, f.deps);
    assert.deepEqual(f.counts(), { starts: 1, uploads: 0, polls: 0 });
  });
  await t.test("wrong video channel cannot produce a verified receipt", async () => {
    const f = await fixture({ wrongVideoChannel: true }); globalThis.fetch = f.mockFetch;
    assert.equal((await runYouTubeReview(f.plan, bytes, f.deps)).state, "needs-reconciliation");
  });
  await t.test("unexpected session host never receives the asset", async () => {
    const f = await fixture({ foreignSession: true }); globalThis.fetch = f.mockFetch;
    assert.equal((await runYouTubeReview(f.plan, bytes, f.deps)).state, "needs-reconciliation");
    assert.equal(f.counts().uploads, 0);
    assert.ok(f.requests.every(r => new URL(r.url).hostname === "www.googleapis.com"));
  });
  await t.test("nonterminal read-back stays retryable and does not hide reconciliation", async () => {
    const options = { privateResult: false };
    const f = await fixture(options); globalThis.fetch = f.mockFetch;
    assert.equal((await runYouTubeReview(f.plan, bytes, f.deps)).state, "needs-reconciliation");
    assert.equal(await reviewReceipt(f.bucket, f.plan), null);
    assert.equal(f.rows.has("youtube-review/fixture-review/receipt.json"), false);
    options.privateResult = true;
    const receipt = await runYouTubeReview(f.plan, bytes, f.deps);
    assert.equal(receipt.state, "verified");
    assert.deepEqual(await reviewReceipt(f.bucket, f.plan), receipt);
    assert.deepEqual(f.counts(), { starts: 1, uploads: 1, polls: 0 });
  });
  await t.test("recovered ID survives unavailable verification and expired session", async () => {
    const f = await fixture({ lostReply: true }); globalThis.fetch = f.mockFetch;
    await runYouTubeReview(f.plan, bytes, f.deps);
    globalThis.fetch = async (input, init) => String(input).startsWith("https://www.googleapis.com/youtube/v3/videos?")
      ? new Response(null, { status: 503 }) : f.mockFetch(input, init);
    await assert.rejects(runYouTubeReview(f.plan, bytes, f.deps), /read-back/);
    assert.deepEqual(JSON.parse(f.rows.get("youtube-review/fixture-review/result.json")!), { videoId: id });
    globalThis.fetch = async (input, init) => String(input) === session
      ? new Response(null, { status: 410 }) : f.mockFetch(input, init);
    assert.equal((await runYouTubeReview(f.plan, bytes, f.deps)).state, "verified");
    assert.deepEqual(f.counts(), { starts: 1, uploads: 1, polls: 1 });
  });
  for (const firstState of ["processing", "uploaded"]) {
    await t.test(`concurrent ${firstState} verifier returns canonical terminal receipt`, async () => {
      const options = { privateResult: false };
      const f = await fixture(options); globalThis.fetch = f.mockFetch;
      await runYouTubeReview(f.plan, bytes, f.deps);
      options.privateResult = true;
      let reached!: () => void, release!: () => void;
      const waiting = new Promise<void>(resolve => { reached = resolve; });
      const released = new Promise<void>(resolve => { release = resolve; });
      let verifications = 0;
      globalThis.fetch = async (input, init) => {
        if (String(input).startsWith("https://www.googleapis.com/youtube/v3/videos?") && ++verifications === 1) {
          reached(); await released;
          return Response.json({ items: [{ id, snippet: { channelId: REVIEW_CHANNEL }, status: { privacyStatus: "private", uploadStatus: firstState } }] });
        }
        return f.mockFetch(input, init);
      };
      const first = runYouTubeReview(f.plan, bytes, f.deps);
      await waiting;
      const winner = await runYouTubeReview(f.plan, bytes, f.deps);
      release();
      assert.equal(winner.state, "verified");
      assert.equal(winner.uploadStatus, "processed");
      assert.deepEqual(await first, winner);
      assert.deepEqual(await reviewReceipt(f.bucket, f.plan), winner);
      assert.deepEqual(f.counts(), { starts: 1, uploads: 1, polls: 0 });
    });
  }
  await t.test("shared transport preserves normal publisher query, metadata and bytes", async () => {
    const f = await fixture(); globalThis.fetch = f.mockFetch;
    const metadata = { snippet: { title: "Existing #Shorts", description: "Existing caption", categoryId: "26" }, status: { privacyStatus: "public" as const, selfDeclaredMadeForKids: false } };
    const url = await startYouTubeUpload("synthetic-token", metadata, bytes.length);
    await finishYouTubeUpload(url, bytes);
    assert.equal(f.requests[0].url, "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status");
    assert.deepEqual(JSON.parse(String(f.requests[0].init?.body)), metadata);
    assert.equal(f.requests[1].init?.body, bytes);
  });
});
