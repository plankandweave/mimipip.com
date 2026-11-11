import assert from "node:assert/strict";
import test from "node:test";
import { partnerManifest, partnerShortName } from "./partner-app";

test("the home-screen label is the partner's name, not its legal suffix", () => {
  assert.equal(partnerShortName("Vijay Sales India Private Limited"), "Vijay Sales");
  assert.equal(partnerShortName("HomeLane"), "HomeLane");
  assert.equal(partnerShortName("LTM Pvt Ltd"), "LTM");
});

test("the partner app opens inside its own portal, never on the shop", () => {
  const m = partnerManifest({ slug: "vijay-sales", name: "Vijay Sales India Private Limited" });
  assert.equal(m.scope, "/partners/vijay-sales");
  assert.ok(m.start_url.startsWith(`${m.scope}?`));
  assert.equal(m.display, "standalone");
});
