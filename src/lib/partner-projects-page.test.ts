import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { partnerCapabilities } from "./partner-capabilities";
import * as limits from "./print-limits";
import * as tier1 from "./tier1-cities";

const nativeRequire = createRequire(import.meta.url);
type Session = {
  account: { slug: string; name: string };
  email: string;
  staff: boolean;
  agreementPending: boolean;
  city?: string | null;
  member?: {
    id: string;
    active: boolean;
    role: string;
    can_build: boolean;
    can_order: boolean;
  };
} | null;

function moduleExports(path: string, imports: Record<string, unknown>) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const exported: Record<string, any> = {};
  runInNewContext(compiled, {
    exports: exported,
    process: { env: {} },
    Buffer,
    require(name: string) {
      if (name.startsWith("node:")) return nativeRequire(name);
      if (name === "server-only") return {};
      if (Object.hasOwn(imports, name)) return imports[name];
      throw new Error(`Unexpected page fixture import: ${name}`);
    },
  });
  return exported;
}

// Use the real account-match and home helpers; page execution gets only an
// already-authenticated session fixture, without creating cookies or DB rows.
const auth = moduleExports("./corporate-auth.ts", {
  "@/lib/partner-capabilities": { partnerCapabilities },
  "next/headers": {},
  "./supabase-admin": {},
  "./print-types": {},
  "./print-limits": limits,
});

class PageRedirect extends Error {
  constructor(readonly location: string) {
    super(location);
  }
}

function page(session: Session) {
  let workspaceElements = 0;
  const Workspace = () => {};
  const exported = moduleExports("../app/partners/[slug]/projects/page.tsx", {
    "next/navigation": {
      redirect(location: string): never {
        throw new PageRedirect(location);
      },
    },
    "@/lib/corporate-auth": {
      currentCorporateSession: async () => session,
      partnerHome: auth.partnerHome,
      slugMatchesSession: auth.slugMatchesSession,
    },
    "@/lib/partner-capabilities": { partnerCapabilities },
    "@/lib/tier1-cities": tier1,
    "./workspace": { __esModule: true, default: Workspace },
    "react/jsx-runtime": {
      jsx(type: unknown, props: unknown) {
        workspaceElements++;
        return { type, props };
      },
    },
  });
  return {
    open: () =>
      exported.default({ params: Promise.resolve({ slug: "homelane" }) }),
    workspaceElements: () => workspaceElements,
    Workspace,
  };
}

const member = (slug: string, staff = false): NonNullable<Session> => ({
  account: { slug, name: slug === "homelane" ? "HomeLane" : "Vijay Sales" },
  email: staff ? "desk@zyvorah.com" : `designer@${slug}.com`,
  staff,
  agreementPending: false,
  city: slug === "homelane" ? "Mumbai" : null,
});

for (const staff of [false, true]) {
  test(`a Vijay Sales ${staff ? "staff" : "member"} opening HomeLane keeps the requested partner`, async () => {
    const fixture = page(member("vijay-sales", staff));
    await assert.rejects(fixture.open(), (error: unknown) => {
      assert.ok(error instanceof PageRedirect);
      assert.equal(error.location, "/partners/homelane");
      return true;
    });
    assert.equal(fixture.workspaceElements(), 0);
  });
}

test("an unsigned HomeLane project request opens its own sign-in page", async () => {
  const fixture = page(null);
  await assert.rejects(fixture.open(), (error: unknown) => {
    assert.ok(error instanceof PageRedirect);
    assert.equal(error.location, "/partners/homelane");
    return true;
  });
  assert.equal(fixture.workspaceElements(), 0);
});

test("a matching HomeLane member receives only their HomeLane workspace", async () => {
  const fixture = page(member("homelane"));
  const rendered = await fixture.open();
  assert.equal(rendered.type, fixture.Workspace);
  assert.equal(rendered.props.slug, "homelane");
  assert.equal(rendered.props.name, "HomeLane");
  assert.equal(rendered.props.email, "designer@homelane.com");
  assert.equal(rendered.props.city, "Mumbai");
  assert.equal(fixture.workspaceElements(), 1);
});

test("staff on the matching HomeLane account still cannot enter its private workspace", async () => {
  const fixture = page(member("homelane", true));
  await assert.rejects(fixture.open(), (error: unknown) => {
    assert.ok(error instanceof PageRedirect);
    assert.equal(error.location, "/partners/homelane/orders");
    return true;
  });
  assert.equal(fixture.workspaceElements(), 0);
});

test("the actual Projects page passes only the genuine member's independent tour roles", async () => {
  for (const [can_build, can_order, role] of [
    [true, false, "member"],
    [false, true, "member"],
    [true, false, "admin"],
  ] as const) {
    const session = {
      ...member("homelane"),
      member: {
        id: "fixture-member",
        active: true,
        can_build,
        can_order,
        role,
      },
    };
    const element = await page(session).open();
    assert.equal(element.props.tourIdentity.memberKey, "fixture-member");
    assert.equal(element.props.tourIdentity.canBuild, can_build);
    assert.equal(element.props.tourIdentity.canPurchase, can_order);
    assert.equal(element.props.tourIdentity.isAdmin, role === "admin");
  }
});

test("a HomeLane sign-in that has not chosen its city is sent to choose one first", async () => {
  const fixture = page({ ...member("homelane"), city: null });
  await assert.rejects(fixture.open(), (error: unknown) => {
    assert.ok(error instanceof PageRedirect);
    assert.equal(error.location, "/partners/homelane");
    return true;
  });
  assert.equal(fixture.workspaceElements(), 0);
});
