import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

async function storefront(staff: boolean | null) {
  const result = await build({
    entryPoints: ["src/lib/partner-mode.ts"], bundle: true, write: false,
    platform: "node", format: "esm",
    plugins: [{ name: "session-fixture", setup(b) {
      b.onResolve({ filter: /^(server-only|next\/server|\.\/corporate-auth|\.\/partner-capabilities)$/ }, a => ({ path: a.path, namespace: "fixture" }));
      b.onLoad({ filter: /.*/, namespace: "fixture" }, a => ({ loader: "js", contents:
        a.path === "server-only" ? "" :
        a.path === "next/server" ? "export const NextResponse = { json: (body, init) => Response.json(body, init) };" :
        a.path === "./partner-capabilities" ? "export const purchasingAllowed = () => false;" :
        `export const partnerHome = () => '/partners/test';
         export const currentCorporateSession = async () => (${staff === null ? "null" : JSON.stringify({ staff, account: { slug: "test", name: "Test partner" }, email: "test@example.com", member: { can_build: true } })});`
      }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

test("staff visiting the public shop can use the retail cart despite a portal session", async () => {
  const mode = await storefront(true);
  assert.equal(await mode.currentPartnerMode(), null);
  assert.equal(await mode.refusePartnerPurchase(), null);
});

test("partner designers retain their project and procurement flow", async () => {
  const mode = await storefront(false);
  assert.equal((await mode.currentPartnerMode()).role, "designer");
  const response = await mode.refusePartnerPurchase();
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "partner_no_purchase");
});

test("retail visitors can use the cart without a corporate session", async () => {
  const mode = await storefront(null);
  assert.equal(await mode.currentPartnerMode(), null);
  assert.equal(await mode.refusePartnerPurchase(), null);
});
