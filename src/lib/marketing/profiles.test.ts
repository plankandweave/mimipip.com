import { test } from "node:test";
import assert from "node:assert/strict";
import { belongsToProfile, isPersonalPlan, PERSONAL_PLAN_KEY } from "./profiles";
import { runSlot } from "./pipeline";
import type { Selection } from "./select";

test("personal and brand plans never share a workspace", () => {
  for (const key of [PERSONAL_PLAN_KEY, "personal-roheena-instagram", "personal-roheena-linkedin"]) {
    assert.equal(belongsToProfile(key, "roheena"), true);
    assert.equal(belongsToProfile(key, "zyvorah"), false);
  }
  for (const key of [null, undefined, "", "taash", "linkedin-q4", "roheena-signature"]) {
    assert.equal(belongsToProfile(key, "roheena"), false);
    assert.equal(belongsToProfile(key, "zyvorah"), true);
  }
});

test("personal composition stops before credentials, catalogue reads or publishing", async () => {
  assert.equal(isPersonalPlan(PERSONAL_PLAN_KEY), true);
  await assert.rejects(runSlot({ campaign: { key: PERSONAL_PLAN_KEY } } as Selection), /brand composer cannot run/);
});
