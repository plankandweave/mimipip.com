// The whole reason this module exists is that a credential under the "wrong"
// name leaves half the integration silently dark. Organic Instagram publishing
// now leans on the same resolution, so the fallbacks are worth pinning: set one
// Meta system-user token and both ads AND posting should light up.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { metaIgAccountId, metaPublishToken } from "./meta-env";

const KEYS = [
  "IG_BUSINESS_ACCOUNT_ID",
  "META_IG_ACCOUNT_ID",
  "IG_ACCESS_TOKEN",
  "META_ADS_TOKEN",
  "META_SYSTEM_USER_TOKEN",
];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
function clear() {
  for (const k of KEYS) delete process.env[k];
}

test("the IG account falls back from the organic name to the ads name", () => {
  clear();
  assert.equal(metaIgAccountId(), undefined, "unset means unset");
  process.env.META_IG_ACCOUNT_ID = "17841400000000000";
  assert.equal(metaIgAccountId(), "17841400000000000", "the ads IG account serves organic too");
  process.env.IG_BUSINESS_ACCOUNT_ID = "17841499999999999";
  assert.equal(metaIgAccountId(), "17841499999999999", "an explicit organic id wins when set");
});

test("one Meta system-user token powers organic publishing", () => {
  clear();
  assert.equal(metaPublishToken(), undefined, "no token resolves to nothing (stays unconfigured)");
  process.env.META_SYSTEM_USER_TOKEN = "sys-user-token";
  assert.equal(metaPublishToken(), "sys-user-token", "the legacy ads token name still works");
  process.env.META_ADS_TOKEN = "ads-token";
  assert.equal(metaPublishToken(), "ads-token", "the canonical ads token is used");
  process.env.IG_ACCESS_TOKEN = "dedicated-ig-token";
  assert.equal(metaPublishToken(), "dedicated-ig-token", "a dedicated publish token wins when set");
});
