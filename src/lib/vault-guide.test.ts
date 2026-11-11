import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { imageNotesEnabled } from "./vault-image-notes";
import { isCleared, normaliseClearance } from "./marketing/library-record";

function harness(slug: string | null, pending = false) {
  const exports: Record<string, any> = {};
  const lookedUp: string[] = [];
  const chain: any = { select: () => chain, eq: (_: string, id: string) => { lookedUp.push(id); return chain; }, maybeSingle: async () => ({ data: { media_key: "guide.mp4", clearance: Object.fromEntries(["voice", "music", "listening"].map(k => [k, { state: pending ? "pending" : "cleared" }])) } }) };
  runInNewContext(ts.transpileModule(readFileSync(new URL("../app/api/corporate/vault/guide/route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, URL, Request, Response, Headers,
    require: (name: string) => ({
      "@/lib/corporate-auth": { currentCorporateSession: async (options: any) => { assert.equal(options.allowVaultUploadOnly, true); return slug ? { account: { slug }, agreementPending: false } : null; } },
      "@/lib/vault-image-notes": { imageNotesEnabled },
      "@/lib/marketing/library-record": { isCleared, normaliseClearance },
      "@/lib/marketing/db": { hasServiceRole: () => true, serviceClient: () => ({ from: () => chain }) },
      "@/lib/r2-media": { privateBucket: async () => ({ head: async () => ({ size: 10, httpMetadata: { contentType: "video/mp4" } }), get: async (_: string, opts: any) => ({ body: "0123456789".slice(opts?.range?.offset ?? 0, opts?.range ? opts.range.offset + opts.range.length : 10) }) }) },
    }[name]),
  });
  return { get: (range?: string) => exports.GET(new Request("https://zyvorah.com/api/corporate/vault/guide?id=foreign-asset", { headers: range ? { range } : {} })), lookedUp };
}

test("guide is private and restricted to the two requested Vaults", async () => {
  assert.equal((await harness(null).get()).status, 401);
  assert.equal((await harness("other-account").get()).status, 403);
  for (const slug of ["superhealth", "saraswati-ytit"]) {
    const h = harness(slug);
    const r = await h.get();
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(h.lookedUp, ["e53e1149-a096-4f72-a57b-2a7905cbdbbf"]);
    assert.equal(await r.text(), "0123456789");
  }
  assert.equal((await harness("superhealth", true).get()).status, 404);
});

test("guide supports seeking, suffix ranges and refuses out-of-bounds ranges", async () => {
  const h = harness("saraswati-ytit");
  const r = await h.get("bytes=3-5");
  assert.equal(r.status, 206);
  assert.equal(r.headers.get("content-range"), "bytes 3-5/10");
  assert.equal(await r.text(), "345");
  assert.equal(await (await h.get("bytes=-2")).text(), "89");
  assert.equal((await h.get("bytes=10-20")).status, 416);
});
