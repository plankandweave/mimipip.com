import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import * as capabilities from "./partner-capabilities";
import { legacyPartnerWorkflowAllowed } from "./partner-legacy-policy";

const account = { id: "hl", slug: "homelane", email_domain: "homelane.com" };
const response = {
  json: (body: unknown, options?: { status?: number }) => ({
    body,
    status: options?.status ?? 200,
  }),
};
const nativeRequire = createRequire(import.meta.url);

// Execute the real server handlers with isolated imports. No Next request
// context, database, mailer or OS transport is reachable from these fixtures.
function serverModule(path: string, imports: Record<string, unknown>) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const exported: Record<string, (...args: any[]) => any> = {};
  runInNewContext(compiled, {
    exports: exported,
    process,
    Buffer,
    console,
    URL,
    Request,
    require: (name: string) =>
      name.startsWith("node:")
        ? nativeRequire(name)
        : name === "next/server"
          ? { NextResponse: response }
          : name.endsWith("partner-capabilities")
            ? capabilities
            : name.endsWith("partner-legacy-policy")
              ? { legacyPartnerWorkflowAllowed }
              : (imports[name] ?? {}),
  });
  return exported;
}

function database(rows: Record<string, unknown>) {
  const reads: string[] = [];
  let mutations = 0;
  return {
    reads,
    get mutations() {
      return mutations;
    },
    from(table: string) {
      reads.push(table);
      const query: Record<string, any> = {};
      for (const method of ["select", "eq", "is", "in", "limit"])
        query[method] = () => query;
      for (const method of ["single", "maybeSingle", "order"])
        query[method] = async () => ({ data: rows[table] ?? null });
      for (const method of ["insert", "update", "upsert", "delete"])
        query[method] = () => {
          mutations++;
          throw new Error(`Unexpected ${table} mutation`);
        };
      return query;
    },
  };
}

test("HomeLane legacy gate cannot be disabled; unknown account closes and legacy defaults stay open", () => {
  assert.equal(
    legacyPartnerWorkflowAllowed({
      ...account,
      capabilities: { poRequiredRelease: false },
    }),
    false,
  );
  assert.equal(legacyPartnerWorkflowAllowed(null), false);
  assert.equal(legacyPartnerWorkflowAllowed({ slug: "legacy" }), true);
  assert.equal(
    legacyPartnerWorkflowAllowed({
      slug: "future",
      capabilities: { poRequiredRelease: true },
    }),
    false,
  );
});

test("legacy batch helper denies before wall content is read, including internal callers", async () => {
  const sb = database({
    corporate_site_batches: { id: "batch", account_id: account.id },
    corporate_accounts: account,
  });
  const module = serverModule("lib/site-batch.ts", {});
  assert.equal(await module.loadBatch(sb, "batch"), null);
  assert.deepEqual(sb.reads, ["corporate_site_batches", "corporate_accounts"]);
  assert.equal(sb.mutations, 0);
});

test("legacy batch helper continues serving an ordinary partner", async () => {
  const sb = database({
    corporate_site_batches: { id: "batch", account_id: "legacy" },
    corporate_accounts: { slug: "legacy" },
    corporate_site_batch_walls: [{ id: "wall" }],
  });
  const result = await serverModule("lib/site-batch.ts", {}).loadBatch(
    sb,
    "batch",
  );
  assert.equal(result.walls[0].id, "wall");
});

test("missing account policy cannot fall back to an unrestricted legacy batch", async () => {
  const sb = database({ corporate_site_batches: { account_id: "unknown" } });
  assert.equal(
    await serverModule("lib/site-batch.ts", {}).loadBatch(sb, "batch"),
    null,
  );
  assert.equal(sb.reads.includes("corporate_site_batch_walls"), false);
});

test("partner admin cannot allocate, compose or propose a different partner's batch", async () => {
  for (const action of ["allocate", "compose", "propose"]) {
    const sb = database({});
    const module = serverModule(
      `app/api/corporate/site-batch/[id]/${action}/route.ts`,
      {
        "@/lib/supabase-admin": { supabaseAdmin: () => sb },
        "@/lib/site-batch": {
          internalTokenOk: () => false,
          loadBatch: async () => ({
            batch: { account_id: "someone-else" },
            walls: [],
          }),
        },
        "@/lib/corporate-auth": {
          currentCorporateSession: async () => ({
            account: { id: "mine" },
            staff: false,
          }),
          isAccountAdmin: () => true,
        },
      },
    );
    const result = await module.POST(
      new Request("https://example.test", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ id: "batch" }) },
    );
    assert.equal(result.status, 401);
    assert.equal(sb.mutations, 0);
  }
});

test("OS-token batch creation and staff creation cannot write pre-PO legacy rows", async () => {
  for (const internal of [true, false]) {
    const sb = database({ corporate_accounts: account });
    const module = serverModule("app/api/corporate/site-batch/route.ts", {
      "@/lib/supabase-admin": { supabaseAdmin: () => sb },
      "@/lib/site-batch": { internalTokenOk: () => internal },
      "@/lib/corporate-auth": {
        currentCorporateSession: async () => ({ account, staff: true }),
        isAccountAdmin: () => false,
      },
    });
    const result = await module.POST(
      new Request("https://example.test/api/corporate/site-batch", {
        method: "POST",
        body: JSON.stringify({
          accountSlug: "homelane",
          walls: [{ widthMm: 1000 }],
        }),
      }),
    );
    assert.equal(result.status, 403);
    assert.equal(sb.mutations, 0);
  }
});

test("old measurement bearer tokens cannot resolve HomeLane or create a draft", async () => {
  const link = {
    account_id: account.id,
    store_id: "store",
    expires_at: "2099-01-01",
    batch_id: "old-batch",
  };
  const sb = database({
    corporate_measure_links: link,
    corporate_stores: { active: true },
    corporate_accounts: { ...account, active: true },
  });
  const module = serverModule("lib/measure-link.ts", {
    "@/lib/supabase-admin": { supabaseAdmin: () => sb },
    "@/lib/corporate-auth": { sha256: (value: string) => value },
  });
  assert.equal(
    (await module.resolveMeasureLink("x".repeat(43))).state,
    "unknown",
  );
  assert.equal(await module.ensureDraftBatch(sb, link, {}, account), null);
  assert.equal(sb.mutations, 0);
});

test("phone-only member cannot enter a PO-gated account", async () => {
  const sb = database({
    corporate_members: { account_id: account.id },
    corporate_accounts: account,
  });
  const module = serverModule("lib/corporate-phone.ts", {
    "./phone": { toIndianMobile: (value: string) => value },
    "./supabase-admin": { supabaseAdmin: () => sb },
  });
  assert.equal(await module.memberByPhone("9876543210"), null);
});

test("staff cannot alter HomeLane member grants or create phone-only members", async () => {
  for (const route of ["members", "team"]) {
    const sb = database({});
    const module = serverModule(`app/api/corporate/${route}/route.ts`, {
      "@/lib/corporate-auth": {
        currentCorporateSession: async () => ({ account, staff: true }),
        canManageMembers: () => true,
      },
      "@/lib/supabase-admin": { supabaseAdmin: () => sb },
    });
    assert.equal(
      (
        await module.POST(
          new Request("https://example.test", { method: "POST", body: "{}" }),
        )
      ).status,
      403,
    );
    assert.equal(sb.mutations, 0);
  }
});

test("HomeLane admin cannot grant themselves purchasing permission", async () => {
  const email = "designer@homelane.com";
  const sb = database({
    corporate_members: {
      id: "member",
      email,
      role: "admin",
      active: true,
      can_order: false,
    },
  });
  const module = serverModule("app/api/corporate/members/route.ts", {
    "@/lib/corporate-auth": {
      currentCorporateSession: async () => ({ account, email, staff: false }),
      canManageMembers: () => true,
      normaliseEmail: (value: string) => value.trim().toLowerCase(),
    },
    "@/lib/supabase-admin": { supabaseAdmin: () => sb },
  });
  const result = await module.POST(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ email, can_order: true }),
    }),
  );
  assert.equal(result.status, 403);
  assert.equal(sb.mutations, 0);
});

test("legacy portfolio capture cannot create staff-visible HomeLane project data", async () => {
  const sb = database({});
  const module = serverModule("lib/portfolio-capture.ts", {
    "./corporate-auth": {
      currentCorporateSession: async () => ({ account, staff: true }),
    },
    "./supabase-admin": { supabaseAdmin: () => sb },
  });
  assert.equal((await module.guardCapture("area")).status, 403);
  assert.deepEqual(sb.reads, []);
  assert.equal(sb.mutations, 0);
});

test("token-only quote approval cannot claim a HomeLane confirmation", async () => {
  const sb = database({ corporate_accounts: account });
  const module = serverModule(
    "app/api/corporate/quotes/[token]/approve/route.ts",
    {
      "@/lib/supabase-admin": { supabaseAdmin: () => sb },
      "@/lib/corporate-quote": {
        fetchCorporateQuote: async () => ({ account_id: account.id }),
      },
    },
  );
  const result = await module.POST(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ poNumber: "PO-1" }),
    }),
    { params: Promise.resolve({ token: "old" }) },
  );
  assert.equal(result.status, 403);
  assert.equal(sb.mutations, 0);
});

test("payment webhook cannot release a HomeLane legacy, unpaid-PO, cross-account or unselected line", async () => {
  for (const fixture of [
    { order: {}, confirmation: null },
    {
      order: { partner_confirmation_id: "c", partner_option_id: "o" },
      confirmation: {
        account_id: "hl",
        option_ids: ["o"],
        po_accepted_at: null,
      },
    },
    {
      order: { partner_confirmation_id: "c", partner_option_id: "o" },
      confirmation: {
        account_id: "other",
        option_ids: ["o"],
        po_accepted_at: "2026-09-15",
      },
    },
    {
      order: { partner_confirmation_id: "c", partner_option_id: "o" },
      confirmation: {
        account_id: "hl",
        option_ids: ["different"],
        po_accepted_at: "2026-09-15",
      },
    },
  ]) {
    let mails = 0;
    const sb = database({
      corporate_orders: { account_id: "hl", ...fixture.order },
      corporate_accounts: account,
      partner_private_confirmations: fixture.confirmation,
    });
    const module = serverModule("lib/corporate-payments.ts", {
      "./supabase-admin": { supabaseAdmin: () => sb },
      "./email": {
        sendEmail: async () => {
          mails++;
        },
      },
    });
    const result = await module.handleCorporateCapture({
      corporateOrderId: "old",
      paymentId: "pay",
    });
    assert.equal(result.outcome, "po_gate_held");
    assert.equal(sb.mutations, 0);
    assert.equal(mails, 0);
  }
});
