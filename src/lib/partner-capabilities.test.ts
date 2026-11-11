import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as policy from "./partner-capabilities";
function settings({ slug = "future", pending = 0, admin = true } = {}) {
  let reads = 0;
  const updates: any[] = [];
  const account = {
    id: "account",
    slug,
    capabilities: policy.HOMELANE_CAPABILITIES,
  };
  const sb = {
    rpc: async () => ({ data: admin }),
    from(table: string) {
      reads++;
      const q: any = {};
      for (const m of ["select", "eq", "order"]) q[m] = () => q;
      q.single = async () => ({ data: account });
      q.update = (value: any) => {
        updates.push(value);
        return q;
      };
      q.then = (ok: any) =>
        Promise.resolve({
          data: table === "corporate_accounts" ? [account] : null,
          count: pending,
          error: null,
        }).then(ok);
      return q;
    },
  };
  const source = readFileSync(
    new URL("../app/api/admin/partner-features/route.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exported: any = {};
  runInNewContext(compiled, {
    exports: exported,
    Response,
    Error,
    process,
    URL,
    require: (name: string) =>
      name.endsWith("supabase-admin")
        ? { supabaseAdmin: () => sb }
        : name.endsWith("staff-key")
          ? {
              // Stands in for the Google sign-in: a signed-in caller resolves to
              // a key, a signed-out one to "". The header is the fixture's way of
              // saying which, not something a real request carries any more.
              staffKey: async (req: Request) =>
                req.headers.get("x-fixture-staff") ?? "",
            }
          : name.endsWith("partner-capabilities")
            ? policy
            : {},
  });
  return {
    updates,
    get reads() {
      return reads;
    },
    patch: (capabilities: unknown) =>
      exported.PATCH(
        new Request("https://fixture.test", {
          method: "PATCH",
          headers: {
            "x-fixture-staff": "fixture-admin",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ accountId: "account", capabilities }),
        }),
      ),
  };
}
test("capability defaults preserve every legacy workflow and HomeLane fails closed in schema-first rollout", () => {
  assert.deepEqual(
    policy.partnerCapabilities({ slug: "legacy" }),
    policy.LEGACY_CAPABILITIES,
  );
  const home = policy.partnerCapabilities({
    slug: "homelane",
    capabilities: {
      poRequiredRelease: false,
      artworkUpload: true,
      customLibrary: true,
      dispatchPromiseDays: 90,
    },
  });
  assert.equal(home.poRequiredRelease, true);
  assert.equal(home.artworkUpload, false);
  assert.equal(home.customLibrary, false);
  assert.equal(home.dispatchPromiseDays, 7);
});
test("new partner feature changes update capabilities only, preserving pricing and credit columns", async () => {
  const f = settings();
  const r = await f.patch(policy.HOMELANE_CAPABILITIES);
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(f.updates[0]), ["capabilities"]);
  assert.deepEqual(f.updates[0].capabilities, policy.HOMELANE_CAPABILITIES);
});
test("staff key auth denies capabilities access before any account content or mutation", async () => {
  const f = settings({ admin: false });
  const r = await f.patch(policy.HOMELANE_CAPABILITIES);
  assert.equal(r.status, 401);
  assert.equal(f.reads, 0);
  assert.equal(f.updates.length, 0);
});
test("HomeLane promise/PO/artwork restrictions cannot be relaxed through staff onboarding controls", async () => {
  for (const patch of [
    { dispatchPromiseDays: 8 },
    { artworkUpload: true },
    { customLibrary: true },
    { catalogue: false },
    { customSizing: false },
  ]) {
    const f = settings({ slug: "homelane" });
    const r = await f.patch({ ...policy.HOMELANE_CAPABILITIES, ...patch });
    assert.equal(r.status, 400);
    assert.equal(f.updates.length, 0);
  }
});
test("existing private confirmations prevent a future partner switching to a legacy release bypass", async () => {
  const f = settings({ pending: 1 });
  const r = await f.patch(policy.LEGACY_CAPABILITIES);
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /cannot be disabled/);
  assert.equal(f.updates.length, 0);
});
test("impossible feature combinations and nonboolean checkboxes fail before account mutation", () => {
  assert.throws(
    () =>
      policy.validateCapabilities({
        ...policy.LEGACY_CAPABILITIES,
        customerProjects: true,
      }),
    /PO release/,
  );
  assert.throws(
    () =>
      policy.validateCapabilities({
        ...policy.LEGACY_CAPABILITIES,
        purchaseApproval: true,
      }),
    /customer projects/,
  );
  assert.throws(
    () =>
      policy.validateCapabilities({
        ...policy.LEGACY_CAPABILITIES,
        artworkUpload: "yes",
      }),
    /Invalid feature/,
  );
});

// Roheena, 30 September 2026: "open the exclusive collections for HomeLane
// too" — an override for one account, not a change to what 'online' means.
test("exclusive collections are open to HomeLane and still withheld from other online accounts", () => {
  assert.equal(policy.exclusivesBlocked({ slug: "homelane", account_type: "online", capabilities: null }), false);
  assert.equal(policy.exclusivesBlocked({ slug: "another-reseller", account_type: "online", capabilities: null }), true);
  assert.equal(
    policy.exclusivesBlocked({ slug: "another-reseller", account_type: "online", capabilities: { exclusiveCollections: true } }),
    false,
  );
  assert.equal(policy.exclusivesBlocked({ slug: "vijay-sales", account_type: "corporate", capabilities: null }), false);
});
