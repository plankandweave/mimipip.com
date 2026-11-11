// The Google Ads connection can change a live ad account. These pin what it is
// allowed to send: status-only pauses, only for running campaigns that are
// really in this account.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADS_SCOPE, CUSTOMER_ID, apiVersions, authorizationUrl, customerId, mergeCampaigns, microsToInr, pausable, pauseOperations, toCampaign,
  type CampaignRow,
} from "./spec";

const row = (over: Partial<CampaignRow>): CampaignRow => ({
  id: "1", name: "Search | Brand", status: "ENABLED", channel: "SEARCH", dailyBudgetInr: 500, cost7dInr: 0, clicks7d: 0, impressions7d: 0, ...over,
});

test("the account ids are the documented ones", () => {
  assert.equal(customerId("905-946-7956"), CUSTOMER_ID);
  assert.equal(customerId("90594679"), null);
  assert.equal(customerId("abc-def-ghij"), null);
});

test("money arrives in micros and leaves in rupees", () => {
  assert.equal(microsToInr("14484000000"), 14484);
  assert.equal(microsToInr(19660000), 19.66);
  assert.equal(microsToInr(undefined), 0);
});

test("a GAQL row becomes a campaign", () => {
  const c = toCampaign({
    campaign: { id: "22", name: "Zyvorah Wallpaper & Murals | India | PMax", status: "ENABLED", advertisingChannelType: "PERFORMANCE_MAX" },
    campaignBudget: { amountMicros: "300000000" },
    metrics: { costMicros: "7685000000", clicks: "120", impressions: "9000" },
  });
  assert.deepEqual(c, { id: "22", name: "Zyvorah Wallpaper & Murals | India | PMax", status: "ENABLED", channel: "PERFORMANCE_MAX", dailyBudgetInr: 300, cost7dInr: 7685, clicks7d: 120, impressions7d: 9000 });
});

test("campaigns with no activity are still listed; removed ones are not; running first", () => {
  const all = [row({ id: "1", status: "PAUSED" }), row({ id: "2" }), row({ id: "3", status: "REMOVED" }), row({ id: "4" })];
  const merged = mergeCampaigns(all, [row({ id: "4", cost7dInr: 900, clicks7d: 30 })]);
  assert.deepEqual(merged.map((c) => c.id), ["4", "2", "1"]);
  assert.equal(merged[0].cost7dInr, 900);
});

test("only running campaigns in this account are paused; the rest are named, not sent", () => {
  const list = [row({ id: "1" }), row({ id: "2", status: "PAUSED", name: "Old" })];
  const { pause, refused } = pausable(list, ["1", "2", "999", "1"]);
  assert.deepEqual(pause.map((c) => c.id), ["1"]);
  assert.equal(refused.length, 2);
  assert.match(refused.join(" "), /Old: already paused/);
  assert.match(refused.join(" "), /999: not a campaign/);
});

test("a pause changes status and nothing else", () => {
  assert.deepEqual(pauseOperations("9059467956", ["7"]), {
    operations: [{ update: { resourceName: "customers/9059467956/campaigns/7", status: "PAUSED" }, updateMask: "status" }],
  });
});

test("the sign-in asks for the Ads scope and a lasting, freshly-consented grant", () => {
  const u = new URL(authorizationUrl("cid.apps.googleusercontent.com", "https://zyvorah.com/admin/google-ads/callback", "s1"));
  assert.equal(u.searchParams.get("scope"), ADS_SCOPE);
  assert.equal(u.searchParams.get("access_type"), "offline");
  assert.equal(u.searchParams.get("prompt"), "consent");
  assert.equal(u.searchParams.get("redirect_uri"), "https://zyvorah.com/admin/google-ads/callback");
  assert.equal(u.searchParams.get("state"), "s1");
});

test("a pinned API version is tried first, then the newest down", () => {
  assert.equal(apiVersions("v22")[0], "v22");
  assert.equal(apiVersions("v22").filter((v) => v === "v22").length, 1);
  assert.equal(apiVersions("junk")[0], apiVersions(undefined)[0]);
});
