import assert from "node:assert/strict";
import * as tier1 from "./tier1-cities";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { partnerReturnPath } from "./partner-return";

const nativeRequire = createRequire(import.meta.url);
function serverModule(path: string, imports: Record<string, unknown> = {}) {
  const compiled = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const exported: Record<string, any> = {};
  runInNewContext(compiled, {
    exports: exported,
    Buffer,
    Response,
    URL,
    Date,
    Uint8Array,
    require(name: string) {
      if (name.startsWith("node:")) return nativeRequire(name);
      if (name === "server-only") return {};
      if (name === "@/components/partners/portal-tour") return { default: () => null };
      if (Object.hasOwn(imports, name)) return imports[name];
      throw new Error(`Unexpected document fixture import: ${name}`);
    },
  });
  return exported;
}

const documents = serverModule("./partner-documents.ts");
const original = documents.PARTNER_DOCUMENTS[0];
const payload = Buffer.from("isolated reviewed PDF bytes");
const fixtureDocument = {
  ...original,
  bytes: payload.length,
  sha256: createHash("sha256").update(payload).digest("hex"),
};
const identity = {
  account: { slug: "homelane", name: "HomeLane", email_domain: "homelane.com" },
  email: "reader@homelane.com",
  staff: false,
  member: { active: true, can_build: false, can_order: false },
};
const denied = [
  null,
  { ...identity, account: { ...identity.account, slug: "vijay-sales" } },
  { ...identity, email: "reader@example.com" },
  { ...identity, member: { ...identity.member, active: false } },
  { ...identity, member: null },
];

function download(
  session: unknown,
  bytes: Buffer | null = payload,
  id = original.id,
) {
  const reads: string[] = [];
  const module = serverModule(
    "../app/api/corporate/partner-documents/[id]/route.ts",
    {
      "@/lib/corporate-auth": { currentCorporateSession: async () => session },
      "@/lib/partner-documents": {
        ...documents,
        PARTNER_DOCUMENTS: [fixtureDocument],
      },
      "@/lib/corporate-art-store": {
        caDownload: async (path: string) => {
          reads.push(path);
          return {
            data: bytes && new Blob([new Uint8Array(bytes)]),
            error: bytes ? null : { message: "missing" },
          };
        },
      },
    },
  );
  return {
    reads,
    response: () =>
      module.GET(new Request("https://zyvorah.com"), {
        params: Promise.resolve({ id }),
      }),
  };
}

test("download denies unsigned, wrong-account/domain, inactive and unlisted users before storage", async () => {
  for (const session of denied) {
    const fixture = download(session);
    assert.equal((await fixture.response()).status, session ? 403 : 401);
    assert.deepEqual(fixture.reads, []);
  }
});

test("any active HomeLane member downloads exact reviewed bytes without build or purchase grants", async () => {
  const fixture = download(identity);
  const response = await fixture.response();
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), payload);
  assert.deepEqual(fixture.reads, [original.storagePath]);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(
    response.headers.get("content-disposition")!,
    /attachment; filename="HomeLane-Zyvorah-Portal-Guide.pdf"/,
  );
});

test("missing, changed-length and changed-checksum documents are never delivered", async () => {
  const changed = Buffer.from(payload);
  changed[0] ^= 1;
  for (const bytes of [
    null,
    Buffer.concat([payload, Buffer.from("extra")]),
    changed,
  ]) {
    const response = await download(identity, bytes).response();
    assert.equal(response.status, 502);
    assert.equal(response.headers.get("content-type"), "application/json");
  }
  const unknown = download(identity, payload, "another-document");
  assert.equal((await unknown.response()).status, 404);
  assert.deepEqual(unknown.reads, []);
});

function signedDownload(session: unknown) {
  let reads = 0;
  class NextResponse extends Response {}
  const module = serverModule(
    "../app/api/files/corporate-art/[...path]/route.ts",
    {
      "next/server": { NextResponse },
      "@/lib/corporate-auth": { currentCorporateSession: async () => session },
      "@/lib/partner-documents": documents,
      "@/lib/partner-private-auth": {},
      "@/lib/supabase-admin": {},
      "@/lib/corporate-art-store": { caVerify: () => true },
      "@/lib/media-client": {},
      // Range parsing for video playback; a document download never sends a
      // Range header, so this is never reached here.
      "@/lib/presentation-sign": { parseRange: () => null },
      "@/lib/r2-media": {
        privateBucket: async () => {
          reads++;
          return {
            get: async () => ({
              arrayBuffer: async () => new Uint8Array(payload).buffer,
              httpMetadata: { contentType: "application/pdf" },
            }),
          };
        },
      },
    },
  );
  return {
    reads: () => reads,
    response: () =>
      module.GET(
        {
          nextUrl: new URL(
            `https://zyvorah.com/api/files/corporate-art?sig=valid&exp=${Math.floor(Date.now() / 1000) + 600}`,
          ),
          // A download sends no Range header; the route asks before it reads.
          headers: new Headers(),
        },
        { params: Promise.resolve({ path: original.storagePath.split("/") }) },
      ),
  };
}

test("a valid signed document bearer still requires an authorised session on the same account", async () => {
  for (const session of denied) {
    const fixture = signedDownload(session);
    assert.equal((await fixture.response()).status, 403);
    assert.equal(fixture.reads(), 0);
  }
  const allowed = signedDownload(identity);
  assert.equal((await allowed.response()).status, 200);
  assert.equal(allowed.reads(), 1);
});

test("Documents page retains HomeLane destination, supports staff, and lists the guide for a member without order grants", async () => {
  class Redirect extends Error {
    constructor(readonly location: string) {
      super(location);
    }
  }
  const render = async (session: any) => {
    const module = serverModule("../app/partners/[slug]/documents/page.tsx", {
      "next/link": { __esModule: true, default: "Link" },
      "next/navigation": {
        redirect: (location: string) => {
          throw new Redirect(location);
        },
      },
      "@/lib/corporate-auth": {
        currentCorporateSession: async () => session,
        partnerHome: (a: { slug: string }) => `/partners/${a.slug}`,
        slugMatchesSession: (s: typeof identity, slug: string) =>
          s.account.slug === slug,
      },
      "@/lib/partner-documents": documents,
      "react/jsx-runtime": {
        jsx: (type: unknown, props: unknown) => ({ type, props }),
        jsxs: (type: unknown, props: unknown) => ({ type, props }),
      },
    });
    return module.default({ params: Promise.resolve({ slug: "homelane" }) });
  };
  for (const session of [
    null,
    { ...identity, account: { ...identity.account, slug: "vijay-sales" } },
  ])
    await assert.rejects(
      render(session),
      (error: any) => error.location === "/partners/homelane?next=documents",
    );
  const staffPage = JSON.stringify(await render({ ...identity, staff: true, member: null, email: "staff@zyvorah.com" }));
  assert.match(staffPage, /Download PDF/);
  assert.match(staffPage, /HomeLane visual portal guide/);
  const page = JSON.stringify(await render(identity));
  assert.match(page, /HomeLane visual portal guide/);
  assert.match(
    page,
    /\/api\/corporate\/partner-documents\/homelane-portal-guide/,
  );
  assert.match(page, /Download PDF/);
});


test("staff on HomeLane can download its guide, but staff on another account cannot", async () => {
  const staff = { ...identity, staff: true, member: null, email: "staff@zyvorah.com" };
  assert.equal((await download(staff).response()).status, 200);
  assert.equal((await signedDownload(staff).response()).status, 200);
  const other = { ...staff, account: { ...staff.account, slug: "vijay-sales" } };
  const denied = download(other);
  assert.equal((await denied.response()).status, 403);
  assert.deepEqual(denied.reads, []);
  assert.equal((await signedDownload(other).response()).status, 403);
});

test("login preserves Documents for members, staff, signed-out and wrong-account visitors", async () => {
  class Redirect extends Error {}
  async function render(session: unknown, next: unknown = "documents") {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { ...identity.account, active: true, portfolio_mode: false } }) };
    const module = serverModule("../app/partners/[slug]/page.tsx", {
      "next/navigation": { redirect: (url: string) => { throw new Redirect(url); }, notFound: () => { throw new Error("404"); } },
      "@/lib/supabase-admin": { supabaseAdmin: () => ({ from: () => query }) },
      "@/lib/corporate-auth": { currentCorporateSession: async () => session, isVaultUploadOnly: () => false, partnerHome: (a: any) => `/partners/${a.slug}`, isStaffSession: (s: any) => s.staff },
      "@/lib/partner-capabilities": { partnerCapabilities: () => ({ poRequiredRelease: true }) },
      "@/lib/portfolio": {},
      "@/lib/tier1-cities": tier1,
      "@/lib/partner-return": { partnerReturnPath },
      "./city-picker": { __esModule: true, default: "CityPicker" },
      "./login-form": { default: "Login" },
      "./portfolio-dashboard": { default: "Dashboard" },
      "./wrong-account": { default: "WrongAccount" },
      "react/jsx-runtime": { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) },
    });
    return module.default({ params: Promise.resolve({ slug: "homelane" }), searchParams: Promise.resolve({ next }) });
  }
  // A HomeLane sign-in that has chosen its city; staff never choose one.
  const signedIn = { ...identity, city: "Mumbai" };
  for (const session of [signedIn, { ...identity, staff: true, member: null }]) {
    await assert.rejects(render(session), (e: Error) => e.message === "/partners/homelane/documents");
  }
  // Before the city is chosen, the city screen comes first and still carries
  // the person on to Documents afterwards.
  const picker = await render(identity);
  assert.equal(picker.type, "CityPicker");
  assert.equal(picker.props.next, "/partners/homelane/documents");
  assert.equal((await render(null)).props.returnTo, "documents");
  assert.equal((await render({ ...identity, account: { ...identity.account, slug: "vijay-sales" } })).props.returnToDocuments, true);
  for (const next of [undefined, "https://example.com", "//example.com", ["documents"]]) {
    await assert.rejects(render(signedIn, next === undefined ? "" : next), (e: Error) => e.message === "/partners/homelane/projects");
  }
});
