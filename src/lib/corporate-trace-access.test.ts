import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const requireNative = createRequire(import.meta.url);
function authFor(email: string, domain: string, member: unknown) {
  const rows: Record<string, unknown> = {
    corporate_sessions: { account_id: "a", email, last_seen_at: new Date().toISOString() },
    corporate_accounts: { id: "a", email_domain: domain, active: true, agreement_required: null },
    corporate_members: member,
  };
  const exports: Record<string, any> = {};
  const sb = { from: (table: string) => {
    const q: any = { select: () => q, eq: () => q, gt: () => q, maybeSingle: async () => ({ data: rows[table] }), then: (resolve: any) => Promise.resolve({ count: 0, error: null }).then(resolve) };
    return q;
  } };
  runInNewContext(ts.transpileModule(readFileSync(new URL("./corporate-auth.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, process: { env: { CORPORATE_STAFF_DOMAINS: "zyvorah.com" } }, console, Buffer, Date,
    require: (name: string) => name.startsWith("node:") ? requireNative(name)
      : name === "next/headers" ? { cookies: async () => ({ get: () => ({ value: "synthetic-cookie" }) }) }
      : name === "./supabase-admin" ? { supabaseAdmin: () => sb } : {},
  });
  return exports;
}

test("Trace-only guard rejects already-issued nonstaff cookies, even with an accidental active member", async () => {
  for (const member of [null, { role: "admin", active: true, can_build: true, can_order: true }]) {
    const auth = authFor("dhce@mehtahospital.com", "DR-MEHTAS-HOSPITALS.TRACE.INVALID", member);
    assert.equal(await auth.currentCorporateSession(), null);
    assert.equal(await auth.currentCorporateSession({ allowVaultUploadOnly: true }), null);
  }
});

test("Trace-only guard preserves existing staff sessions and ordinary .invalid member sessions", async () => {
  assert.equal((await authFor("roheena@zyvorah.com", "hospital.trace.invalid", null).currentCorporateSession()).staff, true);
  const session = await authFor("existing@example.com", "existing.invalid", { role: "member", active: true }).currentCorporateSession();
  assert.equal(session.email, "existing@example.com");
});
