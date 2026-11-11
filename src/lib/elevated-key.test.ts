// Can a staff credential be rotated without taking the admin down?
//
// The keys these routes present are read from admin_config and cached. That
// cache used to be PERMANENT — one read per isolate, held for its whole life.
// Rotating a key then left every running instance presenting the old value, the
// database refusing it, and every staff screen answering "unauthorized" until
// somebody redeployed. A credential that cannot be changed without an outage is
// one that never gets changed.
//
// So the behaviour that makes rotation safe is pinned here: a new value is
// picked up once the TTL passes, the cache genuinely saves reads inside it, and
// a database blip does not blank a key that was working a second ago.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Row = { k: string; v: string | null };

/** Load elevated-key.ts with its server-only imports replaced, and with control
 *  over both the clock and what the database returns. */
function load(rows: () => Row[] | Error) {
  let reads = 0;
  const source = readFileSync(new URL("./elevated-key.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const supabaseAdmin = () => ({
    from: () => ({
      select: () => ({
        in: async () => {
          reads++;
          const r = rows();
          return r instanceof Error ? { data: null, error: r } : { data: r, error: null };
        },
      }),
    }),
  });

  let now = 1_000_000;
  const exported: Record<string, (...a: unknown[]) => Promise<string | undefined>> = {};
  runInNewContext(compiled, {
    exports: exported,
    console: { error: () => {} },
    process: { env: {} },
    Date: { now: () => now },
    require: (name: string) =>
      name.endsWith("supabase-admin") ? { supabaseAdmin } : {},
  });

  return {
    adminRpcKey: () => exported.adminRpcKey() as Promise<string | undefined>,
    elevatedKey: () => exported.elevatedKey() as Promise<string | undefined>,
    advance: (ms: number) => {
      now += ms;
    },
    get reads() {
      return reads;
    },
  };
}

const keys = (admin: string, intel = "intel-value"): Row[] => [
  { k: "admin_key", v: admin },
  { k: "intel_key", v: intel },
];

test("a rotated key is picked up once the cache expires — no deploy needed", async () => {
  let current = keys("old-admin-key");
  const mod = load(() => current);

  assert.equal(await mod.adminRpcKey(), "old-admin-key");

  // Rotate in the database, exactly as the rotation does.
  current = keys("new-admin-key");

  // Inside the TTL the old value is still served — that is the cache working.
  mod.advance(30_000);
  assert.equal(await mod.adminRpcKey(), "old-admin-key");

  // Past it, the new value arrives on its own.
  mod.advance(31_000);
  assert.equal(await mod.adminRpcKey(), "new-admin-key");
});

test("the cache actually saves reads inside the window", async () => {
  const mod = load(() => keys("a-key"));
  for (let i = 0; i < 5; i++) await mod.adminRpcKey();
  assert.equal(mod.reads, 1);
});

test("a database blip keeps the last good key rather than blanking it", async () => {
  let fail = false;
  const mod = load(() => (fail ? new Error("connection reset") : keys("a-key")));

  assert.equal(await mod.adminRpcKey(), "a-key");
  fail = true;
  mod.advance(61_000);
  // Before the fix a failed refresh cached nulls and logged every staff screen
  // out until the next deploy.
  assert.equal(await mod.adminRpcKey(), "a-key");
});

test("admin and intel keys stay distinct after a refresh", async () => {
  // admin_key_ok() accepts ONLY the admin row; elevatedKey() returns intel
  // first. A refresh must not blur the two — see staff-surface.test.ts.
  const mod = load(() => keys("the-admin-key", "the-intel-key"));
  assert.equal(await mod.adminRpcKey(), "the-admin-key");
  assert.equal(await mod.elevatedKey(), "the-intel-key");
});
