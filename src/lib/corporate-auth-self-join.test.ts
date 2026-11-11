import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as capabilities from "./partner-capabilities";

const nativeRequire = createRequire(import.meta.url);

type Row = { account_id: string; email: string; active: boolean };

// The real self-join rules, run against an in-memory corporate_members table.
function authModule(rows: Row[], countFailure = false) {
  const source = readFileSync(new URL("./corporate-auth.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const query = () => {
    const filters: [string, unknown][] = [];
    const hits = () => rows.filter((r) => filters.every(([k, v]) => (r as Record<string, unknown>)[k] === v));
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
      maybeSingle: async () => ({ data: hits()[0] ?? null }),
      then: (ok: (v: { count: number | null }) => unknown) => Promise.resolve({ count: countFailure ? null : hits().length, error: countFailure ? { message: "synthetic database failure" } : null }).then(ok),
    };
    return q;
  };
  const sb = { from: () => query() };
  const exported: Record<string, any> = {};
  runInNewContext(compiled, {
    exports: exported, process, Buffer, console, URL,
    require: (name: string) => {
      if (name.startsWith("node:")) return nativeRequire(name);
      if (name === "server-only") return {};
      if (name.endsWith("partner-capabilities")) return capabilities;
      if (name === "next/headers") return { cookies: async () => ({ get: () => undefined }) };
      if (name.endsWith("supabase-admin")) return { supabaseAdmin: () => sb };
      if (name.endsWith("print-types")) return { mediaFloorSqft: () => 0 };
      if (name.endsWith("print-limits")) return { MAX_RUN_MM: 0, MAX_BAND_MM: 0, MAX_HEIGHT_MM: 0, MIN_SIDE_MM: 0, sizeRejection: () => null };
      return {};
    },
  });
  return exported;
}

const homelane = { id: "hl", slug: "homelane", email_domain: "homelane.com", domain_self_join: true } as any;
const listed: Row[] = [{ account_id: "hl", email: "rushikesh.g@homelane.com", active: true }];

test("any @homelane.com designer may sign in once self-join is on", async () => {
  const { loginAllowed } = authModule([...listed]);
  assert.equal(await loginAllowed(homelane, "ritik.gaur@homelane.com"), true);
  assert.equal(await loginAllowed(homelane, "Ritik.Gaur@HomeLane.com"), true);
});

test("without self-join the member list still binds (the 1 Oct 2026 lockout)", async () => {
  const { loginAllowed } = authModule([...listed]);
  assert.equal(await loginAllowed({ ...homelane, domain_self_join: false }, "ritik.gaur@homelane.com"), false);
});

test("a revoked colleague stays out — signing in again does not undo removal", async () => {
  const { loginAllowed } = authModule([...listed, { account_id: "hl", email: "gone@homelane.com", active: false }]);
  assert.equal(await loginAllowed(homelane, "gone@homelane.com"), false);
});

test("only the exact domain, and one inbox one seat", async () => {
  const { loginAllowed, selfJoinEligible } = authModule([...listed]);
  assert.equal(await loginAllowed(homelane, "someone@evil-homelane.com"), false);
  assert.equal(selfJoinEligible(homelane, "x@sub.homelane.com"), false);
  assert.equal(selfJoinEligible(homelane, "x@homelane.com.evil.io"), false);
  assert.equal(selfJoinEligible(homelane, "ritik+2@homelane.com"), false);
  assert.equal(selfJoinEligible(homelane, "ritik@homelane.com"), true);
});


test("a failed member-list count never opens the domain or grants an unlisted login", async () => {
  const auth = authModule([], true);
  assert.equal(await auth.accountRunsAllowList("restricted-account"), true);
  assert.equal(await auth.loginAllowed({ ...homelane, domain_self_join: false }, "unlisted@homelane.com"), false);
});

test("Trace-only reserved tenants fail closed before zero-member fallback, membership and self-join", async () => {
  const account = { ...homelane, id: "trace", email_domain: "dr-mehtas-hospitals.trace.invalid", domain_self_join: false };
  for (const rows of [[], [{ account_id: "trace", email: "dhce@mehtahospital.com", active: true }]]) {
    const auth = authModule(rows);
    for (const email of ["dhce@mehtahospital.com", "strategy@mehtahospital.com", "x@dr-mehtas-hospitals.trace.invalid"]) {
      assert.equal(await auth.loginAllowed(account, email), false);
      assert.equal(await auth.loginAllowed({ ...account, domain_self_join: true }, email), false);
      assert.equal(auth.selfJoinEligible({ ...account, domain_self_join: true }, email), false);
    }
    assert.equal(await auth.loginAllowed(account, "roheena@zyvorah.com"), true);
  }
});

test("existing ordinary .invalid member accounts and real-domain legacy accounts retain access", async () => {
  const auth = authModule([{ account_id: "existing", email: "person@example.com", active: true }]);
  assert.equal(await auth.loginAllowed({ ...homelane, id: "existing", email_domain: "shades-personal.invalid", domain_self_join: false }, "person@example.com"), true);
  const empty = authModule([]);
  assert.equal(await empty.loginAllowed({ ...homelane, domain_self_join: false }, "designer@homelane.com"), true);
  assert.equal(empty.isTraceOnlyAccount({ email_domain: "legacy.invalid" }), false);
  assert.equal(empty.isTraceOnlyAccount({ email_domain: "client.trace.invalid.example.com" }), false);
});
