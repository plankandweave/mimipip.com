import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Exercise the real handler; privileged database and mail calls are fixtures.
function fixture(authorized = true, addFails = false) {
  const calls: string[] = [];
  const exported: Record<string, (req: Request) => Promise<Response>> = {};
  const token = "a".repeat(64);
  const imports: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/staff-key": { staffKey: async () => authorized ? "fixture-staff" : "" },
    "@/lib/supabase": { supabase: { rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(name);
      if (name === "admin_key_ok") return { data: authorized, error: null };
      if (name === "crm_presentation_add_recipient") {
        assert.equal(args.p_email, "parul.dogra@iilm.edu");
        assert.equal(args.p_presentation_id, "presentation-fixture");
        return { data: { id: "recipient-fixture" }, error: addFails ? { message: "fixture rejection" } : null };
      }
      return { data: {}, error: null };
    } } },
    "@/lib/supabase-admin": { supabaseAdmin: () => ({ from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { title: "IILM", require_code: true } }) }) }),
      update: () => ({ eq: async () => { calls.push(`update:${table}`); } }),
    }) }) },
    "@/lib/presentation": { mintToken: () => token },
    "@/lib/email": { sendEmail: async () => { calls.push("email"); return true; } },
  };
  const source = readFileSync(new URL("../app/api/admin/crm/presentation/route.ts", import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: exported, process: { env: {} }, console: { error: () => {} },
    require: (name: string) => { assert.ok(name in imports, `Unexpected import: ${name}`); return imports[name]; },
  });
  return { calls, token, run: (extra: Record<string, unknown> = {}) => exported.PUT(new Request("https://zyvorah.com/api/admin/crm/presentation", {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ presentation_id: "presentation-fixture", email: "Parul.Dogra@iilm.edu", name: "Parul", ...extra }),
  })) };
}

test("no-email link uses staff validation and recipient RPC without mail or sent markers", async () => {
  const f = fixture();
  const res = await f.run({ notify: false });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { id: "recipient-fixture", link: `https://zyvorah.com/p/${f.token}`, emailed: false });
  assert.deepEqual(f.calls, ["admin_key_ok", "crm_presentation_add_recipient"]);
});

test("existing callers and non-boolean false retain immediate invitation behaviour", async () => {
  for (const extra of [{}, { notify: true }, { notify: "false" }]) {
    const f = fixture();
    assert.equal((await (await f.run(extra)).json()).emailed, true);
    assert.deepEqual(f.calls, ["admin_key_ok", "crm_presentation_add_recipient", "email", "crm_presentation_set_status", "update:crm_presentation_recipients"]);
  }
});

test("no-email mode still denies unauthorized and invalid recipient requests", async () => {
  const unauthorized = fixture(false);
  assert.equal((await unauthorized.run({ notify: false })).status, 401);
  assert.deepEqual(unauthorized.calls, []);
  const invalid = fixture();
  assert.equal((await invalid.run({ notify: false, email: "invalid" })).status, 400);
  assert.deepEqual(invalid.calls, ["admin_key_ok"]);
});

test("recipient failure produces no link, email or sent status", async () => {
  const f = fixture(true, true);
  const res = await f.run({ notify: false });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "add_failed" });
  assert.deepEqual(f.calls, ["admin_key_ok", "crm_presentation_add_recipient"]);
});
