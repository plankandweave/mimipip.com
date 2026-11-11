import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import ts from "typescript";
import * as capabilities from "./partner-capabilities";
import * as validation from "./partner-workspace-validation";
import * as tier1 from "./tier1-cities";

const nativeRequire = createRequire(import.meta.url);
const account = { id: "account-hl", slug: "homelane", email_domain: "homelane.com", account_type: "corporate" };
const projectId = "e00ee52e-d18b-4cdf-b7d0-69cd5a9aa3c0";
const confirmationId = "e00ee52e-d18b-4cdf-b7d0-69cd5a9aa3c1";
const member = { active: true, can_build: true, can_order: true };
const purchaser = { account, email: "buyer@homelane.com", staff: false, agreementPending: false, member };
type Session = typeof purchaser | null;

// Execute real handlers with real validation and auth; privileged storage,
// database and remote image decoding are replaced with isolated fixtures.
function serverModule(path: string, imports: Record<string, unknown>) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exported: Record<string, (...args: any[]) => any> = {};
  runInNewContext(compiled, {
    exports: exported, process, Buffer, console, URL, Request, Response, File, Error, Uint8Array, ArrayBuffer,
    fetch: () => { throw new Error("Unexpected network access from fixture"); },
    require: (name: string) => {
      if (name.startsWith("node:") || name === "pdf-lib" || name === "zod") return nativeRequire(name);
      if (name === "server-only") return {};
      // after() runs follow-up work (the SAP price notice) once the response
      // is sent; the fixture runs none of it, so no mail or network is touched.
      if (name === "next/server" && !Object.hasOwn(imports, name)) return { after: () => {} };
      if (name.endsWith("partner-capabilities")) return capabilities;
      if (name.endsWith("partner-workspace-validation")) return validation;
      if (Object.hasOwn(imports, name)) return imports[name];
      // Other imports are inert until a branch uses them; such use fails the test.
      return {};
    },
  });
  return exported;
}

function auth(session: Session) {
  return serverModule("lib/partner-private-auth.ts", {
    "@/lib/corporate-auth": {
      currentCorporateSession: async () => session,
      can: (value: NonNullable<Session>, what: string) => what === "build" && value.member.can_build,
    },
  });
}

const documentValidator = serverModule("lib/partner-document-validation.ts", {
  "@/lib/media-client": {
    // Same full decode contract as the existing stateless production service.
    thumbnailBytesRemote: async (bytes: ArrayBuffer) => {
      const decoded = await sharp(Buffer.from(bytes)).resize({ width: 100 }).png().toBuffer();
      return new Uint8Array(decoded).buffer;
    },
  },
});

async function pdfBytes() {
  const document = await PDFDocument.create();
  document.addPage([100, 100]);
  return document.save();
}

function database(rows: Record<string, Record<string, any> | null>, rpcError: string | null = null) {
  const reads: string[] = [];
  const writes: { table: string; value: Record<string, any> }[] = [];
  const calls: { name: string; args: Record<string, any> }[] = [];
  return {
    reads, writes, calls,
    from(table: string) {
      reads.push(table);
      const filters: Record<string, unknown> = {};
      let inserted: Record<string, any> | null = null;
      const query: Record<string, any> = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        insert: (value: Record<string, any>) => { inserted = value; writes.push({ table, value: structuredClone(value) }); return query; },
      };
      const read = async () => {
        const row = inserted ?? rows[table];
        return { data: row && Object.entries(filters).every(([key, value]) => row[key] === value) ? row : null, error: null };
      };
      query.single = read;
      query.maybeSingle = read;
      return query;
    },
    async rpc(name: string, args: Record<string, any>) {
      calls.push({ name, args: structuredClone(args) });
      return { data: null, error: rpcError ? { message: rpcError } : null };
    },
  };
}

// Apply the actual account, acceptance and JSON containment filters used by
// the serving routes; access tests must not return a row for every query.
function servingDatabase(rows: Record<string, Record<string, any>[]>) {
  return { from(table: string) {
    let selected = rows[table] ?? [];
    const matches = (actual: any, expected: any): boolean => Array.isArray(expected)
      ? expected.every(value => actual?.includes(value))
      : expected && typeof expected === "object"
        ? Object.entries(expected).every(([key, value]) => matches(actual?.[key], value))
        : actual === expected;
    const q: any = {
      select: () => q,
      eq: (key: string, value: unknown) => { selected = selected.filter(row => row[key] === value); return q; },
      not: (key: string, _operator: string, value: unknown) => { selected = selected.filter(row => row[key] !== value && row[key] !== undefined); return q; },
      contains: (key: string, value: unknown) => { selected = selected.filter(row => matches(row[key], value)); return q; },
      limit: (count: number) => { selected = selected.slice(0, count); return q; },
      maybeSingle: async () => ({ data: selected[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: selected, error: null }).then(resolve),
    };
    return q;
  } };
}

test("signed workspace file handler keeps photos and pre-PO masters partner-private", async () => {
  const master = `partner-workspace/${account.id}/masters/pinned.png`;
  const photo = `partner-workspace/${account.id}/photos/wall.png`;
  for (const scenario of [
    { session: null, key: master, accepted: false, expected: 403 },
    { session: { ...purchaser, staff: true }, key: master, accepted: false, expected: 403 },
    { session: { ...purchaser, account: { ...account, id: "another-account" } }, key: master, accepted: false, expected: 403 },
    { session: purchaser, key: photo, accepted: false, expected: 200 },
    { session: null, key: photo, accepted: true, expected: 403 },
    { session: null, key: master, accepted: true, expected: 200 },
  ]) {
    let storageReads = 0;
    const sb = servingDatabase({
      partner_private_options: [{ id: "option", account_id: account.id, specification: { masterImage: { path: master } } }],
      partner_private_confirmations: [{ id: confirmationId, account_id: account.id, option_ids: ["option"], po_accepted_at: scenario.accepted ? "2026-09-15T00:00:00Z" : null }],
    });
    const handler = serverModule("app/api/files/corporate-art/[...path]/route.ts", {
      "next/server": { NextResponse: Response },
      "@/lib/partner-private-auth": auth(scenario.session),
      "@/lib/supabase-admin": { supabaseAdmin: () => sb },
      "@/lib/corporate-art-store": { caVerify: () => true },
      "@/lib/r2-media": { privateBucket: async () => ({ get: async () => { storageReads++; return { httpMetadata: { contentType: "image/png" }, arrayBuffer: async () => new Uint8Array([1, 2]).buffer }; } }) },
    });
    const request = new Request(`https://example.test/files?exp=${Math.ceil(Date.now() / 1000) + 600}&sig=valid`);
    Object.assign(request, { nextUrl: new URL(request.url) });
    const response = await handler.GET(request, { params: Promise.resolve({ path: scenario.key.split("/") }) }) as Response;
    assert.equal(response.status, scenario.expected);
    assert.equal(storageReads, scenario.expected === 200 ? 1 : 0);
  }
});

test("PO document handler rejects staff, other partners and pre-PO service reads", async () => {
  for (const scenario of [
    { session: { ...purchaser, staff: true }, service: false, accepted: true, expected: 403 },
    { session: { ...purchaser, account: { ...account, id: "another-account" } }, service: false, accepted: true, expected: 404 },
    { session: purchaser, service: false, accepted: true, expected: 200 },
    { session: null, service: true, accepted: false, expected: 404 },
    { session: null, service: true, accepted: true, expected: 200 },
  ]) {
    let downloads = 0;
    const sb = servingDatabase({ partner_private_confirmations: [{ id: confirmationId, account_id: account.id, po_path: "private/accepted.pdf", po_mime: "application/pdf", po_accepted_at: scenario.accepted ? "2026-09-15T00:00:00Z" : null }] });
    const handler = serverModule("app/api/corporate/private-workspace/confirmations/[id]/document/route.ts", {
      "@/lib/site-batch": { internalTokenOk: () => scenario.service },
      "@/lib/partner-private-auth": auth(scenario.session),
      "@/lib/supabase-admin": { supabaseAdmin: () => sb },
      "@/lib/corporate-art-store": { caDownload: async () => { downloads++; return { data: new Uint8Array([1, 2]), error: null }; } },
    });
    const response = await handler.GET(new Request("https://example.test/document"), { params: Promise.resolve({ id: confirmationId }) }) as Response;
    assert.equal(response.status, scenario.expected);
    assert.equal(downloads, scenario.expected === 200 ? 1 : 0);
    if (response.status === 200) assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});

async function poFixture(options: { session?: Session; confirmation?: Record<string, any> | null; storageError?: boolean; rpcError?: string } = {}) {
  const sb = database({ partner_private_confirmations: options.confirmation === undefined ? { id: confirmationId, account_id: account.id, status: "confirmed_awaiting_po" } : options.confirmation }, options.rpcError);
  const uploads: { path: string; bytes: Uint8Array; settings: unknown }[] = [];
  const module = serverModule("app/api/corporate/private-workspace/confirmations/[id]/po/route.ts", {
    "@/lib/partner-private-auth": auth(options.session === undefined ? purchaser : options.session),
    "@/lib/partner-document-validation": documentValidator,
    "@/lib/supabase-admin": { supabaseAdmin: () => sb },
    "@/lib/corporate-art-store": { caUpload: async (path: string, bytes: Uint8Array, settings: unknown) => { uploads.push({ path, bytes, settings }); return { error: options.storageError ? { message: "Unavailable" } : null }; } },
  });
  return {
    sb, uploads,
    async submit(bytes: Uint8Array, mime = "application/pdf", number = "HL-PO-1") {
      const form = new FormData();
      form.set("file", new File([new Uint8Array(bytes).buffer], "purchase-order", { type: mime }));
      form.set("poNumber", number);
      return module.POST(new Request("https://example.test/po", { method: "POST", body: form }), { params: Promise.resolve({ id: confirmationId }) }) as Promise<Response>;
    },
  };
}

test("PO parser rejects fabricated signatures and fully decodes valid documents", async () => {
  const invalid = [
    ["application/pdf", Buffer.from("%PDF-1.7\nfake\n%%EOF")],
    ["image/png", Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from("padding-IEND-pad")])],
    ["image/jpeg", Buffer.from([255, 216, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 217])],
  ] as const;
  for (const [mime, bytes] of invalid) await assert.rejects(documentValidator.validatePoDocument(bytes, mime));
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
  const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).jpeg().toBuffer();
  for (const [mime, bytes] of [["application/pdf", await pdfBytes()], ["image/png", png], ["image/jpeg", jpeg]] as const) {
    assert.equal((await documentValidator.validatePoDocument(bytes, mime)).mime, mime);
  }
});

test("PO handler denies unauthenticated, staff, wrong-domain, designer-only and revoked purchasers before reads", async () => {
  for (const session of [null, { ...purchaser, staff: true }, { ...purchaser, email: "buyer@another.com" }, { ...purchaser, member: { ...member, can_order: false } }, { ...purchaser, member: { ...member, active: false } }, { ...purchaser, agreementPending: true }]) {
    const fixture = await poFixture({ session });
    const result = await fixture.submit(await pdfBytes());
    assert.equal(result.status, session ? 403 : 401);
    assert.deepEqual(fixture.sb.reads, []);
    assert.equal(fixture.uploads.length, 0);
    assert.equal(fixture.sb.calls.length, 0);
  }
});

test("corrupt, empty and MIME-mismatched PO uploads cannot store or enqueue a release", async () => {
  for (const [mime, bytes] of [["application/pdf", Buffer.from("%PDF-1.7\nfake\n%%EOF")], ["application/pdf", Buffer.alloc(0)], ["text/html", await pdfBytes()]] as const) {
    const fixture = await poFixture();
    assert.equal((await fixture.submit(bytes, mime)).status, 400);
    assert.equal(fixture.uploads.length, 0);
    assert.equal(fixture.sb.calls.length, 0);
  }
});

test("PO storage failure never accepts or releases the confirmation", async () => {
  const fixture = await poFixture({ storageError: true });
  const result = await fixture.submit(await pdfBytes());
  assert.equal(result.status, 400);
  assert.match((await result.json()).error, /Nothing has been released/);
  assert.equal(fixture.uploads.length, 1);
  assert.equal(fixture.sb.calls.length, 0);
});

test("valid PO is privately stored once and atomically associated with the authenticated purchaser", async () => {
  const bytes = await pdfBytes();
  const sha = createHash("sha256").update(bytes).digest("hex");
  const fixture = await poFixture();
  const result = await fixture.submit(bytes);
  assert.equal(result.status, 200);
  assert.equal((await result.json()).status, "release_pending");
  assert.equal(fixture.uploads.length, 1);
  assert.ok(fixture.uploads[0].path.startsWith(`partner-workspace/${account.id}/po/${confirmationId}/${sha}-`));
  assert.equal((fixture.uploads[0].settings as { upsert: boolean }).upsert, false);
  assert.equal(fixture.sb.calls.length, 1);
  assert.deepEqual(fixture.sb.calls[0], { name: "partner_accept_po", args: { p_account: account.id, p_confirmation: confirmationId, p_number: "HL-PO-1", p_path: fixture.uploads[0].path, p_sha: sha, p_mime: "application/pdf", p_actor: purchaser.email } });
});

test("identical PO replay is idempotent and changing its number or bytes cannot replace the receipt", async () => {
  const bytes = await pdfBytes();
  const sha = createHash("sha256").update(bytes).digest("hex");
  const fixture = await poFixture({ confirmation: { id: confirmationId, account_id: account.id, status: "sent", po_sha256: sha, po_number: "HL-PO-1" } });
  assert.equal((await fixture.submit(bytes)).status, 200);
  assert.equal((await fixture.submit(bytes, "application/pdf", "OTHER-PO")).status, 400);
  const otherPdf = await PDFDocument.create(); otherPdf.addPage([200, 100]);
  assert.equal((await fixture.submit(await otherPdf.save())).status, 400);
  assert.equal(fixture.uploads.length, 0);
  assert.equal(fixture.sb.calls.length, 0);
});

test("superseded and cross-account confirmations cannot attach a PO", async () => {
  for (const confirmation of [{ id: confirmationId, account_id: account.id, status: "superseded" }, { id: confirmationId, account_id: "other-account", status: "confirmed_awaiting_po" }, null]) {
    const fixture = await poFixture({ confirmation });
    assert.equal((await fixture.submit(await pdfBytes())).status, 400);
    assert.equal(fixture.uploads.length, 0);
    assert.equal(fixture.sb.calls.length, 0);
  }
});

test("PO association failure reports an error without claiming acceptance", async () => {
  const fixture = await poFixture({ rpcError: "Confirmation was superseded" });
  const result = await fixture.submit(await pdfBytes());
  assert.equal(result.status, 400);
  assert.match((await result.json()).error, /superseded/);
  assert.equal(fixture.uploads.length, 1);
  assert.equal(fixture.sb.calls.length, 1);
});

test("private mutation handler separates specifying from purchasing", async () => {
  for (const [session, action] of [
    [{ ...purchaser, member: { ...member, can_order: false } }, "confirm"],
    [{ ...purchaser, member: { ...member, can_build: false } }, "project"],
    [{ ...purchaser, member: { ...member, can_build: false } }, "option"],
    [{ ...purchaser, member: { ...member, can_build: false } }, "decision"],
  ] as const) {
    const sb = database({});
    const module = serverModule("app/api/corporate/private-workspace/route.ts", {
      "@/lib/partner-private-auth": auth(session),
      "@/lib/corporate-auth": { can: (value: NonNullable<Session>) => value.member.can_build },
      "@/lib/supabase-admin": { supabaseAdmin: () => sb },
    });
    const result = await module.POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ action }) })) as Response;
    assert.equal(result.status, 403);
    assert.equal(sb.writes.length, 0);
    assert.equal(sb.calls.length, 0);
  }
});

test("option saves resolve trusted catalogue artwork instead of client design URLs or master identities", async () => {
  const flatUrl = "https://catalogue.example.test/approved.png";
  const master = Buffer.from("trusted-master-bytes");
  const sb = database({ partner_private_projects: { id: projectId, account_id: account.id }, materials: { slug: "smooth-matt", id: "material" }, material_costs: { material_id: "material", supplier_code: "NONWOVEN", media_width_mm: 1350 } });
  const fetched: string[] = [];
  const priced: Record<string, any>[] = [];
  const module = serverModule("app/api/corporate/private-workspace/route.ts", {
    "@/lib/partner-private-auth": auth(purchaser),
    "@/lib/supabase-admin": { supabaseAdmin: () => sb },
    "@/lib/corporate-auth": { can: () => true },
    "@/lib/pricing": { autographBlockedForType: () => false },
    "@/lib/queries": {
      getProductByHandle: async () => ({ id: "product", status: "active", flat_verified: true, is_service: false, category: "wallpaper", title: "Approved", product_images: [], product_materials: [{ available: true, materials: { slug: "smooth-matt", coming_soon: false } }] }),
      pickFlatImage: () => ({ url: flatUrl, width: 100, height: 100 }),
    },
    "@/lib/r2-media": { fetchMediaAware: async (url: string) => { fetched.push(url); return new Response(master, { headers: { "Content-Type": "image/png" } }); } },
    "@/lib/corporate-art-store": { caUpload: async () => ({ error: null }) },
    "@/lib/corporate-files": { canonicalArtUrl: (_: unknown, path: string) => `pinned://${path}` },
    "@/lib/corporate-project": { priceProjectLines: async (_: unknown, lines: Record<string, any>[]) => { priced.push(...lines); return { ok: true, lines }; } },
  });
  const body = { action: "option", projectId, roomName: "Living", wallIdentifier: "W1", productHandle: "approved", materialSlug: "smooth-matt", widthMm: 3000, heightMm: 2700, placement: { zoom: 1.5, cropX: 0.1, cropY: 0.7, flipH: true, flipV: false }, designUrl: "https://attacker.test/custom.png", masterImage: { path: "other-account/private" } };
  const result = await module.POST(new Request("https://example.test", { method: "POST", body: JSON.stringify(body) })) as Response;
  assert.equal(result.status, 200);
  assert.deepEqual(fetched, [flatUrl]);
  assert.ok(priced[0].designUrl.startsWith(`pinned://partner-workspace/${account.id}/masters/`));
  assert.equal(priced[0].masterImage, undefined);
  assert.equal(sb.calls[0].name, "partner_add_option");
  const specification = sb.calls[0].args.p_option.specification;
  assert.equal(specification.masterImage.url, flatUrl);
  assert.equal(specification.masterImage.sha256, createHash("sha256").update(master).digest("hex"));
  assert.deepEqual(specification.placement, body.placement);
});

test("a HomeLane order delivering outside the city chosen at sign-in is stopped before anything is written", async () => {
  const shipping = {
    state: "Maharashtra", address_line: "1700/35, 6th Cross Rd, Banashankari", city: "Mumbai", pincode: "560050",
    contact_name: "Site lead", contact_phone: "9822012345", gstin: "27AAACH0000A1Z5", billing_address: "HomeLane, Mumbai",
  };
  for (const [city, pattern] of [["Mumbai", /560050 is in Bengaluru, not Mumbai/], [null, /Choose your city/]] as const) {
    const sb = database({});
    const module = serverModule("app/api/corporate/private-workspace/route.ts", {
      "@/lib/partner-private-auth": auth({ ...purchaser, city } as Session),
      "@/lib/corporate-auth": { can: () => true, shipStateAllowed: () => true },
      "@/lib/supabase-admin": { supabaseAdmin: () => sb },
      "@/lib/tier1-cities": tier1,
    });
    const body = { action: "confirm", projectId, optionIds: [confirmationId], shipping };
    const result = await module.POST(new Request("https://example.test", { method: "POST", body: JSON.stringify(body) })) as Response;
    assert.equal(result.status, 400);
    assert.match((await result.json()).error, pattern);
    assert.equal(sb.calls.length, 0);
    assert.equal(sb.writes.length, 0);
  }
});
