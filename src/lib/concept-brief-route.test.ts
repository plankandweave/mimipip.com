import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

// Exercise the actual intake (including validation and the real catalogue),
// replacing only IO. No request, email or database mutation leaves the test.
test("apartment briefs pass the production intake and failed saves never become leads", async () => {
  const state = { writes: 0, fail: false, events: [] as unknown[], after: [] as Promise<unknown>[] };
  Object.assign(globalThis, { __conceptIntakeTest: state });
  try {
    const stubs: Record<string, string> = {
      "next/server": `export const NextResponse = { json: (body, init) => Response.json(body, init) }; export const after = fn => globalThis.__conceptIntakeTest.after.push(Promise.resolve().then(fn));`,
      "next/headers": `export const cookies = async () => ({ get: () => ({value: "550e8400-e29b-41d4-a716-446655440000"}) });`,
      "@/lib/supabase-admin": `export const supabaseAdmin = () => ({ from: () => ({ upsert: async () => { const s=globalThis.__conceptIntakeTest; s.writes++; return {error: s.fail ? {code: "TEST_ERROR"} : null}; } }) });`,
      "@/lib/concept-request": `export const allowConceptRequest = async () => true;`,
      "@/lib/server-events": `export const visitorTokenOf = v => v; export const recordCommercialEvent = async e => { globalThis.__conceptIntakeTest.events.push(e); };`,
    };
    const result = await build({
      entryPoints: ["src/app/api/concept-brief/route.ts"], bundle: true, write: false,
      platform: "node", format: "esm", logLevel: "silent",
      plugins: [{ name: "intake-io", setup(b) {
        b.onResolve({ filter: /^(next\/|@\/lib\/)/ }, args => args.path in stubs ? { path: args.path, namespace: "test-io" } : undefined);
        b.onLoad({ filter: /.*/, namespace: "test-io" }, args => ({ contents: stubs[args.path], loader: "js" }));
      } }],
    });
    const { POST } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
    const request = (slug: string) => new Request("https://zyvorah.com/api/concept-brief", {
      method: "POST", headers: { "Content-Type": "application/json", origin: "https://zyvorah.com" },
      body: JSON.stringify({ id: "550e8400-e29b-41d4-a716-446655440001", conceptSlug: slug,
        name: "Test buyer", email: "test@example.com", phone: "9876543210", brief: "Help with my living room",
        language: "en", wantsExclusive: false, website: "" }),
    });
    for (const slug of ["angan-by-the-sea", "raat-bagh", "extreme-modernist", "new-york-apartment"]) {
      assert.equal((await POST(request(slug))).status, 200, slug);
    }
    await Promise.all(state.after);
    assert.equal(state.writes, 4);
    assert.equal(state.events.length, 4);
    assert.equal((await POST(request("invented-concept"))).status, 400);
    assert.equal(state.writes, 4);
    state.fail = true;
    assert.equal((await POST(request("angan-by-the-sea"))).status, 503);
    await Promise.all(state.after);
    assert.equal(state.events.length, 4, "failed submission is not a lead");
  } finally {
    Reflect.deleteProperty(globalThis, "__conceptIntakeTest");
  }
});
