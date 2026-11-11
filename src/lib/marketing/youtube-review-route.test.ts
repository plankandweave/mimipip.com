import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as review from "./youtube-review";

test("standalone review route denies non-owner/cross-origin and GET never uploads", async () => {
  let email: string | undefined = "roheena@plankandweave.com";
  let calls = 0;
  let plan: object | null = null;
  const exports: { GET?: (r: Request) => Promise<Response>; POST?: (r: Request) => Promise<Response> } = {};
  const mocks: Record<string, unknown> = {
    "@/lib/staff-access": { currentStaff: async () => email ? { email } : null },
    "@/lib/r2-media": { privateBucket: async () => ({}) },
    "@/lib/marketing/publish/youtube": { accessToken: async () => { throw new Error("GET must not refresh tokens"); } },
    "@/lib/marketing/youtube-review-plan": { youtubeReviewPlan: () => plan },
    "@/lib/marketing/youtube-review": { ...review, reviewReceipt: async () => null, runYouTubeReview: async () => { calls++; throw new Error("not a live upload test"); } },
  };
  const path = new URL("../../app/admin/youtube-review/route.ts", import.meta.url);
  const source = readFileSync(path, "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, process: { env: { NODE_ENV: "production" } }, URL, Request, Response, File, Uint8Array,
    require: (name: string) => { assert.ok(name in mocks, `Unexpected dependency: ${name}`); return mocks[name]; },
  });
  const req = () => new Request("https://zyvorah.com/admin/youtube-review", { method: "POST", headers: { origin: "https://zyvorah.com" } });
  assert.equal((await exports.GET!(new Request("https://zyvorah.com/admin/youtube-review"))).status, 200);
  assert.equal((await exports.POST!(req())).status, 409);
  email = undefined;
  assert.equal((await exports.GET!(req())).status, 403);
  assert.equal((await exports.POST!(req())).status, 403);
  email = "another-staff@example.com";
  assert.equal((await exports.POST!(req())).status, 403);
  email = "roheena@plankandweave.com";
  assert.equal((await exports.POST!(new Request("https://zyvorah.com/admin/youtube-review", { method: "POST", headers: { origin: "https://evil.test" } }))).status, 403);
  plan = { id: "test-plan", title: "<script>bad</script>" };
  const enabled = await exports.GET!(req());
  const html = await enabled.text();
  assert.ok(html.includes("&lt;script&gt;bad&lt;/script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("/api/admin/marketing"));
  assert.equal(enabled.headers.get("Cache-Control"), "private, no-store");
  assert.ok(enabled.headers.get("Content-Security-Policy")?.includes("frame-ancestors 'none'"));
  assert.equal(calls, 0);
});
