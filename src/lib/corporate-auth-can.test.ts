import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as capabilities from "./partner-capabilities";

const nativeRequire = createRequire(import.meta.url);

// Execute the real capability logic; the session-cookie, database and
// print-rule machinery the module also carries is stubbed out — can() never
// touches it.
function authModule() {
  const source = readFileSync(new URL("./corporate-auth.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exported: Record<string, any> = {};
  runInNewContext(compiled, {
    exports: exported, process, Buffer, console, URL,
    require: (name: string) => {
      if (name.startsWith("node:")) return nativeRequire(name);
      if (name === "server-only") return {};
      if (name.endsWith("partner-capabilities")) return capabilities;
      if (name === "next/headers") return { cookies: async () => ({ get: () => undefined }) };
      if (name.endsWith("supabase-admin")) return { supabaseAdmin: () => null };
      if (name.endsWith("print-types")) return { mediaFloorSqft: () => 0 };
      if (name.endsWith("print-limits")) return { MAX_RUN_MM: 0, MAX_BAND_MM: 0, MAX_HEIGHT_MM: 0, MIN_SIDE_MM: 0, sizeRejection: () => null };
      return {};
    },
  });
  return exported;
}

const { can } = authModule();

const account = { id: "account", slug: "future", email_domain: "future.example", capabilities: null };
const session = (over: Record<string, unknown>) =>
  ({ account, email: "x@future.example", member: null, staff: false, agreementPending: false, ...over });

test("a staff session is a designer session: it prepares but never spends", () => {
  const s = session({ staff: true, email: "desk@zyvorah.com" });
  assert.equal(can(s, "upload"), true);
  assert.equal(can(s, "build"), true);
  assert.equal(can(s, "order"), false);
});

test("a director's staff session may place the order; other staff still may not", () => {
  const director = session({ staff: true, email: "Roheena@plankandweave.com" });
  assert.equal(can(director, "order"), true);
  assert.equal(can(session({ staff: true, email: "savita@magnitudegroup.in" }), "order"), false);
});

test("the partner's own can_order member — the procurement manager — may order", () => {
  const member = { active: true, can_upload: true, can_build: true, can_order: true, role: "member" };
  assert.equal(can(session({ member }), "order"), true);
});

test("a partner member without can_order may not order, admin or not", () => {
  const member = { active: true, can_upload: true, can_build: true, can_order: false, role: "admin" };
  assert.equal(can(session({ member }), "order"), false);
});


test("Vault file permission is separate from artwork, build, ordering and admin", () => {
  const member = { active: true, role: "member", can_vault_upload: true, can_upload: false, can_build: false, can_order: false };
  const s = session({ member });
  assert.equal(can(s, "vault_upload"), true);
  for (const capability of ["upload", "build", "order"]) assert.equal(can(s, capability), false);
  const auth = authModule();
  assert.equal(auth.isVaultUploadOnly(s), true);
  assert.equal(auth.canAdministerAccount(s), false);
  assert.equal(auth.canManageMembers(s), false);
});

test("default-off Vault grant preserves existing builder, staff and domain-open rights", () => {
  for (const can_vault_upload of [undefined, false]) {
    assert.equal(can(session({ member: { can_build: false, can_vault_upload } }), "vault_upload"), false);
    assert.equal(can(session({ member: { can_build: true, can_vault_upload } }), "vault_upload"), true);
  }
  assert.equal(can(session({}), "vault_upload"), true);
  assert.equal(can(session({ staff: true }), "vault_upload"), true);
});
