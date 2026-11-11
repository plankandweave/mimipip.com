import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

test("native progress rejects forged money events and cross-origin writes, strips customer input, and deduplicates", async () => {
  const state = { visitor: "11111111-1111-4111-8111-111111111111", cart: "22222222-2222-4222-8222-222222222222", rows: [] as Record<string, unknown>[], code: "" };
  Object.assign(globalThis, { __progressTest: state });
  const result = await build({ entryPoints: ["src/app/api/purchase-progress/route.ts"], bundle: true, write: false, platform: "node", format: "esm",
    plugins: [{name: "progress-io", setup(b) {
      b.onResolve({filter: /^(next\/headers|@\/lib\/supabase-admin)$/}, a => ({path:a.path,namespace:"io"}));
      b.onLoad({filter:/.*/,namespace:"io"}, a => ({loader:"js",contents:a.path === "next/headers"
        ? `export const cookies=async()=>({get:name=>({value:name==='zyv_cart'?globalThis.__progressTest.cart:globalThis.__progressTest.visitor})});`
        : `export const supabaseAdmin=()=>({from:()=>({insert:async row=>{const s=globalThis.__progressTest;s.rows.push(row);return {error:s.code?{code:s.code}:null};}})});`}));
    }}] });
  const {POST} = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
  const request = (stage: string, origin = "https://zyvorah.com", ua = "Mozilla/5.0 Chrome/130.0") => new Request("https://zyvorah.com/api/purchase-progress", {method:"POST",headers:{origin,"user-agent":ua},body:JSON.stringify({stage,email:"do-not-store@example.com",cart:"forged",amount:99999})});
  try {
    assert.equal((await POST(request("payment_captured"))).status,400);
    assert.equal((await POST(request("cart_opened","https://evil.example"))).status,403);
    assert.equal((await POST(request("cart_opened",undefined,"Googlebot"))).status,204);
    assert.equal(state.rows.length,0);
    state.cart="";
    assert.equal((await POST(request("cart_opened"))).status,409);
    state.cart="22222222-2222-4222-8222-222222222222";
    const response=await POST(request("cart_opened"));
    assert.equal(response.status,204);
    assert.equal(response.headers.get("cache-control"),"private, no-store");
    assert.deepEqual(state.rows[0].meta,{stage:"cart_opened"});
    assert.equal(state.rows[0].emitted_by,"client");
    assert.equal(JSON.stringify(state.rows[0]).includes("do-not-store"),false);
    state.code="23505";
    assert.equal((await POST(request("cart_opened"))).status,204);
    assert.equal(state.rows[0].event_key,state.rows[1].event_key);
    state.code="XX000";
    assert.equal((await POST(request("cart_opened"))).status,503);
  } finally { delete (globalThis as Record<string, unknown>).__progressTest; }
});
